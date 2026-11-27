"use strict";
// Tier List Studio: import characters (KoiLog / VNDB), rank them on tiers, export a picture (see export.js).

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STORE = "tierlistStudio.v1";

const TIER_PRESETS = {
  "S – F": [["S", "#ff7f7f"], ["A", "#ffbf7f"], ["B", "#ffdf7f"], ["C", "#bfff7f"], ["D", "#7fbfff"], ["F", "#bf7fff"]],
  "Stars": [["5 ★", "#f2b94b"], ["4 ★", "#e58fb0"], ["3 ★", "#9c8fe0"], ["2 ★", "#6aaed6"], ["1 ★", "#8fa3a8"]],
  "Love scale": [["Soulmate", "#e8467c"], ["Adore", "#f08a5d"], ["Like", "#f2c14e"], ["Fine", "#7bc47f"], ["Not for me", "#7a8ba8"]],
  "Top tiers": [["Best boy", "#d6a63c"], ["Great", "#c96b8c"], ["Good", "#8f7bd1"], ["Okay", "#5fa3c4"], ["Skip", "#8a8f9c"]],
};

let uid = 0;
const newId = () => "t" + Date.now().toString(36) + (uid++).toString(36);
const makeTiers = (preset) => preset.map(([name, color]) => ({ id: newId(), name, color, keys: [] }));

const DEFAULT_UI = { poolPos: "right", poolW: 340, boardCard: 84, poolCard: 64, labelW: 96, labelFs: 22, vennCard: 56, axisCard: 7, captions: true, numbered: false, heroines: "show", awardCrown: "crown", awardButton: "metallic", awardPlaque: "step", coverSide: "left", coverPos: "top" };
const VENN_COLORS = ["#e8467c", "#3aa0e0", "#f2b94b"];
const makeVenn = (n = 3) => ({ n, size: 100, overlap: 55,
  circles: [["Best personality", 0], ["Best design", 1], ["Best voice", 2]].map(([name, i]) => ({ name, color: VENN_COLORS[i] })), regions: {} });
const makeAxis = () => ({ xMin: "Hate", xMax: "Love", yMin: "Villain", yMax: "Hero", grid: 10, aspect: "square", numbers: false, nMin: -5, nMax: 5,
  snap: false, axisColor: "", gridColor: "", quad: ["", "", "", ""], pos: {} });
const makeAwards = () => ({ cols: 0, cats: [], scope: "", byGame: {} });
const awardSets = () => [state.awards, ...Object.values(state.awards.byGame || {})];                 // every set of awards (all games)
const curAwards = () => (state.awards.scope ? ((state.awards.byGame ||= {})[state.awards.scope] ||= { cols: 0, cats: [] }) : state.awards);
// saved lists from older versions have awards without the per-game parts: fill in what is missing
function fixAwards(a) {
  a = a && typeof a === "object" ? a : {};
  return { ...a, cols: +a.cols || 0, cats: Array.isArray(a.cats) ? a.cats : [], scope: typeof a.scope === "string" ? a.scope : "", last: typeof a.last === "string" ? a.last : "", byGame: a.byGame && typeof a.byGame === "object" ? a.byGame : {} };
}   // the set being edited
const gamesOf = (it) => it?.games || (it?.game ? [it.game] : []);
const inScope = (k) => state.mode !== "awards" || !state.awards.scope || gamesOf(state.items[k]).includes(state.awards.scope);
function cleanAwardSet(aw) {
  aw = aw || {};
  const cv = aw.cover && typeof aw.cover.img === "string" ? { img: aw.cover.img.slice(0, 500), imgHi: String(aw.cover.imgHi || aw.cover.img).slice(0, 500) } : null;
  return { cols: Math.min(4, Math.max(0, +aw.cols || 0)), ...(cv ? { cover: cv } : {}), cats: (Array.isArray(aw.cats) ? aw.cats : []).filter((c) => c && typeof c.title === "string").slice(0, 80).map((c) => ({
    id: c.id || newId(), title: c.title.slice(0, 60), auto: c.auto || "",
    slots: [0, 1, 2].map((i) => (c.slots && state.items[c.slots[i]] ? c.slots[i] : null)), blurbs: [0, 1, 2].map((i) => String(c.blurbs?.[i] || "").slice(0, 120)) })) };
}
const state = { name: "My character tier list", mode: "tier", tiers: makeTiers(TIER_PRESETS["S – F"]), items: {}, order: [], venn: makeVenn(), axis: makeAxis(), ui: { ...DEFAULT_UI }, customPresets: {}, kind: "characters", other: null, awards: makeAwards(), scales: makeScales(), match: makeMatch() };
let selected = null;

// ---------- persistence ----------
// The saved list can be a megabyte, so a burst of changes (an import adds a game at a time) is written once.
let saveTimer = 0, saveDirty = false;
function saveNow() {
  clearTimeout(saveTimer); if (!saveDirty) return; saveDirty = false;
  try { localStorage.setItem(STORE, JSON.stringify(slimState())); saveNow.warned = false; }
  catch (e) {   // storage full or blocked: say so once, instead of quietly losing changes
    if (!saveNow.warned) { saveNow.warned = true; toast("Couldn't save: the browser's storage is full or blocked. Use More → Save list to file to keep a copy.", "error"); }
  }
}
function save() { saveDirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); }
addEventListener("pagehide", saveNow); addEventListener("beforeunload", saveNow);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveNow(); });
// ...and a burst of redraws is drawn once per frame
let renderRaf = 0;
function renderSoon() { if (!renderRaf) renderRaf = requestAnimationFrame(() => { renderRaf = 0; render(); }); }
// What gets saved leaves out what can be rebuilt on load (about a third of the size): each character's own key, the full-size
// picture link when it is the thumbnail link with one word changed, a games list that only repeats the one game, and empty values.
const deriveHi = (u) => (u ? u.replace("/thumbnail.webp", "/original.webp").replace("/cv.t/", "/cv/") : "");
function slimItem(it) {
  const o = { ...it }; delete o.key;
  if (o.imgHi && o.imgHi === deriveHi(o.img)) delete o.imgHi;
  if (o.games && o.games.length === 1 && o.games[0] === o.game) delete o.games;
  if (o.alt === o.label) delete o.alt;
  if (!o.rating) delete o.rating;
  if (Array.isArray(o.sub) && !o.sub.some(Boolean)) delete o.sub;
  if (o.vote === 0) delete o.vote;
  return o;
}
function hydrateItems(items) {   // the reverse; harmless on items that are already complete
  const out = {};
  for (const [k, it] of Object.entries(items && typeof items === "object" ? items : {})) {
    if (!it || typeof it !== "object") continue;
    const o = { ...it, key: k }; if (o.img && !o.imgHi) o.imgHi = deriveHi(o.img);
    out[k] = o;
  }
  return out;
}
function slimState() {
  const slim = (items) => Object.fromEntries(Object.entries(items || {}).map(([k, it]) => [k, slimItem(it)]));
  return { ...state, items: slim(state.items), other: state.other ? { ...state.other, items: slim(state.other.items) } : null };
}
function load(doc) {
  if (!doc || !Array.isArray(doc.tiers)) return false;
  doc = { ...doc, items: hydrateItems(doc.items) };
  state.name = doc.name || state.name;
  state.tiers = doc.tiers.map((t) => ({ id: t.id || newId(), name: t.name || "", color: t.color || "#888888", keys: (t.keys || []).filter((k) => doc.items && doc.items[k]) }));
  state.items = doc.items || {};
  state.order = (doc.order || Object.keys(state.items)).filter((k) => state.items[k]);
  state.mode = ["venn", "axis", "awards", ...PAGE_MODES].includes(doc.mode) ? doc.mode : "tier";
  state.scales = cleanScales(doc.scales); state.match = cleanMatch(doc.match, state.items);
  const v = doc.venn;
  if (v && Array.isArray(v.circles) && v.circles.length >= 2) {
    state.venn = { n: v.n === 2 ? 2 : 3, size: +v.size || 100, overlap: v.overlap ?? 55, regions: {},
      circles: [0, 1, 2].map((i) => ({ name: v.circles[i]?.name ?? makeVenn().circles[i].name, color: v.circles[i]?.color || VENN_COLORS[i] })) };
    for (const [r, ks] of Object.entries(v.regions || {})) state.venn.regions[r] = (ks || []).filter((k) => state.items[k]);
  } else state.venn = makeVenn();
  const ax = doc.axis || {};
  state.axis = { ...makeAxis(), ...ax, quad: [0, 1, 2, 3].map((i) => String(ax.quad?.[i] ?? "")), pos: {} };
  for (const [k, p] of Object.entries(ax.pos || {})) if (state.items[k] && p && isFinite(p.x) && isFinite(p.y)) state.axis.pos[k] = { x: +p.x, y: +p.y };
  state.ui = { ...DEFAULT_UI, ...(doc.ui || {}) };
  state.customPresets = doc.customPresets && typeof doc.customPresets === "object" ? doc.customPresets : {};
  const aw = doc.awards || {};
  state.awards = { ...cleanAwardSet(aw), scope: typeof aw.scope === "string" ? aw.scope.slice(0, 200) : "", last: typeof aw.last === "string" ? aw.last.slice(0, 200) : "",
    byGame: Object.fromEntries(Object.entries(aw.byGame && typeof aw.byGame === "object" ? aw.byGame : {}).slice(0, 600).map(([g, v]) => [g.slice(0, 200), cleanAwardSet(v)])) };
  state.kind = doc.kind === "games" ? "games" : "characters";
  const o = doc.other; state.other = o && Array.isArray(o.tiers) && o.items && o.venn && o.axis ? o : null; // the list you're not looking at
  if (state.other) { state.other.awards = fixAwards(state.other.awards); state.other.items = hydrateItems(state.other.items); state.other.scales = cleanScales(state.other.scales); state.other.match = cleanMatch(state.other.match, state.other.items); }
  if (state.kind === "games") { state.awards.scope = ""; if (isPageMode()) state.mode = "tier"; }
  return true;
}
try { load(JSON.parse(localStorage.getItem(STORE))); } catch (e) { /* first run */ }

// ---------- two lists: characters and games ----------
const LIST_KEYS = ["name", "mode", "tiers", "items", "order", "venn", "axis", "awards", "scales", "match"];
const freshList = (kind) => ({ name: kind === "games" ? "My game tier list" : "My character tier list", mode: "tier", tiers: makeTiers(TIER_PRESETS["S – F"]), items: {}, order: [], venn: makeVenn(), axis: makeAxis(), awards: makeAwards(), scales: makeScales(), match: makeMatch() });
function switchKind(kind) {
  if (kind === state.kind) return;
  const snap = Object.fromEntries(LIST_KEYS.map((k) => [k, state[k]]));
  const next = state.other || freshList(kind); next.awards = fixAwards(next.awards); if (kind === "games") next.awards.scope = ""; next.scales = cleanScales(next.scales); next.match = cleanMatch(next.match, next.items); if (kind === "games" && PAGE_MODES.includes(next.mode)) next.mode = "tier";   // per-game awards and scales are for characters
  scopeSigReset();
  LIST_KEYS.forEach((k) => (state[k] = next[k]));
  state.other = snap; state.kind = kind; selected = null; save(); renderVennBar.lastMode = null;
  render(); syncImportTabs();
}

// ---------- small helpers ----------
function toast(msg, kind = "") {
  const t = $("#toast"); t.textContent = msg; t.className = "toast " + kind; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3800);
}
function inkFor(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex || ""); if (!m) return "#111";
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1a1a1a" : "#ffffff";
}
const imgSrc = (u) => (u ? `/proxy/img?u=${encodeURIComponent(u)}` : "");
// Heroine = the player character. KoiLog "protagonist" / VNDB "main". Double-click a card to flip it by hand.
const isHeroine = (it) => (it.heroine !== undefined ? !!it.heroine : it.role === "heroine");
// who is shown: everyone, or by role (heroine / love interest / side character)
const HERO_FILTERS = { show: "Show everyone", hide: "Hide heroines", only: "Heroines only", li: "Love interests only", heroli: "Heroines + love interests", side: "Side characters only" };
const roleClass = (it) => (isHeroine(it) ? "heroine" : it.role === "love" ? "love" : it.role === "side" || it.role === "other" ? "side" : "");
const heroMatch = (m, it) => { const c = roleClass(it); return m === "hide" ? c !== "heroine" : m === "only" ? c === "heroine" : m === "li" ? c === "love" : m === "heroli" ? c === "heroine" || c === "love" : m === "side" ? c === "side" : true; };
const heroOk = (it) => state.kind === "games" || heroMatch(state.ui.heroines, it);
const visible = (k) => !!state.items[k] && heroOk(state.items[k]);
const roleOf = (r) => ({ protagonist: "heroine", main: "heroine", love_interest: "love", primary: "love", side: "side" }[r] || "other");
const roleOk = (role, who) => who === "all" || (role === "heroine" && (who === "love+heroine" || who === "heroine")) || (role === "love" && (who === "love" || who === "love+heroine"));
const placed = () => new Set(state.mode === "awards" ? [] : state.mode === "venn" ? Object.values(state.venn.regions).flat() : state.mode === "axis" ? Object.keys(state.axis.pos) : state.tiers.flatMap((t) => t.keys));

