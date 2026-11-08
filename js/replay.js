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
