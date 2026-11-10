// The HSN Capital building: a side-on cutaway drawn with our own simple art (no characters, names, logos or art
// from any game). From the bottom up: the big Analysts' floor (12 group rooms), floors 2 to 5 with two group rooms
// and a discussion room each, then the Audit desk and the CEO's office, with a lift shaft down the side.
//
// All 100 agents are always in it, each at its own desk: a figure in its level's colour with a level number, a mood
// face, its name, and three small bars for its progress to the next level (Day Score, pips, risk to reward: the
// share of its months that meet each of those checks, straight from the Engine).
//
// Nothing moves unless something real happened. Movement comes from two places only:
//   * status/firm_live.json while a cycle runs (who is thinking, researching, coding, testing, in a meeting, at audit)
//   * the cycle's real events (firm/replays/cycle<N>.json, or the tail in the live file): a result chip when the
//     Engine finishes a test, a walk to the discussion room for a meeting, a walk to the Audit desk, a transfer between
//     rooms, the lift for a level-up (bigger celebration for a skipped floor) or a swap down.
// With animations off the same scene is drawn still and events are applied without motion.

export const LEVEL_COLORS = { 1: "#5aa9ff", 2: "#3fd1c9", 3: "#35d07f", 4: "#f5b942", 5: "#b784ff" };
export const BAR_COLORS = { day: "#35d07f", pips: "#f5b942", rr: "#b784ff" };
const LEVEL_NAMES = { 1: "Analysts", 2: "Associates", 3: "Vice Presidents", 4: "Directors", 5: "Managing Directors" };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const CELL_H = 76, HEAD_H = 20, ROOM_H = HEAD_H + CELL_H + 4, LABEL_H = 22;
const WORKING = new Set(["thinking", "researching", "coding", "testing"]);
const STEP = { tested: 0.14, thinking: 0.1, coded: 0.3, meeting_start: 1.6, meeting: 1.2, challenge_start: 1.6, challenge_failed: 0.6, audit_start: 1.4,
  audit_failed: 0.9, battle: 0.9, level_up: 3.4, swapped_down: 3.0, transfer: 1.6, rotation: 0.6, solo_passed_no_seat: 0.6, data_update: 0.3, turn_failed: 0.1,
  meeting_failed: 0.3, transfer_declined: 0.2, retest_failed: 0.4 };

