// ---------- scales: spectrum line, radar chart and alignment grid ----------
// Loaded before app.js (which owns `state`, `$`, `esc`, `save`, `render`, `toast`, ...). Everything here runs after app.js has loaded.
// A route is one character in one game, keyed "<charKey>@<game>". Ratings are 0 to 10 in half steps on user-made opposite-ended scales.
const SCALE_MODES = ["spectrum", "radar", "align"];
const isScalesMode = () => SCALE_MODES.includes(state.mode);
const SC_MAX = 8, RADAR_MAX = 4, RADAR_R = 140;
const RADAR_COLORS = ["#e8467c", "#3aa0e0", "#f2b94b", "#4cb782"];
const scQ = (v) => Math.min(10, Math.max(0, Math.round(v * 2) / 2));
const scFmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function makeScales() {
  const a = newId(), b = newId();
  return { list: [{ id: a, lo: "Fluff", hi: "Serious" }, { id: b, lo: "Cute", hi: "Spice" }], ratings: {}, done: {},
    pool: { mode: "all", games: [], completedOnly: false }, spectrum: { scale: a }, radar: { routes: [], scales: [] },
    align: { x: a, y: b, cuts: [3.5, 6.5], names: Array(9).fill("") } };
}
// saved or imported lists: keep only what makes sense
function cleanScales(s) {
  if (!s || typeof s !== "object" || !Array.isArray(s.list)) return makeScales();
  const list = s.list.filter((x) => x && typeof x.id === "string").slice(0, SC_MAX).map((x) => ({ id: x.id.slice(0, 24), lo: String(x.lo ?? "").slice(0, 24), hi: String(x.hi ?? "").slice(0, 24) }));
  if (list.length < 2) return makeScales();
  const ids = new Set(list.map((x) => x.id)), pick = (id, d) => (ids.has(id) ? id : d);
  const ratings = {};
  for (const [rk, r] of Object.entries(s.ratings && typeof s.ratings === "object" ? s.ratings : {})) {
    if (!r || typeof r !== "object") continue;
    const o = {}; for (const [sid, v] of Object.entries(r)) if (ids.has(sid) && isFinite(v)) o[sid] = scQ(+v);
    if (Object.keys(o).length) ratings[rk] = o;
  }
  const done = {}; for (const [rk, v] of Object.entries(s.done && typeof s.done === "object" ? s.done : {})) done[rk] = !!v;
  const p = s.pool || {}, al = s.align || {}, cuts = Array.isArray(al.cuts) ? al.cuts.map(Number) : [3.5, 6.5];
  const c0 = isFinite(cuts[0]) ? Math.min(9, Math.max(0.5, cuts[0])) : 3.5, c1 = isFinite(cuts[1]) ? Math.min(9.5, Math.max(c0 + 0.5, cuts[1])) : Math.max(c0 + 0.5, 6.5);
  return { list, ratings, done,
    pool: { mode: ["one", "some"].includes(p.mode) ? p.mode : "all", games: (Array.isArray(p.games) ? p.games : []).filter((g) => typeof g === "string").slice(0, 600).map((g) => g.slice(0, 200)), completedOnly: !!p.completedOnly },
    spectrum: { scale: pick(s.spectrum?.scale, list[0].id) },
    radar: { routes: (Array.isArray(s.radar?.routes) ? s.radar.routes : []).filter((r) => typeof r === "string").slice(0, RADAR_MAX), scales: (Array.isArray(s.radar?.scales) ? s.radar.scales : []).filter((i) => ids.has(i)) },
    align: { x: pick(al.x, list[0].id), y: pick(al.y, list[1].id), cuts: [c0, c1], names: Array.from({ length: 9 }, (_, i) => String(al.names?.[i] ?? "").slice(0, 40)) } };
}

