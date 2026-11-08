// Small canvas chart kit (no third-party scripts under the CSP): lines, bars, histogram, heatmap, candles.
// Every chart is drawn from numbers the engine produced; nothing here invents or smooths data.

const COLORS = { green: "#35d07f", red: "#ff5c5c", amber: "#f5b942", blue: "#5aa9ff", purple: "#b784ff", teal: "#3fd1c9", muted: "#8fb3a3", grid: "#1f3a2e", text: "#cfe7da" };

export function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(200, rect.width), h = Math.max(120, rect.height);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = "11px -apple-system, Segoe UI, Roboto, sans-serif";
  return { ctx, w, h };
}

function niceTicks(min, max, n = 5) {
  if (!(max > min)) return [min];
  const span = max - min;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const steps = [1, 2, 2.5, 5, 10];
  let step = mag;
  for (const s of steps) if (raw <= s * mag) { step = s * mag; break; }
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

export function fmt(v, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (abs >= 1e4) return (v / 1e3).toFixed(1) + "k";
  return v.toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Line chart. series: [{name, values: number[], color}], labels: string[] (x labels, optional). */
export function lineChart(canvas, series, { labels = null, zeroLine = false, unit = "" } = {}) {
  const { ctx, w, h } = setup(canvas);
  const pad = { l: 56, r: 12, t: 12, b: 24 };
  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  if (!all.length) return empty(ctx, w, h);
  let min = Math.min(...all), max = Math.max(...all);
  if (zeroLine) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (min === max) { min -= 1; max += 1; }
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i) => pad.l + (i / Math.max(1, n - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
  ctx.strokeStyle = COLORS.grid; ctx.fillStyle = COLORS.muted; ctx.lineWidth = 1;
  for (const t of niceTicks(min, max)) {
    ctx.beginPath(); ctx.moveTo(pad.l, y(t)); ctx.lineTo(w - pad.r, y(t)); ctx.stroke();
    ctx.fillText(fmt(t) + unit, 4, y(t) + 4);
  }
  if (labels && labels.length) {
    const step = Math.max(1, Math.round(labels.length / 6));
    for (let i = 0; i < labels.length; i += step) ctx.fillText(labels[i], x(i) - 10, h - 6);
  }
  if (zeroLine) { ctx.strokeStyle = COLORS.muted; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(pad.l, y(0)); ctx.lineTo(w - pad.r, y(0)); ctx.stroke(); ctx.setLineDash([]); }
  for (const s of series) {
    ctx.strokeStyle = s.color || COLORS.green; ctx.lineWidth = s.width || 1.8; ctx.beginPath();
    let started = false;
    s.values.forEach((v, i) => { if (!Number.isFinite(v)) return; if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v)); });
    ctx.stroke();
    if (s.fill) { ctx.lineTo(x(s.values.length - 1), y(min)); ctx.lineTo(x(0), y(min)); ctx.closePath(); ctx.fillStyle = s.fill; ctx.fill(); }
  }
}

/** Bar chart. items: [{label, value, color}] */
export function barChart(canvas, items, { unit = "", horizontal = false } = {}) {
  const { ctx, w, h } = setup(canvas);
  if (!items.length) return empty(ctx, w, h);
  const vals = items.map((i) => i.value || 0);
  let min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  if (min === max) max = min + 1;
  if (horizontal) {
    const pad = { l: 120, r: 50, t: 8, b: 8 };
    const rowH = (h - pad.t - pad.b) / items.length;
    const x = (v) => pad.l + ((v - min) / (max - min)) * (w - pad.l - pad.r);
    items.forEach((it, i) => {
      const yy = pad.t + i * rowH;
      ctx.fillStyle = it.color || (it.value >= 0 ? COLORS.green : COLORS.red);
      ctx.fillRect(Math.min(x(0), x(it.value)), yy + 3, Math.abs(x(it.value) - x(0)), rowH - 6);
      ctx.fillStyle = COLORS.text; ctx.fillText(it.label, 6, yy + rowH / 2 + 4);
      ctx.fillText(fmt(it.value, 1) + unit, x(Math.max(0, it.value)) + 4, yy + rowH / 2 + 4);
    });
    ctx.strokeStyle = COLORS.muted; ctx.beginPath(); ctx.moveTo(x(0), pad.t); ctx.lineTo(x(0), h - pad.b); ctx.stroke();
    return;
  }
  const pad = { l: 50, r: 10, t: 10, b: 30 };
  const colW = (w - pad.l - pad.r) / items.length;
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
  ctx.strokeStyle = COLORS.grid; ctx.fillStyle = COLORS.muted;
  for (const t of niceTicks(min, max)) { ctx.beginPath(); ctx.moveTo(pad.l, y(t)); ctx.lineTo(w - pad.r, y(t)); ctx.stroke(); ctx.fillText(fmt(t) + unit, 4, y(t) + 4); }
  items.forEach((it, i) => {
    ctx.fillStyle = it.color || (it.value >= 0 ? COLORS.green : COLORS.red);
    const x0 = pad.l + i * colW + colW * 0.15;
    ctx.fillRect(x0, Math.min(y(0), y(it.value)), colW * 0.7, Math.abs(y(it.value) - y(0)));
    ctx.fillStyle = COLORS.text; ctx.save(); ctx.translate(x0 + colW * 0.35, h - 4); ctx.rotate(-0.4); ctx.fillText(String(it.label).slice(0, 10), -10, 0); ctx.restore();
  });
}

/** Histogram of random-run results with the real result marked. bins: [{from,to,count}], real: number. */
export function histogram(canvas, bins, real, { unit = "£" } = {}) {
  const { ctx, w, h } = setup(canvas);
  if (!bins || !bins.length) return empty(ctx, w, h);
  const pad = { l: 36, r: 10, t: 10, b: 26 };
  const maxC = Math.max(...bins.map((b) => b.count), 1);
  const lo = bins[0].from, hi = bins[bins.length - 1].to;
  const x = (v) => pad.l + ((v - lo) / Math.max(1e-9, hi - lo)) * (w - pad.l - pad.r);
  const y = (c) => pad.t + (1 - c / maxC) * (h - pad.t - pad.b);
  for (const b of bins) { ctx.fillStyle = "#2a6a4a"; ctx.fillRect(x(b.from) + 1, y(b.count), Math.max(1, x(b.to) - x(b.from) - 2), h - pad.b - y(b.count)); }
  ctx.fillStyle = COLORS.muted;
  for (const t of niceTicks(lo, hi, 5)) ctx.fillText(unit + fmt(t), x(t) - 12, h - 8);
  if (Number.isFinite(real)) {
    const xr = Math.min(w - pad.r, Math.max(pad.l, x(real)));
    ctx.strokeStyle = COLORS.amber; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xr, pad.t); ctx.lineTo(xr, h - pad.b); ctx.stroke();
    ctx.fillStyle = COLORS.amber; ctx.fillText("you " + unit + fmt(real), Math.min(w - 90, xr + 4), pad.t + 10);
  }
}

