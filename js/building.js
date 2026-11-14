// The HSN Capital building as a small 2D world: a side-on cutaway tower under the London sky, drawn with our own art
// (scene.js, sprites.js; no characters, names, logos or art from any game). From the top: the Audit desk and the CEO's
// office, floors 5 to 2 with two group rooms and a discussion room each, the big Analysts' floor (12 group rooms), and
// in the basement the Engine, the price history, the code room and the sandbox. A lift runs down the side.
//
// All 100 agents are always in it, each with a look of its own, at its own desk: shirt in its level's colour, a mood
// on its face, its name, and four small bars for its progress to the next level (months in profit, pips, risk to
// reward, win rate: the share of its months that meet each check, straight from the Engine). The agent with the most
// pips has a star on its desk and the one with the best win rate a ring - both from real results.
//
// THIS IS NOT A GAME: nothing is scripted. Everything that happens on screen is one of two real things:
//   * status/firm_live.json while a shift runs (who is thinking, researching, coding, testing, in a meeting, at audit)
//   * the shift's recorded events (firm/replays/cycle<N>.json, or the tail in the live file). A test: the idea flies
//     down to the Engine and its real numbers come back to the desk. Code handed in: it goes to the sandbox. A meeting:
//     the group walks to its floor's discussion room. An audit: the papers go up to the Audit desk. A level-up: the
//     lift, and a celebration on the new floor. A swap down, a transfer, a new Analyst: the same, as they happened.
// Only the sky, the blinking and the turning of the machines are decoration. With animations off the same scene is
// drawn still and events are applied without motion.
//
// Two pictures of the same world: the whole building (a map: tap a desk or a room), and, when a stage canvas is
// attached, a camera that moves to wherever the latest real event is and says in one line what it is.
import { LEVEL_COLORS, BAR_COLORS, LEVEL_NAMES, FONT, SKY_H, LABEL_H, HEAD_H, CELL_H, ROOM_H, TOP_H, GROUND_H, BASE_H, LIFT_CAR_H, GOOD, BAD, AMBER, PURPLE, TEAL, PAPER } from "./palette.js";
import { lookOf } from "./sprites.js";
import { paintWorld, paintStatic, paintHud } from "./scene.js";

export { LEVEL_COLORS, BAR_COLORS };

const WORKING = new Set(["thinking", "researching", "coding", "testing"]);
// how long the director waits after each kind of event before showing the next (seconds of building time)
const STEP = { tested: 0.14, thinking: 0.1, looked: 0.3, coded: 0.3, meeting_start: 1.6, meeting: 1.2, challenge_start: 1.6, challenge_failed: 0.6, audit_start: 1.4,
  audit_failed: 0.9, battle: 0.9, level_up: 3.4, swapped_down: 3.0, transfer: 1.6, rotation: 0.6, solo_passed_no_seat: 0.6, data_update: 0.3, turn_failed: 0.1,
  meeting_failed: 0.3, transfer_declined: 0.2, retest_failed: 0.4 };
// the camera: how much an event matters (a bigger number takes the picture from a smaller one) and how long it is shown (real seconds)
const SHOT = { tested: [1, 2.4], thinking: [1, 2.2], looked: [1, 2.6], coded: [3, 3.2], meeting_start: [3, 4.2], meeting: [2, 2.6], challenge_start: [4, 4], challenge_failed: [4, 3.2],
  audit_start: [4, 3.6], audit_failed: [4, 3.2], level_up: [5, 8], swapped_down: [4, 6], battle: [4, 3.2], transfer: [3, 5], rotation: [2, 3], solo_passed_no_seat: [3, 3.2],
  data_update: [3, 3.2], retest_failed: [3, 3] };
const MAX_FLIGHTS = 70;

