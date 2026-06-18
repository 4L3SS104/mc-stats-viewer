"use strict";

//  STATE
const STATE = {
  uuid: null,
  stats: null,   // parsed stats JSON .stats object
  dat: null,     // normalized player data from .dat
  histView: null, // currently selected player in history view
  snapshotDate: null // if set, we're viewing a historical snapshot (not live/current)
};

//  STORAGE (localStorage with in-memory fallback)
let MEM_STORE = {};
let STORAGE_OK = true;
try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); }
catch (e) { STORAGE_OK = false; }

function loadHistory(){
  if(!STORAGE_OK) return MEM_STORE;
  try { return JSON.parse(localStorage.getItem('mcstats_history') || '{}'); }
  catch(e){ return {}; }
}
function saveHistory(h){
  if(!STORAGE_OK){ MEM_STORE = h; return; }
  try { localStorage.setItem('mcstats_history', JSON.stringify(h)); }
  catch(e){ toast('Storage full or unavailable','err'); }
}

// fast hash for duplicate detection
function cyrb53(str){
  let h1=0xdeadbeef,h2=0x41c6ce57;
  for(let i=0,ch;i<str.length;i++){ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (4294967296*(2097151&h2)+(h1>>>0)).toString(16);
}


//  FORMATTERS
const fmtName = r => r.replace(/^minecraft:/,'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
function fmtTime(t){const s=Math.floor(t/20),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
  if(h>0)return `${h}h ${m}m`; if(m>0)return `${m}m ${s%60}s`; return `${s}s`;}
function fmtDist(cm){if(cm>=100000)return `${(cm/100000).toFixed(2)} km`;if(cm>=100)return `${(cm/100).toFixed(0)} m`;return `${cm} cm`;}
const fmtNum = n => (n==null?0:n).toLocaleString('en-US');
const fmtDmg = h => `${(h/10).toFixed(1)} ❤`;
function fmtDate(iso){const d=new Date(iso);return d.toLocaleDateString('en-US',{day:'2-digit',month:'2-digit',year:'2-digit'})+' '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});}
function fmtDateShort(iso){const d=new Date(iso);return d.toLocaleDateString('en-US',{day:'2-digit',month:'2-digit'});}


//  EMOJI MAPS
const BLOCK={'minecraft:stone':'🪨','minecraft:deepslate':'🪨','minecraft:cobblestone':'🪨','minecraft:dirt':'🟤','minecraft:grass_block':'🌱',
 'minecraft:sand':'🏜️','minecraft:gravel':'⬛','minecraft:coal_ore':'⚫','minecraft:deepslate_coal_ore':'⚫','minecraft:iron_ore':'⚙️',
 'minecraft:deepslate_iron_ore':'⚙️','minecraft:gold_ore':'🟡','minecraft:deepslate_gold_ore':'🟡','minecraft:diamond_ore':'💎',
 'minecraft:deepslate_diamond_ore':'💎','minecraft:emerald_ore':'💚','minecraft:deepslate_emerald_ore':'💚','minecraft:lapis_ore':'🔵',
 'minecraft:deepslate_lapis_ore':'🔵','minecraft:redstone_ore':'🔴','minecraft:deepslate_redstone_ore':'🔴','minecraft:ancient_debris':'🟣',
 'minecraft:netherrack':'🔺','minecraft:obsidian':'🌑','minecraft:crying_obsidian':'🌑','minecraft:chest':'📦','minecraft:barrel':'📦',
 'minecraft:crafting_table':'🔨','minecraft:furnace':'🔥','minecraft:blast_furnace':'🔥','minecraft:torch':'🕯️','minecraft:tnt':'💥',
 'minecraft:bookshelf':'📚','minecraft:ice':'🧊','minecraft:snow_block':'❄️','minecraft:water':'💧','minecraft:lava':'🌋',
 'minecraft:glowstone':'✨','minecraft:end_stone':'🟣','minecraft:nether_quartz_ore':'🤍','minecraft:clay':'🩶'};

const MOB={'minecraft:zombie':'🧟','minecraft:skeleton':'💀','minecraft:creeper':'💚','minecraft:spider':'🕷️','minecraft:cave_spider':'🕷️',
 'minecraft:enderman':'👁️','minecraft:blaze':'🔥','minecraft:ghast':'👻','minecraft:witch':'🧙','minecraft:wither':'☠️','minecraft:wither_skeleton':'☠️',
 'minecraft:ender_dragon':'🐉','minecraft:zombified_piglin':'🐷','minecraft:piglin':'🐷','minecraft:piglin_brute':'🐷','minecraft:hoglin':'🐗',
 'minecraft:zoglin':'🐗','minecraft:ravager':'🦏','minecraft:guardian':'🐟','minecraft:elder_guardian':'🐟','minecraft:shulker':'📦',
 'minecraft:zombie_villager':'🧟','minecraft:drowned':'🌊','minecraft:husk':'🏜️','minecraft:stray':'🏹','minecraft:phantom':'👁️',
 'minecraft:pillager':'⚔️','minecraft:vindicator':'⚔️','minecraft:evoker':'🔮','minecraft:vex':'👿','minecraft:slime':'💚','minecraft:magma_cube':'🟠',
 'minecraft:strider':'🔴','minecraft:silverfish':'🐛','minecraft:endermite':'🐛','minecraft:bee':'🐝','minecraft:wolf':'🐺',
 'minecraft:iron_golem':'🤖','minecraft:snow_golem':'⛄','minecraft:breeze':'🌀'};

const ITEM={'minecraft:diamond':'💎','minecraft:emerald':'💚','minecraft:gold_ingot':'🟡','minecraft:iron_ingot':'⚙️','minecraft:netherite_ingot':'🟣',
 'minecraft:coal':'⚫','minecraft:charcoal':'⚫','minecraft:redstone':'🔴','minecraft:lapis_lazuli':'🔵','minecraft:stick':'🪵','minecraft:string':'🧵',
 'minecraft:gunpowder':'💥','minecraft:ender_pearl':'🟢','minecraft:ender_eye':'👁️','minecraft:blaze_rod':'🔥','minecraft:blaze_powder':'🔥',
 'minecraft:bone':'🦴','minecraft:leather':'🟤','minecraft:feather':'🪶','minecraft:gold_nugget':'🟡','minecraft:iron_nugget':'⚙️','minecraft:quartz':'🤍',
 'minecraft:amethyst_shard':'💜','minecraft:arrow':'🏹','minecraft:spectral_arrow':'🏹','minecraft:book':'📖','minecraft:enchanted_book':'📘',
 'minecraft:paper':'📄','minecraft:map':'🗺️','minecraft:filled_map':'🗺️','minecraft:compass':'🧭','minecraft:clock':'🕐','minecraft:bucket':'🪣',
 'minecraft:water_bucket':'🪣','minecraft:lava_bucket':'🪣','minecraft:milk_bucket':'🥛','minecraft:totem_of_undying':'🗿','minecraft:nether_star':'⭐',
 'minecraft:dragon_egg':'🥚','minecraft:egg':'🥚','minecraft:experience_bottle':'🧪','minecraft:name_tag':'🏷️','minecraft:lead':'🪢',
 'minecraft:saddle':'🐴','minecraft:bow':'🏹','minecraft:crossbow':'🏹','minecraft:trident':'🔱','minecraft:shield':'🛡️','minecraft:fishing_rod':'🎣',
 'minecraft:flint_and_steel':'🔥','minecraft:shears':'✂️','minecraft:flint':'🪨','minecraft:elytra':'🪽','minecraft:apple':'🍎',
 'minecraft:golden_apple':'🍏','minecraft:enchanted_golden_apple':'🍏','minecraft:bread':'🍞','minecraft:cooked_beef':'🥩','minecraft:beef':'🥩',
 'minecraft:cooked_porkchop':'🥓','minecraft:porkchop':'🥓','minecraft:cooked_chicken':'🍗','minecraft:chicken':'🍗','minecraft:carrot':'🥕',
 'minecraft:golden_carrot':'🥕','minecraft:potato':'🥔','minecraft:baked_potato':'🥔','minecraft:melon_slice':'🍉','minecraft:cookie':'🍪',
 'minecraft:cake':'🍰','minecraft:pumpkin_pie':'🥧','minecraft:cod':'🐟','minecraft:cooked_cod':'🐟','minecraft:salmon':'🐟','minecraft:cooked_salmon':'🐟',
 'minecraft:mushroom_stew':'🍲','minecraft:sugar':'🍬','minecraft:wheat':'🌾','minecraft:wheat_seeds':'🌱','minecraft:water_bottle':'🧪',
 'minecraft:glass_bottle':'🧪','minecraft:slime_ball':'💚','minecraft:honey_bottle':'🍯','minecraft:scute':'🐢'};