async function mapPool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; await fn(list[k], k); }
  }));
}

// ---------- layout settings ----------
function applyUi() {
  const u = state.ui, r = document.documentElement.style;
  r.setProperty("--card-w", u.boardCard + "px"); r.setProperty("--pool-card", u.poolCard + "px"); r.setProperty("--label-w", u.labelW + "px");
  r.setProperty("--label-fs", u.labelFs + "px"); r.setProperty("--pool-w", u.poolW + "px"); r.setProperty("--venn-card", u.vennCard + "px");
  document.body.classList.toggle("no-captions", !u.captions);
  document.body.classList.toggle("pool-bottom", u.poolPos === "bottom");
  r.setProperty("--axis-card", u.axisCard);
  const games = state.kind === "games";
  document.body.classList.toggle("kind-games", games);
  $("#heroFilter").hidden = games; $("#btnAuto").hidden = isPageMode() || (games && state.mode !== "tier" && state.mode !== "awards");
  $("#modeSeg").querySelectorAll("button").forEach((b) => (b.hidden = games && PAGE_MODES.includes(b.dataset.mode)));
  document.body.classList.toggle("is-scales", isPageMode()); $("#btnExport").hidden = state.mode === "match";
  $("#kindSeg").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === state.kind)));
  document.body.classList.toggle("is-venn", state.mode === "venn");
  document.body.classList.toggle("is-axis", state.mode === "axis");
}

// ---------- boards ----------
function cardHtml(key, idx) {
  const it = state.items[key]; if (!it) return "";
  const tip = [it.label, it.alt && it.alt !== it.label ? it.alt : "", it.game, it.rating ? `your rating ${it.rating}/5` : ""].filter(Boolean).join(" · ");
  return `<figure class="card${selected === key ? " sel" : ""}" draggable="true" data-key="${esc(key)}" title="${esc(tip)}">
    ${it.img ? `<img loading="lazy" decoding="async" src="${esc(imgSrc(it.img))}" alt="">` : `<span class="ph">${esc((it.label || "?")[0])}</span>`}
    ${idx != null ? `<span class="num">${idx + 1}</span>` : ""}${isHeroine(it) ? `<span class="hbadge" title="Heroine">♀</span>` : ""}<figcaption>${esc(it.label)}</figcaption></figure>`;
}

// Venn geometry in a 100-wide space (height varies). Also used by export.js.
function vennGeom(v) {
  const n = v.n, r0 = 27 * (v.size / 100), d = r0 * (2.2 - 1.2 * (v.overlap / 100));
  const cs = n === 2 ? [[-d / 2, 0], [d / 2, 0]] : [[-d / 2, 0], [d / 2, 0], [0, d * 0.866]];
  const minX = Math.min(...cs.map((c) => c[0] - r0)), maxX = Math.max(...cs.map((c) => c[0] + r0));
  const minY = Math.min(...cs.map((c) => c[1] - r0)), maxY = Math.max(...cs.map((c) => c[1] + r0));
  const sc = Math.min(1, 74 / (maxX - minX)), W = (maxX - minX) * sc, H = (maxY - minY) * sc, mx = 13, my = 11;
  const circles = cs.map(([x, y]) => ({ cx: mx + (x - minX) * sc + (74 - W) / 2, cy: my + (y - minY) * sc, r: r0 * sc }));
  const vh = H + my * 2;
  const keyAt = (x, y) => circles.map((c, i) => ((x - c.cx) ** 2 + (y - c.cy) ** 2 <= c.r ** 2 ? i : -1)).filter((i) => i >= 0).join("");
  const acc = {};
  for (let y = 0; y < vh; y += 0.5) for (let x = 0; x < 100; x += 0.5) {
    const k = keyAt(x, y); if (!k) continue;
    const a = (acc[k] ||= { sx: 0, sy: 0, n: 0 }); a.sx += x; a.sy += y; a.n++;
  }
  const regions = {};
  for (const [k, a] of Object.entries(acc)) {
    const cx = a.sx / a.n, cy = a.sy / a.n; let x0 = cx, x1 = cx, y0 = cy, y1 = cy;
    while (keyAt(x0 - 0.5, cy) === k) x0 -= 0.5;
    while (keyAt(x1 + 0.5, cy) === k) x1 += 0.5;
    while (keyAt(cx, y0 - 0.5) === k) y0 -= 0.5;
    while (keyAt(cx, y1 + 0.5) === k) y1 += 0.5;
    regions[k] = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }
  const mid = { x: circles.reduce((a, c) => a + c.cx, 0) / n, y: circles.reduce((a, c) => a + c.cy, 0) / n };
  const labels = circles.map((c) => {
    if (n === 2) return { x: c.cx, y: c.cy - c.r - 1.5, ax: 0, ay: -1 };
    const dx = c.cx - mid.x, dy = c.cy - mid.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    return { x: c.cx + ux * (c.r + 1.5), y: c.cy + uy * (c.r + 1.5), ax: Math.abs(ux) < 0.3 ? 0 : Math.sign(ux), ay: uy < -0.3 ? -1 : uy > 0.3 ? 1 : 0 };
  });
  return { vh, circles, regions, labels, keyAt };
}

/** Largest card width (<= cap) that lets n cards fit in a bw x bh box. */
function fitCard(n, bw, bh, cap, min, gap = 3, ratio = 1.25, extra = () => 0) {
  for (let cw = Math.floor(cap); cw > min; cw--) {
    const per = Math.floor((bw + gap) / (cw + gap)); if (per < 1) continue;
    const rows = Math.ceil(n / per);
    if (rows * (cw * ratio + extra(cw)) + (rows - 1) * gap <= bh) return cw;
  }
  return min;
}

function vennBoardHtml() {
  const v = state.venn, g = vennGeom(v), px = (x) => x.toFixed(2) + "%", py = (y) => (y / g.vh * 100).toFixed(2) + "%";
  const circ = g.circles.map((c, i) => `<div class="vcircle" style="left:${px(c.cx - c.r)};top:${py(c.cy - c.r)};width:${px(c.r * 2)};height:${py(c.r * 2)};background:${esc(v.circles[i].color)}33;border-color:${esc(v.circles[i].color)}"></div>`).join("");
  const labs = g.labels.map((l, i) => `<div class="vlabel" style="left:${px(l.x)};top:${py(l.y)};transform:translate(${-50 + l.ax * 50}%,${-50 + l.ay * 50}%);color:${esc(v.circles[i].color)}">${esc(v.circles[i].name)}</div>`).join("");
  const regs = Object.entries(g.regions).map(([k, r]) => {
    const keys = (v.regions[k] || []).filter(visible);
    const ppu = ($("#board").clientWidth || 900) / 100;
    const cw = keys.length ? fitCard(keys.length, r.w * 0.92 * ppu, r.h * 0.86 * ppu, state.ui.vennCard, 16, 3, state.kind === "games" ? 1.42 : 1.25) : state.ui.vennCard;
    return `<div class="vregion" data-region="${k}" style="left:${px(r.cx)};top:${py(r.cy)};width:${px(r.w * 0.92)};--venn-card:${cw}px">${keys.map((x) => cardHtml(x)).join("")}</div>`;
  }).join("");
  return `<div class="venn" id="venn" style="aspect-ratio:100/${g.vh.toFixed(2)}">${circ}${labs}${regs}</div>`;
}

function renderVennBar() {
  const bar = $("#vennBar"), v = state.venn; bar.hidden = state.mode !== "venn"; if (bar.hidden) return;
  bar.innerHTML = `<label>Circles <select id="vN"><option value="2"${v.n === 2 ? " selected" : ""}>2</option><option value="3"${v.n === 3 ? " selected" : ""}>3</option></select></label>
    ${v.circles.slice(0, v.n).map((c, i) => `<span class="vc"><input type="color" data-vc="${i}" data-f="color" value="${esc(c.color)}" aria-label="Circle ${i + 1} colour"><input data-vc="${i}" data-f="name" value="${esc(c.name)}" maxlength="30" aria-label="Circle ${i + 1} name"></span>`).join("")}
    <label>Circle size <input type="range" id="vSize" min="60" max="130" value="${v.size}"></label>
    <label>Overlap <input type="range" id="vOver" min="15" max="95" value="${v.overlap}"></label>`;
}

function render() {
  const venn = state.mode === "venn";
  applyUi();
  if (renderVennBar.lastMode !== state.mode + state.venn.n) { renderVennBar(); renderAxisBar(); renderVennBar.lastMode = state.mode + state.venn.n; }
  $("#modeSeg").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
  $("#btnTiers").hidden = state.mode !== "tier"; $("#btnAuto").textContent = { venn: "Auto-fill from ratings", axis: "Auto-plot from ratings", awards: "Auto-nominate from ratings", tier: "Auto-rank by rating" }[state.mode] || "";
  $("#awardsBar").hidden = state.mode !== "awards"; if (state.mode === "awards") { $("#awCols").value = String(curAwards().cols); fillPackMenu(); fillScopeBar(); }
  if (state.mode === "match") { matchRender(); if (document.activeElement !== $("#listName")) $("#listName").value = state.name; return; }
  if (isScalesMode()) { scRender(); if (document.activeElement !== $("#listName")) $("#listName").value = state.name; return; }
  if (state.mode === "awards") { $("#board").innerHTML = awardsBoardHtml(); if (state.awards.scope && !castInfo[state.awards.scope]) loadCast(state.awards.scope); }
  else if (state.mode === "axis") $("#board").innerHTML = axisBoardHtml();
  else if (venn) $("#board").innerHTML = vennBoardHtml();
  else $("#board").innerHTML = state.tiers.map((t) => `
    <div class="tier" data-tier="${t.id}">
      <div class="tier-label" data-rename="${t.id}" style="background:${esc(t.color)};color:${inkFor(t.color)}" title="Double-click to rename"><span>${esc(t.name)}</span></div>
      <div class="tier-cards" data-tier="${t.id}">${t.keys.filter(visible).map((k, i) => cardHtml(k, state.ui.numbered ? i : null)).join("")}</div>
    </div>`).join("");
  renderPool();
  if (document.activeElement !== $("#listName")) $("#listName").value = state.name;
}

// The pool can hold thousands of characters. Only the first page is drawn; more are added as you scroll to the end.
const POOL_PAGE = 120;
let poolKeys = [], poolShown = 0, poolSig = "", poolObserver = null;
const poolChunk = (from, to) => { let h = ""; for (let i = from; i < to; i++) h += cardHtml(poolKeys[i]); return h; };
const poolMoreHtml = () => (poolShown < poolKeys.length ? `<button type="button" class="ghost pool-more" id="poolMore">Show ${Math.min(POOL_PAGE, poolKeys.length - poolShown)} more (${poolKeys.length - poolShown} left)</button>` : "");
function watchPoolEnd() {
  if (poolObserver) { poolObserver.disconnect(); poolObserver = null; }
  const el = $("#poolMore"); if (!el || !("IntersectionObserver" in window)) return;
  poolObserver = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) loadMorePool(); }, { root: $("#pool"), rootMargin: "500px" });
  poolObserver.observe(el);
}
function loadMorePool() {
  const el = $("#poolMore"); if (!el) return;
  const to = Math.min(poolKeys.length, poolShown + POOL_PAGE), from = poolShown; el.remove(); poolShown = to;
  $("#pool").insertAdjacentHTML("beforeend", poolChunk(from, to) + poolMoreHtml()); watchPoolEnd();
}
$("#pool").addEventListener("click", (e) => { const m = e.target.closest("#poolMore"); if (m) { e.stopPropagation(); loadMorePool(); } });

