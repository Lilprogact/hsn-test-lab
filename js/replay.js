// Candle replay: plays the tested period through at speed; each real trade appears at its entry with its stop and
// targets and closes at its real exit while the equity curve draws alongside. Pause, scrub and speed controls.
// Everything drawn comes from replay.json (the trade log) and candles_<TF>.json (real bars).
import { h } from "./ui.js";
import { candles } from "./charts.js";

export class Replay {
  constructor(container, data, trades, { window = 120, equity = [] } = {}) {
    this.container = container;
    this.data = data;                   // {t,o,h,l,c}
    this.n = data.t.length;
    this.windowSize = Math.min(window, this.n);
    this.pos = this.windowSize;         // index of the last visible bar (exclusive)
    this.speed = 1;
    this.playing = false;
    this.timer = null;
    // map trades to bar indices
    const times = data.t;
    const idxOf = (iso) => {
      const s = Date.parse(iso) / 1000;
      let lo = 0, hi = times.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < s) lo = mid + 1; else hi = mid; }
      return lo;
    };
    this.trades = trades.map((t) => ({ ...t, entryIdx: idxOf(t.entry_t), exitIdx: idxOf(t.exit_t) })).filter((t) => t.entryIdx < this.n);
    this.equity = equity.map((e) => ({ idx: idxOf(e.time), eq: e.equity }));
    this.build();
  }

  build() {
    this.canvas = h("canvas", { class: "chart replay" });
    this.slider = h("input", { type: "range", class: "range", min: this.windowSize, max: this.n, value: this.pos, step: 1 });
    this.slider.addEventListener("input", () => { this.pos = +this.slider.value; this.draw(); });
    this.playBtn = h("button", { class: "secondary small", onclick: () => this.toggle() }, "Play");
    this.speedSel = h("select", { class: "small" }, ...[1, 2, 5, 10, 25, 60].map((s) => h("option", { value: s }, `${s}×`)));
    this.speedSel.addEventListener("change", () => { this.speed = +this.speedSel.value; });
    this.info = h("span", { class: "muted" });
    this.container.replaceChildren(
      h("div", { class: "toolbar" }, this.playBtn, h("span", { class: "muted" }, "speed"), this.speedSel,
        h("button", { class: "secondary small", onclick: () => this.step(-this.windowSize) }, "◀︎"), h("button", { class: "secondary small", onclick: () => this.step(this.windowSize) }, "▶︎"), this.info),
      this.canvas, this.slider,
    );
    requestAnimationFrame(() => this.draw());
  }

  toggle() {
    this.playing = !this.playing;
    this.playBtn.textContent = this.playing ? "Pause" : "Play";
    if (this.playing) this.tick(); else if (this.timer) clearTimeout(this.timer);
  }
  tick() {
    if (!this.playing) return;
    this.pos = Math.min(this.n, this.pos + 1);
    this.slider.value = this.pos;
    this.draw();
    if (this.pos >= this.n) { this.toggle(); return; }
    this.timer = setTimeout(() => this.tick(), Math.max(15, 400 / this.speed));
  }
  step(delta) { this.pos = Math.max(this.windowSize, Math.min(this.n, this.pos + delta)); this.slider.value = this.pos; this.draw(); }

  draw() {
    const to = this.pos, from = Math.max(0, to - this.windowSize);
    const visible = this.trades.filter((t) => t.entryIdx < to && t.entryIdx >= from - this.windowSize);
    const marks = visible.map((t) => ({
      entryIdx: t.entryIdx, exitIdx: t.exitIdx < to ? t.exitIdx : undefined, dir: t.dir, entry: t.entry, sl: t.sl, tp: t.tp,
      exit: t.exitIdx < to ? t.exit : undefined, pnl: t.exitIdx < to ? t.pnl : undefined, reason: t.exitIdx < to ? t.reason : "",
    }));
    const eq = this.equity.filter((e) => e.idx >= from && e.idx < to).map((e) => e.eq);
    candles(this.canvas, this.data, from, to, marks, { equity: eq.length ? eq : null });
    const closed = this.trades.filter((t) => t.exitIdx < to);
    const pnl = closed.reduce((a, t) => a + (t.pnl || 0), 0), pips = closed.reduce((a, t) => a + (t.pips || 0), 0);
    const d = new Date(this.data.t[to - 1] * 1000);
    this.info.textContent = `${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d)} UK · ${closed.length} closed · £${pnl.toFixed(0)} · ${pips.toFixed(0)} pips`;
  }
}


