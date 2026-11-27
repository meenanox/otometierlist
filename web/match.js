// ---------- Rank match: pick games, then choose between two characters at a time ----------
// Loaded before app.js (which owns `state`, `$`, `esc`, `save`, `render`, `toast`). A merge sort asks the questions. The answers are the
// only thing saved: the whole sort is replayed from them, which is what makes Undo and resuming easy.
const PAGE_MODES = ["spectrum", "radar", "align", "match"];
const isPageMode = () => PAGE_MODES.includes(state.mode);
const MATCH_ANSWERS = [
  [2, "Like a lot more"], [1, "Like more"], [0, "About the same"], [-1, "Like a little less"], [-2, "Like a lot less"],
];
const MATCH_SKIP = 9;   // "No opinion": counts as a tie in the order, but says nothing about how much you like either

const makeMatch = () => ({ stage: "setup", games: [], keys: [], answers: [] });
function cleanMatch(m, items) {
  m = m && typeof m === "object" ? m : {};
  const games = (Array.isArray(m.games) ? m.games : []).filter((g) => typeof g === "string").slice(0, 600).map((g) => g.slice(0, 200));
  const keys = (Array.isArray(m.keys) ? m.keys : []).filter((k) => typeof k === "string");
  const answers = (Array.isArray(m.answers) ? m.answers : []).map(Number).filter((n) => [-2, -1, 0, 1, 2, MATCH_SKIP].includes(n));
  // a run can only be resumed if every character is still in the list
  const ok = ["battle", "done"].includes(m.stage) && keys.length >= 2 && keys.every((k) => items && items[k]);
  return ok ? { stage: m.stage, games, keys, answers } : { stage: "setup", games, keys: [], answers: [] };
}

function* msort(a) {
  if (a.length < 2) return a;
  const mid = a.length >> 1, l = yield* msort(a.slice(0, mid)), r = yield* msort(a.slice(mid));
  const out = []; let i = 0, j = 0;
  while (i < l.length && j < r.length) { const s = yield [l[i], r[j]]; if (s >= 0) out.push(l[i++]); else out.push(r[j++]); }   // a tie keeps the left one first
  return out.concat(l.slice(i), r.slice(j));
}
// replay the saved answers: where the sort is now, and every comparison made so far
function matchRun(keys, answers) {
  const g = msort(keys), pairs = []; let step = g.next(), n = 0;
  while (!step.done && n < answers.length) { pairs.push([step.value[0], step.value[1], answers[n]]); step = g.next(answers[n++]); }
  return { step, pairs };
}
const matchTotal = (n) => (n < 2 ? 0 : Math.max(1, Math.round(n * Math.log2(n) - n + 1)));   // roughly how many questions

// A score out of 10 from how much more you liked each one: every answer pulls the two scores apart by its size.
function matchScores(keys, pairs, order) {
  const x = Object.fromEntries(keys.map((k, i) => [k, (keys.length - i) * 0.01]));
  for (let it = 0; it < 300; it++) for (const [a, b, s] of pairs) {
    if (s === MATCH_SKIP) continue; const err = x[a] - x[b] - s; x[a] -= err * 0.1; x[b] += err * 0.1;
  }
  const v = Object.values(x), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const out = Object.fromEntries(Object.entries(x).map(([k, val]) => [k, Math.round((val - lo) / span * 100) / 10]));
  let cap = 10; for (const k of order || keys) { out[k] = Math.min(out[k], cap); cap = out[k]; }   // never higher than someone ranked above
  return out;
}