/** Heatmap grid: rows x cols with values; render into an HTML container (not canvas) for tap-ability. */
export function heatmapHtml(cells, { rows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], cols = 24 } = {}) {
  const map = new Map(cells.map((c) => [`${c.weekday}-${c.hour}`, c]));
  const vals = cells.map((c) => c.pnl).filter(Number.isFinite);
  const maxAbs = Math.max(1, ...vals.map(Math.abs));
  let html = `<div class="heat"><div class="lab"></div>${Array.from({ length: cols }, (_, i) => `<div class="lab">${i}</div>`).join("")}`;
  rows.forEach((r, ri) => {
    html += `<div class="lab">${r}</div>`;
    for (let c = 0; c < cols; c++) {
      const cell = map.get(`${ri}-${c}`);
      if (!cell) { html += `<div style="background:#101c16"></div>`; continue; }
      const a = Math.min(1, Math.abs(cell.pnl) / maxAbs) * 0.85 + 0.15;
      const bg = cell.pnl >= 0 ? `rgba(53,208,127,${a})` : `rgba(255,92,92,${a})`;
      html += `<div style="background:${bg}" title="${r} ${c}:00 UK: £${fmt(cell.pnl)} over ${cell.n} sets, avg R ${cell.avg_r ?? "—"}">${cell.n}</div>`;
    }
  });
  return html + "</div>";
}