function renderPool() {
  const inBoard = placed();
  const q = $("#poolSearch").value.trim().toLowerCase();
  let keys = state.order.filter((k) => !inBoard.has(k) && visible(k) && inScope(k));
  const all = keys.length;
  if (q) keys = keys.filter((k) => `${state.items[k].label} ${state.items[k].alt || ""} ${state.items[k].game || ""}`.toLowerCase().includes(q));
  const sort = $("#poolSort").value;
  if (sort === "name") keys.sort((a, b) => state.items[a].label.localeCompare(state.items[b].label));
  else if (sort === "game") keys.sort((a, b) => (state.items[a].game || "").localeCompare(state.items[b].game || "") || state.items[a].label.localeCompare(state.items[b].label));
  else if (sort === "rating") keys.sort((a, b) => (state.items[b].rating || 0) - (state.items[a].rating || 0));
  // how many are flagged, so the filter never fails silently
  const counts = { show: 0, hide: 0, only: 0, li: 0, heroli: 0, side: 0 }; let nManual = 0, nRoleless = 0;
  for (const k of state.order) {
    const it = state.items[k]; if (!it) continue; const c = roleClass(it); counts.show++;
    if (c !== "heroine") counts.hide++;
    if (c === "heroine") { counts.only++; counts.heroli++; } else if (c === "love") { counts.li++; counts.heroli++; } else if (c === "side") counts.side++;
    if (it.heroine !== undefined) nManual++;
    if (!it.role && !it.kind) nRoleless++;
  }
  const nHero = counts.only;
  const hiddenByFilter = state.order.filter((k) => !inBoard.has(k) && state.items[k] && !heroOk(state.items[k])).length;
  let empty = `<p class="muted empty">${all ? "No match." : "Nothing here yet. Use <b>Import</b>."}</p>`;
  if (!all && hiddenByFilter) {
    const mode = state.ui.heroines, byRole = ["only", "li", "heroli", "side"].includes(mode), noHero = mode === "only" && !nHero;
    empty = `<div class="muted empty"><p>The <b>${HERO_FILTERS[mode] || mode}</b> filter is hiding ${hiddenByFilter} character${hiddenByFilter === 1 ? "" : "s"}.${noHero ? " None of your characters are flagged as heroines." : mode === "side" && !counts.side ? " You haven't imported any side characters yet: set Who to add to Everyone when importing, or use Add side characters on a game's awards page." : byRole && nRoleless ? ` ${nRoleless} of your characters have no role saved yet.` : ""}</p>
      <p class="row"><button class="ghost" data-hero="show">Show everyone</button>${nRoleless ? `<button class="primary" data-hero="detect" title="Looks up each character's role on KoiLog / VNDB">Detect roles (${nRoleless})</button>` : ""}${nManual ? `<button class="ghost" data-hero="clear" title="Forget hand-made Mark / Unmark choices and use the imported roles again">Clear ${nManual} hand-made mark${nManual === 1 ? "" : "s"}</button>` : ""}</p>
      ${byRole && (noHero || nRoleless) ? `<p>Roles are tagged when you import. Use <b>Detect roles</b> for characters imported earlier, re-import with <b>Who to add</b> set to a choice that includes them, or double-click a card and choose <b>Mark as heroine</b>.</p>` : ""}</div>`;
  }
  const sig = [q, sort, state.ui.heroines, state.mode, state.kind, state.awards.scope].join("|");
  if (sig !== poolSig) { poolSig = sig; poolShown = 0; }   // a new search, sort or filter starts from the top
  poolKeys = keys; poolShown = Math.min(keys.length, Math.max(POOL_PAGE, poolShown));
  $("#pool").innerHTML = poolShown ? poolChunk(0, poolShown) + poolMoreHtml() : empty; watchPoolEnd();
  $("#poolCount").textContent = all ? `${all} unranked` : "";
  $("#heroFilter").value = state.ui.heroines;
  for (const sel of [$("#heroFilter"), $("#exHeroes")]) for (const op of sel.options) op.textContent = `${HERO_FILTERS[op.value]} (${counts[op.value]})`;}


/** dest: a tier id (tier mode) or a Venn region key like "01" (venn mode); "" returns the card to the pool. */
function moveKey(key, dest, beforeKey, at) {
  if (state.mode === "awards") { if (dest === "award" && at) placeAward(key, at); selected = null; save(); render(); return; }
  if (state.mode === "axis") { if (dest === "axis" && at) state.axis.pos[key] = at; else delete state.axis.pos[key]; selected = null; save(); render(); return; }
  const lists = state.mode === "venn" ? Object.values(state.venn.regions) : state.tiers.map((t) => t.keys);
  lists.forEach((arr) => { const i = arr.indexOf(key); if (i >= 0) arr.splice(i, 1); });
  if (dest) {
    const arr = state.mode === "venn" ? (state.venn.regions[dest] ||= []) : state.tiers.find((x) => x.id === dest)?.keys;
    if (!arr) return;
    const i = beforeKey ? arr.indexOf(beforeKey) : -1;
    if (i >= 0) arr.splice(i, 0, key); else arr.push(key);
  }
  selected = null; save(); render();
}

function vennRegionAt(e) {
  const el = $("#venn"); if (!el) return null;
  const r = el.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
  const g = vennGeom(state.venn);
  return g.keyAt((e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * g.vh);
}
function dropTarget(e) {
  if (state.mode === "awards") {
    if (e.target.closest("#pool")) return { tier: "", before: null };
    if (e.target.closest("button,input")) return null;
    const s = e.target.closest("[data-slot]"); return s ? { tier: "award", before: null, at: s.dataset.slot } : null;
  }
  if (state.mode === "axis") {
    if (e.target.closest("#pool")) return { tier: "", before: null };
    const at = axisPointAt(e); return at ? { tier: "axis", before: null, at } : null;
  }
  if (state.mode === "venn") {
    if (e.target.closest("#pool")) return { tier: "", before: null };
    if (!e.target.closest("#venn")) return null;
    const card = e.target.closest(".card"); let before = null;
    if (card) { const r = card.getBoundingClientRect(); const nx = e.clientX > r.left + r.width / 2 ? card.nextElementSibling : card; before = nx?.dataset?.key || null; }
    const k = vennRegionAt(e);
    return { tier: k || "", before: k ? before : null };
  }
  const zone = e.target.closest("[data-tier]"); if (!zone) return null;
  const zoneEl = zone.classList.contains("tier") ? zone.querySelector(".tier-cards") : zone;
  const card = e.target.closest(".card");
  let before = null;
  if (card && card.dataset.key) {
    const r = card.getBoundingClientRect();
    const next = e.clientX > r.left + r.width / 2 ? card.nextElementSibling : card;
    before = next && next.dataset ? next.dataset.key || null : null;
  }
  return { tier: zoneEl.dataset.tier || "", before };
}

document.addEventListener("dragstart", (e) => {
  const c = e.target.closest?.(".card"); if (!c) return;
  e.dataTransfer.setData("text/plain", c.dataset.key); e.dataTransfer.effectAllowed = "move";
});
document.addEventListener("dragover", (e) => { if (e.target.closest?.("[data-tier], #venn, #axis, [data-slot]")) e.preventDefault(); });
document.addEventListener("drop", (e) => {
  const key = e.dataTransfer.getData("text/plain"); const d = dropTarget(e);
  if (!key || !state.items[key] || !d) return;
  e.preventDefault(); moveKey(key, d.tier, d.before === key ? null : d.before, d.at);
});
document.addEventListener("click", (e) => {
  const c = e.target.closest?.(".card");
  if (c) {
    const key = c.dataset.key, now = Date.now();
    if (lastClick.key === key && now - lastClick.t < 400) { lastClick = { key: "", t: 0 }; selected = null; render(); openCardMenu(key, e.clientX, e.clientY); return; } // double-click
    lastClick = { key, t: now };
    selected = selected === key ? null : key; render(); return;
  }
  if (!selected) return;
  if (state.mode !== "tier") { const d = dropTarget(e); if (d) moveKey(selected, d.tier, null, d.at); return; }
  const zone = e.target.closest?.("#board .tier, #pool");
  if (zone) moveKey(selected, zone.dataset.tier || "");
});
document.addEventListener("contextmenu", (e) => {
  const c = e.target.closest?.(".card"); if (!c) return;
  e.preventDefault();
  const it = state.items[c.dataset.key];
  if (it && confirm(`Remove ${it.label} from this list?`)) removeItem(c.dataset.key);
});
function removeItem(key) {
  state.tiers.forEach((t) => (t.keys = t.keys.filter((k) => k !== key)));
  Object.values(state.venn.regions).forEach((a) => { const j = a.indexOf(key); if (j >= 0) a.splice(j, 1); });
  delete state.axis.pos[key];
  awardSets().forEach((st) => st.cats.forEach((c) => (c.slots = c.slots.map((s) => (s === key ? null : s)))));
  scDropItem(key);
  delete state.items[key]; state.order = state.order.filter((k) => k !== key); save(); render();
}

// ---------- adding items ----------
// Imports work the same from either side: characters land in the Characters list and games in the Games list.
const listFor = (kind) => (state.kind === kind ? state : (state.other ||= freshList(kind)));
const importCount = { chars: 0, games: 0 };
function addItems(list) {
  let n = 0;
  for (const it of list) {
    if (!it.key || !it.label) continue;
    const game = it.kind === "game", L = listFor(game ? "games" : "characters");
    if (!L.items[it.key]) { L.order.push(it.key); n++; importCount[game ? "games" : "chars"]++; }
    const prev = L.items[it.key], gs = new Set([...(prev?.games || (prev?.game ? [prev.game] : [])), ...(it.games || (it.game ? [it.game] : []))]);
    L.items[it.key] = { ...prev, ...it, ...(gs.size && !game ? { games: [...gs] } : {}) };
    if (game && prev?.img && !it.img) L.items[it.key].img = prev.img;
  }
  save(); renderSoon(); return n;
}

// Games seen while importing characters: they are added to the Games list too.
const klCover = (g) => { const c = g?.coverImageUrls; return { img: c?.thumbnail || c?.original || "", imgHi: c?.original || c?.thumbnail || "" }; };
const seenGames = new Map();
const noteGame = (it) => { if (it && it.key && it.label && !seenGames.has(it.key)) seenGames.set(it.key, it); };
function flushSeenGames() {
  const found = [...seenGames.values()]; seenGames.clear();
  if (!found.length) return 0;
  const g = listFor("games"); let n = 0;
  for (const it of found) {
    const have = g.items[it.key];
    if (have) { if (!have.img && it.img) { have.img = it.img; have.imgHi = it.imgHi; } continue; }   // already there (maybe with your vote or rank): only fill in a missing cover
    g.order.push(it.key); g.items[it.key] = it; n++; importCount.games++;
  }
  save(); renderSoon(); return n;
}

// ---------- KoiLog ----------
async function kl(path) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try { r = await fetch("/proxy/koilog/" + path); } catch (e) { if (attempt >= 3) throw e; await new Promise((x) => setTimeout(x, 600 * (attempt + 1))); continue; }
    if (r.status === 404) throw new Error("Not found on KoiLog");
    if (r.ok) return r.json();
    if (attempt >= 3 || ![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`KoiLog said ${r.status}`);
    await new Promise((x) => setTimeout(x, 600 * (attempt + 1)));   // busy: wait and try again
  }
}
const pickName = (names, def = true) => (names || []).find((n) => n.default)?.value || (names || [])[0]?.value || "";
const origName = (names) => (names || []).find((n) => n.isOriginal)?.value || (names || []).find((n) => n.lang === "ja")?.value || "";
const gameTitle = (g) => (g.titles || []).find((t) => t.default)?.value || (g.titles || [])[0]?.value || "";

function klCharItem(c, game, extra = {}) {
  return { key: "kl:" + c.id, role: roleOf(c.role), gid: game.id, label: pickName(c.names), alt: origName(c.names), game: gameTitle(game), games: [gameTitle(game)],
    img: c.avatarUrls?.thumbnail || "", imgHi: c.avatarUrls?.original || "", ...extra };
}