const first = (name) => String(name || "").split(" ")[0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (v) => (v === null || v === undefined || Number.isNaN(+v) ? "—" : Math.round(+v).toLocaleString("en-GB"));
const SYMBOL_WORDS = { XAUUSD: "Gold", NAS100: "Nasdaq 100", GBPUSD: "GBP/USD" };

/** What the machines in the basement show, read from the firm's own file (firm/firm.json). */
/** What the price-history room shows, from a coverage file ({symbols: {XAUUSD: {months, last_bar}}}). */
function dataOnFile(coverage) {
  return Object.entries(coverage?.symbols || {}).filter(([, v]) => v && v.months > 0).map(([k, v]) => ({ label: SYMBOL_WORDS[k] || k, months: v.months, to: String(v.last_bar || "").slice(0, 10) }));
}

/**
 * The price history the engine holds now, for setWorld(). The firm's own file only learns of new price history at
 * its next shift, so between a download and that shift the Data check's coverage file is the one that is true.
 * Returns {} when that file shows nothing, so the firm's own file still speaks.
 */
export function coverageWorld(coverage) {
  const data = dataOnFile(coverage);
  return data.length ? { hasData: true, data, dataTo: data.map((d) => d.to).sort().pop() || "" } : {};
}

export function worldFrom(firm) {
  const data = dataOnFile(firm?.data_coverage);
  const st = firm?.strategies || {};
  return { paused: !!firm?.paused, hasData: data.length > 0, data, dataTo: data.map((d) => d.to).sort().pop() || "", dataNote: "none yet",
    codeSources: (firm?.code_room || []).length || 7, strategies: { active: (st.active || []).length, waiting: st.waiting ?? 0, rejected: st.rejected ?? 0 },
    ideas: firm?.library?.ideas ?? 0, verified: firm?.library?.verified ?? 0 };
}

export class Building {
  constructor(canvas, { animations = true, onAgent = null, onRoom = null, describe = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.animations = animations;
    this.onAgent = onAgent; this.onRoom = onRoom; this.describe = describe;
    this.agents = new Map();    // id -> {id, name, level, mood, status, detail, prog, x, y, lane, at, path, away, hold, chip, look, ...}
    this.groups = new Map();    // id -> {id, floor, room, seats: [id|null x5], data, rect}
    this.rooms = []; this.rows = {}; this.staff = [];
    this.lift = { y: 0, ty: 0, riders: [], floor: 1 }; this.rides = [];
    this.effects = []; this.flashes = []; this.texts = []; this.flights = []; this.banner = null; this.auditing = null;
    this.engine = { pulse: 0, spin: 0, activity: 0, count: 0 }; this.sandboxPulse = 0;
    this.queue = []; this.nextAt = 0; this.speed = 1; this.mode = "idle";   // idle | live | replay
    this.seenLive = new Set(); this.liveCycle = null;
    this.selected = null; this.firm = null; this.live = null; this.stars = { pips: null, win: null }; this.world = worldFrom(null);
    this.visible = true; this.dead = false; this.last = performance.now(); this.clock = 0; this.wall = 0; this.dirty = true; this.layer = null;
    this.stage = null; this.cam = null; this.shot = null; this.lastEventAt = -99; this.tourAt = 0; this.tourIndex = 0;
    this._tap = (e) => this.tap(e);
    canvas.addEventListener("click", this._tap);
    this._resize = () => { this.resize(); this.layout(); this.snapAll(); this.resizeStage(); this.draw(); };
    window.addEventListener("resize", this._resize);
    window.addEventListener("orientationchange", this._resize);
    if ("IntersectionObserver" in window) { this.io = new IntersectionObserver((es) => { for (const x of es) { if (x.target === this.canvas) this.visible = x.isIntersecting; else this.stageVisible = x.isIntersecting; } }); this.io.observe(canvas); }
    this.resize();
    requestAnimationFrame(() => this.loop());
  }

  destroy() {
    this.dead = true;
    this.canvas.removeEventListener("click", this._tap);
    this.stage?.removeEventListener("click", this._stageTap);
    window.removeEventListener("resize", this._resize);
    window.removeEventListener("orientationchange", this._resize);
    this.io?.disconnect();
  }

  /** Building time `seconds` that lasts about that long on the wall clock, however fast a replay runs. */
  dur(seconds) { return seconds * (this.mode === "replay" ? Math.max(1, this.speed) : 1); }

  // ── size and layout ─────────────────────────────────────────────────────────────────────────────────────────────
  resize() {
    const w = Math.max(300, Math.floor(this.canvas.parentElement?.getBoundingClientRect().width || this.canvas.getBoundingClientRect().width || 900));
    this.W = w;
    this.phone = w < 560;
    this.liftW = this.phone ? 30 : 44;
    this.land = this.phone ? 8 : 14;                 // the landing beside the lift: where people wait for it and take the stairs
    this.cols1 = w >= 1260 ? 6 : w >= 900 ? 4 : w >= 560 ? 3 : 2;
    const rows1 = 12 / this.cols1;
    this.skyH = SKY_H;
    this.h1 = LABEL_H + rows1 * (ROOM_H + 4) + 4;
    this.hN = LABEL_H + ROOM_H + 8 + (this.phone ? 44 : 0);
    this.hTop = TOP_H;
    this.hBase = this.phone ? 2 * 96 + 12 : BASE_H;
    this.H = SKY_H + this.hTop + 4 * this.hN + this.h1 + GROUND_H + this.hBase + 6;
    let dpr = Math.min(3, window.devicePixelRatio || 1);
    while (dpr > 1 && this.W * this.H * dpr * dpr > 12e6) dpr -= 0.5;          // tablets and phones limit how big one picture may be
    this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.height = `${this.H}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layer = null; this.dirty = true;
  }

  layout() {
    const W = this.W, L = this.liftW, innerX = L + this.land, innerW = W - innerX - 4;
    this.innerX = innerX; this.innerW = innerW;
    this.rooms = []; this.floorRect = {}; this.rows = {};
    const add = (room) => { room.lane = room.virtual ? room.y + room.h - 1 : room.small ? room.y + room.h - 2 : room.y + room.h - 4; this.rooms.push(room); return room; };
    let y = SKY_H;
    this.topRect = { x: L, y, w: W - L, h: this.hTop };
    const aw = Math.max(110, innerW * (this.phone ? 0.42 : 0.3));
    add({ id: "AUDIT", kind: "audit", floor: 6, x: innerX, y: y + LABEL_H, w: aw - 4, h: this.hTop - LABEL_H - 6 });
    const ceo = add({ id: "CEO", kind: "ceo", floor: 6, x: innerX + aw, y: y + LABEL_H, w: innerW - aw, h: this.hTop - LABEL_H - 6 });
    this.rows[6] = [{ top: y, bottom: y + this.hTop, lane: ceo.lane }];
    y += this.hTop;
    for (const f of [5, 4, 3, 2]) {
      this.floorRect[f] = { x: L, y, w: W - L, h: this.hN };
      const gw = this.phone ? innerW / 2 : innerW * 0.36;
      let lane = 0;
      for (let i = 0; i < 2; i++) lane = add({ id: `F${f}R${i}`, kind: "group", floor: f, slot: i, x: innerX + i * gw, y: y + LABEL_H, w: gw - 4, h: ROOM_H }).lane;
      this.rows[f] = [{ top: y, bottom: y + LABEL_H + ROOM_H + 2, lane }];
      if (this.phone) this.rows[f].push({ top: y + LABEL_H + ROOM_H + 2, bottom: y + this.hN, lane: add({ id: `F${f}D`, kind: "discussion", floor: f, small: true, x: innerX, y: y + LABEL_H + ROOM_H + 4, w: innerW, h: 40 }).lane });
      else add({ id: `F${f}D`, kind: "discussion", floor: f, x: innerX + 2 * gw, y: y + LABEL_H, w: innerW - 2 * gw, h: ROOM_H });
      y += this.hN;
    }
    this.floorRect[1] = { x: L, y, w: W - L, h: this.h1 };
    const rw = innerW / this.cols1;
    this.rows[1] = [];
    for (let i = 0; i < 12; i++) {
      const room = add({ id: `F1R${i}`, kind: "group", floor: 1, slot: i, x: innerX + (i % this.cols1) * rw, y: y + LABEL_H + Math.floor(i / this.cols1) * (ROOM_H + 4), w: rw - 4, h: ROOM_H });
      if (i % this.cols1 === 0) this.rows[1].push({ top: room.y - 2, bottom: room.y + ROOM_H + 2, lane: room.lane });
    }
    // floor 1 has no room of its own for discussions: they gather along the floor's sign strip
    add({ id: "F1D", kind: "discussion", floor: 1, virtual: true, x: innerX, y: y + 2, w: innerW, h: LABEL_H - 2 });
    this.groundY = y + this.h1;
    this.baseRect = { x: 0, y: this.groundY + GROUND_H, w: W, h: this.hBase };
    const by = this.baseRect.y + 4, bw = W - 8;
    if (this.phone) {
      add({ id: "ENGINE", kind: "engine", floor: 0, x: 4, y: by, w: bw * 0.6 - 2, h: 96 }); add({ id: "DATA", kind: "data", floor: 0, x: 4 + bw * 0.6 + 2, y: by, w: bw * 0.4 - 2, h: 96 });
      add({ id: "CODE", kind: "code", floor: 0, x: 4, y: by + 100, w: bw * 0.5 - 2, h: 96 }); add({ id: "SANDBOX", kind: "sandbox", floor: 0, x: 4 + bw * 0.5 + 2, y: by + 100, w: bw * 0.5 - 2, h: 96 });
    } else {
      let bx = 4;
      for (const [id, kind, share] of [["ENGINE", "engine", 0.36], ["DATA", "data", 0.2], ["CODE", "code", 0.2], ["SANDBOX", "sandbox", 0.24]]) { add({ id, kind, floor: 0, x: bx, y: by, w: bw * share - 4, h: this.hBase - 8 }); bx += bw * share; }
    }
    this.byId = Object.fromEntries(this.rooms.map((r) => [r.id, r]));
    for (const g of this.groups.values()) g.rect = this.rooms.find((r) => r.kind === "group" && r.floor === g.floor && r.slot === g.room) || null;
    for (const r of this.rooms) if (r.kind === "group") r.group = [...this.groups.values()].find((g) => g.floor === r.floor && g.room === r.slot) || null;
    this.lift.ty = this.liftY(this.lift.floor || 1);
    if (!this.lift.y) this.lift.y = this.lift.ty;
    this.placeStaff();
    this.dirty = true;
  }

  /** The floor managers stand at the end of their floor's sign strip; the auditor sits at the Audit desk. */
  placeStaff() {
    const old = new Map(this.staff.map((m) => [m.id, m]));
    this.staff = [];
    for (const f of [1, 2, 3, 4, 5]) {
      const name = this.firm?.managers?.[String(f)]?.name; if (!name) continue;
      const r = this.floorRect[f], m = old.get(`M${f}`) || { id: `M${f}`, floor: f, phase: f * 1.7 };
      Object.assign(m, { name, look: lookOf(`M${f}`, name, { suit: true }), x: r.x + r.w - 14, y: r.y + LABEL_H + 1, pose: "stand" });
      this.staff.push(m);
    }
    if (this.firm) {
      const d = this.auditSeat(); this.staff.push({ id: "AUD", floor: 4, name: "Audit desk", look: lookOf("AUD", "audit", { suit: true }), x: d.x, y: d.y, pose: "sit", phase: 2.2 });
      const c = this.ceoDesk(); this.staff.push({ id: "CEO", floor: 0, name: "you", tag: "you", look: lookOf("CEO", "the one watching", { suit: true }), x: c.x, y: c.y, pose: "sit", phase: 0.7 });      // whoever is looking at this page
    }
  }

  liftY(floor) { return this.doorOf(floor).y - LIFT_CAR_H; }
  /** Where people get in and out of the lift on a floor: on the landing, level with that floor's walkway. */
  doorOf(floor) { const rows = this.rows[floor >= 6 ? 6 : floor] || [], row = floor === 1 ? rows[rows.length - 1] : rows[0]; return { x: this.liftW + this.land / 2, y: row ? row.lane : this.groundY - 4 }; }

  seatPos(g, i) {
    const r = g.rect; if (!r) return { x: this.liftW + 20, y: this.groundY - 10, cw: 30, cx: 0, top: this.groundY - 60, lane: this.groundY - 4, floor: g.floor };
    const cw = (r.w - 6) / 5, cx = r.x + 3 + i * cw;
    return { x: cx + cw / 2, y: r.y + HEAD_H + 50, cw, cx, top: r.y + HEAD_H, lane: r.lane, floor: g.floor };
  }
  home(id) { const a = this.agents.get(id); const g = a && this.groups.get(a.group); if (!g) return null; const i = g.seats.indexOf(id); return i < 0 ? null : this.seatPos(g, i); }
  /** A discussion room's table: how many sit along it and where the first chair is. */
  tableOf(room) { const per = Math.max(2, Math.floor((room.w - 28) / 14)); return { per, x0: room.x + 19, y: room.y + room.h - 34 }; }
  spot(room, i) {
    if (!room) return { x: this.liftW + 20, y: this.groundY - 8, lane: this.groundY - 4, floor: 1 };
    if (room.virtual || room.small) {
      const gap = 15, per = Math.max(1, Math.floor((room.w - 20) / gap)), row = Math.floor(i / per), col = i % per;
      return { x: room.x + 12 + col * gap + (row % 2) * 7, y: room.lane, lane: room.lane, floor: room.floor };
    }
    const t = this.tableOf(room);
    if (i < t.per) return { x: t.x0 + i * 14, y: t.y, table: true, lane: room.lane, floor: room.floor };
    const j = i - t.per, row = Math.floor(j / t.per), col = j % t.per;
    return { x: t.x0 + 7 + col * 14, y: t.y - 8 - row * 9, lane: room.lane, floor: room.floor };
  }
  auditSeat() { const r = this.byId?.AUDIT; return r ? { x: r.x + r.w - 26, y: r.y + r.h - 20 } : { x: 0, y: 0 }; }
  ceoDesk() { const r = this.byId?.CEO; return r ? { x: r.x + (this.phone ? Math.max(30, r.w * 0.24) : r.w * 0.38), y: r.y + r.h - 20 } : { x: 0, y: 0 }; }
  machine() { const r = this.byId?.ENGINE; return r ? { x: r.x + 8, y: r.y + 21, w: r.w - 16, h: 40 } : { x: 0, y: 0, w: 60, h: 40 }; }
  /** Where things fly to and from: the Engine's core, the sandbox, the Audit desk, the price history. */
  port(name) {
    if (name === "engine") { const m = this.machine(); return { x: m.x + 26, y: m.y + m.h / 2 }; }
    if (name === "sandbox") { const r = this.byId?.SANDBOX; return r ? { x: r.x + 20, y: r.y + 32 } : { x: 0, y: 0 }; }
    if (name === "data") { const r = this.byId?.DATA; return r ? { x: r.x + r.w / 2, y: r.y + 41 } : { x: 0, y: 0 }; }
    if (name === "code") { const r = this.byId?.CODE; return r ? { x: r.x + 30, y: r.y + 30 } : { x: 0, y: 0 }; }
    const d = this.auditSeat(); return { x: d.x - 8, y: d.y - 3 };
  }
  /** Where an agent's own screen is (ideas leave from it and results come back to it). */
  screenOf(id) { const h = this.home(id); return h ? { x: h.cx + 9, y: h.y - 7 } : null; }

  /** Whose desk carries the star (most pips) and the ring (best win rate). Ids from the firm's own numbers, or null. */
  setStars(stars) { this.stars = { pips: stars?.pips || null, win: stars?.win || null }; this.dirty = true; }
  /** Extra facts for the basement's machines (see worldFrom); anything left out is read from the firm's file. */
  setWorld(world) { this.world = { ...worldFrom(this.firm), ...(world || {}) }; this.worldSet = world || null; this.dirty = true; }

  /** The Engine's panel: what it has done, in the firm's own numbers. A replay says that it is one. */
  engineLines() {
    if (this.mode === "live") { const k = this.live?.counters || {}; return [["this shift:", `${fmt(k.ideas_tested ?? 0)} ideas tested`], ["through the Engine:", `${fmt(k.trades_tested ?? 0)} trades`]]; }
    if (this.mode === "replay") return [["replay:", `event ${fmt(this.replayTotal - this.queue.length)} of ${fmt(this.replayTotal)}`], ["tests shown so far:", fmt(this.engine.count)]];
    return [["ideas tested so far:", fmt(this.world.ideas)], ["checked by the Audit desk:", fmt(this.world.verified)]];
  }

  // ── data ────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** The firm's current truth (firm/firm.json) and, when there is one, the live status of a running shift. */
  setData(firm, live) {
    this.firm = firm; this.live = live || null;
    if (this.mode === "replay") return;                 // a replay is showing an earlier moment; the fresh data is used when it ends
    this.world = { ...worldFrom(firm), ...(this.worldSet || {}) };
    this.groups.clear();
    for (const f of [1, 2, 3, 4, 5]) for (const g of firm.floors?.[String(f)]?.groups || []) {
      const seats = [null, null, null, null, null];
      g.members.slice(0, 5).forEach((id, i) => (seats[i] = id));
      this.groups.set(g.id, { id: g.id, floor: f, room: g.room, seats, data: g });
    }
    for (const [id, a] of Object.entries(firm.agents || {})) {
      const cur = this.agents.get(id) || { id, x: 0, y: 0, away: null, hold: 0, chip: null, phase: Math.random() * 6.28, fresh: true, path: [], rides: 0 };
      if (cur.name !== a.name || !cur.look) cur.look = lookOf(id, a.name);
      Object.assign(cur, { name: a.name, level: a.level_n || a.floor, group: a.group, mood: a.mood, status: a.status || "idle", detail: a.status_detail || "", prog: a.progress || null, last: a.last || null });
      this.agents.set(id, cur);
    }
    for (const id of [...this.agents.keys()]) if (!firm.agents?.[id]) this.agents.delete(id);
    this.layout();
    this.applyStatuses(live);
    for (const a of this.agents.values()) if (a.fresh || !this.animations) { this.snap(a); a.fresh = false; }
    this.draw();
  }

  applyStatuses(live) {
    const running = isRunning(live);
    for (const a of this.agents.values()) {
      const s = running ? live.agents?.[a.id] : null;
      if (this.mode === "replay") continue;
      a.status = s?.status || "idle"; a.detail = s?.detail || ""; if (s?.mood) a.mood = s.mood;
      if (!running) { a.away = null; }
      else if (a.status === "in_meeting") { const floor = s.floor || this.groups.get(a.group)?.floor; a.away = floor === 1 && !/discussion/.test(a.detail) ? { huddle: true } : { room: this.rooms.find((r) => r.kind === "discussion" && r.floor === floor) }; }
      else if (a.away && !a.away.sticky) a.away = null;
    }
  }

  /** A fresh live status file (every 15-30 s while a shift runs): statuses now, plus any real events not yet shown. */
  applyLive(live) {
    this.live = live;
    if (this.mode === "replay") return;
    const running = isRunning(live);
    this.mode = running ? "live" : "idle";
    if (live && live.cycle !== this.liveCycle) { this.liveCycle = live.cycle; this.seenLive.clear(); this.primed = false; }
    const events = live?.events || [];
    if (!this.primed) { for (const e of events) this.seenLive.add(key(e)); this.primed = true; }      // what happened before we opened the page is not replayed as "now"
    else if (running) for (const e of events) { const k = key(e); if (!this.seenLive.has(k)) { this.seenLive.add(k); this.queue.push(e); } }
    this.applyStatuses(live);
    if (!this.animations) { while (this.queue.length) this.apply(this.queue.shift(), false); this.snapAll(); this.draw(); }
  }

  /** Replay one finished shift exactly: the seats when it began, then every real event in order. */
  playReplay(replay, { speed = 2, onProgress = null, onEnd = null } = {}) {
    if (!replay || !this.firm) return;
    this.mode = "replay"; this.speed = speed; this.onProgress = onProgress; this.onEnd = onEnd;
    this.replayTotal = (replay.events || []).length; this.replayCycle = replay.cycle;
    this.saved = { groups: new Map([...this.groups].map(([k, g]) => [k, { ...g, seats: [...g.seats] }])), agents: new Map([...this.agents].map(([k, a]) => [k, { group: a.group, level: a.level, mood: a.mood, name: a.name }])) };
    const startGroups = replay.start?.groups || {}, startAgents = replay.start?.agents || {};
    for (const g of this.groups.values()) { const s = startGroups[g.id]; if (s) { g.floor = s[0]; g.room = s[1]; } g.seats = [null, null, null, null, null]; g.playing = null; }
    for (const [id, [floor, gid]] of Object.entries(startAgents)) {
      const a = this.agents.get(id), g = this.groups.get(gid); if (!a || !g) continue;
      a.group = gid; a.level = floor; a.status = "idle"; a.detail = ""; a.away = null; a.chip = null; a.mood = "neutral";
      const i = g.seats.indexOf(null); if (i >= 0) g.seats[i] = id;
    }
    this.engine.count = 0; this.flights = []; this.texts = []; this.shot = null; this.gathering = null;
    this.layout(); this.snapAll();
    this.queue = [...(replay.events || [])]; this.nextAt = this.clock + 0.6;
    this.say(`Replay of shift ${replay.cycle}: ${this.replayTotal} real events`);
  }

  stopReplay(silent = false) {
    if (this.mode !== "replay") return;
    this.queue = []; this.mode = "idle"; this.lift.riders = []; this.rides = []; this.effects = []; this.flights = []; this.texts = []; this.shot = null; this.gathering = null;
    if (this.firm) this.setData(this.firm, this.live);
    for (const a of this.agents.values()) { a.away = null; a.chip = null; a.rides = 0; this.snap(a); }
    if (!silent) this.onEnd?.();
  }

  say(text, seconds = 3) { this.banner = { text, until: this.wall + seconds }; }

  // ── real events -> what you see ─────────────────────────────────────────────────────────────────────────────────
  members(e) { return (e.members || (e.agent ? [e.agent] : (this.groups.get(e.group)?.seats || []))).filter((id) => id && this.agents.has(id)); }

  apply(e, animate = true) {
    const A = (id) => this.agents.get(id);
    const chip = (id, text, color, secs = 2.2, delay = 0) => { const a = A(id); if (a && animate) a.chip = { text, color, born: this.clock + delay, until: this.clock + delay + this.dur(secs) }; };
    const ids = this.members(e);
    switch (e.kind) {
      case "thinking": { const a = A(e.agent); if (a) { a.status = "thinking"; a.detail = ""; a.hold = this.clock + this.dur(1.6); } break; }
      case "looked": {                                     // it read some code, or asked the Engine a question
        const a = A(e.agent); if (!a) break;
        a.status = "researching"; a.detail = String(e.what || e.tool || ""); a.look_tool = e.tool; a.hold = this.clock + this.dur(1.8);
        const s = this.screenOf(a.id);
        if (animate && s) {
          if (e.tool === "read_code") this.fly(this.port("code"), s, "#5aa9ff", 0, this.dur(0.6));                       // the code comes up from the code room
          else if (e.tool === "breakdown" || e.tool === "compare_exits") { this.fly(s, this.port("engine"), TEAL, 0, this.dur(0.4), "engine"); this.fly(this.port("engine"), s, TEAL, this.dur(0.4), this.dur(0.4)); }
        }
        break;
      }
      case "tested": {
        const a = A(e.agent) || A((this.groups.get(e.group)?.seats || []).find(Boolean));
        if (a) {
          a.status = "testing"; a.hold = this.clock + this.dur(0.9);
          const v = e.pips != null ? e.pips : e.month_score, search = e.by === "engine search", own = e.by === "first test";
          const good = v != null && v > 0, screen = this.screenOf(a.id);
          let delay = 0;
          if (animate && screen && this.flights.length < MAX_FLIGHTS) {
            // the idea goes down to the Engine and its real result comes back; the Engine's own search starts at the Engine
            if (search) { delay = this.dur(0.5); this.fly(this.port("engine"), screen, TEAL, 0, delay, "desk"); }
            else if (own) { delay = this.dur(0.9); this.fly(this.port("sandbox"), this.port("engine"), PURPLE, 0, this.dur(0.45), "engine"); this.fly(this.port("engine"), screen, good ? GOOD : BAD, this.dur(0.45), this.dur(0.45), "desk"); }
            else { delay = this.dur(0.9); this.fly(screen, this.port("engine"), "#ffe066", 0, this.dur(0.45), "engine"); this.fly(this.port("engine"), screen, v == null ? PAPER : good ? GOOD : BAD, this.dur(0.45), this.dur(0.45), "desk"); }
          }
          if (animate) this.engine.count += 1;
          if (v != null) chip(a.id, `${search ? "⚙ " : ""}${v > 0 ? "+" : ""}${Math.round(v)}${e.pips != null ? "p" : ""}${e.win != null && e.pips != null ? " " + Math.round(e.win) + "%" : ""}`, good ? GOOD : BAD, search ? 1.5 : 2.2, delay);
        }
        break;
      }
      case "coded": {
        const id = e.agent || (this.groups.get(e.group)?.seats || []).find(Boolean);
        if (id) { chip(id, e.what === "strategy" ? "</> own strategy" : e.what === "team strategy" ? "</> team code" : "</> feature", PURPLE, 3.2); const s = this.screenOf(id); if (animate && s) this.fly(s, this.port("sandbox"), PURPLE, 0, this.dur(0.7), "sandbox"); }
        if (e.group && animate) this.flash(e.group, PURPLE, 1.2);
        break;
      }
      case "turn_failed": break;
      case "meeting_start": { const floor = e.floor || this.groups.get(e.group)?.floor, room = this.rooms.find((r) => r.kind === "discussion" && r.floor === floor);
        ids.forEach((id) => { const a = A(id); a.away = floor === 1 && !e.discussion ? { huddle: true, sticky: true } : { room, sticky: true }; a.status = "in_meeting"; a.detail = e.discussion ? "floor discussion" : "group meeting"; a.hold = this.clock + this.dur(30); }); break; }
      case "meeting": case "meeting_failed": { const who = e.members ? ids : (this.groups.get(e.group)?.seats || []).filter(Boolean); who.forEach((id) => { const a = A(id); if (a) { a.away = null; a.status = "idle"; a.hold = 0; } });
        if (e.group && e.strategy && animate) { this.flash(e.group, GOOD, 1.2); this.word(e.team_code ? `team code ${e.team_code}` : `agreed ${e.strategy}`, this.groups.get(e.group)?.rect, GOOD); } break; }
      case "challenge_start": { ids.forEach((id) => { const a = A(id); a.status = "testing"; a.detail = `floor ${e.floor} challenge`; a.hold = this.clock + this.dur(2.5); }); const g = e.solo ? null : this.groups.get(e.group); if (g && animate) g.playing = { from: this.clock, secs: this.dur(1.5) }; break; }
      case "challenge_failed": { ids.forEach((id) => { const a = A(id); a.mood = "frustrated"; a.status = "idle"; a.hold = 0; }); if (e.solo) chip(e.agent, "not passed", BAD); else if (animate) { this.flash(e.group, BAD, 1); this.word("not passed", this.groups.get(e.group)?.rect, BAD); } break; }
      case "audit_start": ids.forEach((id) => { const a = A(id); a.status = "waiting_audit"; a.detail = ""; a.hold = this.clock + this.dur(30); });
        this.auditing = { who: e.agent ? first(A(e.agent)?.name) : e.group, floor: e.floor, until: this.clock + this.dur(4) };
        if (animate) { const from = e.agent ? this.screenOf(e.agent) : this.groups.get(e.group)?.rect; if (from) this.fly(from.w ? { x: from.x + from.w / 2, y: from.y + 30 } : from, this.port("audit"), AMBER, 0, this.dur(0.8)); }
        break;
      case "audit_failed": ids.forEach((id) => { const a = A(id); a.away = null; a.status = "idle"; a.mood = "frustrated"; a.hold = 0; }); this.auditing = null;
        if (e.agent) chip(e.agent, "audit disagreed", BAD, 3); else if (animate) this.flash(e.group, BAD, 1.2);
        if (animate) this.word("audit disagreed", this.byId.AUDIT, BAD); break;
      case "solo_passed_no_seat": { const a = A(e.agent); if (a) { a.away = null; a.status = "idle"; a.mood = "proud"; a.hold = 0; chip(e.agent, "passed ✓ waiting for a seat", AMBER, 3.5); } break; }
      case "battle": if (animate) { this.flash(e.challenger, AMBER, 1.4); this.flash(e.incumbent, AMBER, 1.4); this.word("promotion battle", this.groups.get(e.challenger)?.rect, AMBER); }
        (this.groups.get(e.challenger)?.seats || []).forEach((id) => { const a = A(id); if (a) { a.away = null; a.status = "idle"; a.hold = 0; } }); break;
      case "level_up": case "swapped_down": this.move(e, ids, animate); break;
      case "transfer": { const a = A(e.agent), b = A(e.swapped), fa = a && this.groups.get(a.group)?.floor, fb = b && this.groups.get(b.group)?.floor;
        this.reseat(e.agent, e.to_group); this.reseat(e.swapped, e.from_group); if (a) a.mood = "happy"; if (b) b.mood = "frustrated";
        if (!animate) { if (a) this.snap(a); if (b) this.snap(b); }
        else if (a && b && fa != null && fb != null && fa !== fb) { a.shirt = fa; b.shirt = fb; this.ride([a.id], fa, fb); this.ride([b.id], fb, fa); }       // a seat on another floor: by lift
        break; }
      case "rotation": { const a = A(e.agent); if (a) { a.name = e.new_name || a.name; a.look = lookOf(a.id, a.name); a.mood = "neutral"; a.prog = null; this.dirty = true; chip(e.agent, "new Analyst", "#5aa9ff", 3); } break; }
      case "retest_failed": if (animate) this.flash(e.group, BAD, 1.2); break;
      case "data_update": if (animate) { this.say(`New price data: ${e.months} months on file`, 3); const p = this.port("data"); this.fly({ x: p.x - 60, y: this.groundY - 6 }, p, "#5aa9ff", 0, this.dur(0.8)); } break;
      default: break;
    }
    if (animate) this.point(e);
    return (STEP[e.kind] ?? 0.2);
  }

  flash(gid, color, secs) { if (gid) this.flashes.push({ gid, color, until: this.clock + this.dur(secs), secs: this.dur(secs) }); }
  /** A word that rises over a room and fades: only ever something that really happened ("not passed", "LEVEL UP"). */
  word(text, rect, color, big = false) { if (rect) this.texts.push({ text, x: rect.x + rect.w / 2, y: rect.y + (rect.h > 60 ? 46 : rect.h / 2), born: this.clock, until: this.clock + this.dur(big ? 3 : 2.2), color, big }); }
  /** Something small flies from one place to another: an idea to the Engine, a result back, code to the sandbox. */
  fly(from, to, color, delay, dur, hit = null) {
    if (!from || !to || this.flights.length >= MAX_FLIGHTS) return;
    const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2, far = Math.hypot(to.x - from.x, to.y - from.y);
    this.flights.push({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, cx: mx + (from.y < to.y ? -1 : 1) * Math.min(90, far * 0.22), cy: my, t0: this.clock + delay, dur: Math.max(0.05, dur), color, hit });
  }

  reseat(id, gid) {
    const a = this.agents.get(id), to = this.groups.get(gid); if (!a || !to) return;
    const from = this.groups.get(a.group);
    if (from) {
      const i = from.seats.indexOf(id);
      if (i >= 0) from.seats[i] = null;
      if (from.seats.length > 5) { const extra = from.seats.pop(); if (extra && i >= 0 && i < 5) from.seats[i] = extra; else if (extra) from.seats.push(extra); }
    }
    const j = to.seats.indexOf(null);
    if (j >= 0) to.seats[j] = id; else to.seats.push(id);          // a sixth waits by the wall until the one it replaces has left
    a.group = gid; a.level = to.floor; a.away = null; a.atTable = false;
    this.dirty = true;
  }

  move(e, ids, animate) {
    const up = e.kind === "level_up", from = e.from, to = e.to;
    if (e.solo) { this.reseat(e.agent, e.group); }
    else {
      const g = this.groups.get(e.group);
      if (g) {
        g.floor = to;
        if (e.room != null) g.room = e.room;
        else { const taken = new Set([...this.groups.values()].filter((x) => x !== g && x.floor === to).map((x) => x.room)); let r = 0; while (taken.has(r) && r < 12) r++; g.room = r; }
        this.layout();
      }
    }
    for (const id of ids) { const a = this.agents.get(id); if (animate && a.shirt == null) a.shirt = from; a.level = to; a.mood = up ? "happy" : "frustrated"; a.status = "idle"; a.hold = 0; a.away = null; a.atTable = false; }
    if (!animate) { ids.forEach((id) => this.snap(this.agents.get(id))); return; }
    if (up && this.auditing) { this.word("verified ✓", this.byId.AUDIT, GOOD); this.auditing = null; }
    this.ride(ids, from, to, { up, skip: !!e.skip, cheer: up, label: up ? (e.skip ? "SKIPPED A FLOOR!" : "LEVEL UP") : "" });
  }

  /** Book the lift. Rides are taken one at a time, in the order things happened; riders walk to the door and wait. */
  ride(ids, from, to, opts = {}) {
    ids = ids.filter((id) => this.agents.has(id)); if (!ids.length || from === to) return;
    for (const id of ids) { const a = this.agents.get(id); a.rides = (a.rides || 0) + 1; }
    this.dirty = true;
    const waiting = !opts.cheer && this.rides.find((r) => r.stage === 0 && !r.cheer && r.from === from && r.to === to && r.ids.length + ids.length <= 6);
    if (waiting) waiting.ids.push(...ids);                 // going the same way and not yet called: one ride
    else this.rides.push({ ids, from, to, up: to > from, stage: 0, t: 0, ...opts });
  }
  pathToDoor(a, floor, i) {
    const door = this.doorOf(floor), lane = a.lane ?? door.y, pts = [];
    if (Math.abs(a.y - lane) > 0.5) pts.push({ x: a.x, y: lane, lane });
    if (Math.abs(lane - door.y) > 0.5) pts.push({ x: door.x, y: lane, lane });
    pts.push({ x: door.x + (Math.abs(lane - door.y) > 0.5 ? 0 : (i % 3) * 4), y: door.y, lane: door.y });
    return pts;
  }

  runRides() {
    const r = this.rides[0]; if (!r) return;
    const there = Math.abs(this.lift.y - this.lift.ty) < 1.5, riders = r.ids.map((id) => this.agents.get(id)).filter(Boolean);
    if (r.stage === 0) {
      r.stage = 1; r.t = this.clock; this.lift.ty = this.liftY(r.from); this.lift.floor = r.from;
      riders.forEach((a, i) => { if (a.at != null && a.at !== r.from) { const d = this.doorOf(r.from); a.x = d.x; a.y = d.y; a.lane = d.y; a.at = r.from; } a.ride = true; a.destKey = null; a.atTable = false; a.path = this.pathToDoor(a, r.from, i); });
    } else if (r.stage === 1 && there && this.clock - r.t > 0.5 && (this.clock - r.t > this.dur(7) || riders.every((a) => !a.path.length && !a.walking))) {
      r.stage = 2; r.t = this.clock; this.lift.riders = r.ids; this.lift.ty = this.liftY(r.to); this.lift.floor = r.to;
    } else if (r.stage === 2 && there && this.clock - r.t > 0.5) {
      this.lift.riders = [];
      const door = this.doorOf(r.to);
      riders.forEach((a, i) => { a.x = door.x + (r.cheer ? 4 + i * 8 : (i % 3) * 4); a.y = door.y; a.lane = door.y; a.at = r.to; a.path = []; a.ride = false; a.rides = Math.max(0, (a.rides || 1) - 1); a.destKey = null;
        if (!a.rides) a.shirt = null;                                                                // arrived: the new floor's colour
        if (r.cheer) { a.cheerUntil = this.clock + this.dur(1.8); a.pause = this.clock + this.dur(1.6); } });
      this.dirty = true;
      if (r.cheer) { const rect = this.floorRect[r.to] || this.topRect; this.celebrate(rect, r.skip ? 140 : 60, r.skip); if (r.label) this.texts.push({ text: r.label, x: door.x + 60, y: door.y - 34, born: this.clock, until: this.clock + this.dur(3.2), color: r.skip ? AMBER : GOOD, big: true }); }
      this.rides.shift();
    }
  }

  // ── motion ──────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Where an agent is meant to be: at the meeting, standing with its group, or at its own desk. */
  dest(a) {
    if (a.away?.room) { const list = [...this.agents.values()].filter((x) => x.away?.room === a.away.room), i = Math.max(0, list.indexOf(a)); return { ...this.spot(a.away.room, i), key: `room:${a.away.room.id}:${i}` }; }
    const h = this.home(a.id); if (!h) return null;
    if (a.away?.huddle) { const r = this.groups.get(a.group)?.rect; return r ? { x: h.x + (r.x + r.w / 2 - h.x) * 0.55, y: r.lane, lane: r.lane, floor: h.floor, key: `huddle:${a.group}` } : { ...h, key: "home" }; }
    return { x: h.x, y: h.y, lane: h.lane, floor: h.floor, seat: true, key: `home:${a.group}:${Math.round(h.x)}:${Math.round(h.y)}` };
  }
  target(a) { return a.path?.length ? a.path[0] : this.dest(a); }
  /** The way from where an agent stands to a place on the same floor: out to the walkway, along it, by the stairs
   *  on the landing when the place is on another row of rooms, and along that walkway. The last step is the place. */
  plan(a, d) {
    const lane = a.lane ?? d.lane, pts = [];
    if (Math.abs(lane - d.lane) < 0.5) {
      if (Math.abs(a.x - d.x) < 3) return pts;
      if (Math.abs(a.y - lane) > 0.5) pts.push({ x: a.x, y: lane, lane });
      pts.push({ x: d.x, y: d.lane, lane: d.lane });
    } else {
      const lx = this.liftW + this.land / 2;
      if (Math.abs(a.y - lane) > 0.5) pts.push({ x: a.x, y: lane, lane });
      pts.push({ x: lx, y: lane, lane }, { x: lx, y: d.lane, lane: d.lane }, { x: d.x, y: d.lane, lane: d.lane });
    }
    return pts;
  }
  snap(a) {
    if (!a) return;
    a.path = []; a.ride = false; a.destKey = null; a.pause = 0; a.shirt = null;
    const d = this.dest(a);
    if (d) { a.x = d.x; a.y = d.y; a.lane = d.lane; a.at = d.floor; a.atTable = !!d.table; a.destKey = d.key; if (d.seat) a.chair = { x: d.x, y: d.y }; }
    a.walking = false;
  }
  snapAll() { this.rides = []; this.lift.riders = []; for (const a of this.agents.values()) { a.rides = 0; this.snap(a); } this.lift.y = this.lift.ty; }

  /** How an agent is drawn right now. */
  poseOf(a) {
    if (this.lift.riders.includes(a.id)) return "stand";
    if (a.walking) return "walk";
    if (a.cheerUntil && this.clock < a.cheerUntil) return "cheer";
    if (a.atTable) return "table";
    const near = (p) => p && Math.abs(a.x - p.x) < 1.5 && Math.abs(a.y - p.y) < 1.5;
    return near(this.home(a.id)) || near(a.chair) ? "sit" : "stand";       // in its own chair - or still in its old one, waiting for the lift
  }

  tick(dt) {
    const sp = this.mode === "replay" ? this.speed : 1;
    this.clock += dt * sp; this.wall += dt;
    // the director: one real event at a time
    if (this.queue.length && this.clock >= this.nextAt && this.animations && this.rides.length < 2 && this.gathered()) {
      const e = this.queue.shift();
      let wait = this.apply(e, true);
      // a meeting is shown properly: the next event waits until everyone has walked there and sat down a moment
      if (e.kind === "meeting_start") this.gathering = { ids: this.members(e), until: this.clock + this.dur(12), sit: this.dur(1.6), at: null };
      const n = this.queue[0];
      const pair = n && ((e.kind === "swapped_down" && !e.solo && n.kind === "level_up" && !n.solo && n.from === e.to && n.to === e.from)      // a won promotion battle
        || (e.kind === "level_up" && e.solo && n.kind === "swapped_down" && n.solo && n.from_group === e.group));                              // moving up alone
      if (pair) { const first = this.shot?.ids ? [...this.members(e)] : null; wait += this.apply(this.queue.shift(), true); if (first && this.shot?.ids) this.shot.ids = [...first, ...this.shot.ids]; }      // the camera stays with both halves of the move
      this.nextAt = this.clock + wait;
      if (this.mode === "replay") { try { this.onProgress?.(this.replayTotal - this.queue.length, this.replayTotal, e); } catch { /* a caption must never stop the replay */ } }
    }
    // a replay ends when its last event has played out: the last walk walked, the last celebration over (or after a long wait, whatever is still moving)
    if (this.mode === "replay" && !this.queue.length && this.clock >= this.nextAt + 1.5 && !this.rides.length && (this.settled() || this.clock >= this.nextAt + this.dur(25))) {
      this.mode = "idle"; this.say(`Shift ${this.replayCycle}: end of the replay`, 4); const done = this.onEnd; this.finish(); done?.();
    }
    this.runRides();
    this.lift.y += (this.lift.ty - this.lift.y) * clamp(dt * sp * 3.2, 0, 1);
    const reach = 95 * sp * dt;                                  // how far a person walks in this tick
    for (const a of this.agents.values()) {
      const riding = this.lift.riders.indexOf(a.id);
      if (riding >= 0) {                                                                            // in the lift: two rows when it is full
        const n = this.lift.riders.length, per = n > 3 ? Math.ceil(n / 2) : n, row = riding >= per ? 1 : 0, col = row ? riding - per : riding, inRow = row ? n - per : per;
        a.x = this.liftW / 2 + (col - (inRow - 1) / 2) * Math.min(8, (this.liftW - 16) / Math.max(1, inRow)); a.y = this.lift.y + LIFT_CAR_H - (row ? 0 : 2.5); a.walking = false; continue;
      }
      if (a.pause && this.clock < a.pause) a.walking = false;                                       // a moment to celebrate
      else if (a.rides) {                                                                           // booked on the lift: walk to the door, or wait for its turn
        if (a.ride && a.path.length) { if (this.step(a, a.path[0], reach)) { const w = a.path.shift(); if (w.lane != null) a.lane = w.lane; a.walking = a.path.length > 0; } }
        else a.walking = false;
      } else {
        const d = this.dest(a);
        if (!d) a.walking = false;
        else if (a.at != null && d.floor != null && a.at !== d.floor) { this.ride([a.id], a.at, d.floor); a.walking = false; }       // its place is on another floor: by lift (those going the same way share it)
        else {
          if (a.destKey !== d.key) { a.destKey = d.key; a.atTable = false; a.path = this.plan(a, d); }
          if (a.path.length) { if (this.step(a, a.path[0], reach)) { const w = a.path.shift(); if (w.lane != null) a.lane = w.lane; a.walking = true; } }
          else if (this.step(a, d, reach)) { a.lane = d.lane; a.at = d.floor; a.atTable = !!d.table; if (d.seat) a.chair = { x: d.x, y: d.y }; }
        }
      }
      if (a.hold && this.clock > a.hold && this.mode !== "live") { a.hold = 0; if (a.status !== "idle" && !a.away) { a.status = "idle"; a.detail = ""; } }
      if (a.chip && this.clock > a.chip.until) a.chip = null;
    }
    // things in flight land: the Engine pulses, the sandbox lights up
    let arrived = 0;
    this.flights = this.flights.filter((f) => {
      if (this.clock < f.t0 + f.dur) return true;
      if (f.hit === "engine") { this.engine.pulse = 1; arrived += 1; } else if (f.hit === "sandbox") this.sandboxPulse = 1;
      else if (f.hit === "desk" && this.effects.length < 260) for (let i = 0; i < 7; i++) this.effects.push({ x: f.x1, y: f.y1, vx: (Math.random() - 0.5) * 2.2, vy: -Math.random() * 1.8 - 0.3, life: 16 + Math.random() * 14, c: f.color, size: 1.6 });
      return false;
    });
    const e = this.engine, working = this.world.hasData && !this.world.paused;
    e.activity += ((arrived ? 1 : 0) - e.activity) * clamp(dt * 2.5, 0, 1); e.pulse *= Math.exp(-dt * 3.2); this.sandboxPulse *= Math.exp(-dt * 1.6);
    if (working) e.spin += dt * (0.25 + e.activity * 7 + (this.mode === "live" ? 0.8 : 0));
    for (const g of this.groups.values()) if (g.playing && this.clock > g.playing.from + g.playing.secs + this.dur(1.2)) g.playing = null;      // the challenge screen goes back up
    this.flashes = this.flashes.filter((f) => this.clock < f.until);
    this.texts = this.texts.filter((f) => this.clock < f.until);
    this.effects = this.effects.filter((p) => p.life > 0);
    for (const p of this.effects) { p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += 0.09 * dt * 60; p.life -= dt * 60; }
    this.film(dt);
  }

  /** One step towards a point. True when the point is reached. */
  step(a, t, reach) {
    const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
    if (d < 1.2) { a.x = t.x; a.y = t.y; a.walking = false; return true; }
    const s = Math.min(d, reach); a.x += (dx / d) * s; a.y += (dy / d) * s; a.walking = true;
    if (Math.abs(dx) > 0.4) a.facing = dx > 0 ? 1 : -1;
    return false;
  }

  /** True unless a meeting is still gathering. Once everyone called to it has arrived they sit a moment; a meeting
   *  that takes too long to gather is not waited for (the next event may be the one that ends it). */
  gathered() {
    const g = this.gathering; if (!g) return true;
    if (this.clock >= g.until) { this.gathering = null; return true; }
    const here = g.ids.every((id) => { const a = this.agents.get(id); return !a || (!a.walking && !a.path.length && !a.rides); });
    if (!here) { g.at = null; return false; }
    if (g.at == null) g.at = this.clock;
    if (this.clock - g.at < g.sit) return false;
    this.gathering = null; return true;
  }

  /** Nothing is still on its way: nobody walking or celebrating, nothing in flight, no words in the air. */
  settled() { return !this.flights.length && !this.texts.length && ![...this.agents.values()].some((a) => a.walking || a.rides || (a.pause && this.clock < a.pause) || (a.cheerUntil && this.clock < a.cheerUntil)); }

  finish() { this.shot = null; if (this.firm) { const f = this.firm, l = this.live; this.flights = []; this.setData(f, l); for (const a of this.agents.values()) { a.away = null; a.rides = 0; this.snap(a); } } }

  celebrate(rect, n, big) {
    for (let i = 0; i < n; i++) this.effects.push({ x: rect.x + Math.random() * rect.w, y: rect.y + rect.h * 0.6, vx: (Math.random() - 0.5) * (big ? 5 : 3), vy: -Math.random() * (big ? 5 : 3) - 1, life: 60 + Math.random() * 50, c: Object.values(LEVEL_COLORS)[i % 5], size: i % 3 ? 3 : 2 });
  }

  busy() {
    return this.queue.length || this.rides.length || this.effects.length || this.flashes.length || this.flights.length || this.texts.length || this.banner || this.auditing || this.camMoving
      || [...this.agents.values()].some((a) => a.walking || a.chip || WORKING.has(a.status) || a.away);
  }

  loop() {
    if (this.dead) return;
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    try {
      const seen = (this.visible || (this.stage && this.stageVisible !== false)) && document.visibilityState !== "hidden";
      if (seen) {
        if (this.animations) { this.tick(dt); this.draw(); }
        else if (now - (this.lastStill || 0) > 1500) { this.lastStill = now; this.draw(); }
      }
    } catch (error) { console.error("building:", error); }      // one bad event must not freeze the building
    // full speed only while something is actually happening; otherwise a slow heartbeat (kind to the iPad's battery)
    if (this.animations && this.busy()) requestAnimationFrame(() => this.loop());
    else setTimeout(() => requestAnimationFrame(() => this.loop()), this.animations ? 170 : 400);
  }

  // ── the camera (only when a stage canvas is attached) ─────────────────────────────────────────────────────────────
  /** A second, close-up picture of the same world. It goes wherever the latest real event is. */
  attachStage(canvas) {
    this.stage = canvas; this.sctx = canvas.getContext("2d");
    this._stageTap = (e) => this.tapStage(e);
    canvas.addEventListener("click", this._stageTap);
    this.io?.observe(canvas);
    this.resizeStage();
  }
  resizeStage() {
    if (!this.stage) return;
    const box = this.stage.parentElement?.getBoundingClientRect() || { width: 800, height: 0 };
    const w = Math.max(280, Math.floor(box.width || 800)), full = typeof document !== "undefined" && (document.fullscreenElement || document.webkitFullscreenElement) === this.stage.parentElement;
    this.sw = w; this.sh = full ? Math.max(230, Math.floor(window.innerHeight || box.height || 450)) : clamp(Math.round(w * 0.5), 230, 450);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.sdpr = dpr; this.stage.width = Math.round(this.sw * dpr); this.stage.height = Math.round(this.sh * dpr); this.stage.style.height = `${this.sh}px`;
    if (!this.cam) this.cam = { x: this.W / 2, y: this.H / 2, s: 1.4 };
  }

  /** Hold the camera on one place ("top", a floor "5".."1", "basement") until follow() lets it go again. */
  hold(key) { this.manual = String(key); this.shot = null; this.camMoving = true; }
  follow() { this.manual = null; this.shot = null; this.camMoving = true; }
  /** The place a held camera looks at, and what to call it. */
  heldPlace() {
    const k = this.manual, L = this.liftW;
    if (k === "top") return { rect: { x: L, y: 0, w: this.W - L, h: this.skyH + this.hTop }, name: "Top floor: the Audit desk and the CEO's office" };
    if (k === "basement") return { rect: { x: 0, y: this.groundY - 4, w: this.W, h: this.hBase + GROUND_H + 8 }, name: "The basement: the Engine, the price history, the code room and the sandbox" };
    const f = +k; if (!this.floorRect[f]) return null;
    const r = this.floorRect[f];
    return { rect: { x: 0, y: r.y, w: this.W, h: r.h }, name: `Floor ${f} · ${LEVEL_NAMES[f]}` };
  }

  /** The camera's view of a world rectangle: its middle, and the zoom that fits it above the caption. */
  frame(rect, pad = 16, min = 1.15) {
    const sw = this.sw || 800, sh = (this.sh || 400) - 34;
    const s = clamp(Math.min(sw / (rect.w + pad * 2), sh / (rect.h + pad * 2)), min, 3.4);
    const vw = sw / s, vh = sh / s;
    return { x: vw >= this.W ? this.W / 2 : clamp(rect.x + rect.w / 2, vw / 2, this.W - vw / 2), y: vh >= this.H ? this.H / 2 : clamp(rect.y + rect.h / 2, vh / 2, this.H - vh / 2), s };
  }

  /** Where a real event happened, for the camera. */
  placeOf(e) {
    const g = (id) => this.groups.get(id), a = (id) => this.agents.get(id), room = (gr) => gr?.rect || null;
    switch (e.kind) {
      case "meeting_start": case "meeting": case "meeting_failed": { const floor = e.floor || g(e.group)?.floor, d = this.rooms.find((r) => r.kind === "discussion" && r.floor === floor);
        if (floor === 1 && !e.discussion) return { rect: room(g(e.group)) };
        return d ? { rect: d.virtual || d.small ? { x: d.x, y: d.y - 14, w: Math.min(d.w, 330), h: d.h + 26 } : d } : null; }
      case "audit_start": case "audit_failed": return { rect: this.byId.AUDIT };
      case "level_up": case "swapped_down": return { follow: this.members(e)[0], ids: this.members(e), rect: room(g(e.group)) };
      case "transfer": return { follow: e.agent, ids: [e.agent, e.swapped].filter(Boolean), rect: room(g(e.to_group)) };
      case "data_update": return { rect: this.byId.DATA };
      case "battle": return { rect: room(g(e.challenger)) };
      default: return { rect: room(g(e.agent ? a(e.agent)?.group : e.group)) };
    }
  }

  /** Give the camera to a real event, if it matters more than what is showing or the current picture has had its time. */
  point(e) {
    this.lastEventAt = this.wall;
    if (!this.stage) return;
    if (this.manual) { try { this.lastLine = this.describe?.(e) || ""; } catch { this.lastLine = ""; } return; }       // the camera is being held: it stays, and says what is happening
    const [pri, hold] = SHOT[e.kind] || [1, 2], cur = this.shot;
    const where = this.placeOf(e); if (!where || (!where.rect && !where.follow)) return;
    let label = "";
    try { label = this.describe?.(e) || ""; } catch { label = ""; }
    label = label || String(e.kind || "").replaceAll("_", " ");
    if (cur && cur.real && this.wall < cur.until) {
      if (where.rect && cur.rect === where.rect && !cur.follow && pri >= cur.pri) { cur.label = label; cur.pri = pri; cur.until = Math.max(cur.until, this.wall + Math.min(hold, 1.8)); return; }      // more in the room on screen: stay, and say so
      if (!(pri > cur.pri || (pri === cur.pri && pri > 1 && this.wall >= cur.lock))) return;                                                                                                      // the picture on screen keeps its time
    }
    this.shot = { ...where, pri, until: this.wall + hold, lock: this.wall + Math.min(hold, 1.5), label, color: e.kind === "level_up" ? GOOD : e.kind === "challenge_failed" || e.kind === "audit_failed" ? "#ffb3b3" : PAPER, real: true };
  }

  /** With no event to show, the camera walks round the building. Each stop says where it is and what is true there. */
  tour() {
    const wd = this.world, stops = [];
    const state = this.mode === "live" ? "A shift is running." : this.mode === "replay" ? `This is the replay of shift ${this.replayCycle}.`
      : wd.paused ? (wd.hasData ? "The firm is paused: nobody is working." : "The firm is paused. There is no price history yet, so nobody can work.") : "Between shifts: everyone is at their desk.";
    if (this.stars.pips && this.home(this.stars.pips)) stops.push({ rect: this.groups.get(this.agents.get(this.stars.pips).group)?.rect, label: `${this.agents.get(this.stars.pips).name} has the most pips so far (the star on the desk).` });
    stops.push({ rect: this.byId.ENGINE, label: wd.hasData ? `The Engine: ${fmt(wd.ideas)} ideas tested so far, ${fmt(wd.verified)} checked by the Audit desk.` : "The Engine is waiting for price history. Nothing can be tested until it arrives." });
    stops.push({ rect: { x: this.topRect.x + this.land, y: this.topRect.y + 8, w: Math.min(this.topRect.w - this.land, 420), h: this.topRect.h - 8 }, label: "Top floor: the Audit desk re-runs every level-up from scratch." });
    for (const f of [5, 4, 3, 2]) { const r = this.byId[`F${f}R0`]; if (r) stops.push({ rect: { x: r.x, y: r.y - 6, w: r.w * 2 + 8, h: r.h + 10 }, label: `Floor ${f} · ${LEVEL_NAMES[f]}. ${state}` }); }
    for (const i of [0, this.cols1, 11]) { const r = this.byId[`F1R${i}`]; if (r) stops.push({ rect: r, label: `Floor 1 · Analysts: ${r.group ? "group " + r.group.id : "a room"}. ${state}` }); }
    stops.push({ rect: this.byId.SANDBOX, label: `The sandbox: code an agent wrote runs only here. ${fmt(wd.strategies.active)} in use, ${fmt(wd.strategies.waiting)} waiting.` });
    stops.push({ rect: this.byId.DATA, label: wd.hasData ? `Price history on file: ${wd.data.map((d) => `${d.label} ${d.months} months`).join(", ")}.` : "Price history: none yet." });
    return stops.filter((s) => s.rect);
  }

  film(dt) {
    if (!this.stage || !this.cam) return;
    const riding = this.rides[0]?.ids.map((id) => this.agents.get(id)).find(Boolean);
    if (this.shot?.follow) {
      const mine = (this.shot.ids || [this.shot.follow]).map((id) => this.agents.get(id)).filter((a) => a && (a.rides || a.walking || (a.pause && this.clock < a.pause)));
      const lead = mine.find((a) => this.lift.riders.includes(a.id)) || mine.find((a) => a.ride && a.walking) || mine.find((a) => a.walking) || mine[0];
      if (lead) { this.shot.follow = lead.id; this.shot.until = Math.max(this.shot.until, this.wall + 2.2); }
    }
    if (riding && (!this.shot || !this.shot.real || this.wall >= this.shot.until)) {
      const r = this.rides[0];                                                                     // people are on their way to the lift and nothing else is showing: go with them
      this.shot = { follow: riding.id, rect: null, pri: 2, until: this.wall + 2.2, lock: 0, label: `${first(riding.name)}${r.ids.length > 1 ? ` and ${r.ids.length - 1} more` : ""}: by lift from floor ${r.from} to floor ${r.to}`, color: PAPER, real: true };
    }
    if (this.manual) {                                                                     // held on one place by the person watching
      const m = this.heldPlace();
      if (m) {
        const recent = this.lastLine && this.wall - this.lastEventAt < 4 ? ` Just now: ${this.lastLine}` : "";
        this.shot = { rect: m.rect, pri: 99, until: this.wall + 1, lock: Infinity, label: `${m.name}.${recent}`, color: "#cfe7da", real: false, held: true };
        const want = this.frame(m.rect, 4, 0.55), k = 1 - Math.exp(-dt * 4.5), c = this.cam;
        c.x += (want.x - c.x) * k; c.y += (want.y - c.y) * k; c.s += (want.s - c.s) * k;
        this.camMoving = Math.abs(want.x - c.x) > 0.6 || Math.abs(want.y - c.y) > 0.6 || Math.abs(want.s - c.s) > 0.004;
        return;
      }
      this.manual = null;
    }
    const ongoing = this.gathering || this.rides.length || this.flights.length;              // something real is still playing out: stay with it
    if (this.shot?.real && ongoing && this.wall >= this.shot.until - 0.5) this.shot.until = this.wall + 1;
    if (!this.shot || (this.wall >= this.shot.until && (!this.shot.real || this.wall - this.lastEventAt > 3.5))) {
      // nothing real to show: walk round the building (the badge says whether this is live, a replay, or the firm at rest)
      const stops = this.tour(), stop = stops[this.tourIndex % Math.max(1, stops.length)]; this.tourIndex += 1;
      if (stop) this.shot = { rect: stop.rect, pri: 0, until: this.wall + 6.5, lock: 0, label: stop.label, color: "#cfe7da", real: false };
    }
    const s = this.shot; if (!s) return;
    let want;
    const who = s.follow && this.agents.get(s.follow);
    if (who && (who.rides || who.walking || !s.rect)) want = this.frame({ x: who.x - 150, y: who.y - 96, w: 300, h: 136 }, 4);
    else want = this.frame(s.rect || { x: 0, y: 0, w: this.W, h: 300 });
    const k = 1 - Math.exp(-dt * 3.6), c = this.cam;
    c.x += (want.x - c.x) * k; c.y += (want.y - c.y) * k; c.s += (want.s - c.s) * k;
    this.camMoving = Math.abs(want.x - c.x) > 0.6 || Math.abs(want.y - c.y) > 0.6 || Math.abs(want.s - c.s) > 0.004;
  }

  // ── drawing ─────────────────────────────────────────────────────────────────────────────────────────────────────
  /** The parts that never move, painted once into a picture of their own (and again when a seat or a number changes). */
  staticLayer() {
    if (typeof document === "undefined" || !document.createElement) return null;
    if (!this.layer) { this.layer = document.createElement("canvas"); this.dirty = true; }
    const need = [Math.round(this.W * this.dpr), Math.round(this.H * this.dpr)];
    if (this.layer.width !== need[0] || this.layer.height !== need[1]) { this.layer.width = need[0]; this.layer.height = need[1]; this.dirty = true; }
    if (this.dirty) {
      const c = this.layer.getContext("2d"); if (!c) return null;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, need[0], need[1]); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      paintStatic(c, this, null);
      this.dirty = false;
    }
    return this.layer;
  }

  draw() {
    const c = this.ctx, W = this.W, H = this.H;
    if (!this.firm) { c.fillStyle = "#07100c"; c.fillRect(0, 0, W, H); c.fillStyle = "#8fb3a3"; c.font = `13px ${FONT}`; c.fillText("Waiting for the firm's files…", 16, 30); return; }
    if (this.visible !== false) {
      c.fillStyle = "#07100c"; c.fillRect(0, 0, W, H);
      paintWorld(c, this, null, this.staticLayer());
      if (this.banner) {
        if (this.wall > this.banner.until) this.banner = null;
        else { c.font = `600 12px ${FONT}`; const tw = c.measureText(this.banner.text).width + 20; c.fillStyle = "rgba(6,19,12,.9)"; c.fillRect((W - tw) / 2, 4, tw, 22); c.strokeStyle = GOOD; c.strokeRect((W - tw) / 2 + 0.5, 4.5, tw - 1, 21); c.fillStyle = PAPER; c.fillText(this.banner.text, (W - tw) / 2 + 10, 19); }
      }
    }
    this.drawStage();
  }

  drawStage() {
    if (!this.stage || !this.cam || this.stageVisible === false) return;
    if (!this.animations) {                                // movement is off: one still picture of the top of the building, and it says so
      const top = this.frame({ x: 0, y: 0, w: this.W, h: Math.min(this.H, this.skyH + this.hTop + this.hN) }, 0);
      Object.assign(this.cam, top);
      this.shot = { rect: null, pri: 0, until: Infinity, lock: 0, label: "Movement is switched off (Replay options, under the whole building). This is a still picture.", color: "#cfe7da", real: false };
    } else if (this.shot && this.shot.until === Infinity) this.shot = null;
    const c = this.sctx, sw = this.sw, sh = this.sh, cam = this.cam, vh = sh - 34;
    c.setTransform(this.sdpr, 0, 0, this.sdpr, 0, 0);
    c.fillStyle = "#05090a"; c.fillRect(0, 0, sw, sh);
    c.save();
    c.translate(sw / 2, vh / 2); c.scale(cam.s, cam.s); c.translate(-cam.x, -cam.y);
    paintWorld(c, this, { x: cam.x - sw / 2 / cam.s, y: cam.y - vh / 2 / cam.s, w: sw / cam.s, h: sh / cam.s, s: cam.s }, null);
    c.restore();
    paintHud(c, this, sw, sh, this.shot);
  }

  // ── taps ────────────────────────────────────────────────────────────────────────────────────────────────────────
  tap(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.open(this.hit((e.clientX - rect.left) * (this.W / rect.width), (e.clientY - rect.top) * (this.H / rect.height)));
  }
  tapStage(e) {
    const rect = this.stage.getBoundingClientRect(), cam = this.cam; if (!cam) return;
    const sx = (e.clientX - rect.left) * (this.sw / rect.width), sy = (e.clientY - rect.top) * (this.sh / rect.height);
    this.open(this.hit(cam.x + (sx - this.sw / 2) / cam.s, cam.y + (sy - (this.sh - 34) / 2) / cam.s));
  }
  open(hit) {
    if (hit?.agent) { this.selected = hit.agent; this.draw(); this.onAgent?.(hit.agent); }
    else if (hit?.room) this.onRoom?.(hit.room);
  }

  /** What is under a point: an agent away from its desk, then a desk (the whole cell is the target), a manager, then a room. */
  hit(x, y) {
    for (const a of this.agents.values()) if ((a.away || a.walking) && Math.abs(a.x - x) < 14 && y > a.y - 32 && y < a.y + 12) return { agent: a.id };
    for (const g of this.groups.values()) {
      const r = g.rect; if (!r || x < r.x || x > r.x + r.w || y < r.y + HEAD_H - 2 || y > r.y + r.h) continue;
      const i = clamp(Math.floor((x - r.x - 3) / ((r.w - 6) / 5)), 0, 4);
      if (g.seats[i]) return { agent: g.seats[i] };
    }
    for (const m of this.staff) if (/^M\d$/.test(m.id) && Math.abs(m.x - x) < 10 && y > m.y - 26 && y < m.y + 4) return { room: { kind: "manager", floor: m.floor, name: m.name } };
    for (const room of this.rooms) if (x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h) return { room };
    return null;
  }

  /** Where an agent's desk is on the page (for tests and for scrolling to it). */
  deskOf(id) { const h = this.home(id); return h ? { x: h.x, y: h.y, w: h.cw, h: CELL_H } : null; }
}

export function isRunning(live) {
  return !!(live && live.mode === "firm" && live.stage && live.stage !== "Cycle finished" && Date.now() - Date.parse(live.updated_at) < 6 * 60 * 1000);
}

function key(e) { return `${e.at}|${e.kind}|${e.agent || e.group || e.floor || ""}|${e.idea || ""}`; }
