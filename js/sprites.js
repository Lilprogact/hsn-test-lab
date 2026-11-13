// The people of HSN Capital, drawn in code: small pixel-style figures of our own design (no character, sprite or art
// from any game or brand). Every agent gets a look of its own (skin, hair, glasses, trousers) worked out from its id
// and name, so the same agent always looks the same and a new Analyst who takes over a seat looks new. The shirt is
// the agent's level colour, so a level can be read at a glance.
//
// One art pixel is one world unit; the painters only use fillRect, so the figures stay sharp at any zoom.

const SKIN = ["#f6d7b8", "#eac09a", "#d9a066", "#b9794a", "#8d5a34", "#5c3a21"];
const HAIR = ["#1b1b1f", "#2e2018", "#4a3020", "#6b4423", "#a8652a", "#d9b25f", "#8c8c94", "#b5482f"];
const TROUSERS = ["#232a3a", "#2b2b33", "#3a2f2a", "#1f3a3a", "#33303d"];
const SCARF = ["#6c5b7b", "#355c7d", "#2a9d8f", "#b56576", "#4f6d7a"];
const INK = "#0b1410";

/** A small, stable hash of a string (FNV-1a), for looks that never change between visits. */
export function hash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Darken (amount < 0) or lighten (amount > 0) a #rrggbb colour. */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The look of one person, from its id and name alone. `suit` is for managers and the auditor. */
export function lookOf(id, name = "", { suit = false } = {}) {
  const h = hash(`${id}|${name}`), pick = (list, shift) => list[(h >>> shift) % list.length];
  const style = (h >>> 9) % 10;                 // 0 short, 1 side part, 2 long, 3 bun, 4 curls, 5 cropped, 6 ponytail, 7 headscarf, 8 flat top, 9 bob
  return {
    skin: pick(SKIN, 0), hair: pick(HAIR, 3), style, scarf: pick(SCARF, 13), trousers: pick(TROUSERS, 17),
    glasses: ((h >>> 21) % 4) === 0, beard: style !== 7 && style !== 2 && style !== 3 && style !== 6 && style !== 9 && ((h >>> 24) % 6) === 0,
    tall: ((h >>> 27) % 3) === 0, suit,
  };
}

const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