async function importKoilogUser(input, onlyPlayed, withRatings, who, progress) {
  const name = input.trim().replace(/^.*\/u\//, "").replace(/[/?#].*$/, "");
  if (!name) throw new Error("Enter a username");
  progress(0, "Looking up profile…");
  const user = await kl("users/" + encodeURIComponent(name));
  if (user.isProfilePublic === false) throw new Error("That profile is private");
  const games = [];
  for (let p = 1; ; p++) {
    progress(0, `Reading game list (page ${p})…`);
    const d = await kl(`users/${user.id}/games/status-summary?page=${p}&pageSize=50`);
    games.push(...d.data);
    if (!d.pagination?.hasMore) break;
  }
  const ratings = {};
  if (withRatings) {
    try { for (const r of await kl(`users/${user.id}/character-ratings`)) ratings[r.characterId] = r; } catch (e) { /* optional */ }
  }
  const wanted = (r) => !onlyPlayed || (r.routeStatus && r.routeStatus !== "TO_PLAY");
  const targets = games.filter((g) => (g.routeStatuses || []).some(wanted));
  let done = 0, added = 0, failed = 0;
  await mapPool(targets, 8, async (g) => {
    try {
      const [game, chars] = await Promise.all([kl("games/" + g.id), kl(`games/${g.id}/characters`)]);
      noteGame({ key: "klg:" + game.id, kind: "game", label: gameTitle(game), alt: "", game: (game.releaseDate || game.released || "").slice(0, 4), ...klCover(game), vote: 0, rating: 0 });
      const byId = Object.fromEntries(chars.map((c) => [c.id, c]));
      // KoiLog's route list also contains the heroine and "major" characters, so the role comes from the character list, not from having a route.
      const routeOf = Object.fromEntries((g.routeStatuses || []).map((rs) => [rs.characterId, rs]));
      const items = [];
      for (const c of chars) {
        const rs = routeOf[c.id]; let role = roleOf(c.role);
        if (rs && role !== "heroine") role = "love";                       // has a route: treat as a love interest
        if (!roleOk(role, who)) continue;
        if (role === "love" && onlyPlayed && !(rs && wanted(rs))) continue; // love interests: only routes you've started (if ticked)
        const rt = ratings[c.id];
        items.push(klCharItem(c, game, { role, ...(rs ? { status: rs.routeStatus } : {}), rating: rt?.overall || 0,
          sub: rt ? [rt.appearance || 0, rt.storyline || 0, rt.personality || 0, rt.voiceActing || 0] : [] }));
      }
      added += addItems(items);
    } catch (e) { failed++; }
    progress(++done / targets.length, `Fetched ${done} of ${targets.length} games · ${added} characters`);
  });
  if (!$("#listName").dataset.touched && state.name === "My character tier list") { state.name = `${user.displayName || name}'s characters`; save(); render(); }
  if (failed) throw new Error(`${failed} of ${targets.length} games could not be read from KoiLog (${added} characters were added). Run the import again to fetch the rest.`);
  return { added, games: targets.length };
}

// ---------- VNDB ----------
async function vndb(endpoint, body, method = "POST") {
  const r = await fetch("https://api.vndb.org/kana/" + endpoint, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`VNDB said ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return r.json();
}
async function vndbAll(endpoint, body) {
  const out = [];
  for (let page = 1; ; page++) {
    const d = await vndb(endpoint, { ...body, results: 100, page });
    out.push(...d.results); if (!d.more || page > 30) break;
  }
  return out;
}
const vndbImg = (c) => c.image?.url || "";

async function vndbCharactersFor(vnIds, who, progress) {
  const titles = {};
  for (let i = 0; i < vnIds.length; i += 50) {
    const part = vnIds.slice(i, i + 50);
    for (const v of await vndbAll("vn", { filters: ["or", ...part.map((id) => ["id", "=", id])], fields: GAME_FIELDS })) { titles[v.id] = v.title; noteGame(gameItem(v)); }
  }
  let added = 0;
  for (let i = 0; i < vnIds.length; i += 15) {
    const part = vnIds.slice(i, i + 15);
    progress(i / vnIds.length, `Reading characters ${Math.min(i + 15, vnIds.length)} of ${vnIds.length} games…`);
    const chars = await vndbAll("character", { filters: ["or", ...part.map((id) => ["vn", "=", ["id", "=", id]])], fields: "id,name,original,image.url,vns.id,vns.role" });
    const items = [];
    for (const c of chars) {
      const link = (c.vns || []).find((v) => part.includes(v.id) && roleOk(roleOf(v.role), who));
      if (!link) continue;
      items.push({ key: "vn:" + c.id, role: roleOf(link.role), label: c.name, alt: c.original || "", game: titles[link.id] || link.id, games: [titles[link.id] || link.id], img: vndbImg(c), imgHi: vndbImg(c) });
    }
    added += addItems(items);
  }
  return added;
}

async function importVndb(input, who, progress) {
  let ids = (input.match(/\bv\d+\b/gi) || []).map((s) => s.toLowerCase());
  if (!ids.length) {
    const name = input.trim(); if (!name) throw new Error("Enter VN ids or a username");
    progress(0, "Looking up VNDB user…");
    let u = /^u\d+$/i.test(name) ? name.toLowerCase() : null;
    if (!u) { const r = await vndb("user?q=" + encodeURIComponent(name), null, "GET"); u = r[name]?.id || Object.values(r).find(Boolean)?.id; }
    if (!u) throw new Error("VNDB user not found");
    progress(0, "Reading their list…");
    const list = await vndbAll("ulist", { user: u, fields: "id", filters: ["or", ["label", "=", 1], ["label", "=", 2], ["label", "=", 3], ["label", "=", 4]] });
    ids = list.map((x) => x.id);
    if (!ids.length) throw new Error("That list has no Playing / Finished / Stalled / Dropped games (or it's private)");
  }
  return { added: await vndbCharactersFor([...new Set(ids)], who, progress), games: ids.length };
}

// ---------- name search ----------
async function searchByName(q) {
  const [kg, vv, vc] = await Promise.allSettled([
    kl(`games?searchQuery=${encodeURIComponent(q)}&pageSize=30`),
    vndb("vn", { filters: ["search", "=", q], fields: "id,title", results: 15 }),
    vndb("character", { filters: ["search", "=", q], fields: "id,name,original,image.url,vns.id,vns.role,vns.title", results: 20 }),
  ]);
  const rows = [];
  if (kg.status === "fulfilled") for (const g of kg.value.data || []) rows.push({ kind: "KoiLog game", title: gameTitle(g), act: { type: "klgame", game: g } });
  if (vv.status === "fulfilled") for (const v of vv.value.results) rows.push({ kind: "VNDB game", title: v.title, act: { type: "vn", id: v.id } });
  if (vc.status === "fulfilled") for (const c of vc.value.results) rows.push({ kind: "VNDB character", title: `${c.name}${c.original ? " · " + c.original : ""}`, sub: c.vns?.[0]?.title || "", img: vndbImg(c), act: { type: "vnchar", c } });
  return rows;
}

// ---------- dialogs ----------
function openDlg(sel) { const d = $(sel); if (!d.open) d.showModal(); return d; }
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) e.target.closest("dialog").close();
  else if (e.target.tagName === "DIALOG") e.target.close();
});

let importing = false;
function setStatus(frac, msg) {
  $("#impStatus").hidden = false; $("#impBar").style.width = Math.round(frac * 100) + "%"; $("#impMsg").textContent = msg;
}
async function runImport(btn, job) {
  if (importing) return; importing = true; btn.disabled = true; seenGames.clear(); importCount.chars = importCount.games = 0;
  try {
    await job(); flushSeenGames();
    const { chars, games } = importCount, msg = [chars ? `${chars} new character${chars === 1 ? "" : "s"}` : "", games ? `${games} new game${games === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ") || "nothing new";
    $("#impStatus").hidden = false; $("#impBar").style.width = "100%";
    $("#impMsg").textContent = `Done: ${msg} added.`; toast(`Added ${msg}`);
  } catch (err) { $("#impStatus").hidden = false; $("#impMsg").textContent = "⚠ " + err.message; toast(err.message, "error"); }
  finally { importing = false; btn.disabled = false; seenGames.clear(); }
}

function syncImportTabs() {
  const tabs = $$(".tabs [data-tab]");
  const cur = tabs.find((b) => b.getAttribute("aria-pressed") === "true" && !b.hidden) || tabs.find((b) => !b.hidden);
  tabs.forEach((b) => b.setAttribute("aria-pressed", String(b === cur)));
  $$("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== cur.dataset.tab));
  $("#impStatus").hidden = true;
}
$("#btnImport").onclick = () => { syncImportTabs(); openDlg("#importDlg"); };
$("#kindSeg").onclick = (e) => { const b = e.target.closest("[data-kind]"); if (b) switchKind(b.dataset.kind); };
$$(".tabs [data-tab]").forEach((b) => (b.onclick = () => {
  $$(".tabs [data-tab]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $$("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
}));
$("#impSide").onchange = (e) => ($("#impWho").value = e.target.checked ? "all" : "love+heroine");
$("#klGo").onclick = (e) => runImport(e.target, () => importKoilogUser($("#klUser").value, $("#klPlayed").checked, $("#klRank").checked, $("#impWho").value, setStatus));
$("#klUser").onkeydown = (e) => { if (e.key === "Enter") $("#klGo").click(); };
$("#vnGo").onclick = (e) => runImport(e.target, () => importVndb($("#vnIn").value, $("#impWho").value, setStatus));
$("#vnIn").onkeydown = (e) => { if (e.key === "Enter") $("#vnGo").click(); };
$("#nmGo").onclick = async () => {
  const q = $("#nmIn").value.trim(); if (q.length < 2) return;
  $("#nmRes").innerHTML = `<p class="muted">Searching…</p>`;
  const rows = await searchByName(q);
  $("#nmRes").innerHTML = rows.map((r, i) => `<div class="res"><span class="kind">${esc(r.kind)}</span>
    ${r.img ? `<img src="${esc(imgSrc(r.img))}" alt="">` : ""}<span class="rt">${esc(r.title)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span>
    <button class="ghost" data-res="${i}">${r.act.type === "vnchar" ? "Add" : "Add characters"}</button></div>`).join("") || `<p class="muted">No results.</p>`;
  $("#nmRes").onclick = (e) => {
    const b = e.target.closest("[data-res]"); if (!b) return;
    const a = rows[+b.dataset.res].act;
    runImport(b, async () => {
      if (a.type === "vnchar") { const c = a.c; return { added: addItems([{ key: "vn:" + c.id, role: roleOf(c.vns?.[0]?.role), label: c.name, alt: c.original || "", game: c.vns?.[0]?.title || "", img: vndbImg(c), imgHi: vndbImg(c) }]), games: 1 }; }
      if (a.type === "vn") return { added: await vndbCharactersFor([a.id], $("#impWho").value, setStatus), games: 1 };
      noteGame({ key: "klg:" + a.game.id, kind: "game", label: gameTitle(a.game), alt: "", game: "", ...klCover(a.game), vote: 0, rating: 0 });
      const chars = await kl(`games/${a.game.id}/characters`);
      return { added: addItems(chars.filter((c) => roleOk(roleOf(c.role), $("#impWho").value)).map((c) => klCharItem(c, a.game))), games: 1 };
    });
  };
};
$("#nmIn").onkeydown = (e) => { if (e.key === "Enter") $("#nmGo").click(); };

// ---------- game tier list: VNDB covers ----------
const GAME_FIELDS = "id,title,alttitle,released,image.url,image.thumbnail";
function gameItem(v, vote) {
  return { key: "vng:" + v.id, kind: "game", label: v.title, alt: v.alttitle || "", game: (v.released || "").slice(0, 4),
    img: v.image?.thumbnail || v.image?.url || "", imgHi: v.image?.url || v.image?.thumbnail || "", vote: vote || 0, rating: vote ? Math.max(1, Math.round(vote / 20)) : 0 };
}
async function vndbUserId(name) {
  if (/^u\d+$/i.test(name)) return name.toLowerCase();
  const r = await vndb("user?q=" + encodeURIComponent(name), null, "GET");
  const id = r[name]?.id || Object.values(r).find(Boolean)?.id;
  if (!id) throw new Error("VNDB user not found");
  return id;
}
async function importVndbGames(input, which, progress) {
  const ids = [...new Set((input.match(/\bv\d+\b/gi) || []).map((s) => s.toLowerCase()))];
  let added = 0;
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 50) {
      progress(i / ids.length, `Reading games ${Math.min(i + 50, ids.length)} of ${ids.length}…`);
      const vns = await vndbAll("vn", { filters: ["or", ...ids.slice(i, i + 50).map((id) => ["id", "=", id])], fields: GAME_FIELDS });
      added += addItems(vns.map((v) => gameItem(v)));
    }
    return { added, games: added };
  }
  const name = input.trim(); if (!name) throw new Error("Enter VN ids or a VNDB username");
  progress(0, "Looking up VNDB user…");
  const u = await vndbUserId(name);
  const labels = { played: [1, 2, 3, 4], finished: [2], wishlist: [5], all: [1, 2, 3, 4, 5] }[which] || [1, 2, 3, 4];
  progress(0, "Reading their list…");
  const list = await vndbAll("ulist", { user: u, fields: "id,vote,vn.title,vn.alttitle,vn.released,vn.image.url,vn.image.thumbnail",
    filters: labels.length === 1 ? ["label", "=", labels[0]] : ["or", ...labels.map((l) => ["label", "=", l])] });
  if (!list.length) throw new Error("That list has no matching games (or it's private)");
  added = addItems(list.filter((x) => x.vn).map((x) => gameItem({ id: x.id, ...x.vn }, x.vote)));
  return { added, games: list.length };
}
$("#gvGo").onclick = (e) => runImport(e.target, () => importVndbGames($("#gvIn").value, $("#gvList").value, setStatus));
$("#gvIn").onkeydown = (e) => { if (e.key === "Enter") $("#gvGo").click(); };
$("#gnGo").onclick = async () => {
  const q = $("#gnIn").value.trim(); if (q.length < 2) return;
  $("#gnRes").innerHTML = `<p class="muted">Searching…</p>`;
  let rows = [];
  try { rows = (await vndb("vn", { filters: ["search", "=", q], fields: GAME_FIELDS, results: 25 })).results; } catch (err) { $("#gnRes").innerHTML = `<p class="muted">⚠ ${esc(err.message)}</p>`; return; }
  $("#gnRes").innerHTML = rows.length ? `<div class="res"><span class="rt"><b>${rows.length} results</b></span><button class="ghost" data-all="1">Add all</button></div>` +
    rows.map((v, i) => `<div class="res">${v.image?.thumbnail ? `<img src="${esc(imgSrc(v.image.thumbnail))}" alt="">` : ""}<span class="rt">${esc(v.title)}<small>${esc((v.released || "").slice(0, 4))} · ${esc(v.id)}</small></span><button class="ghost" data-res="${i}">Add</button></div>`).join("") : `<p class="muted">No results.</p>`;
  $("#gnRes").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const pick = b.dataset.all ? rows : [rows[+b.dataset.res]];
    runImport(b, async () => ({ added: addItems(pick.map((v) => gameItem(v))), games: pick.length }));
  };
};
$("#gnIn").onkeydown = (e) => { if (e.key === "Enter") $("#gnGo").click(); };


// ---------- rank editor ----------
const allPresets = () => ({ ...TIER_PRESETS, ...state.customPresets });
function rainbow(i, n) { return `hsl(${Math.round((i / Math.max(1, n)) * 300)} 75% 68%)`; }
function hslToHex(h) {
  const c = document.createElement("canvas").getContext("2d"); c.fillStyle = h; return c.fillStyle; // browser normalises to #rrggbb
}
function applyRanks(list) {
  const fresh = makeTiers(list);
  state.tiers.forEach((t, i) => fresh[Math.min(i, fresh.length - 1)].keys.push(...t.keys));
  state.tiers = fresh; save(); render(); renderTierEditor();
}
function renderTierEditor() {
  const ps = allPresets();
  $("#tierPresets").innerHTML = Object.keys(ps).map((k) => `<button class="chip" data-preset="${esc(k)}">${esc(k)}</button>${state.customPresets[k] ? `<button class="chip x" data-delpreset="${esc(k)}" title="Delete preset" aria-label="Delete preset ${esc(k)}">✕</button>` : ""}`).join("");
  $("#tierRows").innerHTML = state.tiers.map((t, i) => `<div class="tier-edit" data-i="${i}">
    <input type="color" value="${esc(t.color)}" data-f="color" aria-label="Colour">
    <input value="${esc(t.name)}" data-f="name" maxlength="24" aria-label="Rank name">
    <span class="muted">${t.keys.length}</span>
    <button class="icon" data-act="up" ${i ? "" : "disabled"} aria-label="Move up">↑</button>
    <button class="icon" data-act="down" ${i < state.tiers.length - 1 ? "" : "disabled"} aria-label="Move down">↓</button>
    <button class="icon" data-act="del" aria-label="Delete rank">✕</button></div>`).join("");
  $("#uiNumbered").checked = !!state.ui.numbered;
}
$("#btnTiers").onclick = () => { renderTierEditor(); openDlg("#tiersDlg"); };
$("#tierAdd").onclick = () => { state.tiers.push({ id: newId(), name: "New", color: "#8a93b3", keys: [] }); save(); render(); renderTierEditor(); };
$("#tierSavePreset").onclick = () => {
  const name = (prompt("Name this preset:", "My ranks") || "").trim(); if (!name) return;
  state.customPresets[name] = state.tiers.map((t) => [t.name, t.color]); save(); renderTierEditor(); toast(`Saved preset "${name}"`);
};
$("#tierPasteGo").onclick = () => {
  const lines = $("#tierPaste").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 30);
  if (!lines.length) return toast("Type at least one rank", "error");
  const list = lines.map((l, i) => {
    const m = /^(.*?)[\s,]*(#[0-9a-f]{6})?$/i.exec(l);
    return [(m[1] || l).trim().slice(0, 24) || "?", m[2] || hslToHex(rainbow(i, lines.length))];
  });
  applyRanks(list); $("#tierPaste").value = "";
};
$("#uiNumbered").onchange = (e) => { state.ui.numbered = e.target.checked; save(); render(); };
$("#tiersDlg").addEventListener("input", (e) => {
  const row = e.target.closest(".tier-edit"); if (!row || !e.target.dataset.f) return;
  state.tiers[+row.dataset.i][e.target.dataset.f] = e.target.value; save(); render();
});
$("#tiersDlg").addEventListener("click", (e) => {
  const d = e.target.closest("[data-delpreset]");
  if (d) { delete state.customPresets[d.dataset.delpreset]; save(); renderTierEditor(); return; }
  const p = e.target.closest("[data-preset]");
  if (p) return applyRanks(allPresets()[p.dataset.preset]);
  const b = e.target.closest("[data-act]"); if (!b) return;
  const i = +b.closest(".tier-edit").dataset.i, ts = state.tiers;
  if (b.dataset.act === "up" && i > 0) [ts[i - 1], ts[i]] = [ts[i], ts[i - 1]];
  else if (b.dataset.act === "down" && i < ts.length - 1) [ts[i + 1], ts[i]] = [ts[i], ts[i + 1]];
  else if (b.dataset.act === "del") { if (ts.length <= 1) return toast("Keep at least one rank", "error"); ts.splice(i, 1); }
  save(); render(); renderTierEditor();
});
// rename a rank right on the board
$("#board").addEventListener("dblclick", (e) => {
  const lab = e.target.closest("[data-rename]"); if (!lab) return;
  const t = state.tiers.find((x) => x.id === lab.dataset.rename), span = lab.firstElementChild;
  span.contentEditable = "true"; span.focus(); getSelection().selectAllChildren(span);
  const done = () => { span.contentEditable = "false"; t.name = span.textContent.trim().slice(0, 24) || t.name; save(); render(); };
  span.addEventListener("blur", done, { once: true });
  span.addEventListener("keydown", (k) => { if (k.key === "Enter") { k.preventDefault(); span.blur(); } });
});

// ---------- layout dialog and pool resizer ----------
function syncLayoutDialog() {
  $$("#layoutBody [data-ui]").forEach((el) => {
    const v = state.ui[el.dataset.ui];
    if (el.type === "checkbox") el.checked = !!v; else el.value = v;
    const out = el.parentElement.querySelector("output"); if (out) out.textContent = v + (el.dataset.ui === "axisCard" ? " %" : " px");
  });
}
$("#btnLayout").onclick = () => { syncLayoutDialog(); openDlg("#layoutDlg"); };
$("#layoutBody").addEventListener("input", (e) => {
  const k = e.target.dataset.ui; if (!k) return;
  state.ui[k] = e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" ? +e.target.value : e.target.value;
  save(); applyUi(); syncLayoutDialog();
});
$("#layoutReset").onclick = () => { state.ui = { ...DEFAULT_UI }; save(); render(); syncLayoutDialog(); };
$("#resizer").addEventListener("pointerdown", (e) => {
  e.preventDefault(); const startX = e.clientX, startW = state.ui.poolW; $("#resizer").setPointerCapture(e.pointerId);
  const move = (m) => { state.ui.poolW = Math.max(220, Math.min(760, Math.round(startW - (m.clientX - startX)))); applyUi(); };
  const up = () => { $("#resizer").removeEventListener("pointermove", move); $("#resizer").removeEventListener("pointerup", up); save(); };
  $("#resizer").addEventListener("pointermove", move); $("#resizer").addEventListener("pointerup", up);
});

// ---------- axis chart ----------
const fmtTick = (v) => String(Math.round(v * 10) / 10);
function axisBoardHtml() {
  const a = state.axis, N = a.grid || 0, ratio = a.aspect === "wide" ? 66.67 : 100;
  const ticks = a.numbers && N ? Array.from({ length: N + 1 }, (_, i) => {
    const vx = a.nMin + (a.nMax - a.nMin) * i / N, vy = a.nMax - (a.nMax - a.nMin) * i / N, p = (i / N * 100).toFixed(2) + "%";
    return `<span class="tk tx" style="left:${p}">${fmtTick(vx)}</span>${i * 2 === N ? "" : `<span class="tk ty" style="top:${p}">${fmtTick(vy)}</span>`}`;
  }).join("") : "";
  const quad = ["tl", "tr", "bl", "br"].map((c, i) => (a.quad[i] ? `<span class="aq aq-${c}">${esc(a.quad[i])}</span>` : "")).join("");
  const cards = Object.entries(a.pos).filter(([k]) => visible(k)).map(([k, p]) =>
    `<div class="apos" style="left:${(p.x * 100).toFixed(2)}%;top:${(p.y * 100).toFixed(2)}%">${cardHtml(k)}</div>`).join("");
  const ax = a.axisColor ? `;--ac:${esc(a.axisColor)}` : "", gc = a.gridColor ? `;--gc:${esc(a.gridColor)}` : "";
  return `<div class="axis-outer" style="${ax}${gc}">
    <div class="al al-top">${esc(a.yMax)}</div><div class="al al-bottom">${esc(a.yMin)}</div>
    <div class="al al-left">${esc(a.xMin)}</div><div class="al al-right">${esc(a.xMax)}</div>
    <div class="axis" id="axis" style="aspect-ratio:100/${ratio};--n:${N || 1}${N ? "" : ";background-image:none"}">
      <i class="aline ah"></i><i class="aline av"></i>${ticks}${quad}${cards}</div></div>`;
}

function renderAxisBar() {
  const bar = $("#axisBar"), a = state.axis; bar.hidden = state.mode !== "axis"; if (bar.hidden) return;
  const t = (f, lab, w = 110) => `<label>${lab} <input data-af="${f}" value="${esc(a[f])}" maxlength="30" style="width:${w}px"></label>`;
  bar.innerHTML = `${t("xMin", "Left")}${t("xMax", "Right")}${t("yMax", "Top")}${t("yMin", "Bottom")}
    <label>Grid <select data-af="grid">${[0, 4, 6, 8, 10, 12, 16, 20].map((n) => `<option value="${n}"${a.grid === n ? " selected" : ""}>${n ? n + "×" + n : "none"}</option>`).join("")}</select></label>
    <label>Shape <select data-af="aspect"><option value="square"${a.aspect === "square" ? " selected" : ""}>Square</option><option value="wide"${a.aspect === "wide" ? " selected" : ""}>Wide</option></select></label>
    <label class="inline"><input type="checkbox" data-af="numbers"${a.numbers ? " checked" : ""}> Numbers</label>
    <label>from <input type="number" data-af="nMin" value="${a.nMin}" style="width:56px"> to <input type="number" data-af="nMax" value="${a.nMax}" style="width:56px"></label>
    <label class="inline"><input type="checkbox" data-af="snap"${a.snap ? " checked" : ""}> Snap to grid</label>
    <label>Axes <input type="color" data-af="axisColor" value="${esc(a.axisColor || "#6b5b73")}"></label>
    <label>Grid <input type="color" data-af="gridColor" value="${esc(a.gridColor || "#a9c4e6")}"></label>
    <details><summary>Corner labels</summary><div class="row">${["Top left", "Top right", "Bottom left", "Bottom right"].map((n, i) => `<input data-q="${i}" placeholder="${n}" value="${esc(a.quad[i])}" maxlength="24" style="width:130px">`).join("")}</div></details>`;
}
$("#axisBar").addEventListener("input", (e) => {
  const t = e.target, a = state.axis;
  if (t.dataset.q !== undefined) a.quad[+t.dataset.q] = t.value;
  else if (t.dataset.af) {
    const f = t.dataset.af;
    a[f] = t.type === "checkbox" ? t.checked : t.type === "number" ? (t.value === "" ? 0 : +t.value) : f === "grid" ? +t.value : t.value;
  } else return;
  save(); render();
});

function axisPointAt(e) {
  const el = $("#axis"); if (!el) return null;
  const r = el.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
  let x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; const N = state.axis.grid;
  if (state.axis.snap && N) { x = (Math.floor(x * N - 1e-9) + 0.5) / N; y = (Math.floor(y * N - 1e-9) + 0.5) / N; }
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}
// Left-right = personality, bottom-top = looks, from your KoiLog ratings (1 to 5 stars each), with a little spread so cards don't stack.
function autoPlotAxis(rated) {
  const a = state.axis; let n = 0, seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  Object.assign(a, { xMin: "Weak personality", xMax: "Great personality", yMin: "Plain design", yMax: "Gorgeous design", numbers: false });
  a.pos = {};
  for (const k of rated) {
    const sub = state.items[k].sub || []; if (sub.length !== 4 || !sub[0] || !sub[2]) continue;
    a.pos[k] = { x: Math.min(0.97, Math.max(0.03, 0.1 + (sub[2] - 1) / 4 * 0.8 + rnd() * 0.12)), y: Math.min(0.97, Math.max(0.03, 0.9 - (sub[0] - 1) / 4 * 0.8 + rnd() * 0.12)) }; n++;
  }
  renderVennBar.lastMode = null; return n;
}

// ---------- venn controls ----------
$("#modeSeg").onclick = (e) => {
  const b = e.target.closest("[data-mode]"); if (!b || b.dataset.mode === state.mode) return;
  state.mode = b.dataset.mode; selected = null; save(); render();
};
$("#vennBar").addEventListener("input", (e) => {
  const t = e.target, v = state.venn;
  if (t.id === "vSize") v.size = +t.value;
  else if (t.id === "vOver") v.overlap = +t.value;
  else if (t.dataset.vc !== undefined) v.circles[+t.dataset.vc][t.dataset.f] = t.value;
  else return;
  save(); render();
});
$("#vennBar").addEventListener("change", (e) => {
  if (e.target.id !== "vN") return;
  const v = state.venn, n = +e.target.value; v.n = n;
  for (const k of Object.keys(v.regions)) if (k.split("").some((c) => +c >= n)) delete v.regions[k]; // regions that used the dropped circle go back to the pool
  renderVennBar.lastMode = null; save(); render();
});

// ---------- toolbar ----------
$("#listName").oninput = (e) => { state.name = e.target.value; e.target.dataset.touched = "1"; save(); };
let poolTimer = 0; $("#poolSearch").oninput = () => { clearTimeout(poolTimer); poolTimer = setTimeout(renderPool, 120); }; $("#poolSort").onchange = renderPool;

function autoRankTiers(rated) {
  const n = state.tiers.length;
  state.tiers.forEach((t) => (t.keys = []));
  const score = (it) => { const sb = (it.sub || []).filter(Boolean); return it.rating * 10 + sb.reduce((a, b) => a + b, 0) / Math.max(1, sb.length); };
  rated.sort((a, b) => score(state.items[b]) - score(state.items[a]));
  for (const k of rated) state.tiers[Math.round(((5 - state.items[k].rating) / 4) * (n - 1))].keys.push(k);
}
// Venn: circles become "Looks / Personality / Voice"; a character joins a circle when you gave that aspect 5 stars.
function autoFillVenn(rated) {
  const v = state.venn; v.n = 3; v.regions = {}; v.overlap = Math.max(v.overlap, 72);
  v.circles[0].name = "Looks (5★)"; v.circles[1].name = "Personality (5★)"; v.circles[2].name = "Voice (5★)";
  const idx = [0, 2, 3]; let n = 0;
  for (const k of rated) {
    const sub = state.items[k].sub || []; if (sub.length !== 4) continue;
    const key = idx.map((si, ci) => (sub[si] >= 5 ? ci : -1)).filter((c) => c >= 0).join("");
    if (key) { (v.regions[key] ||= []).push(k); n++; }
  }
  renderVennBar.lastMode = null; return n;
}
$("#btnAuto").onclick = () => {
  const rated = state.order.filter((k) => state.items[k]?.rating);
  if (!rated.length) return toast(state.kind === "games" ? "No VNDB votes loaded. Import a VNDB user list that has votes." : "No KoiLog character ratings loaded. Import a KoiLog user with ratings ticked.", "error");
  if (state.mode === "awards") { const n = autoAwards(); save(); render(); return toast(n ? `Nominated winners for ${n} award${n === 1 ? "" : "s"} from your ratings` : "None of your awards can be filled from ratings (try Best design, Best voice acting or Favourite overall)", n ? "" : "error"); }
  if (state.mode === "axis") { const n = autoPlotAxis(rated); save(); render(); return toast(n ? `Plotted ${n} characters by your ratings` : "No characters with looks and personality ratings (re-import to refresh)", n ? "" : "error"); }
  if (state.mode === "venn") { const n = autoFillVenn(rated); save(); render(); return toast(n ? `Placed ${n} characters by your ratings` : "None of your rated characters have a 5★ aspect (re-import to refresh)", n ? "" : "error"); }
  autoRankTiers(rated); save(); render(); toast(`Placed ${rated.length} characters by your rating`);
};
$("#btnReset").onclick = () => {
  if (isPageMode()) { $("#btnReset").closest("details").open = false; return toast("Nothing to move here in this view. Switch to the Tier list.", "error"); }
  if (state.mode === "venn") state.venn.regions = {}; else if (state.mode === "axis") state.axis.pos = {}; else if (state.mode === "awards") curAwards().cats.forEach((c) => (c.slots = [null, null, null])); else state.tiers.forEach((t) => (t.keys = []));
  save(); render(); $("#btnReset").closest("details").open = false;
};
// Reset character pool: removes the unranked characters shown in the pool; anything already on the board stays.
function resetPool() {
  if (isPageMode()) return toast("Reset pool is off in this view. Switch to the Tier list to remove unranked characters.", "error");
  if (state.mode === "awards") return toast("Reset pool is off in Awards: everyone stays in the pool so they can win several awards. Use More → Clear everything to start over.", "error");
  const here = state.mode === "awards" ? awardKeys() : placed(), keys = state.order.filter((k) => state.items[k] && !here.has(k));
  if (!keys.length) return toast("The pool is already empty");
  const elsewhere = new Set([...state.tiers.flatMap((t) => t.keys), ...Object.values(state.venn.regions).flat(), ...Object.keys(state.axis.pos), ...awardKeys()]);
  const other = keys.filter((k) => elsewhere.has(k)).length;
  if (!confirm(`Remove ${keys.length} unranked character${keys.length === 1 ? "" : "s"} from the pool?` + (other ? `\n${other} of them are placed in another view (tier list, Venn or axis chart) and will be removed from there too.` : "") + "\nCharacters already on this board stay.")) return;
  const gone = new Set(keys);
  state.tiers.forEach((t) => (t.keys = t.keys.filter((k) => !gone.has(k))));
  Object.values(state.venn.regions).forEach((a) => { for (let i = a.length - 1; i >= 0; i--) if (gone.has(a[i])) a.splice(i, 1); });
  awardSets().forEach((st) => st.cats.forEach((c) => (c.slots = c.slots.map((s) => (gone.has(s) ? null : s)))));
  keys.forEach((k) => { delete state.axis.pos[k]; delete state.items[k]; });
  state.order = state.order.filter((k) => !gone.has(k));
  selected = null; save(); render(); toast(`Removed ${keys.length} from the pool`);
}
$("#btnPoolReset").onclick = () => { resetPool(); $("#btnPoolReset").closest("details").open = false; };
$("#btnPoolReset2").onclick = resetPool;
$("#btnClear").onclick = () => {
  if (!confirm("Remove every character from this list? Ranks and circles are kept.")) return;
  state.tiers.forEach((t) => (t.keys = [])); state.venn.regions = {}; state.axis.pos = {}; awardSets().forEach((st) => st.cats.forEach((c) => (c.slots = [null, null, null]))); state.items = {}; state.order = []; state.scales = cleanScales({ ...state.scales, ratings: {}, done: {}, radar: { routes: [], scales: state.scales.radar.scales } }); save(); render(); $("#btnClear").closest("details").open = false;
};
$("#btnSave").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(slimState())], { type: "application/json" }));
  a.download = (state.name.replace(/[^\w-]+/g, "-") || "tier-list") + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
};
$("#btnLoad").onclick = () => $("#fileIn").click();
$("#fileIn").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { if (!load(JSON.parse(await f.text()))) throw 0; save(); renderVennBar.lastMode = null; render(); toast("List opened"); } catch (err) { toast("That isn't a tier list file", "error"); }
  e.target.value = "";
};
$("#btnExport").onclick = () => openTierExport();

