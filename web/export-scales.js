"use strict";
// Picture exports for the Scales modes: spectrum line, radar chart, alignment grid. Loaded after export.js (uses its styles and helpers).

const scDark = (o) => ["noir", "neon", "midnight", "arcade", "classic"].includes(o.style);
const scAlpha = (hex, a) => (/^#[\da-f]{6}$/i.test(hex || "") ? hex + Math.round(a * 255).toString(16).padStart(2, "0") : hex);
async function scLoadImgs(list, px) {
  const imgs = new Map();
  for (let i = 0; i < list.length; i += 16) await Promise.all(list.slice(i, i + 16).map(async (r) => imgs.set(r.rk, await loadImg(pickImg(r.it, px)))));
  return imgs;
}
function scFrame(canvas, W, H) {
  const px = Math.min(+canvas.__scale || 1, Math.sqrt(90e6 / (W * H)), 16000 / H, 16000 / W);
  canvas.width = Math.round(W * px); canvas.height = Math.round(H * px);
  const c = canvas.getContext("2d"); c.setTransform(px, 0, 0, px, 0, 0); return { c, px };
}
function scPill(c, text, cx, cy, k, T) {
  c.save(); c.font = `700 ${Math.round(13 * k)}px ${SANS}`; const w = c.measureText(text).width + 12 * k, h = 20 * k;
  c.fillStyle = T.title; rr(c, cx - w / 2, cy - h / 2, w, h, h / 2); c.fill();
  c.fillStyle = inkFor(T.title); c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, cx, cy + k * 0.5); c.restore();
}
function scNameText(c, T, o, text, x, y, fs, maxW, k) {
  const dark = scDark(o);
  c.save(); c.font = `600 ${Math.round(fs)}px ${T.mono ? T.labelFont : SANS}`; c.textAlign = "center"; c.textBaseline = "alphabetic"; c.lineJoin = "round";
  c.lineWidth = 3.5 * k; c.strokeStyle = dark ? "rgba(0,0,0,.7)" : "rgba(255,255,255,.9)"; c.fillStyle = dark ? "#fff" : "#2a2230";
  const t = fit(c, text, maxW); c.strokeText(t, x, y); c.fillText(t, x, y); c.restore();
}