/** Candles with optional trade markers. data: {t:[],o:[],h:[],l:[],c:[]} slice; trades: [{entryIdx, exitIdx, dir, entry, sl, tp, exit}] */
export function candles(canvas, data, from, to, trades = [], { equity = null } = {}) {
  const { ctx, w, h } = setup(canvas);
  const n = to - from;
  if (n <= 0) return empty(ctx, w, h);
  const pad = { l: 60, r: 10, t: 10, b: 40 };
  const eqH = equity ? 70 : 0;
  const ch = h - pad.t - pad.b - eqH;
  let min = Infinity, max = -Infinity;
  for (let i = from; i < to; i++) { if (data.l[i] < min) min = data.l[i]; if (data.h[i] > max) max = data.h[i]; }
  for (const tr of trades) { if (tr.sl) { min = Math.min(min, tr.sl); max = Math.max(max, tr.sl); } if (tr.tp) { min = Math.min(min, tr.tp); max = Math.max(max, tr.tp); } }
  if (!(max > min)) { min -= 1; max += 1; }
  const span = (max - min) * 0.06; min -= span; max += span;
  const cw = (w - pad.l - pad.r) / n;
  const x = (i) => pad.l + (i - from) * cw + cw / 2;
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * ch;
  ctx.strokeStyle = COLORS.grid; ctx.fillStyle = COLORS.muted;
  for (const t of niceTicks(min, max, 6)) { ctx.beginPath(); ctx.moveTo(pad.l, y(t)); ctx.lineTo(w - pad.r, y(t)); ctx.stroke(); ctx.fillText(t.toFixed(1), 4, y(t) + 4); }
  for (let i = from; i < to; i++) {
    const up = data.c[i] >= data.o[i];
    ctx.strokeStyle = ctx.fillStyle = up ? COLORS.green : COLORS.red;
    ctx.beginPath(); ctx.moveTo(x(i), y(data.h[i])); ctx.lineTo(x(i), y(data.l[i])); ctx.stroke();
    const top = y(Math.max(data.o[i], data.c[i])), bot = y(Math.min(data.o[i], data.c[i]));
    ctx.fillRect(x(i) - Math.max(1, cw * 0.35), top, Math.max(2, cw * 0.7), Math.max(1, bot - top));
  }
  // time labels (UK)
  const step = Math.max(1, Math.round(n / 6));
  for (let i = from; i < to; i += step) {
    const d = new Date(data.t[i] * 1000);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d), x(i) - 30, pad.t + ch + 14);
  }
  // trades
  for (const tr of trades) {
    const xa = x(Math.max(from, tr.entryIdx)), xb = x(Math.min(to - 1, tr.exitIdx ?? to - 1));
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
    if (tr.sl) { ctx.strokeStyle = COLORS.red; ctx.beginPath(); ctx.moveTo(xa, y(tr.sl)); ctx.lineTo(xb, y(tr.sl)); ctx.stroke(); }
    if (tr.tp) { ctx.strokeStyle = COLORS.teal; ctx.beginPath(); ctx.moveTo(xa, y(tr.tp)); ctx.lineTo(xb, y(tr.tp)); ctx.stroke(); }
    for (const lim of tr.limits || []) { ctx.strokeStyle = COLORS.amber; ctx.beginPath(); ctx.moveTo(xa, y(lim)); ctx.lineTo(xb, y(lim)); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.fillStyle = tr.dir === "LONG" ? COLORS.green : COLORS.red;
    ctx.beginPath();
    if (tr.dir === "LONG") { ctx.moveTo(xa, y(tr.entry) + 10); ctx.lineTo(xa - 6, y(tr.entry) + 20); ctx.lineTo(xa + 6, y(tr.entry) + 20); }
    else { ctx.moveTo(xa, y(tr.entry) - 10); ctx.lineTo(xa - 6, y(tr.entry) - 20); ctx.lineTo(xa + 6, y(tr.entry) - 20); }
    ctx.closePath(); ctx.fill();
    if (Number.isFinite(tr.exit) && tr.exitIdx !== undefined && tr.exitIdx < to) {
      ctx.fillStyle = (tr.pnl ?? 0) >= 0 ? COLORS.green : COLORS.red;
      ctx.beginPath(); ctx.arc(xb, y(tr.exit), 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.text; ctx.fillText(`${tr.reason || ""} ${tr.pnl !== undefined ? "£" + fmt(tr.pnl) : ""}`, xb + 6, y(tr.exit) + 4);
    }
  }
  if (equity && equity.length) {
    const top = pad.t + ch + 22;
    const ev = equity.slice(0, Math.max(1, Math.min(equity.length, to - from)));
    const emin = Math.min(...ev), emax = Math.max(...ev);
    const ey = (v) => top + (1 - (v - emin) / Math.max(1e-9, emax - emin)) * (eqH - 12);
    ctx.strokeStyle = COLORS.purple; ctx.lineWidth = 1.5; ctx.beginPath();
    ev.forEach((v, i) => { const xx = pad.l + (i / Math.max(1, ev.length - 1)) * (w - pad.l - pad.r); if (i === 0) ctx.moveTo(xx, ey(v)); else ctx.lineTo(xx, ey(v)); });
    ctx.stroke();
    ctx.fillStyle = COLORS.purple; ctx.fillText("equity £" + fmt(ev[ev.length - 1]), pad.l + 4, top + 10);
  }
}

function empty(ctx, w, h) {
  ctx.fillStyle = "#5f8473"; ctx.fillText("no data", w / 2 - 20, h / 2);
}

export { COLORS };