// ---------- detect heroines for characters imported without a role ----------
const bestRole = (roles) => (roles.includes("love") ? "love" : roles.includes("heroine") ? "heroine" : roles.includes("side") ? "side" : roles[0] || "other");
const gameTitleById = {};
const titleOfGame = (id) => (gameTitleById[id] ||= kl("games/" + id).then(gameTitle).catch(() => ""));
const sameTitle = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
async function detectRoles() {
  if (detectRoles.busy) return;
  const todo = state.order.filter((k) => state.items[k] && !state.items[k].role && !state.items[k].kind);
  if (!todo.length) return toast("Every character already has a role");
  detectRoles.busy = true; let found = 0;
  try {
    const kls = todo.filter((k) => k.startsWith("kl:")), vns = todo.filter((k) => k.startsWith("vn:"));
    let done = 0; toast(`Checking ${todo.length} characters…`);
    await mapPool(kls, 8, async (k) => {
      try {
        const c = await kl("characters/" + k.slice(3)), it = state.items[k], ap = c.appearsIn || [];
        const roles = [...new Set(ap.map((a) => roleOf(a.role)))];
        if (roles.length > 1) {   // a love interest in one game can be the protagonist in another: use the game you imported
          let hit = it.gid ? ap.find((a) => a.gameId === it.gid) : null;
          for (let i = 0; !hit && i < ap.length; i++) if (sameTitle(await titleOfGame(ap[i].gameId), it.game)) hit = ap[i];
          it.role = hit ? roleOf(hit.role) : bestRole(roles);
        } else it.role = roles[0] || "other";
        found++;
      } catch (e) { /* skip */ }
      if (++done % 25 === 0) toast(`Checked ${done} of ${todo.length}…`);
    });
    for (let i = 0; i < vns.length; i += 50) {
      try {
        const part = vns.slice(i, i + 50);
        const rs = await vndbAll("character", { filters: ["or", ...part.map((k) => ["id", "=", k.slice(3)])], fields: "id,vns.id,vns.title,vns.role" });
        for (const c of rs) {
          const k = "vn:" + c.id, it = state.items[k]; if (!it) continue;
          const vs = c.vns || [], roles = [...new Set(vs.map((v) => roleOf(v.role)))];
          const hit = roles.length > 1 ? vs.find((v) => sameTitle(v.title, it.game)) : null;
          it.role = hit ? roleOf(hit.role) : roles.length > 1 ? bestRole(roles) : roles[0] || "other"; found++;
        }
      } catch (e) { /* skip */ }
    }
  } finally { detectRoles.busy = false; }
  save(); render();
  const h = Object.values(state.items).filter(isHeroine).length;
  toast(`Checked ${found} characters: ${h} heroine${h === 1 ? "" : "s"} in this list`, found ? "" : "error");
}
$("#btnDetect").onclick = () => { detectRoles(); $("#btnDetect").closest("details").open = false; };
$("#heroFilter").onchange = (e) => { state.ui.heroines = e.target.value; save(); render(); };
$("#pool").addEventListener("click", (e) => {
  const b = e.target.closest("[data-hero]"); if (!b) return;
  selected = null; e.stopPropagation();
  if (b.dataset.hero === "detect") { detectRoles(); return; }
  if (b.dataset.hero === "show") state.ui.heroines = "show";
  else Object.values(state.items).forEach((it) => { delete it.heroine; });
  save(); render();
});
// ---------- awards: podiums with blurbs ----------
const AWARD_LIB = {
  characters: [
    ["Characters", [["Best design", "looks"], ["Best voice acting", "voice"], ["Best personality", "personality"], ["Hottest character", "looks"], ["Funniest character"], ["Best glow-up / development"], ["Best villain"], ["Best side character"], ["Best heroine"],
      ["Character you hated, then loved"], ["Most red flags (but loved anyway)"], ["Most likely to need therapy"], ["Best \"I'd die for him\""], ["Best hair"], ["Best outfit"], ["Best dramatic entrance"], ["Best mom-friend / dad-friend"], ["Cutest"]]],
    ["Routes", [["Favourite route", "rating"], ["Best arc", "rating"], ["Saddest arc"], ["Funniest arc"], ["Most romantic arc"], ["Saddest route"], ["Best route ending"], ["Best bad end"], ["Best slow burn"], ["Most wholesome route"], ["Most unhinged route"], ["Spiciest route"], ["Most disappointing route"],
      ["Best confession scene"], ["Best plot twist"], ["Best true route"], ["Best kiss scene"], ["Most convoluted route"], ["Best writing", "story"]]],
    ["Overall", [["Favourite overall", "rating"], ["Best romance"], ["Most underrated"], ["Most overhyped"]]],
  ],
  games: [
    ["Games", [["Best overall", "rating"], ["Best romance"], ["Best story"], ["Best art / CGs"], ["Best soundtrack"], ["Best cast"], ["Best ending"], ["Best opening"], ["Best first impression"], ["Best UI / gameplay"], ["Best localization"], ["Best sequel / fandisc"]]],
    ["Mood", [["Best cry"], ["Best comfort game"], ["Most convoluted plot"], ["Best mystery"], ["Best worldbuilding"], ["Most replayable"], ["Biggest surprise"], ["Most underrated"], ["Most overhyped"]]],
  ],
};
const AWARD_PACKS = {
  characters: { "Classic": ["Best design", "Best voice acting", "Best personality", "Best villain", "Best side character", "Favourite overall"],
    "Chaos": ["Most red flags (but loved anyway)", "Most likely to need therapy", "Character you hated, then loved", "Most unhinged route", "Best dramatic entrance", "Best hair"],
    "Cry-fest": ["Saddest route", "Best bad end", "Best confession scene", "Best slow burn", "Most wholesome route", "Best true route"],
    "This game": ["Best arc", "Saddest arc", "Hottest character", "Best design", "Best voice acting", "Funniest character"] },
  games: { "Classic": ["Best overall", "Best story", "Best art / CGs", "Best soundtrack", "Best romance", "Best cast"],
    "Chaos": ["Most convoluted plot", "Most overhyped", "Biggest surprise", "Most underrated", "Best comfort game", "Best first impression"],
    "Cry-fest": ["Best cry", "Best ending", "Best mystery", "Best worldbuilding", "Best sequel / fandisc", "Most replayable"] },
};
const awardLib = () => AWARD_LIB[state.kind === "games" ? "games" : "characters"];
const autoOf = (title) => awardLib().flatMap(([, list]) => list).find(([t]) => t === title)?.[1] || "";
function addAward(title, auto) {
  title = String(title || "").trim().slice(0, 60); if (!title) return false;
  curAwards().cats.push({ id: newId(), title, auto: auto ?? autoOf(title), slots: [null, null, null], blurbs: ["", "", ""] }); return true;
}