/** The head: 8 wide, 7 tall, its top-left corner at (x, y). `face` is the direction it looks: -1 left, 0 ahead, 1 right. */
function head(c, x, y, look, mood, blink, face = 0) {
  const sk = look.skin, hr = look.hair, st = look.style;
  R(c, x, y + 1, 8, 6, sk);                                             // face
  // hair
  if (st === 7) {                                                       // headscarf: covers the hair and frames the face
    R(c, x - 1, y, 10, 3, look.scarf); R(c, x - 1, y + 3, 2, 5, look.scarf); R(c, x + 7, y + 3, 2, 5, look.scarf);
  } else if (st === 5) { R(c, x, y, 8, 1.5, hr);                        // cropped
  } else if (st === 8) { R(c, x, y - 1, 8, 3, hr);                      // flat top
  } else if (st === 4) { R(c, x - 1, y - 1, 10, 4, hr); R(c, x - 1, y + 3, 1, 2, hr); R(c, x + 8, y + 3, 1, 2, hr);     // curls
  } else if (st === 2) { R(c, x, y, 8, 2.5, hr); R(c, x - 1, y + 1, 1.5, 7, hr); R(c, x + 7.5, y + 1, 1.5, 7, hr);      // long
  } else if (st === 9) { R(c, x, y, 8, 2.5, hr); R(c, x - 1, y + 1, 1.5, 5, hr); R(c, x + 7.5, y + 1, 1.5, 5, hr);      // bob
  } else if (st === 3) { R(c, x, y, 8, 2.5, hr); R(c, x + 2.5, y - 2, 3, 2.5, hr);                                      // bun
  } else if (st === 6) { R(c, x, y, 8, 2.5, hr); R(c, x + 7.5, y + 1, 2, 4, hr);                                        // ponytail
  } else if (st === 1) { R(c, x, y, 8, 2, hr); R(c, x, y + 2, 3, 1.5, hr);                                              // side part
  } else { R(c, x, y, 8, 2.5, hr); }                                                                                  // short
  if (look.beard) { R(c, x, y + 5.5, 8, 1.5, hr); R(c, x + 1, y + 7, 6, 0.8, hr); }
  // eyes
  const ex = face * 0.8, ey = y + 3.4;
  if (blink || mood === "proud") { R(c, x + 1.4 + ex, ey + 0.5, 1.8, 0.6, INK); R(c, x + 4.8 + ex, ey + 0.5, 1.8, 0.6, INK); }
  else { R(c, x + 1.8 + ex, ey, 1.1, 1.3, INK); R(c, x + 5.1 + ex, ey, 1.1, 1.3, INK); }
  if (look.glasses) {                                                   // two light lenses, a thin top rim and a bridge
    c.fillStyle = "rgba(255,255,255,.22)"; c.fillRect(x + 1.1 + ex, ey - 0.5, 2.5, 2.2); c.fillRect(x + 4.4 + ex, ey - 0.5, 2.5, 2.2);
    c.fillStyle = "rgba(11,20,16,.8)"; c.fillRect(x + 0.9 + ex, ey - 0.8, 2.9, 0.45); c.fillRect(x + 4.2 + ex, ey - 0.8, 2.9, 0.45); c.fillRect(x + 3.6 + ex, ey - 0.3, 0.8, 0.45);
    if (!blink && mood !== "proud") { R(c, x + 1.8 + ex, ey, 1.1, 1.3, INK); R(c, x + 5.1 + ex, ey, 1.1, 1.3, INK); }
  }
  if (mood === "frustrated" || mood === "focused") { R(c, x + 1.3 + ex, ey - 1.2 + (mood === "frustrated" ? 0 : 0.2), 2, 0.6, INK); R(c, x + 4.7 + ex, ey - 1.2 + (mood === "frustrated" ? 0 : 0.2), 2, 0.6, INK); }
  // mouth
  const mx = x + 3 + ex, my = y + 5.6;
  const mouth = look.beard ? "#e9d8c8" : INK;
  if (mood === "happy" || mood === "proud") { R(c, mx - 0.6, my, 0.8, 0.7, mouth); R(c, mx + 1.8, my, 0.8, 0.7, mouth); R(c, mx, my + 0.6, 2, 0.7, mouth); }
  else if (mood === "frustrated") { R(c, mx, my, 2, 0.7, mouth); R(c, mx - 0.6, my + 0.6, 0.8, 0.7, mouth); R(c, mx + 1.8, my + 0.6, 0.8, 0.7, mouth); }
  else if (mood === "waiting") { R(c, mx + 0.4, my, 1.2, 1.2, mouth); }
  else { R(c, mx, my + 0.2, 2, 0.7, mouth); }
}

/**
 * One person. (x, y) is the middle of the feet when standing or walking, and the middle of the desk's top edge when
 * sitting (the figure is drawn above the desk).
 *   o.pose   "sit" | "stand" | "walk" | "cheer"
 *   o.shirt  colour of the shirt (the level colour)       o.mood   happy | proud | frustrated | focused | neutral | waiting
 *   o.t      clock in seconds (for steps, typing, blinks)  o.phase  a per-person offset so nobody moves in step
 *   o.typing hands on the keyboard                         o.facing -1 | 1 (walking direction)
 *   o.still  true: no blink, no step (animations off)
 */