// ---------- routes ----------
let scSel = "", scQuery = "", scShown = 100, scEditOpen = false, scDrag = null;
const scaleById = (id) => state.scales.list.find((x) => x.id === id);
const scGet = (rk, sid) => state.scales.ratings[rk]?.[sid];
function scSet(rk, sid, v) {
  const r = (state.scales.ratings[rk] ||= {});
  if (v === undefined || v === null) delete r[sid]; else r[sid] = scQ(v);
  if (!Object.keys(r).length) delete state.scales.ratings[rk];
}
function scRoutes() {
  const out = [];
  for (const key of state.order) {
    const it = state.items[key]; if (!it || !visible(key)) continue;
    const gs = gamesOf(it);
    for (const g of gs.length ? gs : [""]) out.push({ rk: key + "@" + g, key, game: g, it });
  }
  return out;
}
function scRoute(rk) {
  const i = rk.indexOf("@"); if (i < 0) return null;
  const key = rk.slice(0, i), it = state.items[key]; return it ? { rk, key, game: rk.slice(i + 1), it } : null;
}
// completed: what you marked by hand, else the KoiLog route status (for the game the character was last imported from)
function scDone(r) {
  const d = state.scales.done[r.rk];
  return d !== undefined ? !!d : r.game === (r.it.game || "") && /COMPLETED/i.test(r.it.status || "");
}
function scPoolRoutes(withQuery) {
  const p = state.scales.pool, q = withQuery ? scQuery.trim().toLowerCase() : "";
  let rs = scRoutes();
  if (p.mode === "one") rs = rs.filter((r) => r.game === p.games[0]);
  else if (p.mode === "some") { const g = new Set(p.games); rs = rs.filter((r) => g.has(r.game)); }
  if (p.completedOnly) rs = rs.filter(scDone);
  if (q) rs = rs.filter((r) => `${r.it.label} ${r.it.alt || ""} ${r.game}`.toLowerCase().includes(q));
  return rs;
}
const scAvatar = (it) => (it.img ? `<img decoding="async" src="${esc(imgSrc(it.img))}" alt="">` : `<span class="ph">${esc((it.label || "?")[0])}</span>`);
const scName = (sc) => `${sc.lo} ↔ ${sc.hi}`;
function scDropItem(key) {   // an item was removed from the list
  for (const rk of Object.keys(state.scales.ratings)) if (rk.startsWith(key + "@")) delete state.scales.ratings[rk];
  state.scales.radar.routes = state.scales.radar.routes.filter((r) => !r.startsWith(key + "@"));
}