// ---------- spectrum ----------
async function renderSpectrumImage(canvas, o) {
  const T = EXPORT_STYLES[o.style] || EXPORT_STYLES.pastel, { fixed, W, fh, k } = frameOf(o);
  await loadFonts(); canvas.__scale = o.scale;
  const s = state.scales, sc = scaleById(s.spectrum.scale) || s.list[0], m = headerMetrics(T, o, k), bottom = m.footH + m.pad * 0.4, namesN = +o.names;
  const rated = scPoolRoutes(false).map((r) => ({ r, v: scGet(r.rk, sc.id) })).filter((x) => x.v !== undefined).sort((a, b) => a.v - b.v);
  const axisBlock = 120 * k, ratio = state.kind === "games" ? 1.42 : 1.25;
  const layout = (cw) => {
    const ch = cw * ratio, laneH = ch + (namesN ? Math.max(9 * k, Math.min(22 * k, cw * 0.17)) + 8 * k : 0) + 10 * k;
    const x0 = m.pad + cw / 2 + 12 * k, x1 = W - m.pad - cw / 2 - 12 * k, gap = (cw * 1.08) / (x1 - x0) * 10, last = [];
    for (const x of rated) { let l = 0; while (last[l] !== undefined && x.v - last[l] < gap) l++; last[l] = x.v; x.lane = l; }
    return { ch, laneH, x0, x1, lanes: Math.max(1, last.length) };
  };
  let cw = Math.min(W * 0.085, 150 * k), L = layout(cw);
  if (fixed) { const availH = fh - m.top - bottom - axisBlock; while (cw > 22 * k && L.lanes * L.laneH > availH) { cw *= 0.94; L = layout(cw); } }
  const contentH = L.lanes * L.laneH + axisBlock, H = fixed ? fh : Math.round(m.top + contentH + bottom);
  const { c, px } = scFrame(canvas, W, H); T.bg(c, W, H, k); drawHeader(c, T, o, W, k, m);
  const lineY = m.top + Math.max(0, (H - bottom - m.top - contentH) / 2) + L.lanes * L.laneH + 30 * k, sx = (v) => L.x0 + (L.x1 - L.x0) * v / 10;
  const g = c.createLinearGradient(L.x0, 0, L.x1, 0); g.addColorStop(0, T.sub); g.addColorStop(1, T.title);
  c.save(); if (T.glow) { c.shadowColor = T.title; c.shadowBlur = 14 * k; } c.strokeStyle = g; c.lineWidth = 8 * k; c.lineCap = "round";
  c.beginPath(); c.moveTo(L.x0, lineY); c.lineTo(L.x1, lineY); c.stroke(); c.restore();
  c.fillStyle = T.names; c.font = `500 ${Math.round(14 * k)}px ${SANS}`; c.textAlign = "center"; c.textBaseline = "top";
  for (let i = 0; i <= 10; i++) { c.fillRect(sx(i) - k, lineY + 8 * k, 2 * k, 7 * k); if (i % 2 === 0) c.fillText(String(i), sx(i), lineY + 18 * k); }
  const lf = Math.round(28 * k * (T.mono ? 0.5 : 1)); c.font = `700 ${lf}px ${T.labelFont}`; c.fillStyle = T.title; c.textBaseline = "alphabetic";
  c.textAlign = "left"; c.fillText(fit(c, sc.lo, (L.x1 - L.x0) / 2 - 10 * k), m.pad, lineY + 80 * k);
  c.textAlign = "right"; c.fillText(fit(c, sc.hi, (L.x1 - L.x0) / 2 - 10 * k), W - m.pad, lineY + 80 * k);
  const imgs = await scLoadImgs(rated.map((x) => x.r), cw * px);
  for (const { r, v, lane } of rated) {
    const x = sx(v) - cw / 2, y = lineY - 16 * k - (lane + 1) * L.laneH + 10 * k;
    drawCard(c, imgs.get(r.rk), x, y, cw, L.ch, T.cardRadius * k, T, r.it.label, k);
    scPill(c, scFmt(v), x + cw - 4 * k, y + 4 * k, k, T);
    if (namesN) scNameText(c, T, o, namesN === 2 && r.game ? `${r.it.label} · ${r.game}` : r.it.label, x + cw / 2, y + L.ch + Math.max(9 * k, Math.min(22 * k, cw * 0.17)) + 2 * k, Math.max(9 * k, Math.min(22 * k, cw * 0.17)), cw * 1.8, k);
  }
  drawFooter(c, T, o, W, H, k, m);
  return { w: W, h: H, px: [canvas.width, canvas.height], cards: rated.length, card: Math.round(cw), missing: rated.filter((x) => (x.r.it.imgHi || x.r.it.img) && !imgs.get(x.r.rk)).length };
}

