#!/usr/bin/env python3
"""
MC Stats Viewer - Local Bridge
==============================

Bridges the MC Stats Viewer web page to a Minecraft world's files AND keeps a
permanent, on-disk history archive (so it does NOT depend on the browser).

WHY THIS EXISTS
---------------
Browsers cannot read OR write files on disk by path (security sandbox). This
small local server, running on the machine that holds the server files, does
both for the page:
  - reads  <world>/stats/<uuid>.json  and  <world>/playerdata/<uuid>.dat
  - writes timestamped copies into a data folder, building a history that
    survives even if the browser's storage is cleared.

FOLDER LAYOUT (recommended)
---------------------------
    mc-stats-viewer/
    |-- viewer/                 <- this script + mc-stats-viewer.html + icons/
    |   |-- mc-stats-bridge.py
    |   |-- mc-stats-viewer.html
    |   `-- icons/
    `-- json&nbt/               <- the on-disk archive (history lives here)
        `-- <uuid>/
            |-- index.json
            |-- 2026-06-16T14-30-00Z.json   (raw stats)
            `-- 2026-06-16T14-30-00Z.dat    (raw player data)

By default the archive folder is `../json&nbt` relative to this script, i.e.
exactly the layout above. Override it with --data /any/path if you prefer.

USAGE
-----
    python3 mc-stats-bridge.py
    python3 mc-stats-bridge.py --world /path/to/server/world
    python3 mc-stats-bridge.py --data /path/to/archive --port 8723

Then open:  http://localhost:8723/

SECURITY
--------
- Binds to 127.0.0.1 only (not reachable from the network).
- Reads ONLY *.json from <world>/stats and *.dat from <world>/playerdata.
- Path traversal is blocked. The world is never modified.

Requires: Python 3.7+ (standard library only).
"""

import argparse
import base64
import hashlib
import json
import os
import posixpath
import shutil
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
ARGS = None
DATA_DIR = None

STATIC_TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json",
}


# ───────────────────────── helpers: paths & files ─────────────────────────

def safe_world(path):
    if not path:
        return None
    p = os.path.realpath(os.path.expanduser(path))
    return p if os.path.isdir(p) else None


def read_within(world, sub, filename, ext):
    """Safely read a file inside <world>/<sub>, matching the expected ext."""
    if not filename.endswith(ext):
        return None
    base = os.path.realpath(os.path.join(world, sub))
    target = os.path.realpath(os.path.join(base, os.path.basename(filename)))
    if os.path.commonpath([base, target]) != base:
        return None
    if not os.path.isfile(target):
        return None
    with open(target, "rb") as f:
        return f.read()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def now_fname():
    # microseconds keep the filename/key unique even for rapid manual refreshes
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")


# ───────────────────────── players & names ─────────────────────────

def list_players(world):
    stats_dir = os.path.join(world, "stats")
    pdata_dir = os.path.join(world, "playerdata")
    players = {}
    if os.path.isdir(stats_dir):
        for fn in os.listdir(stats_dir):
            if fn.endswith(".json"):
                players.setdefault(fn[:-5], {})["stats"] = True
    if os.path.isdir(pdata_dir):
        for fn in os.listdir(pdata_dir):
            if fn.endswith(".dat") and not fn.endswith(".dat_old"):
                players.setdefault(fn[:-4], {})["dat"] = True
    out = []
    for uuid, has in sorted(players.items()):
        out.append({"uuid": uuid, "hasStats": bool(has.get("stats")), "hasDat": bool(has.get("dat"))})
    # attach names
    names = load_names(world)
    for p in out:
        p["name"] = names.get(p["uuid"].replace("-", ""))
    return out