// ---------- the page ----------
let mtGameQuery = "", mtShown = 100;
function matchPoolKeys(games) {   // the characters in the picked games (everyone, if none are picked), after the cast filter
  const g = new Set(games), out = [];
  for (const k of state.order) { const it = state.items[k]; if (!it || !visible(k)) continue; if (!g.size || gamesOf(it).some((x) => g.has(x))) out.push(k); }
  return out;
}
function matchRender() {
  const m = state.match, B = $("#board");
  B.innerHTML = `<div class="mt">${m.stage === "battle" ? matchBattleHtml() : m.stage === "done" ? matchDoneHtml() : matchSetupHtml()}</div>`;
}
function matchSetupHtml() {
  const m = state.match, counts = new Map();
  for (const k of state.order) { const it = state.items[k]; if (!it || !visible(k)) continue; for (const g of gamesOf(it)) counts.set(g, (counts.get(g) || 0) + 1); }
  const q = mtGameQuery.trim().toLowerCase(), names = [...counts.keys()].filter((g) => !q || g.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b));
  const n = matchPoolKeys(m.games).length;
  const resume = m.keys.length >= 2 && m.answers.length ? `<p class="mt-resume">You have a ranking in progress (${Math.round(m.answers.length / matchTotal(m.keys.length) * 100)}% sorted, ${m.keys.length} characters). <button class="primary" data-mt="resume">Resume</button></p>` : "";
  return `<div class="mt-setup"><h2>Rank match</h2>
    <p class="muted">Pick the games you want, then choose between two of their characters at a time. Your answers sort everyone into one ranking, and you can place it in your tier list.</p>${resume}
    <div class="mt-filters"><label>Who <select id="mtHero">${Object.entries(HERO_FILTERS).map(([v, t]) => `<option value="${v}"${v === state.ui.heroines ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <input id="mtSearch" type="search" placeholder="Filter games…" value="${esc(mtGameQuery)}">
      <button class="ghost" data-mt="all">Pick all shown</button><button class="ghost" data-mt="none">Pick none</button></div>
    <div class="mt-games">${names.map((g) => `<label class="inline"><input type="checkbox" data-mg="${esc(g)}"${m.games.includes(g) ? " checked" : ""}> ${esc(g || "(no game)")} <small class="muted">${counts.get(g)}</small></label>`).join("") || `<p class="muted">Import some characters first.</p>`}</div>
    <p id="mtCount" class="muted"></p>
    <button class="primary" data-mt="start" id="mtStart">Start ranking</button></div>`;
}
function matchCountText() {
  const m = state.match, n = matchPoolKeys(m.games).length, el = $("#mtCount"), b = $("#mtStart"); if (!el) return;
  el.textContent = n < 2 ? "Pick games with at least 2 characters." : `${n} characters${m.games.length ? ` from ${m.games.length} game${m.games.length === 1 ? "" : "s"}` : " (all games)"} · about ${matchTotal(n)} questions`;
  if (b) b.disabled = n < 2;
}
const mtCard = (k, side) => { const it = state.items[k]; return `<figure class="mt-card ${side}">${it.imgHi || it.img ? `<img src="${esc(imgSrc(it.imgHi || it.img))}" alt="">` : `<span class="ph">${esc((it.label || "?")[0])}</span>`}<figcaption><b>${esc(it.label)}</b><small>${esc(it.game || "")}</small></figcaption></figure>`; };
function matchBattleHtml() {
  const m = state.match, { step } = matchRun(m.keys, m.answers);
  if (step.done) { m.stage = "done"; save(); return matchDoneHtml(); }
  const [a, b] = step.value, pct = Math.min(99, Math.round(m.answers.length / matchTotal(m.keys.length) * 100)), A = state.items[a], Bi = state.items[b];
  return `<div class="mt-battle"><h2>Battle #${m.answers.length + 1}</h2><p class="muted">${pct}% sorted</p>
    <div class="mt-row">${mtCard(a, "l")}
      <div class="mt-buttons"><p>How do you feel about <b>${esc(A.label)}</b> compared with <b>${esc(Bi.label)}</b>?</p>
        ${MATCH_ANSWERS.map(([s, t], i) => `<button class="mt-ans a${s + 2}" data-ans="${s}"><kbd>${i + 1}</kbd> ${t}</button>`).join("")}
        <div class="mt-aux"><button class="ghost" data-ans="${MATCH_SKIP}"><kbd>0</kbd> No opinion</button><button class="ghost" data-mt="undo"${m.answers.length ? "" : " disabled"}>Undo</button><button class="ghost" data-mt="setup">Save and leave</button></div></div>
      ${mtCard(b, "r")}</div></div>`;
}
function matchDoneHtml() {
  const m = state.match, { step, pairs } = matchRun(m.keys, m.answers), order = step.done ? step.value : m.keys, sc = matchScores(m.keys, pairs, order);
  const rows = order.slice(0, mtShown).map((k, i) => { const it = state.items[k]; return `<li><b class="mt-rank">${i + 1}</b><span class="sc-th">${it.img ? `<img src="${esc(imgSrc(it.img))}" alt="">` : `<span class="ph">${esc((it.label || "?")[0])}</span>`}</span><span class="mt-name"><b>${esc(it.label)}</b><small>${esc(it.game || "")}</small></span><span class="mt-score">${sc[k].toFixed(1)}</span></li>`; }).join("");
  return `<div class="mt-done"><h2>Your ranking</h2><p class="muted">${order.length} characters sorted in ${pairs.length} questions. The score out of 10 comes from how much more you liked each one.</p>
    <div class="row"><button class="primary" data-mt="place">Place in my tier list</button><button class="ghost" data-mt="undo">Undo last answer</button><button class="ghost" data-mt="again">Rank again</button><button class="ghost" data-mt="setup">Back to setup</button></div>
    <ol class="mt-list">${rows}</ol>${order.length > mtShown ? `<button class="ghost" data-mt="more">Show more (${order.length - mtShown} left)</button>` : ""}</div>`;
}

function matchAnswer(s) {
  const m = state.match; if (m.stage !== "battle") return;
  m.answers.push(s); save();
  const { step } = matchRun(m.keys, m.answers); if (step.done) m.stage = "done"; matchRender();
}
function matchUndo() {
  const m = state.match; if (!m.answers.length) return;
  m.answers.pop(); m.stage = "battle"; save(); matchRender();
}
function matchStart() {
  const m = state.match, keys = matchPoolKeys(m.games); if (keys.length < 2) return toast("Pick games with at least 2 characters.", "error");
  let seed = Date.now() % 2147483647 || 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }   // shuffled, so the order they were imported in doesn't matter
  if (m.answers.length && !confirm("Start over? Your ranking in progress will be lost.")) return;
  Object.assign(m, { stage: "battle", keys, answers: [] }); mtShown = 100; save(); matchRender();
}
function matchPlace() {
  const m = state.match, { step } = matchRun(m.keys, m.answers); if (!step.done || !state.tiers.length) return;
  const order = step.value, T = state.tiers.length;
  if (!confirm(`Put these ${order.length} characters into your tier list, best first, spread over ${T} ranks? Where they sit now will be replaced.`)) return;
  const gone = new Set(order); state.tiers.forEach((t) => (t.keys = t.keys.filter((k) => !gone.has(k))));
  order.forEach((k, i) => state.tiers[Math.min(T - 1, Math.floor(i * T / order.length))].keys.push(k));
  state.mode = "tier"; save(); render(); toast(`Placed ${order.length} characters in your tier list`);
}

function wireMatch() {
  const B = $("#board");
  B.addEventListener("click", (e) => {
    if (state.mode !== "match") return;
    const a = e.target.closest("[data-ans]"); if (a) return matchAnswer(+a.dataset.ans);
    const b = e.target.closest("[data-mt]"); if (!b) return; const m = state.match;
    switch (b.dataset.mt) {
      case "start": return matchStart();
      case "resume": m.stage = "battle"; save(); return matchRender();
      case "undo": return matchUndo();
      case "setup": m.stage = "setup"; save(); return matchRender();
      case "again": m.stage = "setup"; m.answers = []; m.keys = []; save(); return matchRender();
      case "place": return matchPlace();
      case "more": mtShown += 200; return matchRender();
      case "all": { const q = mtGameQuery.trim().toLowerCase(); const set = new Set(m.games); for (const k of state.order) for (const g of gamesOf(state.items[k] || {})) if (!q || g.toLowerCase().includes(q)) set.add(g); m.games = [...set]; save(); return matchRender(); }
      case "none": m.games = []; save(); return matchRender();
    }
  });
  B.addEventListener("change", (e) => {
    if (state.mode !== "match") return; const t = e.target, m = state.match;
    if (t.dataset.mg !== undefined) { m.games = t.checked ? [...new Set([...m.games, t.dataset.mg])] : m.games.filter((g) => g !== t.dataset.mg); save(); matchCountText(); }
    else if (t.id === "mtHero") { state.ui.heroines = t.value; save(); matchRender(); }
  });
  let tm = 0;
  B.addEventListener("input", (e) => { if (state.mode === "match" && e.target.id === "mtSearch") { mtGameQuery = e.target.value; clearTimeout(tm); tm = setTimeout(() => { matchRender(); const s = $("#mtSearch"); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 200); } });
  document.addEventListener("keydown", (e) => {
    if (state.mode !== "match" || state.match.stage !== "battle" || e.target.closest?.("input,select,textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key >= "1" && e.key <= "5") { e.preventDefault(); matchAnswer(MATCH_ANSWERS[+e.key - 1][0]); }
    else if (e.key === "0") { e.preventDefault(); matchAnswer(MATCH_SKIP); }
    else if (e.key === "Backspace" || e.key.toLowerCase() === "z") { e.preventDefault(); matchUndo(); }
  });
}
