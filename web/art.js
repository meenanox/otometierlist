"use strict";
// Award artwork, drawn the same way on the board (inline SVG) and in exported pictures (canvas Path2D).
// A design is a list of layers; a layer is { d: SVG path, f: fill colour name, s: stroke colour name, sw: stroke width,
// a: opacity, t: [x, y, degrees, scale] }. Colour names are resolved per place (1st gold, 2nd silver, 3rd bronze).

const AWARD_MEDAL = ["#d9ad45", "#aeb6c1", "#c0804f"];
const AWARD_METAL = [["#fff3c2", "#e8c14f", "#9b7421"], ["#ffffff", "#c3cad4", "#7b8592"], ["#f6d1ae", "#c98a58", "#774825"]];
const artColors = (p) => ({ main: AWARD_METAL[p][1], light: AWARD_METAL[p][0], dark: AWARD_METAL[p][2], white: "#ffffff", ink: "#3a2a12", red: "#ff5d7a", blue: "#7fd7ff", pink: "#f6a6c1" });

const circ = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
const polyStar = (cx, cy, R, r, n) => {
  let d = ""; for (let i = 0; i < n * 2; i++) { const a = Math.PI * i / n - Math.PI / 2, rad = i % 2 ? r : R; d += `${i ? "L" : "M"}${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)} `; }
  return d + "Z";
};
const scallop = (cx, cy, R, amp, n) => {
  let d = ""; for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2, rad = R + amp * Math.cos(a * n); d += `${i ? "L" : "M"}${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)} `; }
  return d + "Z";
};
const HEART = "M50 84 C8 54 4 26 24 14 C37 6 50 18 50 28 C50 18 63 6 76 14 C96 26 92 54 50 84 Z";
const LEAF = "M0 0 C4 -6 12 -6 17 0 C12 6 4 6 0 0 Z";

function laurelLayers() {   // two curved branches of leaves, open at the top
  const L = [{ d: "M47 52 Q14 46 9 12", s: "dark", sw: 2.2 }, { d: "M53 52 Q86 46 91 12", s: "dark", sw: 2.2 }];
  for (let k = 0; k < 7; k++) {
    const t = k / 6, x = (1 - t) ** 2 * 47 + 2 * (1 - t) * t * 14 + t * t * 9, y = (1 - t) ** 2 * 52 + 2 * (1 - t) * t * 46 + t * t * 12;
    const dx = 2 * (1 - t) * (14 - 47) + 2 * t * (9 - 14), dy = 2 * (1 - t) * (46 - 52) + 2 * t * (12 - 46), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    for (const off of [-38, 38]) {
      L.push({ d: LEAF, f: "main", s: "dark", sw: 1, t: [x, y, ang + off, 0.95 - t * 0.2] });
      L.push({ d: LEAF, f: "main", s: "dark", sw: 1, t: [100 - x, y, 180 - ang - off, 0.95 - t * 0.2] });
    }
  }
  L.push({ d: circ(50, 52, 4.5), f: "light", s: "dark", sw: 1.5 });
  return L;
}
function petals() {
  const P = []; for (let i = 0; i < 5; i++) P.push({ d: "M0 0 C-17 -10 -15 -34 -5 -41 L0 -34 L5 -41 C15 -34 17 -10 0 0 Z", f: "pink", s: "dark", sw: 1.6, t: [50, 54, i * 72, 1] });
  P.push({ d: circ(50, 54, 6), f: "main", s: "dark", sw: 1.4 });
  for (let i = 0; i < 5; i++) { const a = i * 72 * Math.PI / 180; P.push({ d: circ(50 + Math.sin(a) * 15, 54 - Math.cos(a) * 15, 2.2), f: "light" }); }
  return P;
}