def load_names(world):
    """Names from usercache.json (server root) overridden by archive/names.json."""
    names = {}
    if world:
        uc = os.path.join(os.path.dirname(world), "usercache.json")
        try:
            if os.path.isfile(uc):
                for e in json.load(open(uc, encoding="utf-8")):
                    u = (e.get("uuid") or "").replace("-", "")
                    if u:
                        names[u] = e.get("name")
        except Exception:
            pass
    nf = os.path.join(DATA_DIR, "names.json")
    try:
        if os.path.isfile(nf):
            for k, v in json.load(open(nf, encoding="utf-8")).items():
                names[k.replace("-", "")] = v
    except Exception:
        pass
    return names


def set_name(uuid, name):
    nf = os.path.join(DATA_DIR, "names.json")
    cur = {}
    try:
        if os.path.isfile(nf):
            cur = json.load(open(nf, encoding="utf-8"))
    except Exception:
        cur = {}
    clean = uuid.replace("-", "")
    if name:
        cur[clean] = name
    elif clean in cur:
        del cur[clean]
    os.makedirs(DATA_DIR, exist_ok=True)
    json.dump(cur, open(nf, "w", encoding="utf-8"))


# ───────────────────────── history archive ─────────────────────────

def sum_vals(d):
    return sum(d.values()) if isinstance(d, dict) else 0


