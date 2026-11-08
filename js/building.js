// The HSN Capital building: a side-on cutaway drawn with our own simple art (no characters, names, logos or art
// from any game). From the bottom up: the big Analysts' floor, floors 2 to 5 with two group rooms and a discussion
// room each, the Audit room, a lift shaft, and the CEO's office at the top. Agents are simple figures coloured by
// level, each with a name tag, a mood face and a status bubble. Every movement is a real event from
// firm/events.jsonl or a real status from status/firm_live.json: typing while testing, walking to the discussion
// room for a meeting, a transfer walking between rooms, the lift carrying a group up on a level-up (two floors on a
// skip, with a bigger celebration). With animations off, the same scene is drawn still.

const LEVEL_COLORS = { 1: "#5aa9ff", 2: "#3fd1c9", 3: "#35d07f", 4: "#f5b942", 5: "#b784ff" };
const FLOOR_H = { 1: 190, 2: 112, 3: 112, 4: 112, 5: 112 };
const TOP_H = 92;
const LIFT_W = 54;

export class Building {
  constructor(canvas, { animations = true, onAgent = null, onRoom = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.animations = animations;
    this.onAgent = onAgent;
    this.onRoom = onRoom;
    this.agents = new Map();      // id -> {id,name,floor,group,level,mood,status,detail,x,y,tx,ty,bob}
    this.rooms = [];              // {id, floor, kind, x,y,w,h, group}
    this.lift = { floor: 1, y: 0, ty: 0, passengers: [], busy: false };
    this.effects = [];            // confetti etc.
    this.queue = [];              // pending animation events
    this.firm = null;
    this.live = null;
    this.hover = null;
    canvas.addEventListener("click", (e) => this.tap(e));
    this.resize();
    window.addEventListener("resize", () => { this.resize(); this.layout(); });
    this.loop();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(320, this.canvas.getBoundingClientRect().width || 900);
    const h = TOP_H + Object.values(FLOOR_H).reduce((a, b) => a + b, 0) + 24;
    this.W = w; this.H = h;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setData(firm, live) {
    this.firm = firm; this.live = live;
    this.layout();
    for (const [id, a] of Object.entries(firm.agents || {})) {
      const st = live?.agents?.[id] || {};
      const cur = this.agents.get(id) || { id, x: 0, y: 0, tx: 0, ty: 0, bob: Math.random() * 6.28 };
      Object.assign(cur, { name: a.name, floor: a.floor, group: a.group, level: a.floor, mood: st.mood || a.mood, status: st.status || a.status, detail: st.detail || a.status_detail || "" });
      this.agents.set(id, cur);
    }
    this.placeAll(true);
  }

  layout() {
    const W = this.W;
    let y = this.H - 24;
    this.rooms = [];
    this.floorRects = {};
    for (const f of [1, 2, 3, 4, 5]) {
      const hgt = FLOOR_H[f];
      y -= hgt;
      this.floorRects[f] = { x: LIFT_W, y, w: W - LIFT_W, h: hgt };
      const groups = this.firm?.floors?.[String(f)]?.groups || [];
      const inner = { x: LIFT_W + 8, y: y + 22, w: W - LIFT_W - 16, h: hgt - 30 };
      if (f === 1) {
        const cols = 6, rows = 2, rw = inner.w / cols, rh = inner.h / rows;
        for (let i = 0; i < 12; i++) {
          const g = groups.find((x) => x.room === i) || groups[i] || null;
          this.rooms.push({ id: `F1R${i}`, floor: 1, kind: "group", x: inner.x + (i % cols) * rw + 3, y: inner.y + Math.floor(i / cols) * rh + 3, w: rw - 6, h: rh - 6, group: g });
        }
      } else {
        const rw = inner.w / 3;
        for (let i = 0; i < 2; i++) {
          const g = groups.find((x) => x.room === i) || groups[i] || null;
          this.rooms.push({ id: `F${f}R${i}`, floor: f, kind: "group", x: inner.x + i * rw + 3, y: inner.y + 3, w: rw - 6, h: inner.h - 6, group: g });
        }
        this.rooms.push({ id: `F${f}D`, floor: f, kind: "discussion", x: inner.x + 2 * rw + 3, y: inner.y + 3, w: rw - 6, h: inner.h - 6, group: null });
      }
    }
    this.topRect = { x: LIFT_W, y: y - TOP_H, w: W - LIFT_W, h: TOP_H };
    this.rooms.push({ id: "AUDIT", floor: 6, kind: "audit", x: LIFT_W + 8, y: y - TOP_H + 22, w: (W - LIFT_W) * 0.38, h: TOP_H - 30, group: null });
    this.rooms.push({ id: "CEO", floor: 6, kind: "ceo", x: LIFT_W + 16 + (W - LIFT_W) * 0.38, y: y - TOP_H + 22, w: (W - LIFT_W) * 0.55, h: TOP_H - 30, group: null });
    this.lift.ty = this.liftYFor(this.lift.floor);
    if (!this.lift.y) this.lift.y = this.lift.ty;
  }

  liftYFor(floor) {
    const r = floor >= 6 ? this.topRect : this.floorRects[floor];
    return r ? r.y + r.h - 34 : 0;
  }

  roomFor(agent) {
    const r = this.rooms.find((x) => x.kind === "group" && x.group && x.group.id === agent.group);
    if (r) return r;
    return this.rooms.find((x) => x.kind === "group" && x.floor === agent.floor) || this.rooms[0];
  }

  placeAll(snap = false) {
    const byRoom = new Map();
    for (const a of this.agents.values()) {
      let room = this.roomFor(a);
      if (a.status === "in_meeting") room = this.rooms.find((x) => x.kind === "discussion" && x.floor === a.floor) || room;
      if (a.status === "waiting_audit") room = this.rooms.find((x) => x.kind === "audit") || room;
      const list = byRoom.get(room.id) || []; list.push(a); byRoom.set(room.id, list);
      a.room = room;
    }
    for (const [rid, list] of byRoom) {
      const room = this.rooms.find((r) => r.id === rid);
      const cols = Math.max(1, Math.min(list.length, Math.floor(room.w / 26)));
      list.forEach((a, i) => {
        a.tx = room.x + 14 + (i % cols) * Math.min(26, (room.w - 20) / Math.max(1, cols));
        a.ty = room.y + room.h - 10 - Math.floor(i / cols) * 24;
        if (snap || !this.animations) { a.x = a.tx; a.y = a.ty; }
      });
    }
  }

  /** Feed real events (newest last). Recent ones (last 6 h) are animated in order. */
  playEvents(events) {
    const cutoff = Date.now() - 6 * 3600 * 1000;
    const recent = events.filter((e) => Date.parse(e.at) >= cutoff && ["level_up", "swapped_down", "transfer", "meeting_start", "meeting"].includes(e.kind));
    this.queue.push(...recent.slice(-12));
    if (!this.animations) this.queue = [];
  }

  nextEvent() {
    if (this.lift.busy || !this.queue.length) return;
    const e = this.queue.shift();
    if (e.kind === "level_up" || e.kind === "swapped_down") {
      const ids = (e.members || []).filter((id) => this.agents.has(id));
      if (!ids.length) return;
      this.lift.busy = true;
      const from = e.from, to = e.to;
      // walk to the lift, ride, walk out
      const liftX = LIFT_W / 2;
      for (const id of ids) { const a = this.agents.get(id); a.tx = liftX; a.ty = this.liftYFor(from) + 20; }
      setTimeout(() => {
        this.lift.ty = this.liftYFor(to);
        this.lift.passengers = ids;
        setTimeout(() => {
          this.lift.passengers = [];
          for (const id of ids) { const a = this.agents.get(id); a.floor = to; a.level = to; }
          this.placeAll();
          if (e.kind === "level_up") this.celebrate(this.floorRects[to] || this.topRect, e.skip ? 90 : 40);
          this.lift.busy = false;
        }, 1800);
      }, 900);
    } else if (e.kind === "transfer") {
      const a = this.agents.get(e.agent);
      const b = this.agents.get(e.swapped);
      if (a) { a.group = e.to_group; }
      if (b) { b.group = e.from_group; }
      this.placeAll();
    } else if (e.kind === "meeting_start") {
      for (const id of e.members || []) { const a = this.agents.get(id); if (a) a.status = "in_meeting"; }
      this.placeAll();
      setTimeout(() => { for (const id of e.members || []) { const a = this.agents.get(id); if (a && a.status === "in_meeting") a.status = "idle"; } this.placeAll(); }, 6000);
    }
  }

  celebrate(rect, n) {
    for (let i = 0; i < n; i++) this.effects.push({ x: rect.x + Math.random() * rect.w, y: rect.y + rect.h / 2, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3 - 1, life: 60 + Math.random() * 40, c: ["#35d07f", "#f5b942", "#5aa9ff", "#b784ff", "#3fd1c9"][i % 5] });
  }

  loop() {
    this.draw();
    if (this.animations) requestAnimationFrame(() => this.loop());
    else setTimeout(() => this.loop(), 2000);
  }

  draw() {
    const ctx = this.ctx, W = this.W, H = this.H;
    if (!this.firm) { ctx.fillStyle = "#07100c"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#8fb3a3"; ctx.fillText("Waiting for the firm's first cycle…", 20, 40); return; }
    this.nextEvent();
    // sky / ground
    ctx.fillStyle = "#07100c"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0e1a14"; ctx.fillRect(0, H - 24, W, 24);
    // shaft
    ctx.fillStyle = "#0b1712"; ctx.fillRect(0, this.topRect.y, LIFT_W, H - 24 - this.topRect.y);
    ctx.strokeStyle = "#234136"; ctx.strokeRect(0.5, this.topRect.y + 0.5, LIFT_W - 1, H - 24 - this.topRect.y - 1);
    // floors
    const levelName = { 1: "Analysts", 2: "Associates", 3: "Vice Presidents", 4: "Directors", 5: "Managing Directors" };
    for (const f of [1, 2, 3, 4, 5]) {
      const r = this.floorRects[f];
      ctx.fillStyle = f % 2 ? "#101c16" : "#13231b"; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#234136"; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.fillStyle = LEVEL_COLORS[f]; ctx.font = "bold 12px -apple-system, Segoe UI, sans-serif";
      const mgr = this.firm.managers?.[String(f)]?.name || "";
      ctx.fillText(`Floor ${f} · ${levelName[f]}`, r.x + 10, r.y + 15);
      ctx.fillStyle = "#8fb3a3"; ctx.font = "11px -apple-system, Segoe UI, sans-serif";
      ctx.fillText(`manager ${mgr}`, r.x + 170, r.y + 15);
    }
    // top: audit + CEO
    const t = this.topRect;
    ctx.fillStyle = "#182b22"; ctx.fillRect(t.x, t.y, t.w, t.h); ctx.strokeStyle = "#2f5546"; ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
    // rooms
    for (const room of this.rooms) {
      ctx.fillStyle = room.kind === "discussion" ? "#0f2a1e" : room.kind === "audit" ? "#2a1f0f" : room.kind === "ceo" ? "#241a33" : "#0b1710";
      ctx.fillRect(room.x, room.y, room.w, room.h);
      ctx.strokeStyle = room.kind === "group" && room.group?.strategy ? "#35d07f" : "#234136"; ctx.strokeRect(room.x + 0.5, room.y + 0.5, room.w - 1, room.h - 1);
      ctx.fillStyle = "#8fb3a3"; ctx.font = "10px -apple-system, Segoe UI, sans-serif";
      const label = room.kind === "group" ? (room.group ? `${room.group.id}${room.group.month_score != null ? " · " + Math.round(room.group.month_score) : ""}` : "empty") : room.kind === "discussion" ? "discussion room" : room.kind === "audit" ? "Audit desk" : `CEO's office · ${this.firm.managers?.["5"]?.name || ""} reports here`;
      ctx.fillText(label, room.x + 4, room.y + 11);
      if (room.kind === "group" && room.group?.last_challenge) {
        const lc = room.group.last_challenge;
        ctx.fillStyle = lc.passed ? "#35d07f" : "#ff5c5c"; ctx.fillRect(room.x + room.w - 10, room.y + 4, 6, 6);
      }
      // the room screen: challenge replay indicator
      if (room.kind === "group" && room.floor > 1) { ctx.fillStyle = "#0a1a12"; ctx.fillRect(room.x + room.w - 40, room.y + 16, 34, 20); ctx.strokeStyle = "#2f5546"; ctx.strokeRect(room.x + room.w - 39.5, room.y + 16.5, 33, 19); }
    }
    // lift
    this.lift.y += (this.lift.ty - this.lift.y) * (this.animations ? 0.06 : 1);
    ctx.fillStyle = "#1e3a2c"; ctx.fillRect(6, this.lift.y, LIFT_W - 12, 30); ctx.strokeStyle = "#35d07f"; ctx.strokeRect(6.5, this.lift.y + 0.5, LIFT_W - 13, 29);
    // agents
    const now = performance.now() / 1000;
    ctx.font = "9px -apple-system, Segoe UI, sans-serif";
    for (const a of this.agents.values()) {
      if (this.lift.passengers.includes(a.id)) { a.x = LIFT_W / 2 + (this.lift.passengers.indexOf(a.id) - 2) * 7; a.y = this.lift.y + 26; }
      else if (this.animations) { a.x += (a.tx - a.x) * 0.08; a.y += (a.ty - a.y) * 0.08; } else { a.x = a.tx; a.y = a.ty; }
      const typing = (a.status === "testing" || a.status === "thinking") && this.animations;
      const bob = typing ? Math.sin(now * 8 + a.bob) * 1.5 : 0;
      const c = LEVEL_COLORS[a.level] || "#5aa9ff";
      ctx.fillStyle = c; ctx.fillRect(a.x - 4, a.y - 10 + bob, 8, 10);        // body
      ctx.beginPath(); ctx.arc(a.x, a.y - 14 + bob, 4, 0, Math.PI * 2); ctx.fill();   // head
      // mood face
      ctx.strokeStyle = "#06130c"; ctx.lineWidth = 1; ctx.beginPath();
      if (a.mood === "happy" || a.mood === "proud") ctx.arc(a.x, a.y - 14 + bob, 2.2, 0.2, Math.PI - 0.2);
      else if (a.mood === "frustrated") ctx.arc(a.x, a.y - 11.5 + bob, 2.2, Math.PI + 0.2, 2 * Math.PI - 0.2);
      else { ctx.moveTo(a.x - 1.8, a.y - 13 + bob); ctx.lineTo(a.x + 1.8, a.y - 13 + bob); }
      ctx.stroke();
      // name tag
      ctx.fillStyle = "#cfe7da"; ctx.fillText(a.name.split(" ")[0], a.x - 10, a.y + 9);
      // status bubble
      if (a.status && a.status !== "idle") {
        const text = a.status === "testing" ? (a.detail || "testing") : a.status === "thinking" ? "thinking…" : a.status === "in_meeting" ? "in a meeting" : a.status === "waiting_audit" ? "waiting for audit" : a.status;
        const tw = Math.min(90, text.length * 5 + 8);
        ctx.fillStyle = "rgba(230,240,234,.9)"; ctx.fillRect(a.x + 6, a.y - 30 + bob, tw, 12);
        ctx.fillStyle = "#06130c"; ctx.fillText(text.slice(0, 18), a.x + 9, a.y - 21 + bob);
      }
    }
    // effects
    this.effects = this.effects.filter((p) => p.life > 0);
    for (const p of this.effects) { p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 1; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 3, 3); }
  }

  tap(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    for (const a of this.agents.values()) if (Math.abs(a.x - x) < 8 && y > a.y - 20 && y < a.y + 10) { this.onAgent?.(a.id); return; }
    for (const room of this.rooms) if (x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h) { this.onRoom?.(room); return; }
  }
}