// what goes above the 1st place winner
const CROWNS = {
  crown: { name: "Crown", w: 100, h: 80, layers: [
    { d: "M6 72 L6 26 L30 46 L50 6 L70 46 L94 26 L94 72 Z", f: "main", s: "dark", sw: 3 },
    { d: "M6 60 L94 60 L94 72 L6 72 Z", f: "dark", a: 0.55 },
    { d: "M10 30 L28 46 L40 46 L22 26 Z", f: "white", a: 0.35 },
    { d: circ(50, 15, 6), f: "red", s: "dark", sw: 1.5 }, { d: circ(6, 27, 5), f: "blue", s: "dark", sw: 1.5 }, { d: circ(94, 27, 5), f: "blue", s: "dark", sw: 1.5 },
    { d: circ(28, 66, 3.2), f: "light" }, { d: circ(50, 66, 3.2), f: "light" }, { d: circ(72, 66, 3.2), f: "light" }] },
  tiara: { name: "Tiara", w: 100, h: 66, layers: [
    { d: "M3 60 Q50 34 97 60 L97 65 Q50 41 3 65 Z", f: "main", s: "dark", sw: 2 },
    { d: "M18 50 L26 22 L36 44 Z", f: "main", s: "dark", sw: 2 }, { d: "M82 50 L74 22 L64 44 Z", f: "main", s: "dark", sw: 2 },
    { d: "M50 2 L63 28 L50 46 L37 28 Z", f: "main", s: "dark", sw: 2.4 }, { d: circ(50, 26, 6), f: "blue", s: "dark", sw: 1.4 },
    { d: circ(26, 20, 3.6), f: "light", s: "dark", sw: 1 }, { d: circ(74, 20, 3.6), f: "light", s: "dark", sw: 1 },
    { d: "M9 58 Q50 33 91 58", s: "white", sw: 1.6, a: 0.6 }] },
  laurel: { name: "Laurel wreath", w: 100, h: 60, layers: laurelLayers() },
  star: { name: "Star", w: 100, h: 96, layers: [
    { d: polyStar(50, 53, 46, 20, 5), f: "main", s: "dark", sw: 3 }, { d: polyStar(50, 53, 27, 12, 5), f: "light", a: 0.75 }] },
  heart: { name: "Heart", w: 100, h: 90, layers: [
    { d: HEART, f: "pink", s: "dark", sw: 3 }, { d: "M22 25 C26 18 33 16 38 20", s: "white", sw: 4, a: 0.7 }, { d: circ(70, 28, 3), f: "white", a: 0.6 }] },
  sakura: { name: "Cherry blossom", w: 100, h: 100, layers: petals() },
};

// the place buttons on the podium steps: six looks (the number is drawn on top)
// fills can be a colour name / css colour, or a gradient: { lin: [x1, y1, x2, y2], stops: [[0, c], [1, c]] } / { rad: [cx, cy, r], stops }
const PIXEL_FONT = '"Press Start 2P", "Courier New", monospace';
const BUTTONS = {
  holo: { name: "Holo", w: 100, h: 100, num: { x: 50, y: 52, size: 42 }, layers: [
    { d: circ(50, 50, 47), f: { lin: [10, 10, 90, 90], stops: [[0, "#ff9be4"], [0.25, "#9bf0ff"], [0.5, "#b9a6ff"], [0.75, "#ffe49b"], [1, "#ff9be4"]] } },
    { d: "M18 66 L64 14 L78 20 L28 80 Z", f: "white", a: 0.4 }, { d: "M60 88 L88 56 L92 62 L68 90 Z", f: "white", a: 0.3 },
    { d: circ(50, 50, 47), s: "main", sw: 4 }, { d: circ(50, 50, 40), s: "white", sw: 1.5, a: 0.7 }] },
  bubble: { name: "Bubble", w: 100, h: 100, num: { x: 50, y: 53, size: 40 }, layers: [
    { d: circ(50, 50, 46), f: { rad: [38, 34, 74], stops: [[0, "light"], [0.55, "main"], [1, "dark"]] }, s: "light", sw: 2.5 },
    { d: "M22 36 Q30 14 56 15 Q34 22 30 42 Z", f: "white", a: 0.85 }, { d: circ(70, 76, 5), f: "white", a: 0.45 }, { d: "M62 84 Q78 78 84 62", s: "white", sw: 3, a: 0.35 }] },
  metallic: { name: "Metallic", w: 100, h: 100, num: { x: 50, y: 52, size: 44 }, layers: [
    { d: circ(50, 50, 47), f: { lin: [10, 8, 90, 92], stops: [[0, "light"], [0.3, "main"], [0.55, "dark"], [0.8, "main"], [1, "light"]] }, s: "dark", sw: 3 },
    { d: circ(50, 50, 35), f: { lin: [80, 90, 20, 10], stops: [[0, "light"], [0.5, "main"], [1, "dark"]] }, s: "dark", sw: 1.5 },
    { d: "M20 36 A34 34 0 0 1 48 16", s: "white", sw: 4.5, a: 0.7 }] },
  simple: { name: "Simple", w: 100, h: 100, num: { x: 50, y: 52, size: 44 }, layers: [{ d: circ(50, 50, 46), f: "main", s: "dark", sw: 4 }] },
  glowing: { name: "Glowing", w: 100, h: 100, num: { x: 50, y: 52, size: 44, color: "main", glow: true }, layers: [
    { d: circ(50, 50, 45), f: "#17112b" }, { d: circ(50, 50, 42), s: "main", sw: 6, gl: "main" }, { d: circ(50, 50, 33), s: "main", sw: 1.5, a: 0.5 }] },
  pixel: { name: "Pixel", w: 100, h: 100, num: { x: 50, y: 54, size: 30, font: PIXEL_FONT }, crisp: true, layers: [
    { d: "M28 4 H72 V14 H86 V28 H96 V72 H86 V86 H72 V96 H28 V86 H14 V72 H4 V28 H14 V14 H28 Z", f: "dark" },
    { d: "M30 12 H70 V20 H80 V30 H88 V70 H80 V80 H70 V88 H30 V80 H20 V70 H12 V30 H20 V20 H30 Z", f: "main" },
    { d: "M30 12 H70 V20 H30 Z M20 20 H30 V30 H20 Z M12 30 H20 V50 H12 Z", f: "light" }, { d: "M70 80 H30 V88 H70 Z M80 70 H70 V80 H80 Z M88 50 H80 V70 H88 Z", f: "dark", a: 0.55 }] },
};