function itemEmoji(id){
  if(ITEM[id])return ITEM[id]; if(BLOCK[id])return BLOCK[id];
  const n=id.replace(/^minecraft:/,'');
  const pat=[['shulker_box','📦'],['bundle','🎒'],['_helmet','🪖'],['_chestplate','🦺'],['_leggings','👖'],['_boots','🥾'],['_sword','🗡️'],['_pickaxe','⛏️'],
   ['_axe','🪓'],['_shovel','🥄'],['_hoe','🌾'],['potion','🧪'],['spawn_egg','🥚'],['music_disc','💿'],['_bed','🛏️'],['_wool','🧶'],['_carpet','🧶'],
   ['_dye','🎨'],['_banner','🚩'],['_log','🪵'],['_wood','🪵'],['_planks','🪵'],['_sapling','🌱'],['_seeds','🌱'],['_ore','⛏️'],['horse_armor','🐴'],
   ['_boat','🛶'],['minecart','🛒'],['_concrete','🟦'],['_terracotta','🧱'],['_glass','🪟'],['_door','🚪'],['_slab','▬'],['_stairs','📐'],
   ['ingot','🔩'],['nugget','🔸'],['template','📜'],['smithing','🔨'],['firework','🎆'],['candle','🕯️'],['head','💀'],['skull','💀']];
  for(const[k,e]of pat) if(n.includes(k)) return e;
  return '▪️';
}


