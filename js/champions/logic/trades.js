// The forward test's trades, one by one, as the scorer saved them (live_test/scores/card_001_trades.json).
// Nothing is added: a trade with no exit is shown as open, and its figure is said to be at the last price.
import { pounds } from "./forward.js";

const CHART = { 1: "1M", 5: "5M", 15: "15M", 30: "30M", 45: "45M", 60: "1H", 120: "2H", 180: "3H", 240: "4H", 1440: "1D" };
const time = (iso) => { const t = Date.parse(iso || ""); return Number.isNaN(t) ? null : t; };

/** "17 Nov, 09:00 GMT": a trade's moment, short. */
export function shortTime(iso) {
  const t = time(iso);
  if (t === null) return "";
  const d = new Date(t);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(d);
  return `${day}, ${clock} GMT`;
}

/** How a trade ended, in plain words, from the Engine's own reason. */
export function wayOut(trade) {
  const parts = String(trade.how || "").split("+").filter(Boolean);
  const stillOpen = trade.out === null || trade.out === undefined;
  const word = (p) => {
    if (/^TP[123]$/.test(p)) return `target ${p.slice(2)}`;
    if (p === "SL") return Number(trade.r) > 0 ? "trailing stop" : "stop";
    if (p === "OPEN") return stillOpen ? "still open" : "closed by the indicator";
    return p.toLowerCase();
  };
  if (!parts.length) return stillOpen ? "Still open" : "Closed";
  const text = [...new Set(parts.map(word))].join(" and ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One version's trades as table rows, newest first. `r` keeps its sign; an open trade says so. */
export function tradeRows(trades) {
  return [...(trades || [])].sort((a, b) => String(b.in).localeCompare(String(a.in))).map((t) => {
    const r = Number(t.r);
    return {
      id: t.id, entered: shortTime(t.in), chart: CHART[t.chart] || `${t.chart}M`, side: t.side === "LONG" ? "Buy" : t.side === "SHORT" ? "Sell" : String(t.side || ""),
      left: t.out ? shortTime(t.out) : "Open", how: wayOut(t), open: !t.out,
      r: Number.isNaN(r) ? "" : `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}R`, money: pounds(t.gbp), sign: r > 0 ? "up" : r < 0 ? "down" : "flat",
    };
  });
}

/** "62 trades: 28 won, 31 lost, 3 still open." Only counted from the rows themselves. */
export function tradesSummary(trades) {
  const all = trades || [];
  if (!all.length) return "No trades yet.";
  const open = all.filter((t) => !t.out).length;
  const closed = all.filter((t) => t.out);
  const won = closed.filter((t) => Number(t.r) > 0).length, lost = closed.filter((t) => Number(t.r) < 0).length, flat = closed.length - won - lost;
  const bits = [`${won} won`, `${lost} lost`];
  if (flat) bits.push(`${flat} level`);
  if (open) bits.push(`${open} still open`);
  return `${all.length} trade${all.length === 1 ? "" : "s"}: ${bits.join(", ")}.`;
}