let artUid = 0;
const artCol = (C, v) => C[v] || v;
const artStops = (C, g) => g.stops.map(([o, c]) => [o, artCol(C, c)]);

function artSvg(art, p, number) {
  const C = artColors(p), id = "ag" + ++artUid; let defs = "", n = 0;
  const fill = (f) => {
    if (!f) return "none"; if (typeof f === "string") return artCol(C, f);
    const gid = `${id}_${n++}`, stops = artStops(C, f).map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
    defs += f.lin ? `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f.lin[0]}" y1="${f.lin[1]}" x2="${f.lin[2]}" y2="${f.lin[3]}">${stops}</linearGradient>`
      : `<radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${f.rad[0]}" cy="${f.rad[1]}" r="${f.rad[2]}">${stops}</radialGradient>`;
    return `url(#${gid})`;
  };
  const layers = art.layers.map((l) => `<path d="${l.d}"${l.t ? ` transform="translate(${l.t[0]} ${l.t[1]}) rotate(${l.t[2] || 0}) scale(${l.t[3] || 1})"` : ""} fill="${fill(l.f)}"${l.s ? ` stroke="${artCol(C, l.s)}" stroke-width="${l.sw || 2}" stroke-linejoin="round" stroke-linecap="round"` : ""}${l.a != null ? ` opacity="${l.a}"` : ""}${l.gl ? ` style="filter:drop-shadow(0 0 3px ${artCol(C, l.gl)})"` : ""}/>`).join("");
  let num = "";
  if (number != null && art.num) {
    const nc = artCol(C, art.num.color || "ink");
    num = `<text x="${art.num.x}" y="${art.num.y}" font-size="${art.num.size}" font-weight="700" font-family='${art.num.font || "Georgia,serif"}' text-anchor="middle" dominant-baseline="central" fill="${nc}"${art.num.glow ? ` style="filter:drop-shadow(0 0 3px ${nc})"` : ""}>${number}</text>`;
  }
  return `<svg viewBox="0 0 ${art.w} ${art.h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"${art.crisp ? ' shape-rendering="crispEdges"' : ""}><defs>${defs}</defs>${layers}${num}</svg>`;
}

/** Draw a design on a canvas into the box x, y, w, h. */
function artDraw(c, art, p, x, y, w, h, number, font) {
  const C = artColors(p), sc = w / art.w;
  const paint = (f) => {
    if (typeof f === "string") return artCol(C, f);
    const g = f.lin ? c.createLinearGradient(...f.lin) : c.createRadialGradient(f.rad[0], f.rad[1], 0, f.rad[0], f.rad[1], f.rad[2]);
    for (const [o, col] of artStops(C, f)) g.addColorStop(o, col);
    return g;
  };
  c.save(); c.translate(x, y); c.scale(sc, h / art.h); c.lineJoin = "round"; c.lineCap = "round";
  for (const l of art.layers) {
    c.save();
    if (l.t) { c.translate(l.t[0], l.t[1]); c.rotate((l.t[2] || 0) * Math.PI / 180); c.scale(l.t[3] || 1, l.t[3] || 1); }
    if (l.a != null) c.globalAlpha = l.a;
    if (l.gl) { c.shadowColor = artCol(C, l.gl); c.shadowBlur = 9 * sc; }
    const path = new Path2D(l.d);
    if (l.f) { c.fillStyle = paint(l.f); c.fill(path); }
    if (l.s) { c.strokeStyle = artCol(C, l.s); c.lineWidth = l.sw || 2; c.stroke(path); }
    c.restore();
  }
  if (number != null && art.num) {
    const nc = artCol(C, art.num.color || "ink");
    c.font = `700 ${art.num.size}px ${art.num.font || font || "Georgia, serif"}`; c.textAlign = "center"; c.textBaseline = "middle";
    if (art.num.glow) { c.shadowColor = nc; c.shadowBlur = 8 * sc; }
    c.fillStyle = nc; c.fillText(String(number), art.num.x, art.num.y);
  }
  c.restore();
}