// ---------- award designs: winner topper, place buttons, cover position ----------
const topperHtml = () => { const d = CROWNS[state.ui.awardCrown]; return d ? `<span class="topper">${artSvg(d, 0)}</span>` : ""; };
const stepHtml = (i) => { const d = BUTTONS[state.ui.awardButton]; return d ? artSvg(d, i, i + 1) : String(i + 1); };
function renderDesigns() {
  const u = state.ui, tile = (attr, key, inner, name, on) => `<button class="design-tile" ${attr}="${key}" aria-pressed="${on}">${inner}<span>${esc(name)}</span></button>`;
  const crowns = tile("data-crown", "none", `<i class="none">–</i>`, "None", u.awardCrown === "none") + Object.entries(CROWNS).map(([k, d]) => tile("data-crown", k, artSvg(d, 0), d.name, u.awardCrown === k)).join("");
  const buttons = tile("data-btn", "number", `<b class="plain">1 2 3</b>`, "Number only", u.awardButton === "number") + Object.entries(BUTTONS).map(([k, d]) => tile("data-btn", k, `<span class="trio">${[0, 1, 2].map((p) => artSvg(d, p, p + 1)).join("")}</span>`, d.name, u.awardButton === k)).join("");
  const cover = `<div class="cover-grid">${["top", "middle", "bottom"].map((pos) => ["left", "right"].map((side) =>
    `<button class="cover-tile" data-side="${side}" data-pos="${pos}" aria-pressed="${u.coverSide === side && u.coverPos === pos}"><span class="mini ${side} ${pos}"></span><small>${pos} · ${side}</small></button>`).join("")).join("")}</div>`;
  const plaques = [["step", "Podium steps"], ["square", "Square plaque"], ["none", "Button only"]].map(([k, name]) =>
    `<button class="design-tile" data-plaque="${k}" aria-pressed="${(["square", "none"].includes(u.awardPlaque) ? u.awardPlaque : "step") === k}"><span class="pl pl-${k}"><i></i><i></i><i></i></span><span>${name}</span></button>`).join("");
  $("#designBody").innerHTML = `<h3>Winner topper <small class="muted">(over 1st place)</small></h3><div class="design-grid">${crowns}</div>
    <h3>Place buttons <small class="muted">(1st, 2nd, 3rd)</small></h3><div class="design-grid btns">${buttons}</div>
    <h3>Under the button <small class="muted">(plaque)</small></h3><div class="design-grid">${plaques}</div>
    <h3>Cover position <small class="muted">(game awards)</small></h3>${cover}`;
}
function openDesigns() { renderDesigns(); openDlg("#designDlg"); }
$("#designBody").addEventListener("click", (e) => {
  const b = e.target.closest("[data-crown],[data-btn],[data-plaque],[data-side]"); if (!b) return;
  if (b.dataset.plaque) state.ui.awardPlaque = b.dataset.plaque;
  else if (b.dataset.crown) state.ui.awardCrown = b.dataset.crown;
  else if (b.dataset.btn) state.ui.awardButton = b.dataset.btn;
  else { state.ui.coverSide = b.dataset.side; state.ui.coverPos = b.dataset.pos; }
  save(); renderDesigns(); render(); if (window.__exportRedraw) window.__exportRedraw();
});
$("#awDesigns").onclick = openDesigns;