// ---------- radar ----------
async function renderRadarImage(canvas, o) {
  const T = EXPORT_STYLES[o.style] || EXPORT_STYLES.pastel, { fixed, W, fh, k } = frameOf(o);
  await loadFonts(); canvas.__scale = o.scale;
  const s = state.scales, sl = scRadarScales(), n = sl.length, m = headerMetrics(T, o, k), bottom = m.footH + m.pad * 0.4, dark = scDark(o);
  const routes = s.radar.routes.map(scRoute).filter(Boolean);
  const entryH = 60 * k, cwL = 40 * k, chL = cwL * 1.25;
  // legend layout (flows to as many rows as it needs)
  const tmp = document.createElement("canvas").getContext("2d"); tmp.font = `600 ${Math.round(22 * k)}px ${SANS}`;
  const entries = routes.map((r, i) => ({ r, col: RADAR_COLORS[i % RADAR_COLORS.length], w: cwL + 22 * k + Math.min(tmp.measureText(r.it.label).width, 260 * k) + 24 * k }));
  const rows = []; let cur = [], cw0 = 0;
  for (const e of entries) { if (cur.length && cw0 + e.w > W - m.pad * 2) { rows.push(cur); cur = []; cw0 = 0; } cur.push(e); cw0 += e.w; }
  if (cur.length) rows.push(cur);
  const legendH = rows.length * entryH + 10 * k;
  let S, H;
  if (fixed) { H = fh; S = Math.min(W - m.pad * 2, H - m.top - bottom - legendH); } else { S = Math.min(W - m.pad * 2, 1150 * k); H = Math.round(m.top + S + legendH + bottom); }
  S = Math.max(S, 200 * k);
  const { c, px } = scFrame(canvas, W, H); T.bg(c, W, H, k); drawHeader(c, T, o, W, k, m);
  const cx = W / 2, cy = m.top + S / 2 + (fixed ? Math.max(0, (H - m.top - bottom - legendH - S) / 2) : 0), R = S / 2 - 120 * k;
  if (n < 3) { c.fillStyle = T.sub; c.font = `600 ${Math.round(24 * k)}px ${SANS}`; c.textAlign = "center"; c.fillText("A radar needs at least 3 scales", cx, cy); drawFooter(c, T, o, W, H, k, m); return { w: W, h: H, px: [canvas.width, canvas.height], cards: 0, card: 0, missing: 0 }; }
  const ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n, P = (i, v) => [cx + Math.cos(ang(i)) * R * v / 10, cy + Math.sin(ang(i)) * R * v / 10];
  const gridCol = dark ? "#ffffff" : T.names;
  c.save(); c.strokeStyle = gridCol; for (const v of [2, 4, 6, 8, 10]) {
    c.globalAlpha = v === 10 ? 0.55 : 0.2; c.lineWidth = (v === 10 ? 2.5 : 1.3) * k; c.beginPath();
    sl.forEach((_, i) => { const [x, y] = P(i, v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.stroke();
  }
  c.globalAlpha = 0.25; c.lineWidth = 1.3 * k; sl.forEach((_, i) => { const [x, y] = P(i, 10); c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke(); }); c.restore();
  c.save(); c.fillStyle = T.names; c.globalAlpha = 0.6; c.font = `500 ${Math.round(16 * k)}px ${SANS}`; c.textAlign = "left"; c.textBaseline = "bottom";
  for (const v of [2, 4, 6, 8, 10]) c.fillText(String(v), cx + 4 * k, cy - R * v / 10 - 1 * k); c.restore();
  // spoke labels: the high end on the rim, the low end smaller beneath
  sl.forEach((x, i) => {
    const [lx, ly] = P(i, 10), co = Math.cos(ang(i)), si = Math.sin(ang(i)), ex = lx + co * 16 * k, ey = ly + si * 16 * k + (si > 0.3 ? 14 * k : si < -0.3 ? -30 * k : 0);
    c.textAlign = Math.abs(co) < 0.25 ? "center" : co > 0 ? "left" : "right"; c.textBaseline = "alphabetic";
    c.fillStyle = T.title; c.font = `700 ${Math.round(34 * k * (T.mono ? 0.5 : 1))}px ${T.labelFont}`; c.fillText(fit(c, x.hi, 240 * k), ex, ey + 6 * k);
    c.fillStyle = T.sub; c.font = `500 ${Math.round(21 * k)}px ${SANS}`; c.fillText(fit(c, `low: ${x.lo}`, 240 * k), ex, ey + 32 * k);
  });
  routes.forEach((r, ri) => {
    const col = RADAR_COLORS[ri % RADAR_COLORS.length], pts = sl.map((x, i) => { const v = scGet(r.rk, x.id); return v === undefined ? null : P(i, v); }).filter(Boolean);
    if (pts.length >= 2) {
      c.save(); c.beginPath(); pts.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y))); if (pts.length >= 3) c.closePath();
      if (pts.length >= 3) { c.fillStyle = scAlpha(col, 0.22); c.fill(); }
      if (T.glow) { c.shadowColor = col; c.shadowBlur = 12 * k; } c.strokeStyle = col; c.lineWidth = 4 * k; c.lineJoin = "round"; c.stroke(); c.restore();
    }
    for (const [x, y] of pts) { c.beginPath(); c.arc(x, y, 7 * k, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 2.5 * k; c.strokeStyle = dark ? "#000" : "#fff"; c.stroke(); }
  });
  const imgs = await scLoadImgs(routes, cwL * px);
  let y = cy + S / 2 + (fixed ? 0 : 0) + 10 * k; if (!fixed) y = m.top + S + 10 * k;
  for (const row of rows) {
    const tw = row.reduce((a, e) => a + e.w, 0); let x = cx - tw / 2;
    for (const e of row) {
      c.fillStyle = e.col; rr(c, x, y + (entryH - chL) / 2 - 2 * k, 6 * k, chL + 4 * k, 3 * k); c.fill();
      drawCard(c, imgs.get(e.r.rk), x + 12 * k, y + (entryH - chL) / 2, cwL, chL, T.cardRadius * k * 0.6, T, e.r.it.label, k);
      c.fillStyle = T.names; c.font = `600 ${Math.round(22 * k)}px ${SANS}`; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(fit(c, e.r.it.label, 260 * k), x + 12 * k + cwL + 10 * k, y + entryH / 2);
      x += e.w;
    }
    y += entryH;
  }
  drawFooter(c, T, o, W, H, k, m);
  return { w: W, h: H, px: [canvas.width, canvas.height], cards: routes.length, card: Math.round(cwL), missing: routes.filter((r) => (r.it.imgHi || r.it.img) && !imgs.get(r.rk)).length };
}

// ---------- alignment ----------
async function renderAlignImage(canvas, o) {
  const T = EXPORT_STYLES[o.style] || EXPORT_STYLES.pastel, { fixed, W, fh, k } = frameOf(o);
  await loadFonts(); canvas.__scale = o.scale;
  const s = state.scales, a = s.align, X = scaleById(a.x) || s.list[0], Y = scaleById(a.y) || s.list[1] || s.list[0], cuts = a.cuts, dark = scDark(o), namesN = +o.names;
  const m = headerMetrics(T, o, k), bottom = m.footH + m.pad * 0.4, mx = 76 * k, my = 54 * k, gridW = W - m.pad * 2 - mx * 2, cellW = gridW / 3, gap = 8 * k;
  let cellH, H;
  if (fixed) { H = fh; cellH = Math.min((H - m.top - bottom - my * 2) / 3, cellW * 1.3); } else { cellH = cellW * 0.9; H = Math.round(m.top + my * 2 + cellH * 3 + bottom); }
  const gx = m.pad + mx, gy = m.top + my + (fixed ? Math.max(0, (H - m.top - bottom - my * 2 - cellH * 3) / 2) : 0);
  const { c, px } = scFrame(canvas, W, H); T.bg(c, W, H, k); drawHeader(c, T, o, W, k, m);
  const cells = Array.from({ length: 9 }, () => []);
  for (const r of scPoolRoutes(false)) { const vx = scGet(r.rk, X.id), vy = scGet(r.rk, Y.id); if (vx === undefined || vy === undefined) continue; cells[(2 - scBand(vy, cuts)) * 3 + scBand(vx, cuts)].push(r); }
  const all = cells.flat(), ratio = state.kind === "games" ? 1.42 : 1.25, part = (sc, b) => (b === 0 ? sc.lo : b === 2 ? sc.hi : "Balanced");
  const nameFs = Math.round(21 * k * (T.mono ? 0.55 : 1)), nameH = nameFs + 14 * k;
  const extra = (cw) => (namesN ? Math.max(9 * k, Math.min(22 * k, cw * 0.17)) + 6 * k : 0);
  let cardW = 0; const sizes = cells.map((rs) => (rs.length ? fitCard(rs.length, cellW - 20 * k, cellH - nameH - 14 * k, Math.min(cellW * 0.42, 150 * k), 18 * k, 5 * k, ratio, extra) : 0));
  cardW = Math.min(...sizes.filter(Boolean), 9999); if (cardW === 9999) cardW = 0;
  const imgs = await scLoadImgs(all, Math.max(cardW, 40) * px);
  cells.forEach((rs, i) => {
    const col = i % 3, row = Math.floor(i / 3), x = gx + col * cellW + gap / 2, y = gy + row * cellH + gap / 2, w = cellW - gap, h = cellH - gap, t = col + 2 - row;
    c.save(); rr(c, x, y, w, h, T.radius * k * 0.5);
    if (T.rowFill) { c.fillStyle = T.rowFill; c.fill(); }
    c.fillStyle = scAlpha(T.title, 0.05 + t * 0.035); c.fill();
    c.strokeStyle = T.rowStroke === "tier" ? T.title : T.rowStroke || scAlpha(T.names, 0.35); c.lineWidth = (T.rowLine || 1.6) * k; if (T.glow) { c.shadowColor = T.glow; c.shadowBlur = 8 * k; } c.stroke(); c.restore();
    const nm = a.names[i] || `${part(X, col)} · ${part(Y, 2 - row)}`;
    c.fillStyle = T.title; c.font = `700 ${nameFs}px ${T.labelFont}`; c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillText(fit(c, nm, w - 20 * k), x + w / 2, y + nameFs + 6 * k);
    if (!rs.length) return;
    const cw = cardW || 24 * k, ch = cw * ratio, per = Math.max(1, Math.floor((w - 16 * k + 5 * k) / (cw + 5 * k))), rowsN = Math.ceil(rs.length / per), rh = ch + extra(cw) + 5 * k;
    let yy = y + nameH + Math.max(0, (h - nameH - rowsN * rh) / 2);
    for (let r0 = 0; r0 < rowsN; r0++) {
      const inRow = rs.slice(r0 * per, r0 * per + per), tw = inRow.length * cw + (inRow.length - 1) * 5 * k; let xx = x + (w - tw) / 2;
      for (const r of inRow) {
        drawCard(c, imgs.get(r.rk), xx, yy, cw, ch, T.cardRadius * k, T, r.it.label, k);
        if (namesN) scNameText(c, T, o, r.it.label, xx + cw / 2, yy + ch + extra(cw) - 6 * k, Math.max(9 * k, Math.min(22 * k, cw * 0.17)), cw * 1.7, k);
        xx += cw + 5 * k;
      }
      yy += rh;
    }
  });
  // axis labels
  const lf = Math.round(26 * k * (T.mono ? 0.5 : 1)); c.fillStyle = T.title; c.font = `700 ${lf}px ${T.labelFont}`; c.textBaseline = "middle"; c.textAlign = "center";
  c.fillText(fit(c, Y.hi, gridW), gx + gridW / 2, gy - my / 2 - 2 * k); c.fillText(fit(c, Y.lo, gridW), gx + gridW / 2, gy + cellH * 3 + my / 2 + 2 * k);
  c.save(); c.translate(gx - mx / 2 - 6 * k, gy + cellH * 1.5); c.rotate(-Math.PI / 2); c.fillText(fit(c, X.lo, cellH * 3), 0, 0); c.restore();
  c.save(); c.translate(gx + gridW + mx / 2 + 6 * k, gy + cellH * 1.5); c.rotate(Math.PI / 2); c.fillText(fit(c, X.hi, cellH * 3), 0, 0); c.restore();
  drawFooter(c, T, o, W, H, k, m);
  return { w: W, h: H, px: [canvas.width, canvas.height], cards: all.length, card: Math.round(cardW), missing: all.filter((r) => (r.it.imgHi || r.it.img) && !imgs.get(r.rk)).length };
}