const first = (name) => String(name || "").split(" ")[0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Building {
  constructor(canvas, { animations = true, onAgent = null, onRoom = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.animations = animations;
    this.onAgent = onAgent; this.onRoom = onRoom;
    this.agents = new Map();    // id -> {id, name, level, mood, status, detail, prog, x, y, away, hold, chip, ...}
    this.groups = new Map();    // id -> {id, floor, room, seats: [id|null x5], data}
    this.rooms = [];
    this.lift = { y: 0, ty: 0, riders: [] }; this.rides = [];
    this.effects = []; this.flashes = []; this.banner = null; this.auditing = null;
    this.queue = []; this.nextAt = 0; this.speed = 1; this.mode = "idle";   // idle | live | replay
    this.seenLive = new Set(); this.liveCycle = null;
    this.selected = null; this.firm = null; this.live = null;
    this.visible = true; this.dead = false; this.last = performance.now(); this.clock = 0;
    this._tap = (e) => this.tap(e);
    canvas.addEventListener("click", this._tap);
    this._resize = () => { this.resize(); this.layout(); this.snapAll(); this.draw(); };
    window.addEventListener("resize", this._resize);
    window.addEventListener("orientationchange", this._resize);
    if ("IntersectionObserver" in window) { this.io = new IntersectionObserver((es) => { this.visible = es.some((x) => x.isIntersecting); }); this.io.observe(canvas); }
    this.resize();
    requestAnimationFrame(() => this.loop());
  }

  destroy() {
    this.dead = true;
    this.canvas.removeEventListener("click", this._tap);
    window.removeEventListener("resize", this._resize);
    window.removeEventListener("orientationchange", this._resize);
    this.io?.disconnect();
  }

  // ── size and layout ─────────────────────────────────────────────────────────────────────────────────────────────
  resize() {
    const w = Math.max(300, Math.floor(this.canvas.parentElement?.getBoundingClientRect().width || this.canvas.getBoundingClientRect().width || 900));
    this.W = w;
    this.phone = w < 560;
    this.liftW = this.phone ? 30 : 44;
    this.cols1 = w >= 1260 ? 6 : w >= 900 ? 4 : w >= 560 ? 3 : 2;
    const rows1 = 12 / this.cols1;
    this.h1 = LABEL_H + rows1 * (ROOM_H + 4) + 4;
    this.hN = LABEL_H + ROOM_H + 8 + (this.phone ? 44 : 0);
    this.hTop = LABEL_H + 70;
    this.H = this.hTop + 4 * this.hN + this.h1 + 16;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.height = `${this.H}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  layout() {
    const W = this.W, L = this.liftW, innerX = L + 4, innerW = W - L - 8;
    this.rooms = []; this.floorRect = {};
    let y = 0;
    this.topRect = { x: L, y, w: W - L, h: this.hTop };
    const aw = Math.max(110, innerW * (this.phone ? 0.42 : 0.3));
    this.rooms.push({ id: "AUDIT", kind: "audit", floor: 6, x: innerX, y: y + LABEL_H, w: aw - 4, h: this.hTop - LABEL_H - 6 });
    this.rooms.push({ id: "CEO", kind: "ceo", floor: 6, x: innerX + aw, y: y + LABEL_H, w: innerW - aw, h: this.hTop - LABEL_H - 6 });
    y += this.hTop;
    for (const f of [5, 4, 3, 2]) {
      this.floorRect[f] = { x: L, y, w: W - L, h: this.hN };
      const gw = this.phone ? innerW / 2 : innerW * 0.36;
      for (let i = 0; i < 2; i++) this.rooms.push({ id: `F${f}R${i}`, kind: "group", floor: f, slot: i, x: innerX + i * gw, y: y + LABEL_H, w: gw - 4, h: ROOM_H });
      if (this.phone) this.rooms.push({ id: `F${f}D`, kind: "discussion", floor: f, x: innerX, y: y + LABEL_H + ROOM_H + 4, w: innerW, h: 40 });
      else this.rooms.push({ id: `F${f}D`, kind: "discussion", floor: f, x: innerX + 2 * gw, y: y + LABEL_H, w: innerW - 2 * gw, h: ROOM_H });
      y += this.hN;
    }
    this.floorRect[1] = { x: L, y, w: W - L, h: this.h1 };
    const rw = innerW / this.cols1;
    for (let i = 0; i < 12; i++) this.rooms.push({ id: `F1R${i}`, kind: "group", floor: 1, slot: i, x: innerX + (i % this.cols1) * rw, y: y + LABEL_H + Math.floor(i / this.cols1) * (ROOM_H + 4), w: rw - 4, h: ROOM_H });
    // floor 1 has no room of its own for discussions: they gather along the floor's corridor strip
    this.rooms.push({ id: "F1D", kind: "discussion", floor: 1, virtual: true, x: innerX, y: y + 2, w: innerW, h: LABEL_H - 2 });
    this.groundY = y + this.h1;
    for (const g of this.groups.values()) g.rect = this.rooms.find((r) => r.kind === "group" && r.floor === g.floor && r.slot === g.room) || null;
    for (const r of this.rooms) if (r.kind === "group") r.group = [...this.groups.values()].find((g) => g.floor === r.floor && g.room === r.slot) || null;
    this.lift.ty = this.liftY(this.lift.floor || 1);
    if (!this.lift.y) this.lift.y = this.lift.ty;
  }

  liftY(floor) { const r = floor >= 6 ? this.topRect : this.floorRect[floor]; return r ? r.y + r.h - 40 : 0; }
  doorOf(floor) { return { x: this.liftW + 10, y: this.liftY(floor) + 36 }; }

  seatPos(g, i) {
    const r = g.rect; if (!r) return { x: this.liftW + 20, y: this.groundY - 10, cw: 30, cx: 0 };
    const cw = (r.w - 6) / 5, cx = r.x + 3 + i * cw;
    return { x: cx + cw / 2, y: r.y + HEAD_H + 40, cw, cx, top: r.y + HEAD_H };
  }
  home(id) { const a = this.agents.get(id); const g = a && this.groups.get(a.group); if (!g) return null; const i = g.seats.indexOf(id); return i < 0 ? null : this.seatPos(g, i); }
  spot(room, i) {
    if (!room) return { x: this.liftW + 20, y: this.groundY - 8 };
    const gap = room.virtual ? 22 : 32, per = Math.max(1, Math.floor((room.w - 20) / gap));
    const row = Math.floor(i / per), col = i % per;
    return { x: room.x + 18 + col * gap, y: room.virtual ? room.y + room.h - 1 : room.y + room.h - 14 - row * 34 };
  }

  // ── data ────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** The firm's current truth (firm/firm.json) and, when there is one, the live status of a running cycle. */
  setData(firm, live) {
    this.firm = firm; this.live = live || null;
    if (this.mode === "replay") return;                 // a replay is showing an earlier moment; the fresh data is used when it ends
    this.groups.clear();
    for (const f of [1, 2, 3, 4, 5]) for (const g of firm.floors?.[String(f)]?.groups || []) {
      const seats = [null, null, null, null, null];
      g.members.slice(0, 5).forEach((id, i) => (seats[i] = id));
      this.groups.set(g.id, { id: g.id, floor: f, room: g.room, seats, data: g });
    }
    for (const [id, a] of Object.entries(firm.agents || {})) {
      const cur = this.agents.get(id) || { id, x: 0, y: 0, away: null, hold: 0, chip: null, phase: Math.random() * 6.28, fresh: true };
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

  /** A fresh live status file (every 15-30 s while a cycle runs): statuses now, plus any real events not yet shown. */
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

  /** Replay one finished cycle exactly: the seats when it began, then every real event in order. */
  playReplay(replay, { speed = 4, onProgress = null, onEnd = null } = {}) {
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
    this.layout(); this.snapAll();
    this.queue = [...(replay.events || [])]; this.nextAt = this.clock + 0.6;
    this.say(`Replaying cycle ${replay.cycle}: ${this.replayTotal} real events`);
  }

  stopReplay(silent = false) {
    if (this.mode !== "replay") return;
    this.queue = []; this.mode = "idle"; this.lift.riders = []; this.rides = []; this.effects = [];
    if (this.firm) this.setData(this.firm, this.live);
    for (const a of this.agents.values()) { a.away = null; a.chip = null; this.snap(a); }
    if (!silent) this.onEnd?.();
  }

  say(text, seconds = 3) { this.banner = { text, until: this.clock + seconds }; }

  // ── real events -> what you see ─────────────────────────────────────────────────────────────────────────────────
  members(e) { return (e.members || (e.agent ? [e.agent] : (this.groups.get(e.group)?.seats || []))).filter((id) => id && this.agents.has(id)); }

  apply(e, animate = true) {
    const A = (id) => this.agents.get(id);
    const chip = (id, text, color, secs = 2.2) => { const a = A(id); if (a && animate) a.chip = { text, color, until: this.clock + secs / Math.max(1, this.speed / 2), born: this.clock }; };
    const ids = this.members(e);
    switch (e.kind) {
      case "thinking": { const a = A(e.agent); if (a) { a.status = "thinking"; a.detail = ""; a.hold = this.clock + 1.2; } break; }
      case "tested": { const a = A(e.agent); if (a) { a.status = "testing"; a.hold = this.clock + 0.8; if (e.month_score != null) chip(e.agent, `${e.month_score > 0 ? "+" : ""}${Math.round(e.month_score)}`, e.month_score > 0 ? "#35d07f" : "#ff5c5c"); } break; }
      case "coded": chip(e.agent, "</> code", "#b784ff", 3); break;
      case "turn_failed": break;
      case "meeting_start": { const floor = e.floor || this.groups.get(e.group)?.floor, room = this.rooms.find((r) => r.kind === "discussion" && r.floor === floor);
        ids.forEach((id) => { const a = A(id); a.away = floor === 1 && !e.discussion ? { huddle: true, sticky: true } : { room, sticky: true }; a.status = "in_meeting"; a.detail = e.discussion ? "floor discussion" : "group meeting"; a.hold = this.clock + 30; }); break; }
      case "meeting": case "meeting_failed": { const who = e.members ? ids : (this.groups.get(e.group)?.seats || []).filter(Boolean); who.forEach((id) => { const a = A(id); if (a) { a.away = null; a.status = "idle"; a.hold = 0; } }); if (e.group && e.strategy && animate) this.flash(e.group, "#35d07f", 1.2); break; }
      case "challenge_start": { ids.forEach((id) => { const a = A(id); a.status = "testing"; a.detail = `floor ${e.floor} challenge`; a.hold = this.clock + 2.5; }); const g = e.solo ? null : this.groups.get(e.group); if (g && animate) g.playing = { from: this.clock, secs: 1.5 }; break; }
      case "challenge_failed": { ids.forEach((id) => { const a = A(id); a.mood = "frustrated"; a.status = "idle"; a.hold = 0; }); if (e.solo) chip(e.agent, "not passed", "#ff5c5c"); else if (animate) this.flash(e.group, "#ff5c5c", 1); break; }
      case "audit_start": ids.forEach((id) => { const a = A(id); a.status = "waiting_audit"; a.detail = ""; a.hold = this.clock + 30; });
        this.auditing = { who: e.agent ? first(A(e.agent)?.name) : e.group, floor: e.floor, until: this.clock + 4 }; break;
      case "audit_failed": ids.forEach((id) => { const a = A(id); a.away = null; a.status = "idle"; a.mood = "frustrated"; a.hold = 0; }); this.auditing = null;
        if (e.agent) chip(e.agent, "audit disagreed", "#ff5c5c", 3); else if (animate) this.flash(e.group, "#ff5c5c", 1.2); break;
      case "solo_passed_no_seat": { const a = A(e.agent); if (a) { a.away = null; a.status = "idle"; a.mood = "proud"; a.hold = 0; chip(e.agent, "passed ✓ waiting for a seat", "#f5b942", 3.5); } break; }
      case "battle": if (animate) { this.flash(e.challenger, "#f5b942", 1.4); this.flash(e.incumbent, "#f5b942", 1.4); }
        (this.groups.get(e.challenger)?.seats || []).forEach((id) => { const a = A(id); if (a) { a.away = null; a.status = "idle"; a.hold = 0; } }); break;
      case "level_up": case "swapped_down": this.move(e, ids, animate); break;
      case "transfer": { this.reseat(e.agent, e.to_group); this.reseat(e.swapped, e.from_group); const a = A(e.agent), b = A(e.swapped); if (a) a.mood = "happy"; if (b) b.mood = "frustrated"; if (!animate) { if (a) this.snap(a); if (b) this.snap(b); } break; }
      case "rotation": { const a = A(e.agent); if (a) { a.name = e.new_name || a.name; a.mood = "neutral"; a.prog = null; chip(e.agent, "new Analyst", "#5aa9ff", 3); } break; }
      case "retest_failed": if (animate) this.flash(e.group, "#ff5c5c", 1.2); break;
      case "data_update": if (animate) this.say(`New price data: ${e.months} months on file`, 3); break;
      default: break;
    }
    return (STEP[e.kind] ?? 0.2);
  }

  flash(gid, color, secs) { if (gid) this.flashes.push({ gid, color, until: this.clock + secs, secs }); }

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
    a.group = gid; a.level = to.floor; a.away = null;
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
    for (const id of ids) { const a = this.agents.get(id); a.level = to; a.mood = up ? "happy" : "frustrated"; a.status = "idle"; a.hold = 0; a.away = null; }
    if (!animate) { ids.forEach((id) => this.snap(this.agents.get(id))); return; }
    // walk to the lift on the old floor and wait there; rides are taken one at a time, in the order things happened
    const door = this.doorOf(from);
    ids.forEach((id, i) => { const a = this.agents.get(id); a.route = [{ x: door.x + i * 5, y: door.y }]; a.ride = true; });
    this.rides.push({ ids, from, to, up, skip: !!e.skip, stage: 0, t: 0 });
  }

  runRides() {
    const r = this.rides[0]; if (!r) return;
    const there = Math.abs(this.lift.y - this.lift.ty) < 2;
    if (r.stage === 0) { r.stage = 1; r.t = this.clock; this.lift.ty = this.liftY(r.from); }
    else if (r.stage === 1 && there && (this.clock - r.t > 4 || r.ids.every((id) => !this.agents.get(id)?.walking)) && this.clock - r.t > 0.5) { r.stage = 2; r.t = this.clock; this.lift.riders = r.ids; this.lift.ty = this.liftY(r.to); }
    else if (r.stage === 2 && there && this.clock - r.t > 0.5) {
      this.lift.riders = [];
      const door = this.doorOf(r.to);
      for (const id of r.ids) { const a = this.agents.get(id); if (!a) continue; a.x = door.x; a.y = door.y; a.route = null; a.ride = null; }
      if (r.up) this.celebrate(this.floorRect[r.to] || this.topRect, r.skip ? 120 : 45, r.skip);
      this.rides.shift();
    }
  }

  // ── motion ──────────────────────────────────────────────────────────────────────────────────────────────────────
  target(a) {
    if (a.route?.length) return a.route[0];
    if (a.away?.room) { const list = [...this.agents.values()].filter((x) => x.away?.room === a.away.room); return this.spot(a.away.room, Math.max(0, list.indexOf(a))); }
    const h = this.home(a.id);
    if (a.away?.huddle && h) { const r = this.groups.get(a.group)?.rect; return r ? { x: h.x + (r.x + r.w / 2 - h.x) * 0.5, y: h.y + 10 } : h; }      // standing together in their own room
    return h;
  }
  snap(a) { if (!a) return; a.route = null; a.ride = null; const t = this.target(a); if (t) { a.x = t.x; a.y = t.y; } a.walking = false; }
  snapAll() { this.rides = []; this.lift.riders = []; for (const a of this.agents.values()) this.snap(a); this.lift.y = this.lift.ty; }

  tick(dt) {
    const sp = this.mode === "replay" ? this.speed : 1;
    this.clock += dt * sp;
    // the director: one real event at a time
    if (this.queue.length && this.clock >= this.nextAt && this.animations && this.rides.length < 2) {
      const e = this.queue.shift();
      let wait = this.apply(e, true);
      const n = this.queue[0];
      const pair = n && ((e.kind === "swapped_down" && !e.solo && n.kind === "level_up" && !n.solo && n.from === e.to && n.to === e.from)      // a won promotion battle
        || (e.kind === "level_up" && e.solo && n.kind === "swapped_down" && n.solo && n.from_group === e.group));                              // moving up alone
      if (pair) wait += this.apply(this.queue.shift(), true);
      this.nextAt = this.clock + wait;
      if (this.mode === "replay") { try { this.onProgress?.(this.replayTotal - this.queue.length, this.replayTotal, e); } catch { /* a caption must never stop the replay */ } }
    }
    if (this.mode === "replay" && !this.queue.length && this.clock >= this.nextAt + 1.5 && !this.rides.length) { this.mode = "idle"; this.say(`Cycle ${this.replayCycle}: end of the replay`, 4); const done = this.onEnd; this.finish(); done?.(); }
    this.runRides();
    this.lift.y += (this.lift.ty - this.lift.y) * clamp(dt * sp * 3.2, 0, 1);
    const speed = 150 * sp;
    for (const a of this.agents.values()) {
      if (this.lift.riders.includes(a.id)) { a.x = this.liftW / 2 + (this.lift.riders.indexOf(a.id) - 2) * 5; a.y = this.lift.y + 36; a.walking = false; continue; }
      const t = this.target(a); if (!t) continue;
      const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
      if (d < 1.2) { a.x = t.x; a.y = t.y; a.walking = false; if (a.route?.length && !a.ride) a.route.shift(); }      // waiting for the lift: stay at the door
      else { const s = Math.min(d, speed * dt); a.x += (dx / d) * s; a.y += (dy / d) * s; a.walking = true; }
      if (a.hold && this.clock > a.hold && this.mode !== "live") { a.hold = 0; if (a.status !== "idle" && !a.away) { a.status = "idle"; a.detail = ""; } }
      if (a.chip && this.clock > a.chip.until) a.chip = null;
    }
    this.flashes = this.flashes.filter((f) => this.clock < f.until);
    this.effects = this.effects.filter((p) => p.life > 0);
    for (const p of this.effects) { p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += 0.09 * dt * 60; p.life -= dt * 60; }
  }

  finish() { if (this.firm) { const f = this.firm, l = this.live; this.setData(f, l); for (const a of this.agents.values()) { a.away = null; this.snap(a); } } }

  celebrate(rect, n, big) {
    for (let i = 0; i < n; i++) this.effects.push({ x: rect.x + Math.random() * rect.w, y: rect.y + rect.h * 0.6, vx: (Math.random() - 0.5) * (big ? 5 : 3), vy: -Math.random() * (big ? 5 : 3) - 1, life: 60 + Math.random() * 50, c: Object.values(LEVEL_COLORS)[i % 5] });
  }

  busy() { return this.queue.length || this.rides.length || this.effects.length || this.flashes.length || this.banner || this.auditing || [...this.agents.values()].some((a) => a.walking || a.chip || WORKING.has(a.status) || a.away); }

  loop() {
    if (this.dead) return;
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    try {
      if (this.visible && document.visibilityState !== "hidden") {
        if (this.animations) { this.tick(dt); this.draw(); }
        else if (now - (this.lastStill || 0) > 1500) { this.lastStill = now; this.draw(); }
      }
    } catch (error) { console.error("building:", error); }      // one bad event must not freeze the building
    // full speed only while something is actually happening; otherwise a slow heartbeat (kind to the iPad's battery)
    if (this.animations && this.busy()) requestAnimationFrame(() => this.loop());
    else setTimeout(() => requestAnimationFrame(() => this.loop()), 400);
  }

  // ── drawing ─────────────────────────────────────────────────────────────────────────────────────────────────────
  draw() {
    const c = this.ctx, W = this.W, H = this.H;
    c.fillStyle = "#07100c"; c.fillRect(0, 0, W, H);
    if (!this.firm) { c.fillStyle = "#8fb3a3"; c.font = `13px ${FONT}`; c.fillText("Waiting for the firm's files…", 16, 30); return; }
    c.fillStyle = "#0e1a14"; c.fillRect(0, this.groundY, W, H - this.groundY);
    // lift shaft and car
    c.fillStyle = "#0b1712"; c.fillRect(0, 0, this.liftW, this.groundY);
    c.strokeStyle = "#234136"; c.lineWidth = 1; c.strokeRect(0.5, 0.5, this.liftW - 1, this.groundY - 1);
    c.fillStyle = "#1e3a2c"; c.fillRect(4, this.lift.y, this.liftW - 8, 38); c.strokeStyle = "#35d07f"; c.strokeRect(4.5, this.lift.y + 0.5, this.liftW - 9, 37);
    // top: Audit desk and the CEO's office
    c.fillStyle = "#182b22"; c.fillRect(this.topRect.x, this.topRect.y, this.topRect.w, this.topRect.h);
    c.strokeStyle = "#2f5546"; c.strokeRect(this.topRect.x + 0.5, this.topRect.y + 0.5, this.topRect.w - 1, this.topRect.h - 1);
    c.font = `600 12px ${FONT}`; c.fillStyle = "#e6f0ea"; c.fillText("HSN Capital", this.topRect.x + 8, this.topRect.y + 15);
    // floors
    for (const f of [1, 2, 3, 4, 5]) {
      const r = this.floorRect[f];
      c.fillStyle = f % 2 ? "#101c16" : "#13231b"; c.fillRect(r.x, r.y, r.w, r.h);
      c.strokeStyle = "#234136"; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      c.fillStyle = LEVEL_COLORS[f]; c.font = `600 12px ${FONT}`;
      const label = `Floor ${f} · ${LEVEL_NAMES[f]}`;
      c.fillText(label, r.x + 8, r.y + 15);
      if (!this.phone) { c.fillStyle = "#8fb3a3"; c.font = `11px ${FONT}`; c.fillText(`manager ${this.firm.managers?.[String(f)]?.name || ""}`, r.x + 16 + c.measureText(label).width + 30, r.y + 15); }
    }
    for (const room of this.rooms) this.drawRoom(room);
    // seats: desk, name, level and the three progress bars stay at the desk even when its agent has walked off
    for (const g of this.groups.values()) if (g.rect) g.seats.forEach((id, i) => { if (id && i < 5) this.drawSeat(g, i, this.agents.get(id)); });
    const list = [...this.agents.values()].sort((a, b) => a.y - b.y);
    for (const a of list) this.drawAgent(a);
    for (const a of list) this.drawBubble(a);
    for (const p of this.effects) { c.fillStyle = p.c; c.fillRect(p.x, p.y, 3, 3); }
    if (this.banner) {
      if (this.clock > this.banner.until) this.banner = null;
      else { c.font = `600 12px ${FONT}`; const tw = c.measureText(this.banner.text).width + 20; c.fillStyle = "rgba(6,19,12,.9)"; c.fillRect((W - tw) / 2, 4, tw, 22); c.strokeStyle = "#35d07f"; c.strokeRect((W - tw) / 2 + 0.5, 4.5, tw - 1, 21); c.fillStyle = "#e6f0ea"; c.fillText(this.banner.text, (W - tw) / 2 + 10, 19); }
    }
  }

  drawRoom(room) {
    const c = this.ctx;
    if (room.virtual) return;
    const fill = { discussion: "#0f2a1e", audit: "#2a1f0f", ceo: "#241a33", group: "#0b1710" }[room.kind];
    c.fillStyle = fill; c.fillRect(room.x, room.y, room.w, room.h);
    const g = room.group;
    const fl = g && this.flashes.find((f) => f.gid === g.id);
    c.lineWidth = fl ? 2 : 1;
    c.strokeStyle = fl ? fl.color : room.kind === "group" && g?.data?.strategy ? "#2f6b4d" : "#234136";
    c.strokeRect(room.x + 0.5, room.y + 0.5, room.w - 1, room.h - 1); c.lineWidth = 1;
    c.font = `10px ${FONT}`; c.fillStyle = "#8fb3a3";
    if (room.kind === "discussion") { c.fillText(this.phone ? "discussion room" : `Floor ${room.floor} discussion room`, room.x + 6, room.y + 13); return; }
    if (room.kind === "audit") {
      c.fillText("Audit desk", room.x + 6, room.y + 13);
      const au = this.auditing && this.clock < this.auditing.until ? this.auditing : (this.auditing = null);
      const waiting = !au && this.mode === "live" ? [...this.agents.values()].find((a) => a.status === "waiting_audit") : null;
      if (au || waiting) { c.fillStyle = "#f5b942"; c.fillText(au ? `re-running ${au.who}'s floor ${au.floor} challenge` : `re-running ${waiting.group}'s challenge`, room.x + 6, room.y + 26); c.strokeStyle = "#f5b942"; c.strokeRect(room.x + 1.5, room.y + 1.5, room.w - 3, room.h - 3); }
      else { c.fillStyle = "#5f8473"; c.fillText("re-runs every level-up", room.x + 6, room.y + 26); }
      return;
    }
    if (room.kind === "ceo") { c.fillText("CEO's office", room.x + 6, room.y + 13); c.fillStyle = "#5f8473"; if (!this.phone) c.fillText(`${this.firm.managers?.["5"]?.name || "Head of Trading"} reports here`, room.x + 6, room.y + 26); return; }
    if (!g) { c.fillStyle = "#3b5a4c"; c.fillText("empty room", room.x + 6, room.y + 13); return; }
    const d = g.data || {};
    c.fillStyle = "#cfe7da"; c.font = `600 10px ${FONT}`; c.fillText(g.id, room.x + 5, room.y + 13);
    const idW = c.measureText(g.id).width;
    c.font = `10px ${FONT}`; c.fillStyle = "#8fb3a3";
    const info = d.strategy ? `${d.strategy}${d.month_score != null && room.w > 190 ? " · score " + Math.round(d.month_score) : ""}` : "no strategy yet";
    c.fillText(info, room.x + 9 + idW, room.y + 13);
    // the room's screen: the running total of the real Day Scores of its latest challenge
    const sw = Math.min(54, room.w * 0.26), sx = room.x + room.w - sw - 5, sy = room.y + 3;
    c.fillStyle = "#06120c"; c.fillRect(sx, sy, sw, 14); c.strokeStyle = "#2f5546"; c.strokeRect(sx + 0.5, sy + 0.5, sw - 1, 13);
    const sc = d.screen;
    if (sc?.cum?.length > 1) {
      const part = g.playing ? clamp((this.clock - g.playing.from) / g.playing.secs, 0, 1) : 1;
      if (g.playing && part >= 1) g.playing = null;
      const n = Math.max(2, Math.round(sc.cum.length * part)), lo = Math.min(0, ...sc.cum), hi = Math.max(0, ...sc.cum), span = hi - lo || 1;
      c.beginPath();
      for (let i = 0; i < n; i++) { const px = sx + 2 + (i / (sc.cum.length - 1)) * (sw - 4), py = sy + 12 - ((sc.cum[i] - lo) / span) * 10; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      c.strokeStyle = sc.passed ? "#35d07f" : "#ff8a5c"; c.stroke();
    } else if (g.playing) { c.fillStyle = "#35d07f"; c.fillRect(sx + 2, sy + 6, (sw - 4) * clamp((this.clock - g.playing.from) / g.playing.secs, 0, 1), 2); }
  }

  drawSeat(g, i, a) {
    const c = this.ctx, s = this.seatPos(g, i), col = LEVEL_COLORS[g.floor] || "#5aa9ff";
    const left = s.cx + 3, w = s.cw - 6;
    if (this.selected && a && this.selected === a.id) { c.fillStyle = "rgba(53,208,127,.12)"; c.fillRect(s.cx + 1, s.top, s.cw - 2, CELL_H - 2); }
    // desk and monitor
    c.fillStyle = "#274436"; c.fillRect(left, s.y, w, 4);
    c.fillStyle = "#1b3024"; c.fillRect(left + 2, s.y + 4, 2, 6); c.fillRect(left + w - 4, s.y + 4, 2, 6);
    const on = a && WORKING.has(a.status) && !a.walking && !a.away;
    c.fillStyle = on ? "#0f3d2a" : "#0a1811"; c.fillRect(left + 1, s.y - 10, 10, 8); c.strokeStyle = on ? "#35d07f" : "#2f5546"; c.strokeRect(left + 1.5, s.y - 9.5, 9, 7);
    if (on && this.animations) { c.fillStyle = "#35d07f"; const k = Math.floor(this.clock * 8 + a.phase) % 3; for (let r = 0; r < 3; r++) c.fillRect(left + 3, s.y - 8 + r * 2, 3 + ((r + k) % 3) * 1.5, 1); }
    if (!a) return;
    // level number on the desk front
    c.fillStyle = col; c.fillRect(left + w - 11, s.y - 9, 10, 9); c.fillStyle = "#06130c"; c.font = `700 8px ${FONT}`; c.fillText(String(g.floor), left + w - 8.5, s.y - 2);
    // name
    c.font = `10px ${FONT}`; c.fillStyle = "#cfe7da";
    let name = first(a.name); while (name.length > 2 && c.measureText(name).width > w) name = name.slice(0, -1);
    c.fillText(name, s.x - c.measureText(name).width / 2, s.y + 19);
    // progress to the next level: Day Score, pips, risk to reward (share of its months that meet each check)
    const p = a.prog, has = p && p.basis && p.basis !== "none";
    [["day", 23], ["pips", 27.5], ["rr", 32]].forEach(([k, dy]) => {
      c.fillStyle = "#15281f"; c.fillRect(left, s.y + dy, w, 3);
      if (has) { c.fillStyle = BAR_COLORS[k]; c.globalAlpha = p.basis === "challenge" ? 1 : 0.62; c.fillRect(left, s.y + dy, w * clamp((p[k]?.pct || 0) / 100, 0, 1), 3); c.globalAlpha = 1; }
    });
  }

  drawAgent(a) {
    const c = this.ctx, col = LEVEL_COLORS[a.level] || "#5aa9ff";
    const home = this.home(a.id);
    const seated = home && !a.walking && !a.away && Math.abs(a.x - home.x) < 2 && Math.abs(a.y - home.y) < 2;
    const typing = seated && WORKING.has(a.status) && this.animations;
    const bob = typing ? Math.sin(this.clock * 9 + a.phase) * 1.1 : 0;
    if (seated) {
      c.fillStyle = col; c.beginPath(); c.arc(a.x, a.y - 18, 5.5, 0, 6.283); c.fill();
      c.fillRect(a.x - 6.5, a.y - 12, 13, 12);
      if (typing) { c.fillStyle = "#e6f0ea"; c.fillRect(a.x - 9, a.y - 3 + bob, 3, 2); c.fillRect(a.x + 6, a.y - 3 - bob, 3, 2); }
      this.face(a, a.x, a.y - 18);
    } else {
      const step = a.walking && this.animations ? Math.sin(this.clock * 12 + a.phase) * 2.5 : 0;
      c.fillStyle = col; c.beginPath(); c.arc(a.x, a.y - 22, 5, 0, 6.283); c.fill();
      c.fillRect(a.x - 4.5, a.y - 17, 9, 11);
      c.fillRect(a.x - 4 + step, a.y - 6, 3, 6); c.fillRect(a.x + 1 - step, a.y - 6, 3, 6);
      this.face(a, a.x, a.y - 22);
      if (a.away?.room && !a.walking) { c.font = `9px ${FONT}`; c.fillStyle = "#cfe7da"; const n = first(a.name).slice(0, 7); c.fillText(n, a.x - c.measureText(n).width / 2, a.y + 9); }   // its desk keeps its name; away in a room it carries one
    }
    if (this.selected === a.id) { c.strokeStyle = "#e6f0ea"; c.lineWidth = 1.5; c.beginPath(); c.arc(a.x, a.y - (seated ? 18 : 22), 8, 0, 6.283); c.stroke(); c.lineWidth = 1; }
  }

  face(a, x, y) {
    const c = this.ctx;
    c.fillStyle = "#06130c"; c.fillRect(x - 2.4, y - 1.4, 1.3, 1.3); c.fillRect(x + 1.1, y - 1.4, 1.3, 1.3);
    c.strokeStyle = "#06130c"; c.lineWidth = 1; c.beginPath();
    if (a.mood === "happy" || a.mood === "proud") c.arc(x, y + 0.6, 2.2, 0.25, Math.PI - 0.25);
    else if (a.mood === "frustrated") c.arc(x, y + 3.4, 2.2, Math.PI + 0.3, 2 * Math.PI - 0.3);
    else { c.moveTo(x - 1.8, y + 2.2); c.lineTo(x + 1.8, y + 2.2); }
    c.stroke();
  }

  drawBubble(a) {
    const c = this.ctx;
    // at a desk the bubble is one short word (desks are close together); the agent's file has the detail
    const words = { thinking: "thinking…", researching: "research", coding: "coding", testing: /challenge/.test(a.detail || "") ? "challenge" : "testing", in_meeting: a.detail || "in a meeting", waiting_audit: "waiting for audit" };
    let text = a.chip ? a.chip.text : (a.status && a.status !== "idle" && (!a.away || !a.walking) ? words[a.status] || a.status : "");
    if (!text) return;
    if (!a.chip && a.away) { const mates = [...this.agents.values()].filter((x) => x.away && (a.away.huddle ? x.away.huddle && x.group === a.group : x.away.room === a.away.room)); if (mates[0] !== a) return; }   // one bubble per gathering
    if (!a.chip && a.status === "waiting_audit") { const g = this.groups.get(a.group); if (g && g.seats.find((id) => this.agents.get(id)?.status === "waiting_audit") !== a.id) return; }
    text = text.length > 26 ? text.slice(0, 25) + "…" : text;
    c.font = `600 9px ${FONT}`;
    const tw = c.measureText(text).width + 8, home = this.home(a.id), seated = home && !a.away && !a.walking;
    const seat = seated ? (this.groups.get(a.group)?.seats.indexOf(a.id) ?? 0) : 0;
    let bx = clamp(a.x - tw / 2, this.liftW + 2, this.W - tw - 2), by = a.y - (seated ? 38 + (seat % 2) * 9 : 40);      // neighbours' bubbles sit at two heights
    if (a.chip) { const age = this.clock - a.chip.born; by -= Math.min(8, age * 10); }
    c.fillStyle = a.chip ? a.chip.color : "rgba(230,240,234,.94)"; c.fillRect(bx, by, tw, 12);
    c.fillStyle = "#06130c"; c.fillText(text, bx + 4, by + 9);
  }

  // ── taps ────────────────────────────────────────────────────────────────────────────────────────────────────────
  tap(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.W / rect.width), y = (e.clientY - rect.top) * (this.H / rect.height);
    const hit = this.hit(x, y);
    if (hit?.agent) { this.selected = hit.agent; this.draw(); this.onAgent?.(hit.agent); }
    else if (hit?.room) this.onRoom?.(hit.room);
  }

  /** What is under a point: an agent away from its desk, then a desk (the whole cell is the target), then a room. */
  hit(x, y) {
    for (const a of this.agents.values()) if ((a.away || a.walking) && Math.abs(a.x - x) < 14 && y > a.y - 32 && y < a.y + 12) return { agent: a.id };
    for (const g of this.groups.values()) {
      const r = g.rect; if (!r || x < r.x || x > r.x + r.w || y < r.y + HEAD_H - 2 || y > r.y + r.h) continue;
      const i = clamp(Math.floor((x - r.x - 3) / ((r.w - 6) / 5)), 0, 4);
      if (g.seats[i]) return { agent: g.seats[i] };
    }
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