// ---------- the page ----------
function scRender() {
  const s = state.scales;
  const games = new Map(); for (const r of scRoutes()) games.set(r.game, (games.get(r.game) || 0) + 1);
  const names = [...games.keys()].sort((a, b) => a.localeCompare(b));
  if (s.pool.mode === "one" && !names.includes(s.pool.games[0])) s.pool.games = names.length ? [names[0]] : [];
  const sel = (id, opts, cur, extra = "") => `<select ${id} ${extra}>${opts.map(([v, t, n]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}${n ? ` data-sname="${esc(v)}"` : ""}>${esc(t)}</option>`).join("")}</select>`;
  const scaleOpts = s.list.map((x) => [x.id, scName(x), 1]);
  const mode = state.mode;
  const bar = `<span class="sc-modehint muted">${mode === "spectrum" ? "One scale as a line" : mode === "radar" ? "Compare up to 4 routes across your scales" : "Two scales make a 3×3 grid"}</span>
    ${mode === "spectrum" ? `<label>Scale ${sel('id="scSpecScale"', scaleOpts, s.spectrum.scale)}</label>` : ""}
    ${mode === "align" ? `<label>Left → right ${sel('data-al="x"', scaleOpts, s.align.x)}</label><label>Bottom → top ${sel('data-al="y"', scaleOpts, s.align.y)}</label>
      <label title="Scores up to the first number are Low, from the second number are High, the rest Middle">Low up to <input type="number" data-cut="0" min="0.5" max="9" step="0.5" value="${s.align.cuts[0]}"> High from <input type="number" data-cut="1" min="1" max="9.5" step="0.5" value="${s.align.cuts[1]}"></label>` : ""}
    ${mode === "radar" ? `<span class="sc-chipset">${s.list.map((x) => `<label class="inline"><input type="checkbox" data-rs="${esc(x.id)}"${!s.radar.scales.length || s.radar.scales.includes(x.id) ? " checked" : ""}><span data-sname="${esc(x.id)}">${esc(scName(x))}</span></label>`).join("")}</span>` : ""}
    <details class="sc-edit"${scEditOpen ? " open" : ""}><summary>Scales (${s.list.length})</summary>
      <div class="sc-scales">${s.list.map((x) => `<div class="sc-srow"><input data-lo="${esc(x.id)}" value="${esc(x.lo)}" maxlength="24" aria-label="Low end"><span>↔</span><input data-hi="${esc(x.id)}" value="${esc(x.hi)}" maxlength="24" aria-label="High end"><button class="ghost icon" data-delscale="${esc(x.id)}" title="Delete this scale"${s.list.length <= 2 ? " disabled" : ""}>✕</button></div>`).join("")}</div>
      <div class="row"><button class="ghost" data-addscale${s.list.length >= SC_MAX ? " disabled" : ""}>+ Add a scale</button><button class="ghost" data-clearall>Clear all ratings</button></div>
    </details>`;
  const gameCtl = `<label>Games ${sel('id="scGameMode"', [["all", "All games"], ["one", "One game"], ["some", "Several games"]], s.pool.mode)}</label>
    ${s.pool.mode === "one" ? sel('id="scGameOne" class="sc-wide"', names.map((n) => [n, `${n || "(no game)"} (${games.get(n)})`]), s.pool.games[0]) : ""}
    ${s.pool.mode === "some" ? `<details class="sc-glist"><summary>${s.pool.games.length} game${s.pool.games.length === 1 ? "" : "s"} picked</summary><div class="sc-gbox">${names.map((n) => `<label class="inline"><input type="checkbox" data-gsome="${esc(n)}"${s.pool.games.includes(n) ? " checked" : ""}> ${esc(n || "(no game)")} (${games.get(n)})</label>`).join("")}</div></details>` : ""}`;
  $("#board").innerHTML = `<div class="sc">
    <div class="venn-bar sc-bar">${bar}</div>
    <div class="sc-main">
      <aside class="sc-side">
        <div class="sc-filters">${gameCtl}
          <label class="inline"><input type="checkbox" id="scDoneOnly"${s.pool.completedOnly ? " checked" : ""}> Completed routes only</label>
          <select id="scHero" title="Who to show">${Object.entries(HERO_FILTERS).map(([v, t]) => `<option value="${v}"${v === state.ui.heroines ? " selected" : ""}>${t}</option>`).join("")}</select>
          <input id="scSearch" type="search" placeholder="Filter routes by name or game…" value="${esc(scQuery)}"></div>
        <div id="scRoutes" class="sc-routes"></div>
      </aside>
      <section class="sc-stage"><div id="scRate" class="sc-rate"></div><div id="scChart" class="sc-chart"></div></section>
    </div></div>`;
  scRoutesRender(); scRateRender(); scChartRender();
}

function scRoutesRender() {
  const el = $("#scRoutes"); if (!el) return;
  const s = state.scales, rs = scPoolRoutes(true).sort((a, b) => a.it.label.localeCompare(b.it.label) || a.game.localeCompare(b.game));
  const total = scPoolRoutes(false).length;
  const row = (r) => `<div class="sc-route${r.rk === scSel ? " sel" : ""}" data-rk="${esc(r.rk)}" role="button" tabindex="0">
    <span class="sc-th">${scAvatar(r.it)}</span><span class="sc-rn"><b>${esc(r.it.label)}</b><small>${esc(r.game || "No game")}</small></span>
    <span class="sc-chips">${s.list.map((x) => { const v = scGet(r.rk, x.id); return `<i class="${v === undefined ? "off" : ""}" title="${esc(scName(x))}">${v === undefined ? "·" : scFmt(v)}</i>`; }).join("")}</span>
    <button class="sc-done" data-done aria-pressed="${scDone(r)}" title="Completed route (click to change)">✓</button></div>`;
  const shown = rs.slice(0, scShown);
  el.innerHTML = rs.length ? shown.map(row).join("") + (rs.length > shown.length ? `<button class="ghost pool-more" id="scMore">Show more (${rs.length - shown.length} left)</button>` : "")
    : `<p class="muted empty">${state.order.length ? "No routes match. Try another game, or untick Completed routes only." : "Nothing here yet. Use Import characters."}</p>`;
  const f = $("#scCount"); if (f) f.textContent = `${rs.length} of ${total}`;
}

function scRateRender() {
  const el = $("#scRate"); if (!el) return;
  const r = scSel && scRoute(scSel);
  if (!r) { el.innerHTML = `<p class="muted">Pick a route in the list${state.mode === "radar" ? " (it joins the radar)" : ""}, then <b>click or drag</b> on the chart to rate it.</p>`; return; }
  el.innerHTML = `<div class="sc-rhead"><span class="sc-th">${scAvatar(r.it)}</span><span><b>${esc(r.it.label)}</b> <small class="muted">${esc(r.game || "No game")}</small></span></div>
    <div class="sc-sliders">${state.scales.list.map((x) => { const v = scGet(r.rk, x.id);
      return `<label class="sc-slider${v === undefined ? " off" : ""}"><span class="lo" data-lo-t="${esc(x.id)}">${esc(x.lo)}</span><input type="range" min="0" max="10" step="0.5" data-rate="${esc(x.id)}" value="${v ?? 5}"><span class="hi" data-hi-t="${esc(x.id)}">${esc(x.hi)}</span><output>${v === undefined ? "–" : scFmt(v)}</output><button class="ghost icon" data-clear="${esc(x.id)}" title="Clear this score">✕</button></label>`; }).join("")}</div>`;
}

function scChartRender() {
  const el = $("#scChart"); if (!el) return;
  el.innerHTML = state.mode === "spectrum" ? scSpectrumHtml() : state.mode === "radar" ? scRadarHtml() : scAlignHtml();
}

// ---------- spectrum ----------
const scLeft = (v) => `calc(var(--pad) + (100% - 2 * var(--pad)) * ${v / 10})`;
function scSpectrumHtml() {
  const s = state.scales, sc = scaleById(s.spectrum.scale) || s.list[0];
  const sz = Math.max(36, Math.min(72, state.ui.boardCard)), pad = Math.ceil(sz / 2) + 8;
  const W = Math.max(300, ($("#scChart")?.clientWidth || 800) - 2 * pad), gap = sz * 1.05 / W * 10;
  const rated = scPoolRoutes(false).map((r) => ({ r, v: scGet(r.rk, sc.id) })).filter((x) => x.v !== undefined).sort((a, b) => a.v - b.v);
  const last = []; for (const x of rated) { let l = 0; while (last[l] !== undefined && x.v - last[l] < gap) l++; last[l] = x.v; x.lane = l; }
  const lanes = Math.max(1, last.length), lh = sz + 8;
  const av = rated.map(({ r, v, lane }) => `<div class="sc-av${r.rk === scSel ? " sel" : ""}" data-rk="${esc(r.rk)}" style="left:${scLeft(v)};bottom:${34 + lane * lh}px" title="${esc(r.it.label)} · ${esc(r.game)}">${scAvatar(r.it)}<b>${scFmt(v)}</b></div>`).join("");
  const ticks = Array.from({ length: 11 }, (_, i) => `<span style="left:${i * 10}%">${i % 2 ? "" : i}</span>`).join("");
  return `<div class="sc-spec" style="--sz:${sz}px;--pad:${pad}px"><div class="sc-pad" data-gesture="spec" data-sid="${esc(sc.id)}" style="height:${lanes * lh + 76}px">${av}
    <div class="sc-line"><div class="sc-ticks">${ticks}</div></div></div>
    <div class="sc-ends"><b data-lo-t="${esc(sc.id)}">${esc(sc.lo)}</b><span class="muted">${rated.length} rated · click or drag on the line</span><b data-hi-t="${esc(sc.id)}">${esc(sc.hi)}</b></div></div>`;
}

// ---------- radar ----------
const scRadarScales = () => { const s = state.scales; const pick = s.list.filter((x) => !s.radar.scales.length || s.radar.scales.includes(x.id)); return pick; };
const scRadarActive = () => (state.scales.radar.routes.includes(scSel) ? scSel : "");
function scRadarHtml() {
  const s = state.scales, sl = scRadarScales(), n = sl.length;
  if (n < 3) return `<p class="muted empty">A radar needs at least 3 scales. Tick more scales above, or add one under <b>Scales</b>.</p>`;
  const ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n, pt = (i, v) => [Math.cos(ang(i)) * RADAR_R * v / 10, Math.sin(ang(i)) * RADAR_R * v / 10];
  const poly = (v) => sl.map((_, i) => pt(i, v).map((c) => c.toFixed(1)).join(",")).join(" ");
  const rings = [2, 4, 6, 8, 10].map((v) => `<polygon points="${poly(v)}" class="rg${v === 10 ? " rim" : ""}"/><text x="3" y="${(-RADAR_R * v / 10 - 2).toFixed(1)}" class="rn">${v}</text>`).join("");
  const spokes = sl.map((_, i) => { const [x, y] = pt(i, 10); return `<line x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="sp"/>`; }).join("");
  const labels = sl.map((x, i) => { const [lx, ly] = pt(i, 10), c = Math.cos(ang(i)), sn = Math.sin(ang(i)), ex = lx + c * 14, ey = ly + sn * 14 + (sn > 0.3 ? 8 : 0), an = Math.abs(c) < 0.25 ? "middle" : c > 0 ? "start" : "end";
    return `<text x="${ex.toFixed(1)}" y="${ey.toFixed(1)}" text-anchor="${an}" class="lb" data-hi-t="${esc(x.id)}">${esc(x.hi)}</text><text x="${ex.toFixed(1)}" y="${(ey + 12).toFixed(1)}" text-anchor="${an}" class="lb2">low: ${esc(x.lo)}</text>`; }).join("");
  const act = scRadarActive();
  const shapes = s.radar.routes.map((rk, ri) => {
    const col = RADAR_COLORS[ri % RADAR_COLORS.length], pts = sl.map((x, i) => { const v = scGet(rk, x.id); return v === undefined ? null : { i, v, p: pt(i, v) }; }).filter(Boolean);
    const path = pts.length >= 3 ? `<polygon points="${pts.map((q) => q.p.map((c) => c.toFixed(1)).join(",")).join(" ")}" fill="${col}" fill-opacity="${rk === act ? 0.28 : 0.14}" stroke="${col}" stroke-width="${rk === act ? 3 : 2}"/>`
      : pts.length === 2 ? `<polyline points="${pts.map((q) => q.p.map((c) => c.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${col}" stroke-width="2"/>` : "";
    const dots = pts.map((q) => `<circle cx="${q.p[0].toFixed(1)}" cy="${q.p[1].toFixed(1)}" r="${rk === act ? 7 : 4.5}" fill="${col}" stroke="#fff" stroke-width="1.5" data-i="${q.i}" data-rk="${esc(rk)}"><title>${esc(scName(sl[q.i]))}: ${scFmt(q.v)}</title></circle>`).join("");
    return path + dots;
  }).join("");
  const legend = s.radar.routes.map((rk, ri) => { const r = scRoute(rk); if (!r) return ""; const col = RADAR_COLORS[ri % RADAR_COLORS.length];
    return `<span class="sc-lchip${rk === act ? " sel" : ""}" data-chip="${esc(rk)}" style="--c:${col}"><i></i><b>${esc(r.it.label)}</b><small>${esc(r.game)}</small><button class="ghost icon" data-radar-x="${esc(rk)}" title="Remove from the radar">✕</button></span>`; }).join("");
  return `<div class="sc-radarwrap"><svg id="scRadar" class="sc-radar" data-gesture="radar" viewBox="-215 -190 430 380" role="img" aria-label="Radar chart of route ratings">${rings}${spokes}${shapes}${labels}</svg>
    <div class="sc-legend">${legend || `<span class="muted">Pick routes in the list to add them (up to ${RADAR_MAX}).</span>`}</div>
    <p class="muted sc-note">${act ? "Click or drag on the chart to rate the highlighted route; the nearest spoke moves." : s.radar.routes.length ? "Click a route above to choose which one you are rating." : ""}</p></div>`;
}

// ---------- alignment ----------
const scBand = (v, c) => (v <= c[0] ? 0 : v >= c[1] ? 2 : 1);
const scCentres = (c) => [scQ(c[0] / 2), scQ((c[0] + c[1]) / 2), scQ((c[1] + 10) / 2)];
function scAlignHtml() {
  const s = state.scales, a = s.align, X = scaleById(a.x) || s.list[0], Y = scaleById(a.y) || s.list[1] || s.list[0], c = a.cuts;
  const sz = Math.max(36, Math.min(64, state.ui.boardCard)), part = (sc, b) => (b === 0 ? sc.lo : b === 2 ? sc.hi : "Balanced");
  const cells = Array.from({ length: 9 }, () => []);
  for (const r of scPoolRoutes(false)) { const vx = scGet(r.rk, X.id), vy = scGet(r.rk, Y.id); if (vx === undefined || vy === undefined) continue;
    cells[(2 - scBand(vy, c)) * 3 + scBand(vx, c)].push(r); }
  const html = cells.map((rs, i) => { const col = i % 3, row = Math.floor(i / 3), auto = `${part(X, col)} · ${part(Y, 2 - row)}`;
    return `<div class="sc-cell" data-cell="${i}" style="--t:${(col + 2 - row) * 9}"><input class="sc-cname" data-cn="${i}" value="${esc(a.names[i])}" placeholder="${esc(auto)}" maxlength="40" aria-label="Name of this cell"><div class="sc-cavs">${rs.map((r) => `<div class="sc-av${r.rk === scSel ? " sel" : ""}" data-rk="${esc(r.rk)}" title="${esc(r.it.label)} · ${esc(r.game)} (${scFmt(scGet(r.rk, X.id))}, ${scFmt(scGet(r.rk, Y.id))})">${scAvatar(r.it)}<b>${esc(r.it.label)}</b></div>`).join("")}</div></div>`; }).join("");
  return `<div class="sc-align" style="--sz:${sz}px"><div class="sc-ay t" data-hi-t="${esc(Y.id)}">${esc(Y.hi)}</div><div class="sc-ax l" data-lo-t="${esc(X.id)}">${esc(X.lo)}</div><div class="sc-grid">${html}</div><div class="sc-ax r" data-hi-t="${esc(X.id)}">${esc(X.hi)}</div><div class="sc-ay b" data-lo-t="${esc(Y.id)}">${esc(Y.lo)}</div></div>
    <p class="muted sc-note">Click a cell to put the picked route there, or drag a card between cells. For exact scores use the sliders above.</p>`;
}

// ---------- doing things ----------
function scSelect(rk) {
  scSel = rk;
  if (state.mode === "radar") {
    const r = state.scales.radar.routes;
    if (!r.includes(rk)) { if (r.length >= RADAR_MAX) toast(`The radar compares up to ${RADAR_MAX} routes. Remove one first.`, "error"); else { r.push(rk); save(); } }
  }
  scRoutesRender(); scRateRender(); scChartRender();
}
function scRefreshAll() { scRoutesRender(); scRateRender(); scChartRender(); }
function scLabels() {   // scale names changed: update the text in place so typing isn't interrupted
  for (const x of state.scales.list) {
    document.querySelectorAll(`[data-sname="${CSS.escape(x.id)}"]`).forEach((e) => (e.textContent = scName(x)));
    document.querySelectorAll(`[data-lo-t="${CSS.escape(x.id)}"]`).forEach((e) => (e.textContent = x.lo));
    document.querySelectorAll(`[data-hi-t="${CSS.escape(x.id)}"]`).forEach((e) => (e.textContent = x.hi));
  }
  document.querySelectorAll("#scRoutes .sc-chips i").forEach((e, i) => { const x = state.scales.list[i % state.scales.list.length]; if (x) e.title = scName(x); });
}

function scPointerDown(e) {
  if (e.button !== 0 || !isScalesMode()) return;
  const t = e.target, s = state.scales;
  if (t.closest("input,select,button,summary")) return;
  const av = t.closest(".sc-av");
  if (state.mode === "spectrum" && t.closest("[data-gesture=spec]")) {
    const rk = av ? av.dataset.rk : scSel, sid = t.closest("[data-gesture]").dataset.sid;
    if (!rk) return toast("Pick a route in the list first, then click or drag on the line.", "error");
    if (rk !== scSel) { scSel = rk; scRoutesRender(); scRateRender(); }
    scDrag = { kind: "spec", rk, sid }; e.preventDefault(); scMove(e);
  } else if (state.mode === "radar" && t.closest("#scRadar")) {
    const rk = scRadarActive(); if (!rk) return toast("Pick a route in the list (or click one above the chart) to rate it.", "error");
    const sl = scRadarScales(), p = scRadarPoint(e); let i = t.dataset?.i !== undefined && t.dataset.rk === rk ? +t.dataset.i : -1;
    if (i < 0) { let ang = Math.atan2(p.y, p.x) + Math.PI / 2; ang = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); i = Math.round(ang / (2 * Math.PI) * sl.length) % sl.length; }
    scDrag = { kind: "radar", rk, i, sid: sl[i].id }; e.preventDefault(); scMove(e);
  } else if (state.mode === "align" && av) {
    const rk = av.dataset.rk; if (rk !== scSel) { scSel = rk; scRoutesRender(); scRateRender(); document.querySelectorAll("#scChart .sc-av").forEach((a) => a.classList.toggle("sel", a.dataset.rk === rk)); }
    scDrag = { kind: "align", rk, el: av, x0: e.clientX, y0: e.clientY, moved: false }; e.preventDefault();
  }
}
function scRadarPoint(e) {
  const svg = $("#scRadar"), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, k = Math.max(vb.width / r.width, vb.height / r.height);
  // the svg keeps its aspect ratio, so the picture is centred inside the box
  const w = vb.width / k, h = vb.height / k, ox = r.left + (r.width - w) / 2, oy = r.top + (r.height - h) / 2;
  return { x: (e.clientX - ox) * k + vb.x, y: (e.clientY - oy) * k + vb.y };
}
function scMove(e) {
  const d = scDrag; if (!d) return;
  if (d.kind === "spec") {
    const line = $(".sc-line"); if (!line) return; const r = line.getBoundingClientRect(), v = scQ((e.clientX - r.left) / r.width * 10);
    if (scGet(d.rk, d.sid) === v) return; scSet(d.rk, d.sid, v);
    let av = $(`.sc-av[data-rk="${CSS.escape(d.rk)}"]`); if (!av) { scChartRender(); av = $(`.sc-av[data-rk="${CSS.escape(d.rk)}"]`); }
    if (av) { av.style.left = scLeft(v); av.querySelector("b").textContent = scFmt(v); }
    scSliderSync(d.sid, v);
  } else if (d.kind === "radar") {
    const sl = scRadarScales(), p = scRadarPoint(e), a = -Math.PI / 2 + 2 * Math.PI * d.i / sl.length;
    const v = scQ((p.x * Math.cos(a) + p.y * Math.sin(a)) / RADAR_R * 10); if (scGet(d.rk, d.sid) === v) return;
    scSet(d.rk, d.sid, v); scChartRender(); scSliderSync(d.sid, v);
  } else if (d.kind === "align") {
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4) { d.moved = true; d.el.classList.add("drag"); }
    if (d.moved) d.el.style.transform = `translate(${e.clientX - d.x0}px,${e.clientY - d.y0}px)`;
  }
}
function scSliderSync(sid, v) {   // keep the slider panel in step while dragging on the chart
  const sl = $(`#scRate [data-rate="${CSS.escape(sid)}"]`); if (!sl) return;
  sl.value = v; sl.closest("label").classList.remove("off"); sl.closest("label").querySelector("output").textContent = scFmt(v);
}
function scUp(e) {
  const d = scDrag; if (!d) return; scDrag = null;
  if (d.kind === "align" && d.moved) {
    d.el.style.pointerEvents = "none"; const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest(".sc-cell"); d.el.style.pointerEvents = "";
    if (cell) scPutInCell(d.rk, +cell.dataset.cell);
  }
  save(); scRefreshAll();
}
function scPutInCell(rk, i) {
  const a = state.scales.align, ctr = scCentres(a.cuts); scSet(rk, a.x, ctr[i % 3]); scSet(rk, a.y, ctr[2 - Math.floor(i / 3)]);
}