function awardsGridHtml() {
  const a = curAwards();
  if (!a.cats.length) return `<div class="awards-empty"><p><b>No awards yet.</b></p><p class="muted">Type your own award above, choose <b>Pick from list</b>, or add a pack (Classic, Chaos, Cry-fest).</p></div>`;
  const gridCols = a.cols ? `repeat(${a.cols},minmax(0,1fr))` : "repeat(auto-fill,minmax(320px,1fr))";
  const order = [1, 0, 2];
  return `<div class="awards" style="grid-template-columns:${gridCols}">${a.cats.map((c, ci) => `
    <section class="award" data-cat="${esc(c.id)}">
      <header><input class="atitle" data-cat="${esc(c.id)}" value="${esc(c.title)}" maxlength="60" aria-label="Award name">
        <span class="actl"><button class="icon" data-aact="up" data-cat="${esc(c.id)}" ${ci ? "" : "disabled"} aria-label="Move up">↑</button><button class="icon" data-aact="down" data-cat="${esc(c.id)}" ${ci < a.cats.length - 1 ? "" : "disabled"} aria-label="Move down">↓</button><button class="icon" data-aact="del" data-cat="${esc(c.id)}" aria-label="Delete award">✕</button></span></header>
      <div class="podium" data-plaque="${["square", "none"].includes(state.ui.awardPlaque) ? state.ui.awardPlaque : "step"}">${order.map((i) => {
        const key = c.slots[i], it = key && visible(key) ? state.items[key] : null;
        return `<div class="pslot p${i + 1}" data-slot="${esc(c.id)}:${i}">
          <div class="pcard">${i === 0 && it ? topperHtml() : ""}${it ? `${cardHtml(key)}${it.game && !state.awards.scope ? `<small class="agame">${esc(it.game)}</small>` : ""}<button class="aclear" data-aclear="${esc(c.id)}:${i}" aria-label="Remove from podium">✕</button>` : `<div class="pempty">${["1st", "2nd", "3rd"][i]}</div>`}</div>
          <div class="pstep s${i + 1}">${stepHtml(i)}</div>
          <input class="ablurb" list="blurbIdeas" data-ab="${esc(c.id)}:${i}" value="${esc(c.blurbs[i])}" maxlength="120" placeholder="${i ? "why?" : "why it won…"}" aria-label="Blurb for place ${i + 1}"></div>`;
      }).join("")}</div>
    </section>`).join("")}</div>`;
}

function awardsBoardHtml() {
  const g = state.awards.scope, grid = awardsGridHtml();
  if (!g) return grid;
  const cv = curAwards().cover;
  return `<div class="game-awards"><h2 class="gtitle">${esc(g.toUpperCase())} AWARDS</h2>${castBannerHtml(g)}
    <div class="gbody" data-side="${state.ui.coverSide === "right" ? "right" : "left"}" data-pos="${["middle", "bottom"].includes(state.ui.coverPos) ? state.ui.coverPos : "top"}"><aside class="gcover">${cv ? `<img src="${esc(imgSrc(cv.img))}" alt="Cover of ${esc(g)}">` : `<div class="gcover-ph">Looking for the cover…</div>`}</aside>${grid}</div></div>`;
}

// ---- a game's full cast: KoiLog knows who is in the game, whatever you imported before
const castInfo = {};   // game title -> { gid, game, chars } | { loading } | { error }
async function loadCast(g) {
  if (!g || castInfo[g]?.loading) return;
  castInfo[g] = { loading: true };
  const set = curAwards();
  try {
    let gid = set.gid || state.order.map((k) => state.items[k]).find((i) => i && i.game === g && i.gid)?.gid, game = null;
    if (!gid) {
      const r = await kl(`games?searchQuery=${encodeURIComponent(g)}&pageSize=10`);
      game = (r.data || []).find((x) => (x.titles || []).some((t) => sameTitle(t.value, g)));
      gid = game?.id;
    }
    if (!gid) { castInfo[g] = { error: "not on KoiLog" }; if (state.awards.scope === g) render(); return; }
    game = game && game.titles ? game : await kl("games/" + gid);
    const chars = await kl(`games/${gid}/characters`);
    castInfo[g] = { gid, game, chars }; set.gid = gid;
    if (!set.cover?.img && game.coverImageUrls?.thumbnail) set.cover = { img: game.coverImageUrls.thumbnail, imgHi: game.coverImageUrls.original || game.coverImageUrls.thumbnail };
    save();
  } catch (e) { castInfo[g] = { error: e.message }; }
  if (state.awards.scope === g) render();
}
const inCastList = (c, g) => { const it = state.items["kl:" + c.id]; return !!it && gamesOf(it).includes(g); };
const isCore = (c) => c.role === "protagonist" || c.role === "love_interest";
function castBannerHtml(g) {
  const ci = castInfo[g];
  if (!ci || ci.loading) return `<p class="cast-note muted">Checking this game's cast…</p>`;
  if (ci.error) return `<p class="cast-note muted">Couldn't check the full cast (${esc(ci.error)}).</p>`;
  const core = ci.chars.filter(isCore), have = core.filter((c) => inCastList(c, g)).length;
  const sideMissing = ci.chars.filter((c) => !isCore(c) && !inCastList(c, g)).length;
  const buttons = (have < core.length ? `<button class="ghost" data-cast="core">Add the ${core.length - have} missing</button>` : "") +
    (sideMissing ? `<button class="ghost" data-cast="all">Add ${sideMissing} side character${sideMissing === 1 ? "" : "s"} too</button>` : "");
  return `<p class="cast-note">${have === core.length ? `<b>Full cast ✓</b> · ${core.length} love interests + heroine are in your list.` : `Cast: <b>${have} of ${core.length}</b> love interests + heroine are in your list.`} ${buttons}</p>`;
}
function addCast(g, everyone) {
  const ci = castInfo[g]; if (!ci?.chars) return;
  const items = ci.chars.filter((c) => everyone || isCore(c)).map((c) => klCharItem(c, ci.game, { role: roleOf(c.role) }));
  const before = Object.keys(state.items).length;
  addItems(items);
  const added = Object.keys(state.items).length - before;
  save(); render(); toast(added ? `Added ${added} character${added === 1 ? "" : "s"} to ${g}` : `${g}: everyone was already in your list`);
}
$("#board").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cast]"); if (!b) return;
  e.stopPropagation(); addCast(state.awards.scope, b.dataset.cast === "all");
});

// find the game's cover once and remember it: saved game id, then KoiLog by title, then VNDB by title
async function resolveGameCover(g) {
  const set = curAwards(); if (!g || set.cover?.img) return;
  const coverOf = (game) => (game?.coverImageUrls?.thumbnail ? { img: game.coverImageUrls.thumbnail, imgHi: game.coverImageUrls.original || game.coverImageUrls.thumbnail } : null);
  const it = state.order.map((k) => state.items[k]).find((i) => i && i.game === g && i.gid);
  let cover = null;
  try { if (it?.gid) cover = coverOf(await kl("games/" + it.gid)); } catch (e) { /* try the next way */ }
  if (!cover) {
    try {
      const r = await kl(`games?searchQuery=${encodeURIComponent(g)}&pageSize=10`);
      const hit = (r.data || []).find((x) => (x.titles || []).some((t) => sameTitle(t.value, g)));
      cover = coverOf(hit);
    } catch (e) { /* try the next way */ }
  }
  if (!cover) {
    try {
      const r = await vndb("vn", { filters: ["search", "=", g], fields: "id,title,image.url,image.thumbnail", results: 5 });
      const hit = r.results.find((x) => sameTitle(x.title, g)) || r.results[0];
      if (hit?.image) cover = { img: hit.image.thumbnail || hit.image.url, imgHi: hit.image.url || hit.image.thumbnail };
    } catch (e) { /* no cover */ }
  }
  if (cover) { set.cover = cover; save(); render(); } else if (state.awards.scope === g) { const ph = $(".gcover-ph"); if (ph) ph.textContent = "No cover found"; }
}

function placeAward(key, at) {
  const [cid, i] = at.split(":"), c = curAwards().cats.find((x) => x.id === cid); if (!c) return;
  c.slots = c.slots.map((s, j) => (j === +i ? key : s === key ? null : s));   // a character can win many awards, but only one place in each
}
const awardKeys = () => new Set(awardSets().flatMap((st) => st.cats.flatMap((c) => c.slots.filter(Boolean))));