// A challenge replay: the challenge months day by day on the real daily candles, with the Engine's real Day Scores
// ticking up underneath. Everything drawn comes from one file, firm/challenges/<name>.json (written when the
// challenge ran): `candles` (daily open/high/low/close of the instrument) and `per_month[m].day_scores`.
export class ChallengeReplay {
  constructor(container, rec) {
    this.container = container; this.rec = rec;
    const cd = rec.candles || {};
    const scores = new Map();
    for (const m of Object.keys(rec.per_month || {}).sort()) for (const d of rec.per_month[m].day_scores || []) scores.set(d.day, d);
    const days = (cd.days && cd.days.length) ? cd.days : [...scores.keys()].sort();
    this.days = days.map((day, i) => ({ day, o: cd.o?.[i], h: cd.h?.[i], l: cd.l?.[i], c: cd.c?.[i], s: scores.get(day) || null }));
    this.n = this.days.length; this.pos = this.n; this.speed = 1; this.playing = false; this.timer = null;
    this.build();
  }

  build() {
    this.canvas = h("canvas", { class: "chart replay" });
    this.slider = h("input", { type: "range", class: "range", min: 1, max: Math.max(1, this.n), value: this.pos, step: 1, "aria-label": "Day" });
    this.slider.addEventListener("input", () => { this.pos = +this.slider.value; this.draw(); });
    this.playBtn = h("button", { class: "secondary small", onclick: () => this.toggle() }, "Play");
    this.speedSel = h("select", { class: "small" }, ...[1, 2, 4, 8].map((s) => h("option", { value: s }, `${s}×`)));
    this.speedSel.addEventListener("change", () => { this.speed = +this.speedSel.value; });
    this.info = h("p", { class: "muted replay-info" });
    this.container.replaceChildren(h("div", { class: "toolbar" }, this.playBtn, h("span", { class: "muted" }, "speed"), this.speedSel,
      h("button", { class: "secondary small", onclick: () => { this.pos = 1; this.slider.value = 1; this.draw(); } }, "Start")), this.canvas, this.slider, this.info);
    this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(this.canvas);
    requestAnimationFrame(() => this.draw());
  }

  toggle() {
    this.playing = !this.playing;
    this.playBtn.textContent = this.playing ? "Pause" : "Play";
    if (this.playing) { if (this.pos >= this.n) this.pos = 0; this.tick(); } else if (this.timer) clearTimeout(this.timer);
  }
  tick() {
    if (!this.playing || !this.canvas.isConnected) { this.playing = false; return; }
    this.pos = Math.min(this.n, this.pos + 1); this.slider.value = this.pos; this.draw();
    if (this.pos >= this.n) { this.toggle(); return; }
    this.timer = setTimeout(() => this.tick(), Math.max(30, 260 / this.speed));
  }

