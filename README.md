# ⛏ MCStats Viewer

> A zero-dependency dashboard to explore your Minecraft player **statistics**, **live state** (inventory, health, position…), and track **progress over time** — all in a single HTML file, fully offline.

<p align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/NBT%20parser-built--in-60a5fa?style=for-the-badge" alt="NBT parser">
  <img src="https://img.shields.io/badge/no%20dependencies-✓-4ade80?style=for-the-badge" alt="No dependencies">
  <img src="https://img.shields.io/badge/License-MIT-a78bfa?style=for-the-badge" alt="MIT License">
</p>

---

> 📸 **Add a screenshot here** — open the dashboard with some data loaded, take a screenshot, save it as `screenshot.png` next to the HTML file, then replace this line with:
> `![MCStats Viewer Preview](screenshot.png)`

---

## ✨ Features

The app is split into **three sections**:

### 📊 Statistics
- Overview cards: playtime, deaths, mob kills, distance (walking / running / flying), jumps, damage dealt & taken, animals bred, fish caught, nights slept, and more
- Ranked leaderboards with pixel-style bars: mined blocks, killed mobs, used / crafted / picked-up / dropped items, and "killed by"
- Emoji icons for hundreds of blocks, mobs and items

### 🎒 Player State
Reads the binary player data file and shows:
- ❤️ **Health** rendered as Minecraft hearts (half-hearts supported)
- 🍖 **Hunger** rendered as drumsticks
- ✨ **Experience** bar with current level and total XP
- 🎮 **Game mode** (Survival / Creative / Adventure / Spectator)
- 📍 **Positions** — current location, last death point, and respawn point, each with its dimension
- 🎒 **Full inventory** in Minecraft-style slots: armor, off-hand, hotbar and main inventory
- 📦 **Ender chest** contents
- 🟪 **Shulker boxes** are clickable — click one to reveal what's inside it
- ✦ Enchanted items are highlighted

### 📈 History
- Every statistics file you load is **saved locally with a timestamp**
- **Duplicate detection** — if you re-import an identical file, it's skipped automatically
- **Charts over time** (once you have 2+ snapshots on different days): playtime, deaths, blocks mined, mobs killed, distance walked
- Snapshot table with per-entry delete
- Assign a **custom name** to any player via the ✏️ button — it sticks across sessions

### 🔒 General
- **100% local & private** — files are read only in your browser, nothing is ever uploaded
- **Zero install, zero dependencies** — one `.html` file, no build step, no server
- Auto-fetches player **name** and **skin avatar** from Mojang using the UUID

---

## 🚀 How to Use

### 1. Locate your files

Minecraft splits player data across **two files**, both named after the player's UUID:

```
your-server/
└── world/
    ├── stats/
    │   └── <player-uuid>.json   ← 📊 statistics  (blocks, mobs, playtime…)
    └── playerdata/
        └── <player-uuid>.dat    ← 🎒 live state  (inventory, health, position…)
```

> **On Crafty Controller:** open the server's file manager and browse to `world/stats/` and `world/playerdata/`. You can also reach them directly on the host machine.

You can load **either file on its own** or **both together** — same UUID means they merge into one view.

### 2. Open the viewer

Download `mc-stats-viewer.html` and open it in a modern browser — **double-click is enough**, no server required.

```bash
firefox mc-stats-viewer.html
# or
google-chrome mc-stats-viewer.html
```

### 3. Load the files

Drag & drop the `.json` and/or `.dat` files onto the drop zone (or click to browse). Use the **＋ Add file** button to add the other file later.

---

## 🗂️ Tracking progress over time

The **History** section turns the viewer into a progress tracker:

1. Import a player's `.json` stats file today → it's saved as a dated snapshot
2. Import the same player's stats again in a few days → a new snapshot is added
3. Once there are **2 or more** snapshots, charts appear automatically

The more often you import, the more detailed the graphs. Identical files are detected via a content hash and won't create duplicate snapshots.

> History is stored in your browser's `localStorage`, meaning it lives **on the device/browser where you open the file**. It persists when you open the HTML locally or host it (e.g. GitHub Pages). It does **not** sync between devices.

---

## 📂 File Formats

### Statistics (`.json`)
Plain JSON. Distances are in **centimeters**, time in **game ticks** (20 ticks = 1 second). The viewer converts everything to readable units.

```json
{
  "stats": {
    "minecraft:custom": { "minecraft:play_time": 864000, "minecraft:deaths": 12 },
    "minecraft:mined":  { "minecraft:stone": 2048, "minecraft:diamond_ore": 34 },
    "minecraft:killed": { "minecraft:zombie": 200, "minecraft:creeper": 87 }
  }
}
```

### Player data (`.dat`)
A **gzip-compressed NBT** (Named Binary Tag) binary file — not JSON. The viewer includes a **built-in NBT parser** and uses the browser's native `DecompressionStream` to read it, so no libraries are needed. Relevant fields read: `Health`, `foodLevel`, `XpLevel` / `XpP` / `XpTotal`, `playerGameType`, `Pos`, `Dimension`, `LastDeathLocation`, `Spawn*`, `Inventory`, `EnderItems`, and shulker `BlockEntityTag.Items`.

---

## 🧰 Tech Stack

| Technology | Purpose |
|---|---|
| HTML5 + CSS3 (grid, flexbox, custom properties) | Structure & styling |
| Vanilla JavaScript (ES2020) | Logic & rendering, no framework |
| Custom NBT parser + `DecompressionStream` | Reading `.dat` player files |
| Inline SVG | History charts |
| `localStorage` | Persisting history snapshots |
| [VT323](https://fonts.google.com/specimen/VT323) / [Inter](https://fonts.google.com/specimen/Inter) / [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | Typography |
| [Crafatar](https://crafatar.com) / [Mojang API](https://wiki.vg/Mojang_API) | Avatars & player names |

---

## ✅ Compatibility

- **Browsers:** Firefox and Chromium-based browsers (recent versions). The `.dat` reader requires `DecompressionStream`, supported in all modern browsers.
- **Minecraft:** tested against the **Java Edition 1.20.x** player data format. Other versions may store some fields differently.

---

## 🗺️ Roadmap

- [ ] Multi-player comparison on the same chart
- [ ] Export a snapshot or stats card as a shareable image
- [ ] Search & filter inside leaderboards and inventory
- [ ] Bundled fonts for fully offline use (no Google Fonts request)
- [ ] Item textures instead of emoji (optional resource pack support)
- [ ] Bedrock Edition support

---

## 📄 License

Released under the [MIT License](LICENSE). Fork it, mod it, and share it with your server community.

---

<p align="center">
  Made with ❤️ for Minecraft server admins tired of reading raw JSON and NBT
</p>