export function drawPerson(c, x, y, look, o = {}) {
  const t = o.t || 0, ph = o.phase || 0, shirt = o.shirt || "#5aa9ff", dark = shade(shirt, -0.28), jacket = look.suit ? "#27303b" : null;
  const blink = !o.still && ((t * 0.9 + ph) % 4.6) < 0.13;
  x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2;
  if (o.pose === "sit") {
    const lean = o.typing && !o.still ? Math.sin(t * 9 + ph) : 0;
    const top = y - 19 - (look.tall ? 1 : 0);
    R(c, x - 5, top + 9, 10, 10 + (look.tall ? 1 : 0), jacket || shirt);               // torso
    R(c, x - 6.5, top + 10, 2, 7, jacket ? shade(jacket, -0.2) : dark);                // arms
    R(c, x + 4.5, top + 10, 2, 7, jacket ? shade(jacket, -0.2) : dark);
    if (jacket) { R(c, x - 1.5, top + 9, 3, 6, "#e9edf0"); R(c, x - 0.6, top + 10, 1.2, 5, shirt); }       // shirt front and a tie in the level colour
    else R(c, x - 0.6, top + 9.5, 1.2, 4.5, dark);                                      // lanyard
    R(c, x - 1.5, top + 8, 3, 1.2, look.skin);                                          // neck
    head(c, x - 4, top, look, o.mood, blink, 0);
    if (o.typing) { R(c, x - 6.5, y - 2.2 + lean * 0.7, 2.6, 1.6, look.skin); R(c, x + 3.9, y - 2.2 - lean * 0.7, 2.6, 1.6, look.skin); }
    else { R(c, x - 6.5, y - 2, 2.2, 1.4, look.skin); R(c, x + 4.3, y - 2, 2.2, 1.4, look.skin); }
    return;
  }
  const walking = o.pose === "walk" && !o.still, cheer = o.pose === "cheer" && !o.still;
  const cyc = walking ? Math.sin(t * 11 + ph) : 0, bob = walking ? Math.abs(Math.cos(t * 11 + ph)) * 0.9 : cheer ? Math.abs(Math.sin(t * 9 + ph)) * 2.6 : 0;
  const by = y - bob, face = walking ? (o.facing || 1) : 0, tall = look.tall ? 1 : 0;
  // legs and shoes
  R(c, x - 3.2 + cyc * 1.4, by - 6, 2.6, 5.2 + bob, look.trousers); R(c, x + 0.6 - cyc * 1.4, by - 6, 2.6, 5.2 + bob, look.trousers);
  R(c, x - 3.4 + cyc * 1.8 + (face > 0 ? 0.4 : face < 0 ? -0.4 : 0), y - 1.1, 3.2, 1.1, "#101418"); R(c, x + 0.4 - cyc * 1.8 + (face > 0 ? 0.4 : face < 0 ? -0.4 : 0), y - 1.1, 3.2, 1.1, "#101418");
  // torso and arms
  R(c, x - 4.5, by - 14 - tall, 9, 8.4 + tall, jacket || shirt);
  if (jacket) { R(c, x - 1.4, by - 14 - tall, 2.8, 5.5, "#e9edf0"); R(c, x - 0.6, by - 13 - tall, 1.2, 4.6, shirt); }
  else R(c, x - 0.6, by - 13.5 - tall, 1.2, 4.2, dark);
  const armCol = jacket ? shade(jacket, -0.2) : dark;
  if (cheer) { R(c, x - 6.5, by - 20 - tall, 2, 7, armCol); R(c, x + 4.5, by - 20 - tall, 2, 7, armCol); R(c, x - 6.6, by - 21.5 - tall, 2.2, 1.6, look.skin); R(c, x + 4.4, by - 21.5 - tall, 2.2, 1.6, look.skin); }
  else { R(c, x - 6.5, by - 13.6 - tall - cyc * 0.8, 2, 6.6, armCol); R(c, x + 4.5, by - 13.6 - tall + cyc * 0.8, 2, 6.6, armCol); R(c, x - 6.5, by - 7.2 - tall - cyc * 0.8, 2, 1.4, look.skin); R(c, x + 4.5, by - 7.2 - tall + cyc * 0.8, 2, 1.4, look.skin); }
  R(c, x - 1.5, by - 15.2 - tall, 3, 1.4, look.skin);
  head(c, x - 4, by - 22 - tall, look, o.mood, blink, face);
}

/** Small picture signs used in bubbles and on machines. (x, y) is the centre; `s` scales it (1 = about 9 units across);
 *  `t` is the clock for the two that move (the thinking dots and the gear). */