//  ICONE REALI (texture Minecraft) con fallback emoji
//  Put the textures in the ./icons folder (see README).
//  Looks up: icons/<name>.png -> icons/item(s)/<name>.png -> icons/block(s)/<name>.png
const ICON_BASE='icons';
function iconHTML(id,emoji,cls='item-img'){
  const n=id.replace(/^minecraft:/,'');
  const cands=[`${ICON_BASE}/${n}.png`,`${ICON_BASE}/item/${n}.png`,`${ICON_BASE}/items/${n}.png`,`${ICON_BASE}/block/${n}.png`,`${ICON_BASE}/blocks/${n}.png`];
  const safe=(emoji||'▪️').replace(/"/g,'&quot;');
  return `<img class="${cls}" src="${cands[0]}" data-cands="${cands.slice(1).join('|')}" data-emoji="${safe}" alt="" onerror="iconFallback(this)">`;
}

// when a texture is missing: try the next candidate, then fall back to the emoji
window.iconFallback=function(img){
  const rest=(img.dataset.cands||'').split('|').filter(Boolean);
  if(rest.length){img.dataset.cands=rest.slice(1).join('|');img.src=rest[0];return;}
  const span=document.createElement('span');
  span.textContent=img.dataset.emoji||'▪️';
  span.style.cssText=img.classList.contains('si')?'font-size:14px;margin-right:.15rem':'font-size:1.35rem;line-height:1';
  img.replaceWith(span);
};

// ── Enchantments (official English names) ──
const ENCHANTS={
 sharpness:'Sharpness',smite:'Smite',bane_of_arthropods:'Bane of Arthropods',knockback:'Knockback',
 fire_aspect:'Fire Aspect',looting:'Looting',sweeping_edge:'Sweeping Edge',efficiency:'Efficiency',
 silk_touch:'Silk Touch',unbreaking:'Unbreaking',fortune:'Fortune',power:'Power',punch:'Punch',
 flame:'Flame',infinity:'Infinity',protection:'Protection',fire_protection:'Fire Protection',
 feather_falling:'Feather Falling',blast_protection:'Blast Protection',projectile_protection:'Projectile Protection',
 respiration:'Respiration',aqua_affinity:'Aqua Affinity',thorns:'Thorns',depth_strider:'Depth Strider',
 frost_walker:'Frost Walker',soul_speed:'Soul Speed',swift_sneak:'Swift Sneak',mending:'Mending',
 binding_curse:'Curse of Binding',vanishing_curse:'Curse of Vanishing',luck_of_the_sea:'Luck of the Sea',
 lure:'Lure',loyalty:'Loyalty',impaling:'Impaling',riptide:'Riptide',channeling:'Channeling',
 multishot:'Multishot',quick_charge:'Quick Charge',piercing:'Piercing',density:'Density',breach:'Breach',wind_burst:'Wind Burst'};
const SINGLE_LVL=new Set(['silk_touch','mending','flame','infinity','channeling','multishot','aqua_affinity','binding_curse','vanishing_curse']);
function roman(n){const t=[[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];if(n<1||n>10)return ''+n;let r='';for(const[v,s]of t)while(n>=v){r+=s;n-=v;}return r;}

function enchantList(it){
  if(!it)return [];
  const raw=[...(it.enchants||[]),...(it.storedEnchants||[])];
  return raw.map(e=>{
    const id=(e.id||'').replace(/^minecraft:/,'');
    const curse=id.includes('curse');
    const name=ENCHANTS[id]||fmtName(id);
    const lvl=e.lvl!=null?e.lvl:1;
    const lvlStr=(SINGLE_LVL.has(id)&&lvl<=1)?'':' '+roman(lvl);
    return {label:name+lvlStr,curse};
  });
}


//  NBT PARSER (per i file .dat)
async function gunzip(buf){
  const ds=new DecompressionStream('gzip');
  const stream=new Blob([buf]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

class NBTReader{
  constructor(bytes){this.b=bytes;this.v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.o=0;this.td=new TextDecoder('utf-8');}
  u8(){return this.b[this.o++];}
  i8(){const x=this.v.getInt8(this.o);this.o+=1;return x;}
  i16(){const x=this.v.getInt16(this.o);this.o+=2;return x;}
  u16(){const x=this.v.getUint16(this.o);this.o+=2;return x;}
  i32(){const x=this.v.getInt32(this.o);this.o+=4;return x;}
  i64(){const x=this.v.getBigInt64(this.o);this.o+=8;return x;}
  f32(){const x=this.v.getFloat32(this.o);this.o+=4;return x;}
  f64(){const x=this.v.getFloat64(this.o);this.o+=8;return x;}
  str(){const l=this.u16();const s=this.td.decode(this.b.subarray(this.o,this.o+l));this.o+=l;return s;}
  payload(t){
    switch(t){
      case 1:return this.i8(); case 2:return this.i16(); case 3:return this.i32();
      case 4:{const x=this.i64();return (x>=-9007199254740991n&&x<=9007199254740991n)?Number(x):x;}
      case 5:return this.f32(); case 6:return this.f64();
      case 7:{const l=this.i32();const a=[];for(let i=0;i<l;i++)a.push(this.i8());return a;}
      case 8:return this.str();
      case 9:{const et=this.u8();const l=this.i32();const a=[];for(let i=0;i<l;i++)a.push(this.payload(et));return a;}
      case 10:{const o={};while(true){const tt=this.u8();if(tt===0)break;const nm=this.str();o[nm]=this.payload(tt);}return o;}
      case 11:{const l=this.i32();const a=[];for(let i=0;i<l;i++)a.push(this.i32());return a;}
      case 12:{const l=this.i32();const a=[];for(let i=0;i<l;i++)a.push(this.i64());return a;}
      default:throw new Error('Tag NBT sconosciuto: '+t);
    }
  }
  parse(){const t=this.u8();if(t!==10)throw new Error('Root NBT non valido');this.str();return this.payload(10);}
}

async function parseDat(arrayBuffer){
  let bytes=new Uint8Array(arrayBuffer);
  // gzip magic 1f 8b -> decomprimi
  if(bytes[0]===0x1f && bytes[1]===0x8b) bytes=await gunzip(arrayBuffer);
  return new NBTReader(bytes).parse();
}

// extract the fields we care about from the player compound
// ── Item normalization: handles both the old `tag` format (≤1.20.4)
//    and the new `components` format (1.20.5+). Returns a single internal shape. ──
function normEnch(val){
  if(!val) return [];
  if(Array.isArray(val)){ // old: [{id, lvl}]
    return val.map(e=>({id:(e.id||'').replace(/^minecraft:/,''),lvl:e.lvl!=null?e.lvl:1}));
  }

  // new: {levels:{id:lvl}} or {id:lvl}
  const map=(val.levels&&typeof val.levels==='object')?val.levels:val;
  return Object.entries(map).filter(([k])=>k!=='show_in_tooltip')
    .map(([k,v])=>({id:k.replace(/^minecraft:/,''),lvl:typeof v==='number'?v:(v&&v.lvl!=null?v.lvl:1)}));
}

function textFromComponent(c){
  if(c==null)return null;
  if(typeof c==='string')return c;
  if(Array.isArray(c))return c.map(textFromComponent).join('');
  let s=c.text!=null?c.text:'';
  if(c.extra)s+=textFromComponent(c.extra);
  return s||null;
}

function extractText(v){
  if(v==null)return null;
  if(typeof v==='string'){const t=v.trim();
    if(t[0]==='{'||t[0]==='['||t[0]==='"'){try{return textFromComponent(JSON.parse(t));}catch(e){return v;}}
    return v;}
  return textFromComponent(v);
}

function normItem(raw){
  if (!raw||!raw.id)return null;
  const isNew=!!raw.components, comp=raw.components||raw.tag||{};
  const count=raw.count!=null?raw.count:(raw.Count!=null?raw.Count:1);
  const slot=raw.Slot!=null?raw.Slot:null;
  let enchants,stored;
  if (isNew){enchants=normEnch(comp['minecraft:enchantments']);stored=normEnch(comp['minecraft:stored_enchantments']);}
  else{enchants=normEnch(comp.Enchantments);stored=normEnch(comp.StoredEnchantments);}

  // shulker/container/bundle contents
  let contents=null, kind=null;
  if(isNew&&Array.isArray(comp['minecraft:container'])){
    contents=comp['minecraft:container'].map(en=>{const ni=normItem(en.item||{});if(ni)ni.slot=en.slot!=null?en.slot:null;return ni;}).filter(Boolean);
    kind='shulker';
  }
  else if (comp.BlockEntityTag&&Array.isArray(comp.BlockEntityTag.Items)){
    contents=comp.BlockEntityTag.Items.map(normItem).filter(Boolean);
    kind='shulker';
  }
  else if (isNew&&Array.isArray(comp['minecraft:bundle_contents'])){
    contents=comp['minecraft:bundle_contents'].map(normItem).filter(Boolean);
    kind='bundle';
  }
  else if (!isNew&&Array.isArray(comp.Items)&&/bundle/.test(raw.id||'')){
    contents=comp.Items.map(normItem).filter(Boolean);
    kind='bundle';
  }

  // custom name
  let name=null;
  if (isNew)name=extractText(comp['minecraft:custom_name']);
  else if(comp.display&&comp.display.Name!=null)name=extractText(comp.display.Name);
  return {id:raw.id,count,slot,enchants,storedEnchants:stored,contents,containerKind:kind,customName:name};
}

function normalizeDat(root){

  // some versions nest the player under a field, but player.dat is direct
  const inv=(root.Inventory||[]).map(normItem).filter(Boolean);
  const ender=(root.EnderItems||[]).map(normItem).filter(Boolean);
  const pos=root.Pos||null;
  const dim=root.Dimension||null;
  let death=null;
  if (root.LastDeathLocation){death={pos:root.LastDeathLocation.pos,dim:root.LastDeathLocation.dimension};}
  let spawn=null;
  if (root.SpawnX!=null){spawn={x:root.SpawnX,y:root.SpawnY,z:root.SpawnZ,dim:root.SpawnDimension||'minecraft:overworld'};}
  return {
    health:root.Health!=null?root.Health:null,
    food:root.foodLevel!=null?root.foodLevel:null,
    saturation:root.foodSaturationLevel!=null?root.foodSaturationLevel:null,
    xpLevel:root.XpLevel!=null?root.XpLevel:0,
    xpP:root.XpP!=null?root.XpP:0,
    xpTotal:root.XpTotal!=null?root.XpTotal:0,
    gameType:root.playerGameType!=null?root.playerGameType:null,
    pos:pos,dim:dim,death:death,spawn:spawn,
    inventory:inv,ender:ender
  };
}

// map items by slot
function itemBySlot(list){const m={};for(const it of list){if(it&&it.slot!=null)m[it.slot]=it;}return m;}

// already-normalized shulker/container contents
function shulkerItems(it){return (it&&Array.isArray(it.contents)&&it.contents.length)?it.contents:null;}
function isEnchanted(it){return it&&((it.enchants&&it.enchants.length)||(it.storedEnchants&&it.storedEnchants.length));}
function itemDisplayName(it){
  if(it.customName)return {name:it.customName,custom:true};
  return {name:fmtName(it.id),custom:false};
}

// builds the tooltip HTML for an item
function tipHTML(it){
  const {name,custom}=itemDisplayName(it);
  const c=it.count!=null?it.count:1;
  let h=`<div class="tip-name${custom?' custom':''}">${escapeHtml(name)}${c>1?` ×${c}`:''}</div>`;
  h+=`<div class="tip-id">${it.id}</div>`;
  const ench=enchantList(it);
  if(ench.length){h+=`<div class="tip-ench">`+ench.map(e=>`<div class="${e.curse?'curse':''}">${escapeHtml(e.label)}</div>`).join('')+`</div>`;}
  return h;
}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}


//  PIXEL BAR + SLOTS
function pixelBar(frac,color,blocks=18){
  const f=Math.max(1,Math.round(frac*blocks));let h='<div class="pixel-bar">';
  for(let i=0;i<blocks;i++)h+=`<div class="px ${i<f?'on-'+color:''}"></div>`;return h+'</div>';
}

function slotHTML(it,opts={}){
  if(!it)return `<div class="slot${opts.armor?' armor':''}"></div>`;
  const c=it.count!=null?it.count:1;
  const shulker=shulkerItems(it);
  const cls=['slot','has-item'];
  if(opts.armor)cls.push('armor');
  if(isEnchanted(it))cls.push('ench');
  if(shulker)cls.push('clickable');
  let data=` data-tip="${encodeURIComponent(tipHTML(it))}"`;
  if(shulker)data+=` data-shulker="${encodeURIComponent(JSON.stringify(it))}"`;
  return `<div class="${cls.join(' ')}"${data}>${iconHTML(it.id,itemEmoji(it.id))}${c>1?`<span class="count">${c}</span>`:''}</div>`;
}


//  CONFIG OVERVIEW + TABS (statistiche)
const OVERVIEW=[
 {key:'minecraft:play_time',label:'Play Time',icon:'⏱️',color:'green',fmt:fmtTime},
 {key:'minecraft:deaths',label:'Deaths',icon:'💀',color:'red',fmt:fmtNum,sub:'times'},
 {key:'minecraft:mob_kills',label:'Mob Kills',icon:'⚔️',color:'gold',fmt:fmtNum},
 {key:'minecraft:walk_one_cm',label:'Walked',icon:'🚶',color:'blue',fmt:fmtDist},
 {key:'minecraft:sprint_one_cm',label:'Sprinted',icon:'🏃',color:'blue',fmt:fmtDist},
 {key:'minecraft:fly_one_cm',label:'Flown',icon:'🪂',color:'purple',fmt:fmtDist},
 {key:'minecraft:jump',label:'Jumps',icon:'⬆️',color:'gold',fmt:fmtNum,sub:'times'},
 {key:'minecraft:damage_dealt',label:'Damage Dealt',icon:'⚔️',color:'red',fmt:fmtDmg},
 {key:'minecraft:damage_taken',label:'Damage Taken',icon:'🛡️',color:'red',fmt:fmtDmg},
 {key:'minecraft:animals_bred',label:'Animals Bred',icon:'🐄',color:'gold',fmt:fmtNum},
 {key:'minecraft:fish_caught',label:'Fish Caught',icon:'🎣',color:'blue',fmt:fmtNum},
 {key:'minecraft:sleep_in_bed',label:'Nights Slept',icon:'🛏️',color:'purple',fmt:fmtNum},
 {key:'minecraft:open_chest',label:'Chests Opened',icon:'📦',color:'gold',fmt:fmtNum},
 {key:'minecraft:raid_win',label:'Raids Won',icon:'🏆',color:'gold',fmt:fmtNum}
];

const TABS=[
 {id:'mined',label:'⛏️ Mined',key:'minecraft:mined',color:'gold',emoji:BLOCK},
 {id:'killed',label:'⚔️ Mobs Killed',key:'minecraft:killed',color:'red',emoji:MOB},
 {id:'used',label:'🖱️ Used',key:'minecraft:used',color:'green',emoji:{}},
 {id:'crafted',label:'🔨 Crafted',key:'minecraft:crafted',color:'gold',emoji:{}},
 {id:'picked_up',label:'📦 Picked Up',key:'minecraft:picked_up',color:'blue',emoji:{}},
 {id:'killed_by',label:'💀 Killed By',key:'minecraft:killed_by',color:'red',emoji:MOB},
 {id:'dropped',label:'🗑️ Dropped',key:'minecraft:dropped',color:'green',emoji:{}}
];


//  RENDER: STATISTICHE

function renderStatsView(){
  const root=document.getElementById('stats-content');
  if(!STATE.stats){
    root.innerHTML=`<div class="need-file"><div class="nf-icon">📊</div>
      Load the statistics file <code>world/stats/&lt;uuid&gt;.json</code><br>to see this section.</div>`;
    return;
  }

  const s=STATE.stats, custom=s['minecraft:custom']||{};
  let html=snapshotBanner();
  html+=`<div class="section-header"><span class="section-label">OVERVIEW</span><div class="section-divider"></div></div><div class="overview-grid">`;
  for(const o of OVERVIEW){const v=custom[o.key]||0;html+=`<div class="stat-card sc-${o.color}"><div class="sc-icon">${o.icon}</div>
    <div class="sc-label">${o.label}</div><div class="sc-value">${o.fmt(v)}</div>${o.sub?`<div class="sc-sub">${o.sub}</div>`:''}</div>`;}
  html+=`</div><div class="section-header"><span class="section-label">LEADERBOARDS</span><div class="section-divider"></div></div>`;
  html+=`<div class="tabs">`;
  TABS.forEach((t,i)=>{const has=s[t.key]&&Object.keys(s[t.key]).length;
    html+=`<button class="tab-btn${i===0?' active':''}" data-tab="${t.id}" style="${has?'':'opacity:.45'}">${t.label}</button>`;});
  html+=`</div>`;
  TABS.forEach((t,i)=>{html+=`<div class="tab-panel${i===0?' active':''}" id="panel-${t.id}">${listHTML(s[t.key],t.emoji,t.color)}</div>`;});
  root.innerHTML=html;
  wireSnapshotBanner(root);
  root.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>{
    root.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
    root.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');document.getElementById('panel-'+b.dataset.tab).classList.add('active');
  }));
}

function listHTML(data,emojiMap,color,topN=20){
  if(!data||!Object.keys(data).length)return '<div class="empty">No data for this category.</div>';
  const isMob=(emojiMap===MOB);
  const sorted=Object.entries(data).sort((a,b)=>b[1]-a[1]).slice(0,topN);const max=sorted[0][1];
  let h='<div class="stat-list">';
  sorted.forEach(([k,v],i)=>{const rc=i===0?'r1':i===1?'r2':i===2?'r3':'';
    const ic=isMob?(emojiMap[k]||'▪️'):iconHTML(k,emojiMap[k]||itemEmoji(k),'si');
    h+=`<div class="stat-row"><div class="rank ${rc}">#${i+1}</div><div class="stat-row-mid">
      <div class="stat-name">${ic} ${fmtName(k)}</div>${pixelBar(v/max,color)}</div>
      <div class="stat-count">${fmtNum(v)}</div></div>`;});
  return h+'</div>';
}


//  RENDER: PLAYER STATE
const GAMEMODES=['Survival','Creative','Adventure','Spectator'];
function heartsHTML(val,max=20){let h='<div class="bar-row">';const n=Math.ceil(max/2);
  for(let i=0;i<n;i++){const hv=Math.max(0,Math.min(2,val-i*2));h+=`<span class="heart"><span class="fill" style="width:${hv/2*100}%"></span></span>`;}return h+'</div>';}
function shanksHTML(val,max=20){let h='<div class="bar-row">';const n=Math.ceil(max/2);
  for(let i=0;i<n;i++){const hv=Math.max(0,Math.min(2,val-i*2));h+=`<span class="shank"><span class="fill" style="width:${hv/2*100}%"></span></span>`;}return h+'</div>';}
function dimChip(dim){if(!dim)return '';const d=dim.replace('minecraft:','');const cls=d.includes('nether')?'dim-nether':d.includes('end')?'dim-end':'dim-overworld';
  const lbl=d.includes('nether')?'Nether':d.includes('end')?'End':'Overworld';return `<span class="dim-chip ${cls}">${lbl}</span>`;}

function renderStateView(){
  const root=document.getElementById('state-content');
  if(!STATE.dat){
    root.innerHTML=snapshotBanner()+`<div class="need-file"><div class="nf-icon">🎒</div>
      ${STATE.snapshotDate?'This snapshot has no saved player state (.dat).':'Load the player state file <code>world/playerdata/&lt;uuid&gt;.dat</code><br>to see inventory, health, position and more.'}</div>`;
    wireSnapshotBanner(root);
    return;
  }
  const d=STATE.dat;
  let html=snapshotBanner();

  // VITALS
  html+=`<div class="section-header"><span class="section-label">VITALS</span><div class="section-divider"></div></div><div class="vitals">`;
  if(d.health!=null)html+=`<div class="vital-card"><div class="vital-label"><span>❤️ Health</span><span class="v-num">${d.health.toFixed(1)} / 20</span></div>${heartsHTML(d.health)}</div>`;
  if(d.food!=null)html+=`<div class="vital-card"><div class="vital-label"><span>🍖 Hunger</span><span class="v-num">${d.food} / 20</span></div>${shanksHTML(d.food)}</div>`;
  html+=`<div class="vital-card"><div class="vital-label"><span>✨ Experience</span><span class="v-num">total ${fmtNum(d.xpTotal)}</span></div>
    <div style="display:flex;align-items:center;gap:.8rem"><span class="xp-level">${d.xpLevel}</span>
    <div style="flex:1"><div class="xp-bar"><div class="xp-fill" style="width:${Math.round(d.xpP*100)}%"></div></div></div></div></div>`;
  if(d.gameType!=null)html+=`<div class="vital-card"><div class="vital-label"><span>🎮 Game Mode</span></div><span class="gm-chip gm-${d.gameType}">${GAMEMODES[d.gameType]||'?'}</span></div>`;
  html+=`</div>`;

  // POSITIONS
  html+=`<div class="section-header"><span class="section-label">POSITIONS</span><div class="section-divider"></div></div><div class="pos-grid">`;
  if(d.pos)html+=posCard('📍 Current Position',d.pos[0],d.pos[1],d.pos[2],d.dim);
  if(d.death)html+=posCard('💀 Last Death',d.death.pos[0],d.death.pos[1],d.death.pos[2],d.death.dim);
  if(d.spawn)html+=posCard('🛏️ Respawn Point',d.spawn.x,d.spawn.y,d.spawn.z,d.spawn.dim);
  if(!d.pos&&!d.death&&!d.spawn)html+=`<div class="empty">No position recorded.</div>`;
  html+=`</div>`;

  // EQUIP + INVENTORY
  const slots=itemBySlot(d.inventory);
  html+=`<div class="section-header"><span class="section-label">INVENTORY</span><div class="section-divider"></div></div>`;
  html+=`<div class="inv-layout"><div class="equip">
    <div class="inv-block-label">Armor</div>
    ${slotHTML(slots[103],{armor:1})}${slotHTML(slots[102],{armor:1})}${slotHTML(slots[101],{armor:1})}${slotHTML(slots[100],{armor:1})}
    <div class="inv-block-label" style="margin-top:.6rem">Off-hand</div>${slotHTML(slots[-106],{armor:1})}
  </div><div>`;
  // hotbar
  html+=`<div class="inv-block"><div class="inv-block-label">Hotbar</div><div class="inv-grid">`;
  for(let i=0;i<9;i++)html+=slotHTML(slots[i]);html+=`</div></div>`;
  // main
  html+=`<div class="inv-block"><div class="inv-block-label">Backpack</div><div class="inv-grid">`;
  for(let i=9;i<36;i++)html+=slotHTML(slots[i]);html+=`</div></div>`;
  html+=`</div></div><div id="shulker-host"></div>`;

  // ENDER CHEST
  html+=`<div class="section-header"><span class="section-label">ENDER CHEST</span><div class="section-divider"></div></div>`;
  const eslots=itemBySlot(d.ender);
  html+=`<div class="inv-grid" style="margin-bottom:.4rem">`;
  for(let i=0;i<27;i++)html+=slotHTML(eslots[i]);html+=`</div>`;

  root.innerHTML=html;
  wireSnapshotBanner(root);

  // container click (shulker / bundle)
  root.querySelectorAll('.slot[data-shulker]').forEach(el=>el.addEventListener('click',()=>{
    const it=JSON.parse(decodeURIComponent(el.dataset.shulker));showContainer(it);
  }));
}

function posCard(title,x,y,z,dim){
  return `<div class="pos-card"><div class="pos-title">${title}</div>
    <div class="pos-coords"><span><span class="axis">X</span> ${Math.round(x)}</span><span><span class="axis">Y</span> ${Math.round(y)}</span><span><span class="axis">Z</span> ${Math.round(z)}</span></div>
    ${dimChip(dim)}</div>`;
}

function showContainer(it){
  const host=document.getElementById('shulker-host');
  const items=shulkerItems(it)||[];
  const isBundle=it.containerKind==='bundle';
  let g='';
  if (isBundle){
    if (items.length){for(const x of items)g+=slotHTML(x);}
    else g='<div class="empty" style="padding:1rem">Empty bundle</div>';
  } else {
    const slots=itemBySlot(items);
    for(let i=0;i<27;i++)g+=slotHTML(slots[i]);
  }

  const label=it.customName||fmtName(it.id);
  const icon=isBundle?'🎒':'📦';
  const count=isBundle?` <span style="color:var(--muted);font-weight:400">(${items.length} item${items.length!==1?'s':''})</span>`:'';
  host.innerHTML=`<div class="shulker-detail"><h4><span>${icon} ${escapeHtml(label)}${count}</span><span class="x" id="shulker-close">✕ close</span></h4><div class="inv-grid">${g}</div></div>`;
  host.querySelector('#shulker-close').addEventListener('click',()=>host.innerHTML='');
  host.querySelectorAll('.slot[data-shulker]').forEach(el=>el.addEventListener('click',()=>showContainer(JSON.parse(decodeURIComponent(el.dataset.shulker)))));
  host.scrollIntoView({behavior:'smooth',block:'nearest'});
}


//  RENDER: HISTORY + CHARTS
const METRICS=[
 {id:'play',label:'⏱️ Play time (h)',color:'#4ade80',calc:s=>(s.play_time||0)/72000},
 {id:'deaths',label:'💀 Deaths',color:'#f87171',calc:s=>s.deaths||0},
 {id:'mined',label:'⛏️ Blocks mined',color:'#f59e0b',calc:s=>s.mined||0},
 {id:'killed',label:'⚔️ Mobs killed',color:'#60a5fa',calc:s=>s.killed||0},
 {id:'walk',label:'🚶 Distance (km)',color:'#a78bfa',calc:s=>(s.walk_cm||0)/100000}
];
let CUR_METRIC='play';
function sumVals(o){if(!o)return 0;return Object.values(o).reduce((a,b)=>a+b,0);}

// trasforma uno snapshot (stats complete) nella forma compatta usata dai grafici
function compactFromStats(date,ts,stats){
  const c=stats['minecraft:custom']||{};
  return {date,ts,play_time:c['minecraft:play_time']||0,deaths:c['minecraft:deaths']||0,
    mined:sumVals(stats['minecraft:mined']),killed:sumVals(stats['minecraft:killed']),walk_cm:c['minecraft:walk_one_cm']||0};
}

// ── Sorgente storico: su DISCO (bridge) in Live mode, altrimenti localStorage ──
async function getHistoryIndex(){
  if(LIVE.connected){const r=await bridgeGET('/history');return (r.players||[]).map(p=>({id:p.uuid,name:p.name,count:p.count}));}
  const h=loadHistory();return Object.keys(h).map(u=>({id:u,name:h[u].customName||h[u].lastName,count:h[u].snapshots.length}));
}
async function getHistorySeries(id){
  if(LIVE.connected){const r=await bridgeGET('/history',{uuid:id});return {name:r.name,snaps:r.snapshots||[]};}
  const h=loadHistory(),p=h[id]||{snapshots:[]};
  return {name:p.customName||p.lastName,snaps:p.snapshots.map(s=>compactFromStats(s.date,s.date,s.stats))};
}
async function deleteHistSnapshot(id,ts){
  if(LIVE.connected){await bridgeGET('/delete',{uuid:id,ts});return;}
  const h=loadHistory();if(h[id]){h[id].snapshots=h[id].snapshots.filter(x=>x.date!==ts);if(!h[id].snapshots.length)delete h[id];saveHistory(h);}
}
async function clearHistPlayer(id){
  if(LIVE.connected){await bridgeGET('/clear',{uuid:id});return;}
  const h=loadHistory();delete h[id];saveHistory(h);
}

async function renderHistoryView(){
  const root=document.getElementById('history-content');
  let index;
  try{index=await getHistoryIndex();}catch(e){
    root.innerHTML=`<div class="need-file"><div class="nf-icon">📈</div>Bridge unreachable — can't read the on-disk history.</div>`;return;}
  if(!index.length){
    root.innerHTML=`<div class="need-file"><div class="nf-icon">📈</div>
      History is empty.<br>Snapshots are saved ${LIVE.connected?'on disk in your archive folder':'in this browser'} each time stats are imported.<br>
      Import the same player on different days to see the charts over time.</div>`;
    return;
  }
  // seleziona giocatore
  if(!STATE.histView||!index.find(p=>p.id===STATE.histView)){
    const match=index.find(p=>p.id.replace(/-/g,'')===(STATE.uuid||''));
    STATE.histView=match?match.id:index[0].id;
  }
  const sel=STATE.histView;
  const series=await getHistorySeries(sel);
  const snaps=[...series.snaps].sort((a,b)=>new Date(a.date)-new Date(b.date));

  let html=`<div class="section-header"><span class="section-label">PLAYER</span><div class="section-divider"></div></div><div class="hist-players">`;
  for(const p of index){const nm=p.name||p.id.replace(/-/g,'').slice(0,8);
    html+=`<button class="hp-chip${p.id===sel?' active':''}" data-u="${p.id}">${nm}<span class="cnt">${p.count}</span></button>`;}
  html+=`</div>`;

  if(snaps.length<2){
    html+=`<div class="empty" style="margin-bottom:1.5rem">You need at least <strong>2 snapshots</strong> on different dates to draw a chart.<br>
      Currently: ${snaps.length}.</div>`;
  }else{
    html+=`<div class="metric-tabs">`;
    for(const m of METRICS)html+=`<button class="tab-btn${m.id===CUR_METRIC?' active':''}" data-m="${m.id}">${m.label}</button>`;
    html+=`</div><div class="chart-wrap" id="chart-wrap">${chartSVG(snaps,CUR_METRIC)}</div>`;
  }

  html+=`<div class="section-header"><span class="section-label">SAVED SNAPSHOTS</span><div class="section-divider"></div></div>`;
  html+=`<table class="snap-table"><thead><tr><th>Date</th><th>Play time</th><th>Deaths</th><th>Mined</th><th>Killed</th><th></th></tr></thead><tbody>`;
  [...snaps].reverse().forEach(sn=>{
    html+=`<tr class="clickable" data-ts="${sn.ts}" data-date="${sn.date}" title="Click to view this snapshot"><td>${fmtDate(sn.date)}</td><td>${fmtTime(sn.play_time||0)}</td><td>${sn.deaths||0}</td>
      <td>${fmtNum(sn.mined||0)}</td><td>${fmtNum(sn.killed||0)}</td>
      <td><span class="del" data-del="${sn.ts}" title="Delete">🗑️</span></td></tr>`;});
  html+=`</tbody></table><div class="hist-actions"><button class="btn-ghost" id="btn-clear-player">Clear this player's history</button></div>`;

  root.innerHTML=html;
  root.querySelectorAll('.hp-chip').forEach(b=>b.addEventListener('click',()=>{STATE.histView=b.dataset.u;renderHistoryView();}));
  root.querySelectorAll('.metric-tabs .tab-btn').forEach(b=>b.addEventListener('click',()=>{CUR_METRIC=b.dataset.m;renderHistoryView();}));
  root.querySelectorAll('tr.clickable').forEach(tr=>tr.addEventListener('click',()=>viewSnapshot(sel,tr.dataset.ts,tr.dataset.date)));
  root.querySelectorAll('.del').forEach(b=>b.addEventListener('click',async(e)=>{
    e.stopPropagation();await deleteHistSnapshot(sel,b.dataset.del);toast('Snapshot deleted','ok');renderHistoryView();
  }));
  const cp=document.getElementById('btn-clear-player');
  if(cp)cp.addEventListener('click',async()=>{if(confirm("Clear all history for this player?")){
    await clearHistPlayer(sel);STATE.histView=null;toast('History cleared','ok');renderHistoryView();}});
}

// apre uno snapshot salvato e lo mostra nelle viste Statistiche / Stato Giocatore
async function viewSnapshot(id,ts,date){
  if(LIVE.connected){
    try{
      const r=await bridgeGET('/snapshot',{uuid:id,ts});
      STATE.uuid=id.replace(/-/g,'');STATE.stats=r.stats||null;STATE.dat=null;
      if(r.dat_b64){const b=Uint8Array.from(atob(r.dat_b64),c=>c.charCodeAt(0));STATE.dat=normalizeDat(await parseDat(b.buffer));}
    }catch(e){toast('Load failed: '+e.message,'err');return;}
  }else{
    const h=loadHistory(),p=h[id];const snap=p&&p.snapshots.find(s=>s.date===ts);
    if(!snap){toast('Snapshot not found','err');return;}
    STATE.uuid=id;STATE.stats=snap.stats;STATE.dat=null;
  }
  STATE.snapshotDate=date;
  document.getElementById('player-avatar').style.display='';
  document.getElementById('btn-rename').style.display='';
  loadPlayerInfo(id);
  renderAll();switchView('stats');window.scrollTo(0,0);
}

// torna ai dati correnti / esce dalla vista snapshot
function exitSnapshot(){
  STATE.snapshotDate=null;
  if(LIVE.connected){
    const p=LIVE.players.find(x=>x.uuid.replace(/-/g,'')===STATE.uuid);
    if(p){loadLivePlayer(p.uuid);return;}
  }
  renderAll();switchView('history');
}

// banner mostrato nelle viste quando si guarda uno snapshot storico
function snapshotBanner(){
  if(!STATE.snapshotDate)return '';
  return `<div class="snap-banner">📅 Viewing snapshot from <strong>${fmtDate(STATE.snapshotDate)}</strong>
    <button class="sb-back" id="sb-back">${LIVE.connected?'← Back to live':'✕ Exit snapshot'}</button></div>`;
}
function wireSnapshotBanner(root){
  const b=root.querySelector('#sb-back');if(b)b.addEventListener('click',exitSnapshot);
}


function chartSVG(snaps,metricId){
  const m=METRICS.find(x=>x.id===metricId);
  const pts=snaps.map(s=>({date:s.date,val:m.calc(s)}));
  const W=640,H=280,padL=48,padR=20,padT=24,padB=42;
  const maxV=Math.max(...pts.map(p=>p.val),1)*1.12;
  const X=i=>padL+(pts.length===1?0:(i/(pts.length-1))*(W-padL-padR));
  const Y=v=>padT+(1-v/maxV)*(H-padT-padB);
  // gridlines
  let grid='',ylabels='';const steps=4;
  for(let i=0;i<=steps;i++){const v=maxV*i/steps,y=Y(v);
    grid+=`<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#2a2a50" stroke-width="1"/>`;
    ylabels+=`<text x="${padL-8}" y="${y+4}" text-anchor="end" fill="#64748b" font-size="11" font-family="monospace">${v>=1000?(v/1000).toFixed(1)+'k':v.toFixed(metricId==='deaths'||metricId==='mined'||metricId==='killed'?0:1)}</text>`;}
  // line + area
  const line=pts.map((p,i)=>`${i===0?'M':'L'}${X(i).toFixed(1)},${Y(p.val).toFixed(1)}`).join(' ');
  const area=`M${X(0).toFixed(1)},${Y(0).toFixed(1)} `+pts.map((p,i)=>`L${X(i).toFixed(1)},${Y(p.val).toFixed(1)}`).join(' ')+` L${X(pts.length-1).toFixed(1)},${Y(0).toFixed(1)} Z`;
  let dots='',xlabels='';
  pts.forEach((p,i)=>{dots+=`<circle cx="${X(i).toFixed(1)}" cy="${Y(p.val).toFixed(1)}" r="4" fill="${m.color}" stroke="#0d0d16" stroke-width="2"><title>${fmtDate(p.date)}: ${p.val.toFixed(1)}</title></circle>`;
    if(pts.length<=8||i%Math.ceil(pts.length/7)===0)xlabels+=`<text x="${X(i).toFixed(1)}" y="${H-padB+20}" text-anchor="middle" fill="#64748b" font-size="11" font-family="monospace">${fmtDateShort(p.date)}</text>`;});
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g-${metricId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${m.color}" stop-opacity="0.25"/><stop offset="100%" stop-color="${m.color}" stop-opacity="0"/></linearGradient></defs>
    ${grid}${ylabels}<path d="${area}" fill="url(#g-${metricId})"/>
    <path d="${line}" fill="none" stroke="${m.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}${xlabels}</svg>`;
}


//  PLAYER INFO (avatar + name)

async function loadPlayerInfo(rawUuid){
  const nameEl=document.getElementById('player-name'),uuidEl=document.getElementById('player-uuid'),av=document.getElementById('player-avatar');
  const clean=rawUuid.replace(/-/g,'');
  const fUuid=rawUuid.includes('-')?rawUuid:`${clean.slice(0,8)}-${clean.slice(8,12)}-${clean.slice(12,16)}-${clean.slice(16,20)}-${clean.slice(20)}`;
  uuidEl.textContent=fUuid;
  av.style.display='';av.src=`https://crafatar.com/avatars/${clean}?size=64&overlay`;
  av.onerror=()=>{av.src=`https://minotar.net/avatar/${clean}/64.png`;av.onerror=()=>{av.style.display='none';};};

  // name: custom from history first, then Mojang
  const hist=loadHistory();
  if(hist[clean]&&hist[clean].customName){nameEl.textContent=hist[clean].customName;return;}
  try{const r=await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${clean}`);
    if(r.ok){const j=await r.json();if(j.name){nameEl.textContent=j.name;rememberName(clean,j.name);return;}}}catch(e){}
  nameEl.textContent=clean.slice(0,8).toUpperCase();
}
function rememberName(uuid,name){const h=loadHistory();if(h[uuid]){h[uuid].lastName=name;saveHistory(h);}}


//  HISTORY: add snapshot with dedup

function addSnapshot(uuid,stats,silent){
  const h=loadHistory();
  if(!h[uuid])h[uuid]={customName:null,lastName:null,snapshots:[]};
  const hash=cyrb53(JSON.stringify(stats));
  if(h[uuid].snapshots.some(s=>s.hash===hash)){
    if(!silent)toast('Identical snapshot already in history — not added','warn');
    return false;
  }
  h[uuid].snapshots.push({date:new Date().toISOString(),hash,stats});
  saveHistory(h);
  if(!silent)toast('📈 Snapshot saved to history','ok');
  return true;
}


//  FILE HANDLING

function uuidFromFile(file){return file.name.replace(/\.(json|dat)$/i,'');}

function readJSON(file){return new Promise((res,rej)=>{const r=new FileReader();
  r.onload=e=>{try{const j=JSON.parse(e.target.result);res(j.stats||j);}catch(err){rej(err);}};r.onerror=rej;r.readAsText(file);});}
function readDAT(file){return new Promise((res,rej)=>{const r=new FileReader();
  r.onload=async e=>{try{res(normalizeDat(await parseDat(e.target.result)));}catch(err){rej(err);}};r.onerror=rej;r.readAsArrayBuffer(file);});}

async function handleFiles(fileList){
  const files=[...fileList];if(!files.length)return;
  LIVE.connected=false;if(LIVE.timer){clearInterval(LIVE.timer);LIVE.timer=null;}
  document.getElementById('live-bar').classList.add('hidden');
  STATE.snapshotDate=null;
  let loadedUuid=STATE.uuid,gotStats=false,gotDat=false;
  for(const f of files){
    const uuid=uuidFromFile(f).replace(/-/g,'');
    const ext=f.name.split('.').pop().toLowerCase();
    try{
      if(ext==='json'){
        const stats=await readJSON(f);
        if(loadedUuid&&loadedUuid!==uuid&&(STATE.stats||STATE.dat)){STATE.dat=null;} // player changed
        STATE.stats=stats;loadedUuid=uuid;gotStats=true;
        addSnapshot(uuid,stats);
      }else if(ext==='dat'){
        const dat=await readDAT(f);
        if(loadedUuid&&loadedUuid!==uuid&&(STATE.stats||STATE.dat)){STATE.stats=null;}
        STATE.dat=dat;loadedUuid=uuid;gotDat=true;
      }else{toast('Unsupported format: .'+ext,'err');}
    }catch(err){toast(`Error reading ${f.name}: ${err.message}`,'err');console.error(err);}
  }
  if(!loadedUuid)return;
  STATE.uuid=loadedUuid;
  document.getElementById('drop-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('btn-rename').style.display='';
  loadPlayerInfo(loadedUuid);
  renderAll();
  // go to the most relevant view
  if(gotDat&&!gotStats)switchView('state');
  else switchView('stats');
  window.scrollTo(0,0);
}

function renderAll(){renderStatsView();renderStateView();renderHistoryView();}

// Apre l'app direttamente sulla sezione Storico, senza richiedere il caricamento di un file
function openHistoryOnly(){
  STATE.uuid=null;STATE.stats=null;STATE.dat=null;LIVE.connected=false;STATE.snapshotDate=null;
  document.getElementById('drop-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('live-bar').classList.add('hidden');
  // header neutro: nessun giocatore caricato
  document.getElementById('player-avatar').style.display='none';
  document.getElementById('player-name').textContent='History';
  document.getElementById('player-uuid').textContent='No file loaded';
  document.getElementById('btn-rename').style.display='none';
  renderAll();
  switchView('history');
  window.scrollTo(0,0);
}
document.getElementById('btn-history-only').addEventListener('click',openHistoryOnly);


//  LIVE MODE (bridge locale che legge i file del server)
const LIVE={url:null,world:null,auto:false,intervalMin:180,timer:null,players:[],lastUpdate:null,connected:false};
function loadLiveCfg(){try{return JSON.parse(localStorage.getItem('mcstats_live')||'{}');}catch(e){return {};}}
function saveLiveCfg(){try{localStorage.setItem('mcstats_live',JSON.stringify({url:LIVE.url,world:LIVE.world,auto:LIVE.auto,intervalMin:LIVE.intervalMin}));}catch(e){}}
function bridgeBase(){return (LIVE.url||'http://localhost:8723').replace(/\/$/,'');}

async function bridgeGET(path,params){
  const u=new URL(bridgeBase()+path);
  if(LIVE.world)u.searchParams.set('world',LIVE.world);
  for(const k in (params||{}))u.searchParams.set(k,params[k]);
  const r=await fetch(u.toString(),{cache:'no-store'});
  if(!r.ok){let e;try{e=(await r.json()).error;}catch(_){}throw new Error(e||('HTTP '+r.status));}
  return r.json();
}
async function bridgePlayers(){return (await bridgeGET('/players')).players||[];}

// connessione al bridge
async function liveConnect(world,url){
  LIVE.world=(world||'').trim();LIVE.url=(url||'').trim()||null;
  if(!LIVE.world){toast('Enter the world folder path','warn');return;}
  const btn=document.getElementById('live-connect');btn.disabled=true;btn.textContent='Connecting…';
  try{
    const players=await bridgePlayers();
    saveLiveCfg();
    enterLive(players);
  }catch(err){
    toast('Bridge unreachable: '+err.message+' — is the script running?','err');
  }finally{btn.disabled=false;btn.textContent='Connect';}
}

function enterLive(players){
  LIVE.players=players;LIVE.connected=true;
  document.getElementById('drop-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('live-bar').classList.remove('hidden');
  document.getElementById('player-avatar').style.display='';
  document.getElementById('btn-rename').style.display='';
  buildLiveSelector();
  bulkImport();
  const ck=document.getElementById('lb-auto');ck.checked=LIVE.auto;
  const isel=document.getElementById('lb-interval');if(isel)isel.value=String(LIVE.intervalMin);
  if(LIVE.auto)setAuto(true);
  if(players.length)loadLivePlayer(players[0].uuid);
  else{switchView('history');renderAll();updateLiveBar();}
}

function buildLiveSelector(){
  const sel=document.getElementById('lb-player');
  sel.innerHTML=LIVE.players.map(p=>{
    const clean=p.uuid.replace(/-/g,'');
    const nm=p.name||clean.slice(0,8);
    return `<option value="${p.uuid}">${nm}</option>`;
  }).join('');
}

// archivia su disco tutti i giocatori (snapshot solo se cambiati)
async function bulkImport(){
  try{
    const r=await bridgeGET('/refresh-all');
    if(r.players){LIVE.players=r.players;buildLiveSelector();}
    if(r.added)toast('📈 Archived '+r.added+' new snapshot'+(r.added>1?'s':''),'ok');
  }catch(e){updateLiveBar(true);}
  LIVE.lastUpdate=new Date();updateLiveBar();renderHistoryView();
}

// carica un giocatore dal bridge: /refresh archivia (se cambiato) e ritorna i dati correnti
async function loadLivePlayer(dashedUuid){
  STATE.uuid=dashedUuid.replace(/-/g,'');STATE.stats=null;STATE.dat=null;STATE.snapshotDate=null;
  try{
    const r=await bridgeGET('/refresh',{uuid:dashedUuid});
    if(r.stats)STATE.stats=r.stats;
    if(r.dat_b64){const bytes=Uint8Array.from(atob(r.dat_b64),c=>c.charCodeAt(0));STATE.dat=normalizeDat(await parseDat(bytes.buffer));}
  }catch(e){toast('Load failed: '+e.message,'err');}
  loadPlayerInfo(dashedUuid);
  renderAll();LIVE.lastUpdate=new Date();updateLiveBar();
  const sel=document.getElementById('lb-player');if(sel)sel.value=dashedUuid;
  switchView('stats');
}

// AGGIORNA il giocatore attualmente visualizzato (bottone refresh)
async function refreshCurrent(){
  if(!STATE.uuid){toast('No player selected','warn');return;}
  let p=LIVE.players.find(x=>x.uuid.replace(/-/g,'')===STATE.uuid);
  if(!p){try{LIVE.players=await bridgePlayers();buildLiveSelector();p=LIVE.players.find(x=>x.uuid.replace(/-/g,'')===STATE.uuid);}catch(e){}}
  if(!p){toast('Player not found on the server','err');return;}
  await loadLivePlayer(p.uuid);
  toast('🔄 '+document.getElementById('player-name').textContent+' updated','ok');
}

// ciclo automatico ad intervallo configurabile: archivia tutti su disco + aggiorna il corrente
function setAuto(on){
  LIVE.auto=on;saveLiveCfg();
  if(LIVE.timer){clearInterval(LIVE.timer);LIVE.timer=null;}
  if(on)LIVE.timer=setInterval(autoCycle,LIVE.intervalMin*60*1000);
}
function fmtInterval(min){return min>=60?(min%60===0?(min/60)+' h':(min/60).toFixed(1)+' h'):min+' min';}
async function autoCycle(){
  try{
    const r=await bridgeGET('/refresh-all');
    if(r.players){LIVE.players=r.players;buildLiveSelector();}
    if(STATE.uuid){const me=LIVE.players.find(x=>x.uuid.replace(/-/g,'')===STATE.uuid);if(me)await loadLivePlayer(me.uuid);}
    LIVE.lastUpdate=new Date();renderAll();updateLiveBar();
    if(r.added)toast('📈 Auto-import: '+r.added+' new snapshot'+(r.added>1?'s':''),'ok');
  }catch(e){updateLiveBar(true);}
}

function updateLiveBar(offline){
  const dot=document.getElementById('lb-dot'),st=document.getElementById('lb-status'),tm=document.getElementById('lb-time');
  if(!dot)return;
  dot.classList.toggle('off',!!offline);
  st.textContent=offline?'Disconnected':'Live';
  if(LIVE.lastUpdate)tm.textContent='updated '+LIVE.lastUpdate.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}

// eventi Live
document.getElementById('live-toggle').addEventListener('click',()=>{
  const b=document.getElementById('live-body');b.classList.toggle('hidden');
  // prefill da config salvata
  const cfg=loadLiveCfg();
  if(cfg.world&&!document.getElementById('live-world').value)document.getElementById('live-world').value=cfg.world;
  if(cfg.url&&!document.getElementById('live-url').value)document.getElementById('live-url').value=cfg.url;
});
document.getElementById('live-connect').addEventListener('click',()=>{
  const cfg=loadLiveCfg();
  LIVE.auto=cfg.auto||false;
  if(cfg.intervalMin)LIVE.intervalMin=cfg.intervalMin;
  liveConnect(document.getElementById('live-world').value,document.getElementById('live-url').value);
});
document.getElementById('lb-player').addEventListener('change',e=>loadLivePlayer(e.target.value));
document.getElementById('lb-refresh').addEventListener('click',refreshCurrent);
document.getElementById('lb-auto').addEventListener('change',e=>{setAuto(e.target.checked);
  toast(e.target.checked?('Auto-import every '+fmtInterval(LIVE.intervalMin)+' enabled'):'Auto-import disabled','ok');});
document.getElementById('lb-interval').addEventListener('change',e=>{
  LIVE.intervalMin=parseInt(e.target.value,10)||180;saveLiveCfg();
  if(LIVE.auto){setAuto(true);toast('Auto-import set to every '+fmtInterval(LIVE.intervalMin),'ok');}
});



//  NAV + UI

function switchView(v){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+v));
}
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));

let toastTimer;
function toast(msg,type=''){const t=document.getElementById('toast');t.textContent=msg;t.className=type;
  void t.offsetWidth;t.classList.add('show',type);clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),3200);}

// ── TOOLTIP item (hover) ──
const tipEl=document.getElementById('tooltip');
function placeTip(e){
  const pad=14,w=tipEl.offsetWidth,h=tipEl.offsetHeight;
  let x=e.clientX+pad,y=e.clientY+pad;
  if(x+w>innerWidth-8)x=e.clientX-w-pad;
  if(y+h>innerHeight-8)y=e.clientY-h-pad;
  tipEl.style.left=Math.max(8,x)+'px';tipEl.style.top=Math.max(8,y)+'px';
}
document.addEventListener('mouseover',e=>{
  const slot=e.target.closest('.slot[data-tip]');if(!slot)return;
  tipEl.innerHTML=decodeURIComponent(slot.dataset.tip);
  tipEl.classList.add('show');placeTip(e);
});
document.addEventListener('mousemove',e=>{if(tipEl.classList.contains('show'))placeTip(e);});
document.addEventListener('mouseout',e=>{
  const slot=e.target.closest('.slot[data-tip]');
  if(slot&&!slot.contains(e.relatedTarget))tipEl.classList.remove('show');
});

// rename
document.getElementById('btn-rename').addEventListener('click',async()=>{
  if(!STATE.uuid)return;
  const cur=document.getElementById('player-name').textContent;
  const name=prompt('Assign a name to this player:',cur);
  if(name===null)return;const nm=name.trim();
  if(LIVE.connected){
    try{await bridgeGET('/set-name',{uuid:STATE.uuid,name:nm});}catch(e){toast('Save failed: '+e.message,'err');return;}
    LIVE.players=await bridgePlayers().catch(()=>LIVE.players);buildLiveSelector();
  }else{
    const h=loadHistory();
    if(!h[STATE.uuid])h[STATE.uuid]={customName:null,lastName:null,snapshots:[]};
    h[STATE.uuid].customName=nm||null;saveHistory(h);
  }
  document.getElementById('player-name').textContent=nm||STATE.uuid.slice(0,8).toUpperCase();
  toast('Name updated','ok');renderHistoryView();
});


//  EVENTS (drop / input)

const dz=document.getElementById('drop-zone'),fi=document.getElementById('file-input'),fiAdd=document.getElementById('file-input-add');
dz.addEventListener('click',()=>fi.click());
fi.addEventListener('change',e=>handleFiles(e.target.files));
fiAdd.addEventListener('change',e=>{handleFiles(e.target.files);fiAdd.value='';});
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragover');});
dz.addEventListener('dragleave',()=>dz.classList.remove('dragover'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('dragover');handleFiles(e.dataTransfer.files);});

document.getElementById('btn-add').addEventListener('click',()=>fiAdd.click());
document.getElementById('btn-reset').addEventListener('click',()=>{
  document.getElementById('app').classList.add('hidden');
  document.getElementById('live-bar').classList.add('hidden');
  document.getElementById('drop-screen').classList.remove('hidden');
  document.getElementById('player-avatar').style.display='';
  document.getElementById('btn-rename').style.display='';
  if(LIVE.timer){clearInterval(LIVE.timer);LIVE.timer=null;}
  LIVE.connected=false;
  fi.value='';STATE.stats=null;STATE.dat=null;STATE.uuid=null;STATE.histView=null;window.scrollTo(0,0);
});

// global drop on the app
window.addEventListener('dragover',e=>{if(!document.getElementById('app').classList.contains('hidden'))e.preventDefault();});
window.addEventListener('drop',e=>{if(!document.getElementById('app').classList.contains('hidden')){e.preventDefault();handleFiles(e.dataTransfer.files);}});

if(!STORAGE_OK)setTimeout(()=>toast('Saving unavailable in preview: download the file to use history','warn'),800);