function wireScales() {
  const B = $("#board"), s = () => state.scales;
  B.addEventListener("pointerdown", scPointerDown);
  document.addEventListener("pointermove", (e) => { if (scDrag) scMove(e); });
  document.addEventListener("pointerup", scUp); document.addEventListener("pointercancel", scUp);
  B.addEventListener("click", (e) => {
    if (!isScalesMode()) return; const t = e.target;
    if (t.closest("#scMore")) { scShown += 100; return scRoutesRender(); }
    const dn = t.closest("[data-done]");
    if (dn) { const r = scRoute(dn.closest(".sc-route").dataset.rk); if (r) { s().done[r.rk] = !scDone(r); save(); scRoutesRender(); } return; }
    const rx = t.closest("[data-radar-x]"); if (rx) { s().radar.routes = s().radar.routes.filter((r) => r !== rx.dataset.radarX); save(); scChartRender(); return; }
    const ch = t.closest("[data-chip]"); if (ch) { scSel = ch.dataset.chip; scRefreshAll(); return; }
    const row = t.closest(".sc-route"); if (row) return scSelect(row.dataset.rk);
    const cl = t.closest("[data-clear]"); if (cl && scSel) { scSet(scSel, cl.dataset.clear, null); save(); return scRefreshAll(); }
    if (t.closest("[data-addscale]")) { if (s().list.length < SC_MAX) { s().list.push({ id: newId(), lo: "Low", hi: "High" }); scEditOpen = true; save(); scRender(); } return; }
    const del = t.closest("[data-delscale]");
    if (del && s().list.length > 2) {
      const id = del.dataset.delscale; s().list = s().list.filter((x) => x.id !== id);
      for (const rk of Object.keys(s().ratings)) scSet(rk, id, null);
      const ok = cleanScales(s()); Object.assign(s(), { spectrum: ok.spectrum, radar: ok.radar, align: ok.align }); scEditOpen = true; save(); scRender(); return;
    }
    if (t.closest("[data-clearall]")) { if (confirm("Clear every score you've given on every scale?")) { s().ratings = {}; save(); scRefreshAll(); } return; }
    if (state.mode === "align") {
      const cell = t.closest(".sc-cell"); if (!cell || t.closest("input,.sc-av")) return;
      if (!scSel) return toast("Pick a route in the list first.", "error");
      scPutInCell(scSel, +cell.dataset.cell); save(); scRefreshAll();
    }
  });
  B.addEventListener("keydown", (e) => { const row = e.target.closest?.(".sc-route"); if (row && (e.key === "Enter" || e.key === " ") && !e.target.closest("button")) { e.preventDefault(); scSelect(row.dataset.rk); } });
  B.addEventListener("toggle", (e) => { if (e.target.classList?.contains("sc-edit")) scEditOpen = e.target.open; }, true);
  B.addEventListener("input", (e) => {
    if (!isScalesMode()) return; const t = e.target;
    if (t.dataset.lo) { scaleById(t.dataset.lo).lo = t.value; save(); scLabels(); }
    else if (t.dataset.hi) { scaleById(t.dataset.hi).hi = t.value; save(); scLabels(); }
    else if (t.dataset.cn !== undefined) { s().align.names[+t.dataset.cn] = t.value; save(); }
    else if (t.id === "scSearch") { scQuery = t.value; scShown = 100; clearTimeout(scSearchT); scSearchT = setTimeout(scRoutesRender, 120); }
    else if (t.dataset.rate && scSel) {
      const v = +t.value; scSet(scSel, t.dataset.rate, v); t.closest("label").classList.remove("off"); t.closest("label").querySelector("output").textContent = scFmt(v); save(); scChartRender();
    }
  });
  B.addEventListener("change", (e) => {
    if (!isScalesMode()) return; const t = e.target, p = s().pool;
    if (t.id === "scGameMode") { p.mode = t.value; p.games = p.mode === "all" ? [] : p.mode === "one" ? [] : p.games; scShown = 100; save(); return scRender(); }
    if (t.id === "scGameOne") { p.games = [t.value]; scShown = 100; save(); return scRefreshAll(); }
    if (t.dataset.gsome !== undefined) { p.games = t.checked ? [...new Set([...p.games, t.dataset.gsome])] : p.games.filter((g) => g !== t.dataset.gsome); t.closest("details").querySelector("summary").textContent = `${p.games.length} game${p.games.length === 1 ? "" : "s"} picked`; save(); return scRefreshAll(); }
    if (t.id === "scDoneOnly") { p.completedOnly = t.checked; scShown = 100; save(); return scRefreshAll(); }
    if (t.id === "scHero") { state.ui.heroines = t.value; save(); return scRender(); }
    if (t.id === "scSpecScale") { s().spectrum.scale = t.value; save(); return scChartRender(); }
    if (t.dataset.al) { s().align[t.dataset.al] = t.value; save(); return scChartRender(); }
    if (t.dataset.cut !== undefined) {
      const c = s().align.cuts, i = +t.dataset.cut, v = Math.round((+t.value || 0) * 2) / 2;
      if (i === 0) { c[0] = Math.min(9, Math.max(0.5, v)); c[1] = Math.max(c[1], c[0] + 0.5); } else c[1] = Math.min(9.5, Math.max(c[0] + 0.5, v));
      save(); return scRender();
    }
    if (t.dataset.rs !== undefined) {
      const all = s().list.map((x) => x.id), cur = s().radar.scales.length ? s().radar.scales : all.slice();
      const next = t.checked ? [...new Set([...cur, t.dataset.rs])] : cur.filter((i) => i !== t.dataset.rs);
      s().radar.scales = next.length >= all.length ? [] : next; save(); return scChartRender();
    }
    if (t.dataset.rate) scRoutesRender();
  });
}
let scSearchT = 0;
