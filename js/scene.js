// Painters for the HSN Capital building: the sky over London, the tower, its rooms and desks, the machines in the
// basement, the lift, the people, their bubbles and the effects. Our own art, drawn in code (no game's or brand's art).
//
// The painters only read the building's state (building.js): they never decide what happens. What is decoration and
// what is real is kept apart on purpose:
//   decoration   the sky by London time, clouds, blinking, a monitor's scrolling lines, the Engine's turning gears
//   real         who sits where, who is working on what, every result chip (the Engine's own numbers), every walk,
//                meeting, audit, lift ride and celebration (each one a recorded event), the counts on the machines
// A room is lit while someone in it is really working; a paused firm sits in the half dark.
import { LEVEL_COLORS, BAR_COLORS, LEVEL_NAMES, FONT, HEAD_H, CELL_H, LABEL_H, LIFT_CAR_H, ROOM_BG, WOOD, WOOD_LIGHT, WOOD_DARK,
  INK, PAPER, MUTED, DIM, LINE, GOOD, BAD, AMBER, PURPLE, TEAL, BLUE } from "./palette.js";
import { drawPerson, drawIcon, shade, hash } from "./sprites.js";

const WORKING = new Set(["thinking", "researching", "coding", "testing"]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const first = (name) => String(name || "").split(" ")[0];
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const inView = (v, x, y, w, h) => !v || (x < v.x + v.w && x + w > v.x && y < v.y + v.h && y + h > v.y);

function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), f = (s) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * k);
  return `#${[f(16), f(8), f(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function fit(c, text, width) { let t = String(text || ""); if (c.measureText(t).width <= width) return t; while (t.length > 1 && c.measureText(t + "…").width > width) t = t.slice(0, -1); return t + "…"; }

// ── the sky over London ───────────────────────────────────────────────────────────────────────────────────────────
let skyMemo = { key: "", value: null };
/** What the sky looks like at a moment: colours, how dark it is (0 day .. 1 night), and where the sun or moon is (0..1). */
export function skyAt(now = new Date()) {
  const key = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
  if (skyMemo.key === key) return skyMemo.value;
  let hour = now.getUTCHours() + now.getUTCMinutes() / 60, summer = 0;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
    const h = +parts.find((p) => p.type === "hour").value, m = +parts.find((p) => p.type === "minute").value;
    summer = ((h - now.getUTCHours() + 24) % 24) === 1 ? 1 : 0; hour = h + m / 60;
  } catch { /* no time zone data: UTC is close enough for a sky */ }
  const doy = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
  const dayLen = 12.25 + 4.35 * Math.sin(2 * Math.PI * (doy - 80) / 365), noon = 12 + summer;
  const rise = noon - dayLen / 2, set = noon + dayLen / 2, edge = 0.7;
  let light;                                                 // 0 night .. 1 day
  if (hour >= rise + edge && hour <= set - edge) light = 1;
  else if (hour <= rise - edge || hour >= set + edge) light = 0;
  else light = hour < noon ? (hour - (rise - edge)) / (2 * edge) : ((set + edge) - hour) / (2 * edge);
  const NT = "#060a18", NB = "#14213a", DT = "#256d95", DB = "#8fcbd6", TT = "#3a3a6e", TB = "#f29a5c";
  const top = light < 0.5 ? mix(NT, TT, light * 2) : mix(TT, DT, (light - 0.5) * 2), bottom = light < 0.5 ? mix(NB, TB, light * 2) : mix(TB, DB, (light - 0.5) * 2);
  const day = hour > rise && hour < set;
  const pos = day ? (hour - rise) / (set - rise) : (((hour - set + 24) % 24) / (24 - (set - rise)));
  const value = { hour, light, night: 1 - clamp(light * 1.6, 0, 1), top, bottom, day, pos, rise, set };
  skyMemo = { key, value };
  return value;
}

function paintSkyBand(c, b, x, y, w, h, sky, t, small = false) {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, sky.top); g.addColorStop(1, sky.bottom);
  c.fillStyle = g; c.fillRect(x, y, w, h);
  if (sky.night > 0.05) {                                    // stars: the same ones every night, twinkling a little
    const n = small ? 14 : Math.round(w / 16);
    for (let i = 0; i < n; i++) {
      const hx = hash(`s${i}${small ? "w" : ""}`), sx = x + (hx % 1000) / 1000 * w, sy = y + ((hx >>> 10) % 1000) / 1000 * h * 0.8;
      const tw = b.animations ? 0.55 + 0.45 * Math.sin(t * (0.6 + (i % 5) * 0.23) + i) : 0.8;
      c.fillStyle = `rgba(232,240,255,${(sky.night * tw).toFixed(3)})`; c.fillRect(sx, sy, i % 7 === 0 ? 1.5 : 1, i % 7 === 0 ? 1.5 : 1);
    }
  }
  // the sun by day, the moon by night, on one arc across the sky
  const ax = x + 14 + sky.pos * (w - 28), ay = y + h - 8 - Math.sin(Math.PI * sky.pos) * (h - 26), r = small ? 3.6 : 6;
  if (sky.day) { c.fillStyle = "rgba(255,215,106,.22)"; c.beginPath(); c.arc(ax, ay, r * 1.9, 0, 6.2832); c.fill(); c.fillStyle = "#ffd76a"; c.beginPath(); c.arc(ax, ay, r, 0, 6.2832); c.fill(); }
  else { c.fillStyle = "#e8ecf5"; c.beginPath(); c.arc(ax, ay, r * 0.85, 0, 6.2832); c.fill(); c.fillStyle = sky.top; c.beginPath(); c.arc(ax + r * 0.38, ay - r * 0.22, r * 0.72, 0, 6.2832); c.fill(); }
  // clouds drift (decoration)
  const cloud = sky.light > 0.5 ? "rgba(255,255,255,.78)" : "rgba(150,165,200,.28)";
  for (let i = 0; i < (small ? 1 : 4); i++) {
    const sp = 2.2 + i * 0.9, span = w + 90, cx = x + ((((b.animations ? t : 0) * sp + i * 231 + (small ? 40 : 0)) % span) + span) % span - 45, cy = y + 8 + ((i * 37) % Math.max(8, h * 0.45));
    c.fillStyle = cloud; const k = small ? 0.6 : 1;
    c.fillRect(cx, cy + 3 * k, 26 * k, 5 * k); c.fillRect(cx + 5 * k, cy, 12 * k, 4 * k); c.fillRect(cx + 14 * k, cy + 1.5 * k, 9 * k, 3 * k);
  }
}

function paintSky(c, b, view, t) {
  if (!inView(view, 0, 0, b.W, b.skyH + 2)) return;
  const sky = skyAt(b.now ? b.now() : new Date());
  paintSkyBand(c, b, 0, 0, b.W, b.skyH, sky, t);
  // the city behind: the same skyline every time, its windows lit at night
  for (let i = 0, x = -6; x < b.W; i++) {
    const hx = hash(`b${i}`), w = 16 + (hx % 26), h = 8 + ((hx >>> 6) % 24);
    R(c, x, b.skyH - h, w, h, mix("#16263a", "#0b1420", sky.night));
    if (sky.night > 0.3) for (let wy = b.skyH - h + 3; wy < b.skyH - 3; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 4) if (hash(`w${i}:${wx}:${wy}`) % 5 === 0) R(c, wx, wy, 1.6, 1.6, `rgba(255,214,130,${(0.55 * sky.night).toFixed(2)})`);
    x += w + 1 + (hx >>> 12) % 5;
  }
}

// ── things that never move (cached as one picture for the whole-building view) ────────────────────────────────────
export function paintStatic(c, b, view = null) {
  const W = b.W, L = b.liftW;
  // the tower's body and roof
  R(c, 0, b.skyH, W, b.groundY - b.skyH, "#0c1512");
  R(c, 0, b.skyH - 3, W, 3, "#2a3d34"); R(c, 0, b.skyH - 4, W, 1, "#3b5548");
  for (const [rx, rw] of [[W * 0.16, 22], [W * 0.72, 30]]) { R(c, rx, b.skyH - 11, rw, 8, "#1c2a25"); R(c, rx + 2, b.skyH - 9, rw - 4, 2, "#31463c"); }      // roof machinery
  R(c, W - 46, b.skyH - 34, 1.6, 31, "#52685d"); R(c, W - 50, b.skyH - 22, 9.6, 1.2, "#52685d");                                                            // the mast
  // lift shaft, rails and the landing with its stairs
  R(c, 0, b.skyH, L, b.groundY - b.skyH, "#090f0d");
  R(c, 3, b.skyH, 1, b.groundY - b.skyH, "#1b2a24"); R(c, L - 4, b.skyH, 1, b.groundY - b.skyH, "#1b2a24");
  c.strokeStyle = LINE; c.lineWidth = 1; c.strokeRect(0.5, b.skyH + 0.5, L - 1, b.groundY - b.skyH - 1);
  R(c, L, b.skyH, b.land, b.groundY - b.skyH, "#101a16");
  // top floor
  const tr = b.topRect;
  R(c, tr.x, tr.y, tr.w, tr.h, "#141d1b"); c.strokeStyle = "#2f5546"; c.strokeRect(tr.x + 0.5, tr.y + 0.5, tr.w - 1, tr.h - 1);
  c.font = `600 12px ${FONT}`; c.fillStyle = PAPER; c.fillText(b.phone ? "Top floor" : "Top floor · Audit desk and the CEO's office", tr.x + b.land + 6, tr.y + 15);
  // floors 5 to 1: a sign strip, then the rooms
  for (const f of [5, 4, 3, 2, 1]) {
    const r = b.floorRect[f]; if (!r || !inView(view, r.x, r.y, r.w, r.h)) continue;
    R(c, r.x, r.y, r.w, r.h, f % 2 ? "#0f1915" : "#111d18");
    R(c, r.x, r.y, r.w, 2, "#1d2c26");                                                                                   // the slab between floors
    c.strokeStyle = LINE; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    R(c, r.x + b.land + 4, r.y + 5, 3, 12, LEVEL_COLORS[f]);
    c.fillStyle = LEVEL_COLORS[f]; c.font = `600 12px ${FONT}`;
    const label = `Floor ${f} · ${LEVEL_NAMES[f]}`;
    c.fillText(label, r.x + b.land + 12, r.y + 15);
    if (!b.phone) { c.fillStyle = MUTED; c.font = `11px ${FONT}`; c.fillText(`manager ${b.firm?.managers?.[String(f)]?.name || ""}`, r.x + b.land + 42 + c.measureText(label).width + 16, r.y + 15); }
    // stairs between the rows of rooms on this floor
    for (let i = 0; i + 1 < (b.rows[f] || []).length; i++) { const a = b.rows[f][i], d = b.rows[f][i + 1]; for (let k = 0; k < 7; k++) R(c, L + 2 + (k % 2 ? 3 : 0), a.lane + (d.lane - a.lane) * (k / 7), b.land - 7, 1, "#24362e"); }
    // the lift door on this floor
    const door = b.doorOf(f); R(c, L - 2, door.y - LIFT_CAR_H + 2, 2.5, LIFT_CAR_H - 2, "#2a3d34"); c.fillStyle = DIM; c.font = `700 8px ${FONT}`; c.fillText(String(f), 7, door.y - LIFT_CAR_H - 2);
  }
  // the pavement, then the basement's walls (its rooms are painted with the others, below)
  R(c, 0, b.groundY, W, b.baseRect.y - b.groundY, "#1b2420"); R(c, 0, b.groundY, W, 1.5, "#3a4a42");
  for (let x = 14; x < W; x += 38) R(c, x, b.groundY + 4, 12, 1, "#2a3832");
  const br = b.baseRect;
  if (inView(view, br.x, br.y, br.w, br.h)) {
    R(c, br.x, br.y, br.w, br.h, "#080b0a");
    for (let i = 0; i < br.w / 9; i++) { const hx = hash(`r${i}`); R(c, br.x + (hx % 1000) / 1000 * br.w, br.y + ((hx >>> 10) % 1000) / 1000 * br.h, 2, 1, "#111715"); }
  }
  for (const room of b.rooms) if (inView(view, room.x, room.y, room.w, room.h)) paintRoomStatic(c, b, room);
  for (const g of b.groups.values()) if (g.rect && inView(view, g.rect.x, g.rect.y, g.rect.w, g.rect.h)) g.seats.forEach((id, i) => { if (i < 5) paintSeatStatic(c, b, g, i, id ? b.agents.get(id) : null); });
}

function paintRoomStatic(c, b, room) {
  if (room.virtual) return;
  const { x, y, w, h, kind } = room, g = room.group;
  if (kind === "group") {
    R(c, x, y, w, h, ROOM_BG[room.floor] || "#0b1710");
    R(c, x, y + HEAD_H, w, 1, "#1b2a24");
    R(c, x + 1, y + h - 9, w - 2, 8, "#17221d"); R(c, x + 1, y + h - 9, w - 2, 1, "#24342c");                                   // the walkway in front of the desks
    R(c, x + 1, y + HEAD_H + 54, w - 2, 1, "rgba(255,255,255,.035)");                                                      // a line along the wall
    for (let lx = x + 26; lx < x + w - 12; lx += 64) { R(c, lx, y + HEAD_H + 1, 10, 2, "#2c3c35"); }                          // ceiling lamps (lit in paintDynamic)
    c.strokeStyle = g?.data?.strategy ? "#2f6b4d" : LINE; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (!g) { c.font = `10px ${FONT}`; c.fillStyle = "#3b5a4c"; c.fillText("empty room", x + 6, y + 13); return; }
    const d = g.data || {};
    c.fillStyle = "#cfe7da"; c.font = `600 10px ${FONT}`; c.fillText(g.id, x + 5, y + 13);
    const idW = c.measureText(g.id).width;
    c.font = `10px ${FONT}`; c.fillStyle = MUTED;
    const sw = Math.min(54, w * 0.26);
    c.fillText(fit(c, d.strategy ? `${d.strategy}${d.month_score != null && w > 190 ? " · score " + Math.round(d.month_score) : ""}` : "no strategy yet", w - idW - sw - 22), x + 9 + idW, y + 13);
    R(c, x + w - sw - 5, y + 3, sw, 14, "#06120c"); c.strokeStyle = "#2f5546"; c.strokeRect(x + w - sw - 4.5, y + 3.5, sw - 1, 13);          // the room's screen (its curve is drawn live)
    return;
  }
  if (kind === "discussion") {
    R(c, x, y, w, h, "#0f241b"); c.strokeStyle = LINE; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    c.font = `10px ${FONT}`; c.fillStyle = MUTED; c.fillText(b.phone ? "discussion room" : fit(c, `Floor ${room.floor} discussion room`, w - 12), x + 6, y + 13);
    if (!room.small) {
      const t = b.tableOf(room);
      R(c, x + 1, y + h - 9, w - 2, 8, "#17221d");
      for (let i = 0; i < t.per; i++) R(c, t.x0 + i * 14 - 4.5, t.y - 13, 9, 13, "#1b2a31");                                   // chairs
      R(c, t.x0 - 10, t.y, t.per * 14 + 6, 4, WOOD); R(c, t.x0 - 10, t.y, t.per * 14 + 6, 1, WOOD_LIGHT);
      R(c, t.x0 - 7, t.y + 4, 3, h - 13 - (t.y - y), WOOD_DARK); R(c, t.x0 + t.per * 14 - 10, t.y + 4, 3, h - 13 - (t.y - y), WOOD_DARK);
      R(c, x + w / 2 - 22, y + HEAD_H + 4, 44, 20, "#06120c"); c.strokeStyle = "#2f5546"; c.strokeRect(x + w / 2 - 21.5, y + HEAD_H + 4.5, 43, 19);
    }
    return;
  }
  if (kind === "audit") {
    R(c, x, y, w, h, "#241b10"); c.strokeStyle = "#4a3a22"; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    c.font = `600 10px ${FONT}`; c.fillStyle = "#e9c98a"; c.fillText("Audit desk", x + 6, y + 13);
    for (let i = 0; i < Math.min(9, (w - 60) / 7); i++) R(c, x + 8 + i * 7, y + h - 34, 5, 16, ["#8a5a2b", "#5c7a4a", "#6a4a7a", "#7a3b3b", "#3b5f7a"][i % 5]);      // binders
    R(c, x + 6, y + h - 18, Math.min(70, w - 56), 2, WOOD_DARK);
    const d = b.auditSeat(); R(c, d.x - 5.5, d.y - 14, 11, 14, "#1b2a31"); R(c, d.x - 17, d.y, 34, 3, WOOD); R(c, d.x - 17, d.y, 34, 1, WOOD_LIGHT); R(c, d.x - 15, d.y + 3, 30, h - (d.y - y) - 5, WOOD_DARK);
    R(c, d.x + 11, d.y - 9, 1.2, 9, "#8c8c94"); R(c, d.x + 7, d.y - 10, 6, 2, "#8c8c94");                                     // the desk lamp
    return;
  }
  if (kind === "ceo") {
    R(c, x, y, w, h, "#1c152b"); c.strokeStyle = "#3b2f55"; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    c.font = `600 10px ${FONT}`; c.fillStyle = "#d9c8ff"; c.fillText("CEO's office", x + 6, y + 13);
    const d = b.ceoDesk(); R(c, d.x - 7, d.y - 17, 14, 17, "#2b2140"); R(c, d.x - 22, d.y, 44, 3, WOOD); R(c, d.x - 22, d.y, 44, 1, WOOD_LIGHT); R(c, d.x - 20, d.y + 3, 40, h - (d.y - y) - 5, WOOD_DARK);
    R(c, d.x - 9, d.y + 5, 18, 7, "#d9b25f"); c.font = `700 6px ${FONT}`; c.fillStyle = INK; c.fillText("CEO", d.x - 6.5, d.y + 10.6);
    return;
  }
  // the basement
  R(c, x, y, w, h, kind === "sandbox" ? "#0e1620" : "#0d1211"); c.strokeStyle = kind === "sandbox" ? "#35507a" : "#26332e"; c.lineWidth = 1;
  if (kind === "sandbox") { c.setLineDash?.([4, 3]); c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); c.setLineDash?.([]); } else c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  c.font = `600 10px ${FONT}`; c.fillStyle = PAPER;
  const wd = b.world || {};
  if (kind === "engine") {
    c.fillText("The Engine", x + 6, y + 13); c.font = `9px ${FONT}`; c.fillStyle = DIM; if (w > 150) c.fillText(fit(c, "tests every idea on the price history", w - 80), x + 66, y + 13);
    const m = b.machine(); R(c, m.x, m.y, m.w, m.h, "#18222b"); R(c, m.x, m.y, m.w, 2, "#2b3a47"); R(c, m.x, m.y + m.h - 3, m.w, 3, "#101820");
    for (let i = 0; i < Math.floor((m.w - 62) / 9); i++) R(c, m.x + 54 + i * 9, m.y + 6, 6, m.h - 12, i % 2 ? "#141d25" : "#121a21");            // racks
    R(c, m.x + 4, m.y + m.h, 4, y + h - m.y - m.h - 2, "#101820"); R(c, m.x + m.w - 8, m.y + m.h, 4, y + h - m.y - m.h - 2, "#101820");
    return;
  }
  if (kind === "data") {
    c.fillText(w > 120 ? "Price history" : "Prices", x + 6, y + 13);
    const cy = y + 40, cx = x + w / 2;
    R(c, cx - 30, cy - 16, 60, 34, "#18222b"); R(c, cx - 30, cy - 16, 60, 2, "#2b3a47");
    c.font = `9px ${FONT}`;
    const lines = wd.data?.length ? wd.data.map((d) => `${d.label}: ${d.months} months`) : [wd.dataNote || "none yet"];
    lines.slice(0, 3).forEach((s, i) => { c.fillStyle = wd.data?.length ? PAPER : AMBER; c.fillText(fit(c, s, w - 12), x + 6, y + 72 + i * 11); });
    if (wd.data?.length && wd.dataTo) { c.fillStyle = DIM; c.fillText(fit(c, `up to ${wd.dataTo}`, w - 12), x + 6, y + 72 + Math.min(3, lines.length) * 11); }
    return;
  }
  if (kind === "code") {
    c.fillText("Code room", x + 6, y + 13);
    const n = clamp(wd.codeSources ?? 7, 0, 14), sx = x + 8, sy = y + 22;
    R(c, sx - 2, sy + 22, Math.min(w - 12, n * 8 + 6), 2, WOOD_DARK);
    for (let i = 0; i < n; i++) R(c, sx + i * 8, sy + (i % 3), 6, 22 - (i % 3), ["#3f86cf", "#35d07f", "#f5b942", "#b784ff", "#3fd1c9", "#e07a5f", "#8fb3a3"][i % 7]);
    c.font = `9px ${FONT}`; c.fillStyle = MUTED;
    [`${n} things to read:`, "your indicator, your rules,", "how the Engine tests"].forEach((s, i) => c.fillText(fit(c, s, w - 12), x + 6, y + 62 + i * 11));
    return;
  }
  if (kind === "sandbox") {
    c.fillText("Sandbox", x + 6, y + 13); c.font = `9px ${FONT}`; c.fillStyle = "#8fb0e0"; c.fillText(fit(c, "no network · no secrets", w - 60), x + 54, y + 13);
    const s = wd.strategies || {};
    c.fillStyle = PAPER; [[`${s.waiting ?? 0} waiting to be checked`], [`${s.active ?? 0} passed, in use`], [`${s.rejected ?? 0} rejected`]].forEach(([text], i) => c.fillText(fit(c, text, w - 46), x + 40, y + 34 + i * 12));
    R(c, x + 8, y + 24, 24, 18, "#18222b"); R(c, x + 10, y + 26, 20, 12, "#0a1512"); R(c, x + 17, y + 42, 6, 3, "#18222b");
    c.fillStyle = DIM; c.fillText(fit(c, "code an agent wrote runs only here", w - 12), x + 6, y + h - 8);
  }
}

function paintSeatStatic(c, b, g, i, a) {
  const s = b.seatPos(g, i), col = LEVEL_COLORS[g.floor] || BLUE, left = s.cx + 3, w = s.cw - 6;
  R(c, s.x - 5.5, s.y - 14, 11, 14, "#1b2a31"); R(c, s.x - 4.5, s.y - 15, 9, 1, "#1b2a31");                                   // chair
  R(c, left + 4.5, s.y - 2, 3, 2, "#1a2228"); R(c, left + 0.5, s.y - 11, 11, 9, "#1a2228");                                  // monitor (its screen is painted live)
  R(c, left, s.y, w, 3, WOOD); R(c, left, s.y, w, 1, WOOD_LIGHT); R(c, left + 1, s.y + 3, w - 2, 8, WOOD_DARK);              // desk
  if (!a || a.rides) return;                                                                                              // its name goes up when it has arrived
  R(c, left + w - 11, s.y + 3.5, 9, 7, col); c.fillStyle = INK; c.font = `700 7px ${FONT}`; c.fillText(String(g.floor), left + w - 8.6, s.y + 9.4);
  c.font = `10px ${FONT}`; c.fillStyle = "#cfe7da";
  let name = first(a.name); while (name.length > 2 && c.measureText(name).width > w) name = name.slice(0, -1);
  c.fillText(name, s.x - c.measureText(name).width / 2, s.y + 20.5);
  const p = a.prog, has = p && p.basis && p.basis !== "none";
  [["day", 23.5], ["pips", 27], ["rr", 30.5], ["win", 34]].forEach(([k, dy]) => {
    R(c, left, s.y + dy, w, 2.5, "#15281f");
    if (has) { c.globalAlpha = p.basis === "challenge" ? 1 : 0.62; R(c, left, s.y + dy, w * clamp((p[k]?.pct || 0) / 100, 0, 1), 2.5, BAR_COLORS[k]); c.globalAlpha = 1; }
  });
  if (b.stars.pips === a.id) drawIcon(c, "star", left + 6, s.y - 17, 1.25, AMBER);
  if (b.stars.win === a.id) { const rx = left + (b.stars.pips === a.id ? 18 : 6); c.strokeStyle = BLUE; c.lineWidth = 1.4; c.beginPath(); c.arc(rx, s.y - 17, 4.2, 0, 6.2832); c.stroke(); c.beginPath(); c.arc(rx, s.y - 17, 1.4, 0, 6.2832); c.stroke(); c.lineWidth = 1; }
}

// ── things that change ────────────────────────────────────────────────────────────────────────────────────────────
function roomLit(b, g) {
  if (!g) return false;
  if (g.playing) return true;
  for (const id of g.seats) { const a = id && b.agents.get(id); if (a && (WORKING.has(a.status) || a.chip || a.away?.huddle || a.status === "waiting_audit")) return true; }
  return false;
}

export function paintDynamic(c, b, view = null) {
  const t = b.animations ? b.clock : 0, wall = b.animations ? b.wall : 0, wd = b.world || {};
  const dim = wd.paused ? 0.36 : b.mode === "idle" ? 0.2 : 0.3;
  // the sign on the roof: lit while the firm is working, dark while it is paused
  if (inView(view, 0, 0, b.W, b.skyH)) {
    const on = !wd.paused, text = "HSN CAPITAL", size = b.phone ? 13 : 17;
    c.font = `800 ${size}px ${FONT}`; const tw = c.measureText(text).width, sx = (b.W - tw) / 2 + (b.phone ? 0 : b.liftW / 2), sy = b.skyH - 8;
    R(c, sx - 6, sy - size + 2, tw + 12, size + 3, "rgba(8,14,12,.72)"); R(c, sx - 4, sy + 5, 2, 3, "#3b5548"); R(c, sx + tw + 2, sy + 5, 2, 3, "#3b5548");
    if (on) { c.shadowColor = GOOD; c.shadowBlur = 9; }
    c.fillStyle = on ? "#7df0b2" : "#3d5248"; c.fillText(text, sx, sy); c.shadowBlur = 0; c.shadowColor = "transparent";
    if (!b.phone) { c.font = `600 8px ${FONT}`; c.fillStyle = on ? "#cfe7da" : "#5f7a6e"; c.fillText("research only · no real trades", sx + tw + 14, sy - 3); }
    if (Math.floor(wall * 1.2) % 2 === 0) R(c, b.W - 46.8, b.skyH - 36.5, 3.2, 3.2, "#ff5c5c");                                // the mast's light
  }
  // rooms: light, flashes, screens
  for (const room of b.rooms) {
    if (!inView(view, room.x, room.y, room.w, room.h) || room.virtual) continue;
    const g = room.group;
    if (room.kind === "group") {
      const lit = roomLit(b, g);
      if (g) g._glow = (g._glow ?? 0) + ((lit ? 1 : 0) - (g._glow ?? 0)) * (b.animations ? 0.12 : 1);
      const glow = g?._glow ?? 0;
      if (glow > 0.02) for (let lx = room.x + 26; lx < room.x + room.w - 12; lx += 64) {                                     // lamps on: a cone of light
        R(c, lx, room.y + HEAD_H + 1, 10, 2, mix("#2c3c35", "#ffe9a8", glow));
        c.fillStyle = `rgba(255,233,168,${(0.07 * glow).toFixed(3)})`; c.beginPath(); c.moveTo(lx, room.y + HEAD_H + 3); c.lineTo(lx + 10, room.y + HEAD_H + 3); c.lineTo(lx + 34, room.y + room.h - 9); c.lineTo(lx - 24, room.y + room.h - 9); c.closePath(); c.fill();
      }
      if (glow < 0.98) R(c, room.x + 1, room.y + HEAD_H + 1, room.w - 2, room.h - HEAD_H - 2, `rgba(2,6,5,${(dim * (1 - glow)).toFixed(3)})`);
      const fl = g && b.flashes.find((f) => f.gid === g.id);
      if (fl) { const k = clamp((fl.until - b.clock) / fl.secs, 0, 1); c.strokeStyle = fl.color; c.lineWidth = 2; c.globalAlpha = 0.35 + 0.65 * k; c.strokeRect(room.x + 1, room.y + 1, room.w - 2, room.h - 2); c.globalAlpha = 1; c.lineWidth = 1; }
      if (g) paintRoomScreen(c, b, room, g);
      if (g?.playing && room.w >= 150) paintProjector(c, b, room, g);
      if (g) g.seats.forEach((id, i) => { if (i < 5) paintMonitor(c, b, g, i, id ? b.agents.get(id) : null, t); });
    } else if (room.kind === "discussion") {
      const busy = [...b.agents.values()].some((a) => a.away?.room === room);
      if (!busy) R(c, room.x + 1, room.y + 1, room.w - 2, room.h - 2, `rgba(2,6,5,${dim.toFixed(3)})`);
      else if (!room.small) { c.fillStyle = GOOD; c.font = `600 7.5px ${FONT}`; const sw = c.measureText("in session").width; c.fillText("in session", room.x + room.w / 2 - sw / 2, room.y + HEAD_H + 16.5); }
    } else if (room.kind === "audit") paintAudit(c, b, room, t);
    else if (room.kind === "ceo") paintCeo(c, b, room, wall);
    else if (room.kind === "engine") paintEngine(c, b, room, wall);
    else if (room.kind === "data") paintData(c, b, room, wall);
    else if (room.kind === "sandbox" && b.sandboxPulse > 0.02) { c.strokeStyle = PURPLE; c.globalAlpha = clamp(b.sandboxPulse, 0, 1); c.lineWidth = 2; c.strokeRect(room.x + 1, room.y + 1, room.w - 2, room.h - 2); c.globalAlpha = 1; c.lineWidth = 1; }
  }
  if (b.selected) { const a = b.agents.get(b.selected), h = a && b.home(a.id); if (h) { c.strokeStyle = "rgba(53,208,127,.8)"; c.lineWidth = 1; c.strokeRect(h.cx + 1.5, h.top + 0.5, h.cw - 3, CELL_H - 1); } }
  paintLift(c, b, view);
  // people: those sitting first, then anyone on their feet (so walkers pass in front of the desks)
  const list = [...b.agents.values()].filter((a) => inView(view, a.x - 14, a.y - 34, 28, 48)).sort((p, q) => p.y - q.y);
  for (const m of b.staff || []) if (inView(view, m.x - 10, m.y - 30, 20, 34)) drawPerson(c, m.x, m.y, m.look, { pose: m.pose || "stand", shirt: LEVEL_COLORS[m.floor] || AMBER, mood: "neutral", t: wall, phase: m.phase, still: !b.animations });
  for (const a of list) if (b.poseOf(a) === "sit") paintAgent(c, b, a, wall);
  for (const a of list) if (b.poseOf(a) !== "sit") paintAgent(c, b, a, wall);
  paintFlights(c, b, view);
  for (const a of list) paintBubble(c, b, a, view, wall);
  for (const p of b.effects) { c.fillStyle = p.c; c.globalAlpha = clamp(p.life / 30, 0, 1); c.fillRect(p.x, p.y, p.size || 3, p.size || 3); } c.globalAlpha = 1;
  for (const f of b.texts) {                                                                                             // words that rise and fade: "LEVEL UP", "PASSED"
    const age = b.clock - f.born, k = clamp((f.until - b.clock) / 0.6, 0, 1); if (age < 0) continue;
    c.font = `800 ${f.big ? 15 : 11}px ${FONT}`; const tw = c.measureText(f.text).width; c.globalAlpha = k;
    const fx = clamp(f.x - tw / 2, 2, b.W - tw - 2), fy = f.y - Math.min(16, age * 12);
    c.fillStyle = "rgba(6,19,12,.82)"; roundRect(c, fx - 5, fy - (f.big ? 13 : 10), tw + 10, f.big ? 18 : 14, 4); c.fill();
    c.fillStyle = f.color || GOOD; c.fillText(f.text, fx, fy); c.globalAlpha = 1;
  }
}

function paintRoomScreen(c, b, room, g) {
  const sw = Math.min(54, room.w * 0.26), sx = room.x + room.w - sw - 5, sy = room.y + 3, sc = g.data?.screen;
  if (sc?.cum?.length > 1) {
    const part = g.playing ? clamp((b.clock - g.playing.from) / g.playing.secs, 0, 1) : 1;
    const n = Math.max(2, Math.round(sc.cum.length * part)), lo = Math.min(0, ...sc.cum), hi = Math.max(0, ...sc.cum), span = hi - lo || 1;
    c.beginPath();
    for (let i = 0; i < n; i++) { const px = sx + 2 + (i / (sc.cum.length - 1)) * (sw - 4), py = sy + 12 - ((sc.cum[i] - lo) / span) * 10; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
    c.strokeStyle = sc.passed ? GOOD : "#ff8a5c"; c.lineWidth = 1; c.stroke();
  } else if (g.playing) R(c, sx + 2, sy + 6, (sw - 4) * clamp((b.clock - g.playing.from) / g.playing.secs, 0, 1), 2, GOOD);
}

/** While a group sits its challenge the room's big screen comes down and draws the real running total of its Day Scores. */
function paintProjector(c, b, room, g) {
  const sc = g.data?.screen, pw = Math.min(96, room.w * 0.42), ph = 30, px = room.x + (room.w - pw) / 2, py = room.y + HEAD_H + 5;
  const part = clamp((b.clock - g.playing.from) / g.playing.secs, 0, 1);
  R(c, px + pw / 2 - 0.5, room.y + HEAD_H + 1, 1, 4, "#52685d");
  R(c, px - 1, py - 1, pw + 2, ph + 2, AMBER); R(c, px, py, pw, ph, "#06120c");
  c.font = `600 6px ${FONT}`; c.fillStyle = AMBER; c.fillText("CHALLENGE", px + 3, py + 7);
  if (sc?.cum?.length > 1) {
    const n = Math.max(2, Math.round(sc.cum.length * part)), lo = Math.min(0, ...sc.cum), hi = Math.max(0, ...sc.cum), span = hi - lo || 1;
    R(c, px + 3, py + ph - 4 - ((0 - lo) / span) * (ph - 14), pw - 6, 0.5, "#31463c");
    c.beginPath();
    for (let i = 0; i < n; i++) { const x = px + 3 + (i / (sc.cum.length - 1)) * (pw - 6), y = py + ph - 4 - ((sc.cum[i] - lo) / span) * (ph - 14); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.strokeStyle = PAPER; c.lineWidth = 1.2; c.stroke(); c.lineWidth = 1;
  } else R(c, px + 3, py + ph / 2, (pw - 6) * part, 2, GOOD);
}

function paintMonitor(c, b, g, i, a, t) {
  const s = b.seatPos(g, i), left = s.cx + 3;
  const seated = a && b.poseOf(a) === "sit", on = seated && WORKING.has(a.status);
  const fresh = a?.chip && b.clock >= a.chip.born && b.clock - a.chip.born < 0.9 ? a.chip.color : null;                        // a result has just come back
  R(c, left + 1.5, s.y - 10, 9, 7, fresh ? shade(fresh, -0.45) : on ? "#0f3d2a" : "#0a1512");
  if (fresh) { R(c, left + 3, s.y - 8, 6, 1, fresh); R(c, left + 3, s.y - 6, 4, 1, fresh); }
  else if (on) { const k = Math.floor(t * 8 + (a.phase || 0)) % 3; for (let r = 0; r < 3; r++) R(c, left + 2.5, s.y - 9 + r * 2, 3 + ((r + k) % 3) * 1.6, 1, GOOD); }
}

function paintAudit(c, b, room, t) {
  const au = b.auditing && b.clock < b.auditing.until ? b.auditing : null;
  const waiting = !au && b.mode === "live" ? [...b.agents.values()].find((a) => a.status === "waiting_audit") : null;
  const d = b.auditSeat();
  c.font = `10px ${FONT}`;
  if (au || waiting) {
    c.fillStyle = "rgba(255,233,168,.13)"; c.beginPath(); c.moveTo(d.x + 7, d.y - 9); c.lineTo(d.x + 13, d.y - 9); c.lineTo(d.x + 22, d.y); c.lineTo(d.x - 8, d.y); c.closePath(); c.fill();      // the lamp is on
    R(c, d.x - 12, d.y - 1.6, 8, 1.6, PAPER);
    if (b.animations) drawIcon(c, "lens", d.x - 8 + Math.sin(t * 2.4) * 3, d.y - 4, 0.9, "#e9c98a");
    c.fillStyle = AMBER; c.fillText(fit(c, au ? `re-running ${au.who}'s floor ${au.floor} challenge` : `re-running ${waiting.group}'s challenge`, room.w - 12), room.x + 6, room.y + 26);
    c.strokeStyle = AMBER; c.lineWidth = 1; c.strokeRect(room.x + 1.5, room.y + 1.5, room.w - 3, room.h - 3);
  } else { c.fillStyle = "#8a7a5c"; c.fillText(fit(c, "re-runs every level-up from scratch", room.w - 12), room.x + 6, room.y + 26); }
}

function paintCeo(c, b, room, t) {
  const wx = room.x + room.w * 0.5, ww = room.w * 0.5 - 10, wy = room.y + 18, wh = room.h - 42;
  if (ww > 30) {
    paintSkyBand(c, b, wx, wy, ww, wh, skyAt(b.now ? b.now() : new Date()), t, true);
    c.strokeStyle = "#4a3d66"; c.lineWidth = 2; c.strokeRect(wx, wy, ww, wh); c.lineWidth = 1; R(c, wx + ww / 2 - 0.5, wy, 1, wh, "#4a3d66");
  }
  c.font = `10px ${FONT}`; c.fillStyle = "#9a8cc0";
  if (!b.phone) c.fillText(fit(c, `${b.firm?.managers?.["5"]?.name || "The Head of Trading"} reports here`, room.w * 0.5 - 12), room.x + 6, room.y + 26);
}

function paintEngine(c, b, room, t) {
  const m = b.machine(), e = b.engine, wd = b.world || {}, live = wd.hasData && !wd.paused;
  const cx = m.x + 26, cy = m.y + m.h / 2, glow = clamp(e.pulse, 0, 1);
  c.fillStyle = "#0b1218"; c.beginPath(); c.arc(cx, cy, 17, 0, 6.2832); c.fill();
  c.strokeStyle = live ? mix("#1f6b4a", "#7df0b2", glow) : "#2b3a47"; c.lineWidth = 2;
  for (let i = 0; i < 3; i++) { const a0 = e.spin * (i % 2 ? -1 : 1) + i * 2.1; c.beginPath(); c.arc(cx, cy, 6 + i * 4.5, a0, a0 + 1.9); c.stroke(); }
  c.lineWidth = 1;
  c.fillStyle = live ? mix("#16553b", "#b8ffd9", glow) : "#1c2630"; c.beginPath(); c.arc(cx, cy, 3.4 + glow * 1.6, 0, 6.2832); c.fill();
  if (glow > 0.05) { c.fillStyle = `rgba(125,240,178,${(0.22 * glow).toFixed(3)})`; c.beginPath(); c.arc(cx, cy, 22, 0, 6.2832); c.fill(); }
  for (let i = 0; i < Math.floor((m.w - 62) / 9); i++) {                                                                   // rack lights: busy when tests are running
    const lit = live && (hash(`l${i}:${Math.floor(t * (1 + e.activity * 6))}`) % 4 === 0 || glow > 0.6);
    R(c, m.x + 56 + i * 9, m.y + 9 + (i % 3) * 5, 2, 2, lit ? GOOD : "#1f2c36");
  }
  c.font = `9px ${FONT}`;
  const lines = b.engineLines();
  lines.slice(0, 3).forEach(([label, value], i) => { const y = m.y + m.h + 13 + i * 11; if (y > room.y + room.h - 3) return; c.fillStyle = MUTED; c.fillText(label, m.x, y); c.fillStyle = PAPER; c.fillText(fit(c, String(value), room.w - 20 - c.measureText(label).width), m.x + c.measureText(label).width + 5, y); });
  if (!wd.hasData) { c.fillStyle = AMBER; c.font = `600 9px ${FONT}`; c.fillText(fit(c, "waiting for price history", m.w - 58), m.x + 54, m.y + m.h / 2 + 3); }
}

function paintData(c, b, room, t) {
  const cy = room.y + 41, cx = room.x + room.w / 2, has = !!b.world?.data?.length, spin = has ? b.engine.spin * 0.7 : 0;
  for (const dx of [-15, 15]) {
    c.strokeStyle = has ? "#c9a36b" : "#2b3a47"; c.lineWidth = has ? 4 : 1; c.beginPath(); c.arc(cx + dx, cy, has ? 8 : 10, 0, 6.2832); c.stroke(); c.lineWidth = 1;
    c.strokeStyle = "#52685d"; for (let i = 0; i < 3; i++) { const a = spin + i * 2.0944; c.beginPath(); c.moveTo(cx + dx, cy); c.lineTo(cx + dx + Math.cos(a) * 5, cy + Math.sin(a) * 5); c.stroke(); }
  }
  R(c, cx - 24, cy + 12, 3, 3, has ? GOOD : (Math.floor(t * 2) % 2 ? AMBER : "#3a2f14"));
}

function paintLift(c, b, view) {
  const L = b.liftW, y = b.lift.y;
  if (!inView(view, 0, y - 4, L + b.land, LIFT_CAR_H + 8)) return;
  R(c, L / 2 - 0.5, b.skyH, 1, y - b.skyH, "#31463c");                                                                      // the cable
  R(c, 4, y, L - 8, LIFT_CAR_H, "#1a2b24"); R(c, 5, y + 1, L - 10, LIFT_CAR_H - 2, "#22382f");
  R(c, 5, y + 1, L - 10, 3, "#ffe9a8"); c.fillStyle = "rgba(255,233,168,.10)"; c.fillRect(5, y + 4, L - 10, LIFT_CAR_H - 5);
  c.strokeStyle = GOOD; c.lineWidth = 1; c.strokeRect(4.5, y + 0.5, L - 9, LIFT_CAR_H - 1);
}

function paintAgent(c, b, a, t) {
  const pose = b.poseOf(a), col = LEVEL_COLORS[a.shirt ?? a.level] || BLUE, typing = pose === "sit" && WORKING.has(a.status) && !a.atTable;
  drawPerson(c, a.x, a.y, a.look, { pose: pose === "table" ? "sit" : pose, shirt: col, mood: a.mood, t, phase: a.phase, typing, facing: a.facing || 1, still: !b.animations });
  if (pose !== "sit" && a.away?.room && !a.walking && !a.atTable) { c.font = `9px ${FONT}`; c.fillStyle = "#cfe7da"; const n = first(a.name).slice(0, 7); c.fillText(n, a.x - c.measureText(n).width / 2, a.y + 9); }
  if (b.selected === a.id) { c.strokeStyle = PAPER; c.lineWidth = 1.2; c.beginPath(); c.arc(a.x, a.y - (pose === "sit" || pose === "table" ? 15 : 18), 9, 0, 6.2832); c.stroke(); c.lineWidth = 1; }
}

function paintFlights(c, b, view) {
  for (const f of b.flights) {
    const k = clamp((b.clock - f.t0) / f.dur, 0, 1); if (b.clock < f.t0) continue;
    for (let i = 3; i >= 0; i--) {
      const u = clamp(k - i * 0.05, 0, 1), e = u * u * (3 - 2 * u), x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * f.cx + e * e * f.x1, y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * f.cy + e * e * f.y1;
      if (!inView(view, x - 4, y - 4, 8, 8)) continue;
      c.globalAlpha = i ? 0.28 - i * 0.06 : 1; c.fillStyle = f.color; c.beginPath(); c.arc(x, y, i ? 2.2 - i * 0.3 : 2.4, 0, 6.2832); c.fill();
      if (!i) { c.fillStyle = "rgba(255,255,255,.85)"; c.beginPath(); c.arc(x - 0.5, y - 0.5, 0.9, 0, 6.2832); c.fill(); }
    }
    c.globalAlpha = 1;
  }
}

const STATUS_ICON = { thinking: "dots", researching: "search", coding: "code", testing: "gear", in_meeting: "talk", waiting_audit: "paper" };
const CODE_SHORT = { original: "your indicator", original_pine: "the Pine code", chart_maths: "the chart maths", waves: "your Waves rules", rules_engine: "the rule engine", price_model: "the price model", challenges: "the challenges" };
/** The engine's own label for a look ("reading original", "by session") in plain words, short enough for a bubble. */
function researchWords(detail) {
  const d = String(detail || ""), m = /^reading (\S+)/.exec(d);
  if (m) return `reading ${CODE_SHORT[m[1]] || (/^[SF]\d+/.test(m[1]) ? "its own code" : m[1].replaceAll("_", " "))}`;
  if (/^by /.test(d)) return `asks the Engine: ${d}`;
  if (d === "exits") return "asks the Engine: exits";
  return d;
}
const STATUS_WORD = { thinking: "thinking", researching: "research", coding: "writing code", testing: "testing", in_meeting: "meeting", waiting_audit: "waiting for audit" };

function paintBubble(c, b, a, view, t) {
  const chip = a.chip && b.clock >= a.chip.born ? a.chip : null;
  const pose = b.poseOf(a), seated = pose === "sit";
  if (chip) {                                                                                                             // the Engine's real numbers, rising from the desk
    c.font = `700 9px ${FONT}`;
    const text = chip.text.length > 26 ? chip.text.slice(0, 25) + "…" : chip.text, tw = c.measureText(text).width + 9, age = b.clock - chip.born;
    const seat = b.groups.get(a.group)?.seats.indexOf(a.id) ?? 0;
    const bx = clamp(a.x - tw / 2, b.liftW + 2, b.W - tw - 2), by = a.y - (seated ? 37 + (seat % 2) * 12 : 38 + (seat % 3) * 13) - Math.min(9, age * 14);
    const pop = b.animations ? clamp(age / 0.16, 0, 1) : 1, k = 0.55 + 0.45 * pop * (2 - pop);                               // it pops up, then settles
    c.save(); c.translate(bx + tw / 2, by + 6.5); c.scale(k, k); c.translate(-(bx + tw / 2), -(by + 6.5));
    c.fillStyle = "rgba(6,19,12,.55)"; roundRect(c, bx + 1, by + 1.5, tw, 13, 4); c.fill();
    c.fillStyle = chip.color; roundRect(c, bx, by, tw, 13, 4); c.fill();
    c.fillStyle = INK; c.fillText(text, bx + 4.5, by + 9.6);
    c.restore();
    return;
  }
  if (!a.status || a.status === "idle" || (a.away && a.walking)) return;
  if (a.away) { const mates = [...b.agents.values()].filter((x) => x.away && (a.away.huddle ? x.away.huddle && x.group === a.group : x.away.room === a.away.room)); if (mates[0] !== a) return; }      // one bubble per gathering
  const together = a.status === "waiting_audit" || (a.status === "testing" && /challenge/.test(a.detail || "") && !/own/.test(a.detail || ""));
  if (together) { const g = b.groups.get(a.group); if (g && g.seats.find((id) => { const x = b.agents.get(id); return x && x.status === a.status && x.detail === a.detail; }) !== a.id) return; }
  const icon = a.status === "researching" && (a.look_tool === "read_code" || /^reading /.test(a.detail || "")) ? "book" : STATUS_ICON[a.status] || "dots";
  // a close view has room for words; the whole-building view shows the sign alone (the agent's file has the detail)
  const close = (view?.s || 1) >= 1.6 || together || a.away;
  let word = "";
  if (close) word = a.status === "researching" && a.detail ? researchWords(a.detail) : a.status === "testing" && /challenge/.test(a.detail || "") ? "challenge" : a.status === "in_meeting" ? (a.detail || "meeting") : STATUS_WORD[a.status] || a.status;
  c.font = `600 8px ${FONT}`;
  word = word.length > 30 ? word.slice(0, 29) + "…" : word;
  const tw = (word ? c.measureText(word).width + 4 : 0) + 13, seat = seated ? (b.groups.get(a.group)?.seats.indexOf(a.id) ?? 0) : 0;
  const bx = clamp(a.x - tw / 2, b.liftW + 2, b.W - tw - 2), by = a.y - (seated ? 35 + (word ? (seat % 2) * 11 : 0) : 39);
  c.fillStyle = "rgba(240,246,242,.96)"; roundRect(c, bx, by, tw, 12, 4); c.fill();
  c.beginPath(); c.moveTo(a.x - 2, by + 11.5); c.lineTo(a.x + 2, by + 11.5); c.lineTo(a.x, by + 14.5); c.closePath(); c.fill();
  drawIcon(c, icon, bx + 6.5, by + 6, 0.92, INK, t);
  if (word) { c.fillStyle = INK; c.fillText(word, bx + 13, by + 8.8); }
}

/** Everything, back to front. `layer` is the cached picture of the static parts (whole-building view only). */
export function paintWorld(c, b, view = null, layer = null) {
  const t = b.animations ? b.wall : 0;
  paintSky(c, b, view, t);
  if (layer) c.drawImage(layer, 0, 0, b.W, b.H); else paintStatic(c, b, view);
  paintDynamic(c, b, view);
}

/** The camera's frame: what it is showing (LIVE, a REPLAY, or the firm at rest), and one line saying what is happening. */
export function paintHud(c, b, w, h, shot) {
  const wd = b.world || {};
  const mode = b.mode === "live" ? ["LIVE", BAD] : b.mode === "replay" ? [`REPLAY · shift ${b.replayCycle ?? ""}`, AMBER] : wd.paused ? ["PAUSED", DIM] : ["BETWEEN SHIFTS", TEAL];
  c.font = `700 11px ${FONT}`;
  const tw = c.measureText(mode[0]).width + 26;
  c.fillStyle = "rgba(6,12,10,.78)"; roundRect(c, 10, 10, tw, 22, 11); c.fill();
  c.fillStyle = mode[1]; c.beginPath(); c.arc(22, 21, 4, 0, 6.2832); c.fill();
  if (b.mode === "live" && b.animations && Math.floor(b.wall * 2) % 2) { c.fillStyle = "rgba(255,92,92,.35)"; c.beginPath(); c.arc(22, 21, 7, 0, 6.2832); c.fill(); }
  c.fillStyle = PAPER; c.fillText(mode[0], 31, 25);
  const real = b.mode === "replay" ? "real events, played again" : "every move is a real event";
  c.font = `600 10px ${FONT}`; const rw = c.measureText(real).width + 16;
  if (w > 420) { c.fillStyle = "rgba(6,12,10,.6)"; roundRect(c, w - rw - 10, 10, rw, 20, 10); c.fill(); c.fillStyle = MUTED; c.fillText(real, w - rw - 2, 24); }
  const text = shot?.label || "";
  if (text) {
    c.font = `600 13px ${FONT}`;
    const line = fit(c, text, w - 36);
    c.fillStyle = "rgba(6,12,10,.8)"; c.fillRect(0, h - 34, w, 34); R(c, 0, h - 34, w, 1, "rgba(53,208,127,.5)");
    c.fillStyle = shot.color || PAPER; c.fillText(line, 16, h - 13);
  }
}