def stats_hash(inner):
    return hashlib.sha1(json.dumps(inner, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def compact(inner, ts, date, h):
    c = inner.get("minecraft:custom", {}) or {}
    return {
        "ts": ts, "date": date, "hash": h,
        "play_time": c.get("minecraft:play_time", 0),
        "deaths": c.get("minecraft:deaths", 0),
        "mined": sum_vals(inner.get("minecraft:mined")),
        "killed": sum_vals(inner.get("minecraft:killed")),
        "walk_cm": c.get("minecraft:walk_one_cm", 0),
    }


def player_dir(uuid):
    return os.path.join(DATA_DIR, os.path.basename(uuid))


def load_index(pdir):
    fp = os.path.join(pdir, "index.json")
    if os.path.isfile(fp):
        try:
            return json.load(open(fp, encoding="utf-8"))
        except Exception:
            return []
    return []


def save_index(pdir, idx):
    os.makedirs(pdir, exist_ok=True)
    tmp = os.path.join(pdir, "index.json.tmp")
    json.dump(idx, open(tmp, "w", encoding="utf-8"))
    os.replace(tmp, os.path.join(pdir, "index.json"))


def archive_player(world, uuid):
    """Archive a player's current stats (+ player data) if changed. Returns dict."""
    sb = read_within(world, "stats", uuid + ".json", ".json")
    if sb is None:
        return {"added": False}
    try:
        inner = json.loads(sb.decode("utf-8")).get("stats")
        if inner is None:
            inner = json.loads(sb.decode("utf-8"))
    except Exception:
        return {"added": False}
    h = stats_hash(inner)
    pdir = player_dir(uuid)
    idx = load_index(pdir)
    if idx and idx[-1].get("hash") == h:
        return {"added": False}  # unchanged since last snapshot
    ts, date = now_fname(), now_iso()
    os.makedirs(pdir, exist_ok=True)
    with open(os.path.join(pdir, ts + ".json"), "wb") as f:
        f.write(sb)
    db = read_within(world, "playerdata", uuid + ".dat", ".dat")
    if db is not None:
        with open(os.path.join(pdir, ts + ".dat"), "wb") as f:
            f.write(db)
    entry = compact(inner, ts, date, h)
    idx.append(entry)
    save_index(pdir, idx)
    return {"added": True, "entry": entry}


def history_players(world):
    names = load_names(world)
    out = []
    if os.path.isdir(DATA_DIR):
        for d in sorted(os.listdir(DATA_DIR)):
            pdir = os.path.join(DATA_DIR, d)
            if not os.path.isdir(pdir):
                continue
            idx = load_index(pdir)
            if not idx:
                continue
            out.append({"uuid": d, "name": names.get(d.replace("-", "")),
                        "count": len(idx), "lastDate": idx[-1].get("date")})
    return out


def history_series(world, uuid):
    pdir = player_dir(uuid)
    idx = load_index(pdir)
    names = load_names(world)
    return {"uuid": uuid, "name": names.get(uuid.replace("-", "")), "snapshots": idx}


def read_archived(uuid, ts, ext):
    """Read a specific archived snapshot file (<ts>.json / <ts>.dat) safely."""
    pdir = os.path.realpath(player_dir(uuid))
    if os.path.commonpath([os.path.realpath(DATA_DIR), pdir]) != os.path.realpath(DATA_DIR):
        return None
    fp = os.path.realpath(os.path.join(pdir, os.path.basename(ts) + ext))
    if os.path.commonpath([pdir, fp]) != pdir or not os.path.isfile(fp):
        return None
    with open(fp, "rb") as f:
        return f.read()


def delete_snapshot(uuid, ts):
    pdir = player_dir(uuid)
    idx = [e for e in load_index(pdir) if e.get("ts") != ts]
    for ext in (".json", ".dat"):
        fp = os.path.join(pdir, os.path.basename(ts) + ext)
        try:
            if os.path.isfile(fp):
                os.remove(fp)
        except Exception:
            pass
    if idx:
        save_index(pdir, idx)
    else:
        try:
            os.remove(os.path.join(pdir, "index.json"))
        except Exception:
            pass
    return {"ok": True}


def clear_player(uuid):
    pdir = os.path.realpath(player_dir(uuid))
    if os.path.isdir(pdir) and os.path.commonpath([os.path.realpath(DATA_DIR), pdir]) == os.path.realpath(DATA_DIR):
        shutil.rmtree(pdir, ignore_errors=True)
    return {"ok": True}


# ───────────────────────── HTTP handler ─────────────────────────

class Handler(BaseHTTPRequestHandler):

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _world(self, q):
        return safe_world((q.get("world", [None])[0]) or ARGS.world)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        path = u.path

        # ---- live world access ----
        if path == "/players":
            world = self._world(q)
            if not world:
                return self._json({"error": "invalid or missing world path"}, 400)
            return self._json({"world": world, "players": list_players(world)})

        if path in ("/stats", "/playerdata", "/refresh"):
            world = self._world(q)
            if not world:
                return self._json({"error": "invalid or missing world path"}, 400)
            uuid = (q.get("uuid", [""])[0]).strip()
            if not uuid:
                return self._json({"error": "missing uuid"}, 400)

            if path == "/stats":
                data = read_within(world, "stats", uuid + ".json", ".json")
                if data is None:
                    return self._json({"error": "stats file not found"}, 404)
                try:
                    return self._json({"uuid": uuid, "stats": json.loads(data.decode("utf-8"))})
                except Exception:
                    return self._json({"error": "stats file is being written, retry"}, 503)

            if path == "/playerdata":
                data = read_within(world, "playerdata", uuid + ".dat", ".dat")
                if data is None:
                    return self._json({"error": "playerdata file not found"}, 404)
                return self._json({"uuid": uuid, "dat_b64": base64.b64encode(data).decode("ascii")})

            # /refresh : archive if changed, AND return current stats + dat
            res = archive_player(world, uuid)
            out = {"added": res.get("added", False)}
            sb = read_within(world, "stats", uuid + ".json", ".json")
            if sb is not None:
                try:
                    full = json.loads(sb.decode("utf-8"))
                    out["stats"] = full.get("stats", full)
                except Exception:
                    pass
            db = read_within(world, "playerdata", uuid + ".dat", ".dat")
            if db is not None:
                out["dat_b64"] = base64.b64encode(db).decode("ascii")
            return self._json(out)

        if path == "/refresh-all":
            world = self._world(q)
            if not world:
                return self._json({"error": "invalid or missing world path"}, 400)
            players = list_players(world)
            added = 0
            for p in players:
                if p["hasStats"] and archive_player(world, p["uuid"]).get("added"):
                    added += 1
            return self._json({"added": added, "players": players})

        # ---- on-disk history ----
        if path == "/history":
            world = self._world(q)
            uuid = (q.get("uuid", [None])[0])
            if uuid:
                return self._json(history_series(world, uuid))
            return self._json({"players": history_players(world)})

        if path == "/snapshot":
            uuid = (q.get("uuid", [""])[0]).strip()
            ts = (q.get("ts", [""])[0]).strip()
            if not uuid or not ts:
                return self._json({"error": "missing uuid/ts"}, 400)
            out = {}
            sb = read_archived(uuid, ts, ".json")
            if sb is not None:
                try:
                    full = json.loads(sb.decode("utf-8"))
                    out["stats"] = full.get("stats", full)
                except Exception:
                    pass
            db = read_archived(uuid, ts, ".dat")
            if db is not None:
                out["dat_b64"] = base64.b64encode(db).decode("ascii")
            if not out:
                return self._json({"error": "snapshot not found"}, 404)
            return self._json(out)

        if path == "/delete":
            uuid = (q.get("uuid", [""])[0]).strip()
            ts = (q.get("ts", [""])[0]).strip()
            if not uuid or not ts:
                return self._json({"error": "missing uuid/ts"}, 400)
            return self._json(delete_snapshot(uuid, ts))

        if path == "/clear":
            uuid = (q.get("uuid", [""])[0]).strip()
            if not uuid:
                return self._json({"error": "missing uuid"}, 400)
            return self._json(clear_player(uuid))

        if path == "/set-name":
            uuid = (q.get("uuid", [""])[0]).strip()
            name = (q.get("name", [""])[0]).strip()
            if not uuid:
                return self._json({"error": "missing uuid"}, 400)
            set_name(uuid, name)
            return self._json({"ok": True})

        # ---- static files (page + icons) ----
        return self._static(path)

    def _static(self, path):
        if path in ("/", ""):
            path = "/mc-stats-viewer.html"
        rel = posixpath.normpath(path).lstrip("/")
        fp = os.path.realpath(os.path.join(SCRIPT_DIR, rel))
        if os.path.commonpath([SCRIPT_DIR, fp]) != SCRIPT_DIR:
            return self._json({"error": "not found"}, 404)
        ext = os.path.splitext(fp)[1].lower()
        if ext not in STATIC_TYPES or not os.path.isfile(fp):
            return self._json({"error": "not found"}, 404)
        with open(fp, "rb") as f:
            body = f.read()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", STATIC_TYPES[ext])
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


def main():
    global ARGS, DATA_DIR
    ap = argparse.ArgumentParser(description="MC Stats Viewer local bridge")
    ap.add_argument("--port", type=int, default=8723, help="Port to listen on (default 8723)")
    ap.add_argument("--world", default=None, help="Default world folder path (optional)")
    ap.add_argument("--data", default=None, help="Archive folder (default ../json&nbt next to this script)")
    ARGS = ap.parse_args()

    DATA_DIR = os.path.realpath(os.path.expanduser(ARGS.data)) if ARGS.data \
        else os.path.join(os.path.dirname(SCRIPT_DIR), "json&nbt")

    if ARGS.world:
        w = safe_world(ARGS.world)
        ARGS.world = w if w else ARGS.world
        print(f"  Default world: {ARGS.world}" + ("" if w else "   (NOT FOUND)"))

    print("+------------------------------------------------+")
    print("|  MC Stats Viewer - local bridge is running     |")
    print("+------------------------------------------------+")
    print(f"  Archive: {DATA_DIR}")
    print(f"  Open:    http://localhost:{ARGS.port}/")
    print("  Stop:    Ctrl+C\n")

    server = ThreadingHTTPServer(("127.0.0.1", ARGS.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bridge stopped.")
        server.shutdown()


if __name__ == "__main__":
    main()