// board edits (typing keeps focus: save without redrawing)
$("#board").addEventListener("input", (e) => {
  const t = e.target, a = curAwards();
  if (t.classList.contains("atitle")) { const c = a.cats.find((x) => x.id === t.dataset.cat); if (c) { c.title = t.value; c.auto = autoOf(t.value); save(); } }
  else if (t.dataset.ab) { const [cid, i] = t.dataset.ab.split(":"), c = a.cats.find((x) => x.id === cid); if (c) { c.blurbs[+i] = t.value; save(); } }
});
$("#board").addEventListener("click", (e) => {
  const a = curAwards(), b = e.target.closest("[data-aact],[data-aclear]"); if (!b) return;
  e.stopPropagation();
  if (b.dataset.aclear) { const [cid, i] = b.dataset.aclear.split(":"), c = a.cats.find((x) => x.id === cid); if (c) c.slots[+i] = null; }
  else {
    const i = a.cats.findIndex((x) => x.id === b.dataset.cat); if (i < 0) return;
    if (b.dataset.aact === "up" && i > 0) [a.cats[i - 1], a.cats[i]] = [a.cats[i], a.cats[i - 1]];
    else if (b.dataset.aact === "down" && i < a.cats.length - 1) [a.cats[i + 1], a.cats[i]] = [a.cats[i], a.cats[i + 1]];
    else if (b.dataset.aact === "del") a.cats.splice(i, 1);
  }
  save(); render();
});

// the bar: type your own, pick from the list, add a pack, choose columns
$("#awAdd").onclick = () => { if (addAward($("#awNew").value)) { $("#awNew").value = ""; save(); render(); } else toast("Type an award name first", "error"); };
$("#awNew").onkeydown = (e) => { if (e.key === "Enter") $("#awAdd").click(); };
$("#awCols").onchange = (e) => { curAwards().cols = +e.target.value; save(); render(); };
function fillPackMenu() {
  const packs = { ...AWARD_PACKS[state.kind === "games" ? "games" : "characters"] };
  if (!state.awards.scope) delete packs["This game"];
  $("#awPack").innerHTML = `<option value="">Add a pack…</option>` + Object.keys(packs).map((k) => `<option value="${esc(k)}">${esc(k)} (${packs[k].length})</option>`).join("");
}
$("#awPack").onchange = (e) => {
  const list = AWARD_PACKS[state.kind === "games" ? "games" : "characters"][e.target.value]; e.target.value = ""; if (!list) return;
  const have = new Set(curAwards().cats.map((c) => c.title.toLowerCase()));
  let n = 0; for (const t of list) if (!have.has(t.toLowerCase()) && addAward(t)) n++;
  save(); render(); toast(n ? `Added ${n} awards` : "Those awards are already here");
};
$("#awPick").onclick = () => {
  const have = new Set(curAwards().cats.map((c) => c.title.toLowerCase()));
  $("#awList").innerHTML = awardLib().map(([group, list]) => `<fieldset><legend>${esc(group)}</legend>${list.map(([t, auto]) =>
    `<label class="inline"><input type="checkbox" data-t="${esc(t)}" ${have.has(t.toLowerCase()) ? "checked disabled" : ""}> ${esc(t)}${auto ? ' <small class="muted" title="Can be nominated from your ratings">★ auto</small>' : ""}</label>`).join("")}</fieldset>`).join("");
  $("#awFilter").value = ""; openDlg("#awardDlg");
};
$("#awFilter").oninput = (e) => {
  const q = e.target.value.trim().toLowerCase();
  $$("#awList label").forEach((l) => (l.hidden = !!q && !l.textContent.toLowerCase().includes(q)));
  $$("#awList fieldset").forEach((f) => (f.hidden = ![...f.querySelectorAll("label")].some((l) => !l.hidden)));
};
$("#awAddSel").onclick = () => {
  const picks = $$("#awList input:checked:not(:disabled)").map((i) => i.dataset.t); picks.forEach((t) => addAward(t));
  $("#awardDlg").close(); save(); render(); if (picks.length) toast(`Added ${picks.length} award${picks.length === 1 ? "" : "s"}`);
};


// per-game awards: pick a game and the pool, podiums and export are about that game only
function awardGames() {
  const m = new Map();
  for (const k of state.order) { const it = state.items[k]; if (it && it.kind !== "game") for (const g of gamesOf(it)) m.set(g, (m.get(g) || 0) + 1); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
let scopeSig = "";
function scopeSigReset() { scopeSig = ""; jumpSig = ""; }
function fillScopeBar() {
  const row = $("#awScopeRow"), onGames = state.kind === "games"; row.hidden = false;
  $("#awKind").hidden = onGames; $("#awJump").hidden = !onGames;
  if (onGames) return fillJumpMenu();   // on the Games side: choose a game, then give awards to its characters
  const inGame = !!state.awards.scope;
  $$("#awKind button").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.k === "game") === inGame)));
  $("#awGamePick").hidden = !inGame;
  const games = awardGames(), sig = games.map(([g, n]) => g + n + (state.awards.byGame[g]?.cats.some((c) => c.slots.some(Boolean)) ? "*" : "")).join("|") + "#" + state.awards.scope;
  if (sig !== scopeSig) {
    scopeSig = sig;
    $("#awScope").innerHTML = games.map(([g, n]) =>
      `<option value="${esc(g)}">${esc(g)} (${n})${state.awards.byGame[g]?.cats.some((c) => c.slots.some(Boolean)) ? " ✓" : ""}</option>`).join("");
  }
  $("#awScope").value = state.awards.scope;
}
// Games side: the characters live in the other list, so choosing a game takes you to them
let jumpSig = "";
function otherCharGames() {
  const o = state.other; if (!o || !o.items) return [];
  const m = new Map();
  for (const k of o.order || Object.keys(o.items)) { const it = o.items[k]; if (it && it.kind !== "game") for (const g of gamesOf(it)) m.set(g, (m.get(g) || 0) + 1); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
function fillJumpMenu() {
  const games = otherCharGames(), sel = $("#awJumpSel"), sig = games.map(([g, n]) => g + n).join("|");
  if (sig !== jumpSig) {
    jumpSig = sig;
    sel.innerHTML = games.length ? `<option value="">Choose a game…</option>` + games.map(([g, n]) => `<option value="${esc(g)}">${esc(g)} (${n})</option>`).join("") : `<option value="">No characters imported yet</option>`;
  }
  sel.value = "";
}
$("#awJumpSel").onchange = (e) => {
  const g = e.target.value; if (!g) return;
  switchKind("characters"); state.mode = "awards"; setScope(g);
  toast(`${g}: awards for its characters (Characters list)`);
};
function setScope(g) {
  if (state.kind === "games") g = "";   // the Games list has no per-game awards
  state.awards.scope = g; if (g) state.awards.last = g;
  if (g && !curAwards().cats.length) { AWARD_PACKS.characters["This game"].forEach((t) => addAward(t)); toast(`Started ${g} awards`); }
  save(); render(); if (g) loadCast(g).then(() => resolveGameCover(g));
}
$("#awKind").onclick = (e) => {
  const b = e.target.closest("[data-k]"); if (!b) return;
  if (b.dataset.k === "chars") return setScope("");
  const names = awardGames().map((x) => x[0]); if (!names.length) return toast("Import some characters first", "error");
  setScope(names.includes(state.awards.last) ? state.awards.last : names[0]);
};
$("#awScope").onchange = (e) => setScope(e.target.value);
const stepScope = (d) => { const names = awardGames().map((x) => x[0]); if (!names.length || !state.awards.scope) return; const i = names.indexOf(state.awards.scope); setScope(names[i < 0 ? 0 : (i + d + names.length) % names.length]); };
$("#awPrev").onclick = () => stepScope(-1); $("#awNext").onclick = () => stepScope(1);

// Auto-nominate: the top three by your rating for awards that have a matching rating (looks, voice, personality, writing, overall)
function autoAwards() {
  const metric = { looks: (it) => (it.sub || [])[0] || 0, story: (it) => (it.sub || [])[1] || 0, personality: (it) => (it.sub || [])[2] || 0, voice: (it) => (it.sub || [])[3] || 0, rating: (it) => it.rating || 0 };
  let filled = 0;
  for (const c of curAwards().cats) {
    const f = metric[c.auto]; if (!f) continue;
    const ranked = state.order.filter((k) => visible(k) && inScope(k) && f(state.items[k]) > 0)
      .sort((a, b) => f(state.items[b]) - f(state.items[a]) || (state.items[b].rating || 0) - (state.items[a].rating || 0));
    if (!ranked.length) continue;
    c.slots = [ranked[0] || null, ranked[1] || null, ranked[2] || null]; filled++;
  }
  return filled;
}

// ---------- double-click a card to pick where it goes ----------
let lastClick = { key: "", t: 0 };
function closeCardMenu() { $("#cardMenu")?.remove(); }
function openCardMenu(key, x, y) {
  closeCardMenu();
  const it = state.items[key]; if (!it) return;
  const opts = [];
  if (state.mode === "tier") {
    const cur = state.tiers.find((t) => t.keys.includes(key));
    state.tiers.forEach((t) => opts.push({ html: `<i style="background:${esc(t.color)}"></i>${esc(t.name)}${cur === t ? " ✓" : ""}`, run: () => moveKey(key, t.id) }));
  } else if (state.mode === "awards") {
    if (!curAwards().cats.length) opts.push({ html: "<i>Add some awards first</i>", run: () => {} });
    curAwards().cats.forEach((c) => opts.push({ row: true, label: c.title || "Untitled",
      runs: [0, 1, 2].map((i) => ({ txt: ["1st", "2nd", "3rd"][i], on: c.slots[i] === key, run: () => moveKey(key, "award", null, c.id + ":" + i) })) }));
  } else if (state.mode === "venn") {
    const v = state.venn, g = vennGeom(v), cur = Object.entries(v.regions).find(([, a]) => a.includes(key))?.[0];
    Object.keys(g.regions).sort((a, b) => a.length - b.length || a.localeCompare(b)).forEach((k) => {
      const names = k.split("").map((i) => v.circles[+i].name || `Circle ${+i + 1}`);
      const cols = k.split("").map((i) => v.circles[+i].color);
      opts.push({ html: `<i style="background:linear-gradient(90deg,${cols.join(",")}${cols.length < 2 ? "," + cols[0] : ""})"></i>${esc(names.length === 1 ? names[0] + " only" : names.join(" + "))}${cur === k ? " ✓" : ""}`, run: () => moveKey(key, k) });
    });
  } else {
    const a = state.axis, q = a.quad, j = () => (Math.random() - 0.5) * 0.12;
    [["Top left", q[0], 0.25, 0.25], ["Top right", q[1], 0.75, 0.25], ["Bottom left", q[2], 0.25, 0.75], ["Bottom right", q[3], 0.75, 0.75], ["Centre", "", 0.5, 0.5]]
      .forEach(([n, lab, px, py]) => opts.push({ html: `${esc(n)}${lab ? ` <small>${esc(lab)}</small>` : ""}`, run: () => moveKey(key, "axis", null, { x: px + j(), y: py + j() }) }));
  }
  opts.push({ sep: true });
  if (state.mode === "awards" ? curAwards().cats.some((c) => c.slots.includes(key)) : placed().has(key)) opts.push({ html: state.mode === "awards" ? "↩ Take off every podium here" : "↩ Back to the pool", run: () => {
    if (state.mode === "awards") { curAwards().cats.forEach((c) => (c.slots = c.slots.map((s) => (s === key ? null : s)))); save(); render(); } else moveKey(key, ""); } });
  if (it.kind !== "game") opts.push({ html: isHeroine(it) ? "♀ Unmark as heroine" : "♀ Mark as heroine", run: () => { it.heroine = !isHeroine(it); save(); render(); } });
  opts.push({ html: it.kind === "game" ? "✕ Remove game" : "✕ Remove character", danger: true, run: () => removeItem(key) });
  const m = document.createElement("div"); m.id = "cardMenu"; m.className = "card-menu";
  m.innerHTML = `<div class="cm-h">Move <b>${esc(it.label)}</b> to…</div>` + opts.map((o, i) => (o.sep ? `<hr>` : o.row ? `<div class="cm-row"><span>${esc(o.label)}</span>${o.runs.map((r, j) => `<button data-i="${i}" data-r="${j}"${r.on ? ' class="on"' : ""}>${r.txt}</button>`).join("")}</div>` : `<button data-i="${i}"${o.danger ? ' class="danger"' : ""}>${o.html}</button>`)).join("");
  document.body.appendChild(m);
  m.style.left = Math.max(8, Math.min(x, innerWidth - m.offsetWidth - 8)) + "px";
  m.style.top = Math.max(8, Math.min(y, innerHeight - m.offsetHeight - 8)) + "px";
  m.onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) { closeCardMenu(); const o = opts[+b.dataset.i]; (b.dataset.r !== undefined ? o.runs[+b.dataset.r] : o).run(); } };
}
document.addEventListener("mousedown", (e) => { if (!e.target.closest?.("#cardMenu")) closeCardMenu(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCardMenu(); });
addEventListener("scroll", closeCardMenu, true);


let resizeT; addEventListener("resize", () => { if (state.mode !== "venn") return; clearTimeout(resizeT); resizeT = setTimeout(render, 200); });

wireScales(); wireMatch();
render();