export function drawIcon(c, kind, x, y, s = 1, col = INK, t = 0) {
  const P = (dx, dy, w, h, k = col) => R(c, x + dx * s, y + dy * s, w * s, h * s, k);
  const path = (pts, k = col) => { c.fillStyle = k; c.beginPath(); pts.forEach(([dx, dy], i) => c[i ? "lineTo" : "moveTo"](x + dx * s, y + dy * s)); c.closePath(); c.fill(); };
  const ring = (dx, dy, r, k = col, lw = 1.1) => { c.strokeStyle = k; c.lineWidth = lw * s; c.beginPath(); c.arc(x + dx * s, y + dy * s, r * s, 0, 6.2832); c.stroke(); c.lineWidth = 1; };
  const disc = (dx, dy, r, k = col) => { c.fillStyle = k; c.beginPath(); c.arc(x + dx * s, y + dy * s, r * s, 0, 6.2832); c.fill(); };
  switch (kind) {
    case "bulb": disc(0, -1.2, 2.9, "#f5b942"); P(-1.3, 1.5, 2.6, 1.2, "#c98a1b"); P(-1, 2.9, 2, 0.9, col); break;
    case "dots": { const k = Math.floor(t * 3) % 3; for (let i = 0; i < 3; i++) disc(-3 + i * 3, i === k ? -1 : 0, 1.05); break; }
    case "search": ring(-0.8, -0.8, 2.5); path([[1, 1.6], [1.8, 0.8], [3.9, 2.9], [3.1, 3.7]]); break;
    case "book": path([[-4.2, -3], [-0.3, -2.2], [-0.3, 3.4], [-4.2, 2.6]], "#2f6fb0"); path([[4.2, -3], [0.3, -2.2], [0.3, 3.4], [4.2, 2.6]], "#3f86cf"); P(-3.3, -1.1, 2.2, 0.55, "#e6f0ea"); P(-3.3, 0.3, 2.2, 0.55, "#e6f0ea"); P(1.1, -1.1, 2.2, 0.55, "#e6f0ea"); P(1.1, 0.3, 2.2, 0.55, "#e6f0ea"); break;
    case "code": path([[-1.6, -2.6], [-0.6, -2.6], [-3, 0], [-0.6, 2.6], [-1.6, 2.6], [-4.2, 0]]); path([[1.6, -2.6], [0.6, -2.6], [3, 0], [0.6, 2.6], [1.6, 2.6], [4.2, 0]]); break;
    case "gear": { const a0 = t * 2; for (let i = 0; i < 6; i++) { const a = a0 + i * 1.0472; path([[Math.cos(a - 0.2) * 2.4, Math.sin(a - 0.2) * 2.4], [Math.cos(a - 0.14) * 4, Math.sin(a - 0.14) * 4], [Math.cos(a + 0.14) * 4, Math.sin(a + 0.14) * 4], [Math.cos(a + 0.2) * 2.4, Math.sin(a + 0.2) * 2.4]]); } disc(0, 0, 2.9); disc(0, 0, 1.1, "#e6f0ea"); break; }
    case "check": path([[-3.6, 0.2], [-2.4, -1], [-1, 0.6], [2.6, -3.2], [3.8, -2], [-1, 3]]); break;
    case "cross": path([[-3, -2], [-2, -3], [0, -1], [2, -3], [3, -2], [1, 0], [3, 2], [2, 3], [0, 1], [-2, 3], [-3, 2], [-1, 0]]); break;
    case "star": { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 1.8 : 4.2; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } path(pts); break; }
    case "talk": path([[-3.8, -3], [3.8, -3], [3.8, 1.2], [-0.6, 1.2], [-2.4, 3.2], [-2.2, 1.2], [-3.8, 1.2]]); break;
    case "paper": path([[-3.1, -4.1], [1.5, -4.1], [3.1, -2.5], [3.1, 4.1], [-3.1, 4.1]], col); path([[-2.5, -3.5], [1.2, -3.5], [2.5, -2.2], [2.5, 3.5], [-2.5, 3.5]], "#ffffff"); P(-1.7, -1.4, 3.4, 0.6); P(-1.7, 0.1, 3.4, 0.6); P(-1.7, 1.6, 2.2, 0.6); break;
    case "lens": ring(0, 0, 3, col, 0.9); path([[2, 2.6], [2.6, 2], [4.4, 3.8], [3.8, 4.4]]); break;
    default: disc(0, 0, 1.4);
  }
}