  draw() {
    const cv = this.canvas, dpr = Math.min(3, window.devicePixelRatio || 1), W = cv.clientWidth || 600, H = cv.clientHeight || 320;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#101c16"; c.fillRect(0, 0, W, H);
    const n = this.n; if (!n) { c.fillStyle = "#8fb3a3"; c.fillText("No trading days in this record.", 12, 24); return; }
    const padL = 8, padR = 52, top = 8, split = Math.round(H * 0.58), bot = H - 18, dx = (W - padL - padR) / n, shown = this.days.slice(0, this.pos);
    const hasCandles = this.days.some((d) => d.h != null);
    // candles (the scale is fixed over the whole challenge so nothing jumps while it plays)
    if (hasCandles) {
      const hi = Math.max(...this.days.map((d) => d.h ?? -Infinity)), lo = Math.min(...this.days.map((d) => d.l ?? Infinity)), py = (v) => top + (hi - v) / (hi - lo || 1) * (split - top - 8);
      c.fillStyle = "#5f8473"; c.font = "10px -apple-system, sans-serif"; c.fillText(hi.toFixed(1), W - padR + 4, top + 9); c.fillText(lo.toFixed(1), W - padR + 4, split - 8);
      shown.forEach((d, i) => {
        if (d.h == null) return;
        const x = padL + i * dx + dx / 2, up = d.c >= d.o;
        c.strokeStyle = c.fillStyle = up ? "#35d07f" : "#ff5c5c";
        c.beginPath(); c.moveTo(x, py(d.h)); c.lineTo(x, py(d.l)); c.stroke();
        const bw = Math.max(1.5, dx * 0.6); c.fillRect(x - bw / 2, Math.min(py(d.o), py(d.c)), bw, Math.max(1, Math.abs(py(d.o) - py(d.c))));
      });
    }
    // month dividers
    c.font = "10px -apple-system, sans-serif";
    let lastLabelX = -100;
    this.days.forEach((d, i) => {
      if (i !== 0 && d.day.slice(0, 7) === this.days[i - 1].day.slice(0, 7)) return;
      const x = padL + i * dx;
      c.strokeStyle = "#234136"; c.beginPath(); c.moveTo(x, top); c.lineTo(x, bot); c.stroke();
      if (x - lastLabelX >= 56) { c.fillStyle = "#8fb3a3"; c.fillText(d.day.slice(0, 7), x + 3, H - 5); lastLabelX = x; }      // a stray boundary day gets its line, not a second label
    });
    // Day Scores: a bar for each day traded, and the running Month Score as a line
    const all = this.days.map((d) => d.s?.day_score || 0), mx = Math.max(10, ...all.map(Math.abs));
    let run = 0; const cumAll = all.map((v) => (run += v)); const cmx = Math.max(10, ...cumAll.map(Math.abs));
    const zero = split + (bot - split) / 2, half = (bot - split) / 2 - 4;
    c.strokeStyle = "#2f5546"; c.beginPath(); c.moveTo(padL, zero); c.lineTo(W - padR, zero); c.stroke();
    let sum = 0, pips = 0, money = 0, traded = 0;
    shown.forEach((d, i) => {
      if (!d.s) return;
      const x = padL + i * dx + dx / 2, v = d.s.day_score, bh = Math.abs(v) / mx * half, bw = Math.max(1.5, dx * 0.6);
      c.fillStyle = v >= 0 ? "#35d07f" : "#ff5c5c"; c.fillRect(x - bw / 2, v >= 0 ? zero - bh : zero, bw, Math.max(1, bh));
      if (d.s.broke_risk_limit) { c.strokeStyle = "#f5b942"; c.strokeRect(x - bw / 2 - 1, zero - 1, bw + 2, bh + 2); }
      sum += v; pips += d.s.pips || 0; money += d.s.pnl_gbp || 0; traded += 1;
    });
    c.strokeStyle = "#e6f0ea"; c.lineWidth = 1.5; c.beginPath();
    shown.forEach((d, i) => { const x = padL + i * dx + dx / 2, y = zero - cumAll[i] / cmx * half; if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.stroke(); c.lineWidth = 1;
    c.fillStyle = "#e6f0ea"; c.font = "600 11px -apple-system, sans-serif"; c.fillText(`${sum >= 0 ? "+" : ""}${sum.toFixed(1)}`, W - padR + 4, zero + 4);
    const cur = shown[shown.length - 1];
    const dayText = cur ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(cur.day + "T12:00:00Z")) : "";
    const today = cur?.s ? `Day Score ${cur.s.day_score >= 0 ? "+" : ""}${cur.s.day_score} (${cur.s.trades} trade${cur.s.trades === 1 ? "" : "s"}, ${Math.round(cur.s.pips)} pips, £${Math.round(cur.s.pnl_gbp)}${cur.s.broke_risk_limit ? ", broke the daily loss limit: −20" : ""})` : "no trade that day";
    this.info.textContent = `${dayText} · day ${this.pos} of ${n} · ${today} · Month Score so far ${sum >= 0 ? "+" : ""}${sum.toFixed(1)} · ${Math.round(pips)} pips · £${Math.round(money)} · ${traded} days traded`;
  }
}
