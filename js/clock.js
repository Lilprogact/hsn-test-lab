// Market clock: gold / NAS100 open or closed, time to the next open or close, and the Sydney, Tokyo, London and
// New York sessions — computed in each market's own time zone and shown in UK time. The schedule comes from
// the engine's status/market_calendar.json (MT5 spec or data-derived, with detected holidays); until that
// loads, the documented defaults are used and labelled.

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DEFAULT_SESSIONS_NY = {
  Sunday: [["18:00", "24:00"]],
  Monday: [["00:00", "17:00"], ["18:00", "24:00"]],
  Tuesday: [["00:00", "17:00"], ["18:00", "24:00"]],
  Wednesday: [["00:00", "17:00"], ["18:00", "24:00"]],
  Thursday: [["00:00", "17:00"], ["18:00", "24:00"]],
  Friday: [["00:00", "17:00"]],
  Saturday: [],
};
const FOREX_SESSIONS_NY = { ...DEFAULT_SESSIONS_NY, Sunday: [["17:00", "24:00"]] };
const SESSIONS_LOCAL = {
  Sydney: ["Australia/Sydney", "07:00", "16:00"],
  Tokyo: ["Asia/Tokyo", "09:00", "18:00"],
  London: ["Europe/London", "08:00", "17:00"],
  "New York": ["America/New_York", "08:00", "17:00"],
};

const fmtCache = new Map();
function parts(date, tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    fmtCache.set(tz, f);
  }
  const out = {};
  for (const p of f.formatToParts(date)) out[p.type] = p.value;
  return { weekday: out.weekday, year: +out.year, month: +out.month, day: +out.day, hour: +out.hour, minute: +out.minute };
}
function hm(text) {
  const [h, m] = text.split(":").map(Number);
  return h * 60 + m;
}

export class MarketHours {
  constructor(symbol, sessionsNY = DEFAULT_SESSIONS_NY, closures = [], source = "default") {
    this.symbol = symbol;
    this.sessions = sessionsNY;
    this.closures = closures;
    this.source = source;
  }
  static fromJson(j) {
    return new MarketHours(j.symbol, j.sessions_ny || DEFAULT_SESSIONS_NY, j.closures || [], j.source || "default");
  }
  static defaultFor(symbol) {
    return new MarketHours(symbol, symbol === "GBPUSD" ? FOREX_SESSIONS_NY : DEFAULT_SESSIONS_NY, [], "default");
  }
  isOpen(date) {
    const p = parts(date, "America/New_York");
    const minute = p.hour * 60 + p.minute;
    const intervals = this.sessions[p.weekday] || [];
    const scheduled = intervals.some(([a, b]) => hm(a) <= minute && minute < hm(b));
    if (!scheduled) return false;
    const t = date.getTime();
    for (const c of this.closures) {
      const w = closedWindow(c);
      if (w && w[0] <= t && t < w[1]) return false;
    }
    return true;
  }
  /** Next transition as {at: Date, opens: bool}, scanning minute by minute up to 10 days. */
  nextChange(from = new Date()) {
    const start = new Date(Math.floor(from.getTime() / 60000) * 60000);
    const state = this.isOpen(start);
    const limit = start.getTime() + 10 * 86400000;
    let t = start.getTime();
    // coarse scan by 15 min, then refine
    while (t < limit) {
      t += 15 * 60000;
      if (this.isOpen(new Date(t)) !== state) {
        let lo = t - 15 * 60000;
        while (lo < t) {
          lo += 60000;
          if (this.isOpen(new Date(lo)) !== state) return { at: new Date(lo), opens: !state };
        }
      }
    }
    return null;
  }
}

function closedWindow(c) {
  if (!c.session_start_utc || !c.session_end_utc) return null;
  const s = Date.parse(c.session_start_utc), e = Date.parse(c.session_end_utc);
  if (c.kind === "holiday") return [s, e];
  if (c.kind === "early_close" && c.last_bar_utc) return [Date.parse(c.last_bar_utc) + 60000, e];
  if (c.kind === "late_open" && c.first_bar_utc) return [s, Date.parse(c.first_bar_utc)];
  return null;
}

export function sessionStatus(date = new Date()) {
  const out = {};
  for (const [name, [tz, a, b]] of Object.entries(SESSIONS_LOCAL)) {
    const p = parts(date, tz);
    const minute = p.hour * 60 + p.minute;
    const weekday = !["Saturday", "Sunday"].includes(p.weekday);
    out[name] = { open: weekday && hm(a) <= minute && minute < hm(b), local: `${a}–${b}` };
  }
  return out;
}

export function ukTime(date, withDate = false) {
  const opts = { timeZone: "Europe/London", hourCycle: "h23", hour: "2-digit", minute: "2-digit" };
  if (withDate) Object.assign(opts, { weekday: "short", day: "2-digit", month: "short" });
  return new Intl.DateTimeFormat("en-GB", opts).format(date);
}

export function ukDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function ukTz(date = new Date()) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "short" });
  return f.formatToParts(date).find((p) => p.type === "timeZoneName")?.value || "UK";
}

export function durationText(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${mi}m`;
  return `${mi}m`;
}

/** Render the header clock bar. hoursBySymbol: {XAUUSD: MarketHours, NAS100: MarketHours}. */
export function renderClockBar(el, hoursBySymbol, marketType = null) {
  const now = new Date();
  const bits = [];
  bits.push(`<span class="pill" title="UK time">${ukTime(now, true)} ${ukTz(now)}</span>`);
  for (const [sym, h] of Object.entries(hoursBySymbol)) {
    const open = h.isOpen(now);
    const nxt = h.nextChange(now);
    const when = nxt ? `${nxt.opens ? "opens" : "closes"} ${ukTime(nxt.at, true)} UK (${durationText(nxt.at - now)})` : "";
    bits.push(`<span class="pill"><i class="dot ${open ? "on" : ""}"></i>${sym === "XAUUSD" ? "Gold" : sym} ${open ? "open" : "closed"} · ${when}${h.source === "default" ? " · default hours" : ""}</span>`);
  }
  const fx = MarketHours.defaultFor("GBPUSD");
  const gold = hoursBySymbol.XAUUSD;
  if (gold && fx.isOpen(now) && !gold.isOpen(now)) bits.push(`<span class="pill"><i class="dot warn"></i>forex open, gold frozen</span>`);
  const sess = sessionStatus(now);
  bits.push(...Object.entries(sess).map(([n, s]) => `<span class="pill"><i class="dot ${s.open ? "on" : ""}"></i>${n}</span>`));
  if (marketType) bits.push(`<span class="pill">5M ${marketType.own || "?"}${marketType.quiet ? " · quiet" : ""} · 1H ${marketType["1H"] || "?"}</span>`);
  el.innerHTML = bits.join("");
}
