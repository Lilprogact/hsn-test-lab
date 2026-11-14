// Plain words for the price download's report (the engine's status/mt5_cloud.json). No page code in here, so the
// tests can hold it to what it says. Nothing is worked out or estimated: every figure is the engine's own.

const day = (iso) => String(iso || "").slice(0, 10);
const minute = (iso) => String(iso || "").slice(0, 16).replace("T", " ");

/**
 * What to show for the last price download.
 *   {kind: "never"}                         it has not run
 *   {kind: "stopped", text, at}             the job stopped on purpose and says why (nothing in doubt was saved)
 *   {kind: "status", text, at}              a waiting or failed run's one line
 *   {kind: "probe", ...}                    the start-up probe (drawn by the page as before)
 *   {kind: "report", at, login, terminal, clock, notes, rows}
 */
export function exportView(m) {
  if (!m) return { kind: "never" };
  if (m.problem) return { kind: "stopped", text: m.problem, at: m.at };
  if (m.status) return { kind: "status", text: `${m.status}${m.note ? ` — ${m.note}` : ""}`, at: m.at };
  if (m.probe) return { kind: "probe", report: m };
  const c = m.clock;
  const clock = c
    ? `Bar times: ${c.words}. Read from the broker's own weekends (${c.agree} of ${c.weeks} agree; the week opens ${c.week_opens_new_york} New York)${c.live_tick === "agrees" ? ", and a live price tick agrees." : ". The market was shut, so there was no live tick to compare."}`
    : `Server clock offset ${(Number(m.server_utc_offset_seconds || 0) / 3600).toLocaleString("en-GB", { maximumFractionDigits: 1 })} h (${m.offset_measured_from || "?"})`;
  const notes = [];
  if (m.more_to_do) notes.push("This run ran out of time before it reached the oldest month asked for. The next run starts by itself and carries on from there.");
  const rows = (m.symbols || []).map((x) => {
    if (x.error) return { Symbol: x.symbol, Note: `${x.error}${x.candidates?.length ? `. Names on this server that look like it: ${x.candidates.join(", ")}` : ""}`, problem: true };
    const note = x.stopped ? x.stopped.charAt(0).toUpperCase() + x.stopped.slice(1) : x.months_left ? `${x.months_left} older month${x.months_left === 1 ? "" : "s"} still to fetch` : "";
    return {
      Symbol: x.broker_symbol && x.broker_symbol !== x.symbol ? `${x.symbol} (${x.broker_symbol} at FOREX.com)` : x.symbol,
      "Bars read": x.bars_added ?? null, Months: x.months_stored ?? null, From: day(x.first_bar), To: minute(x.last_bar), Note: note, problem: !!x.stopped,
    };
  });
  const a = m.account;
  const login = !a ? null
    : a.read_only_login ? { text: "read-only login (investor password)", kind: "good" }
      : a.demo_trading_password ? { text: "demo account, its trading password (allowed by you for a demo)", kind: "warn" }
        : { text: "login could trade: refused", kind: "bad" };
  return { kind: "report", at: m.at, login, terminal: `${m.terminal?.company || "?"} · build ${m.terminal?.build || "?"}`, clock, notes, rows, askedBackTo: m.asked_back_to || null };
}

// ── the TradingView check (the engine's status/data_match.json) ─────────────────────────────────────────────────────

/** How to make the files, in the order to do it. The first step protects the live layouts: nothing saved is changed. */
export const TV_STEPS = [
  "In Safari (the website, not the TradingView app), open a chart on tradingview.com.",
  "First make a new layout, so nothing in your live setup changes: the small arrow next to the layout's name (top right), then Create new layout. Call it Test Lab.",
  "Set the symbol to FOREXCOM:XAUUSD.",
  "Add your Adaptive Trader indicator and leave its settings alone. Keep Volume on the chart.",
  "Set the clock at the bottom right to UTC.",
  "Choose 5 minutes, and drag the chart back a few times so it loads more history.",
  "The same arrow as before, then Download chart data (older versions say Export chart data), time format ISO.",
  "Do it again on 1 hour. More timeframes (1 minute, 15 minutes, 4 hours) make the proof stronger.",
  "Give the files to Claude in the chat, or add them yourself: github.com, hsn-test-lab-engine, data/exports, Add file, Upload files. The check then runs by itself.",
];

const candles = (min) => (min == null ? "" : min % 1440 === 0 ? `${min / 1440}-day` : min % 60 === 0 ? `${min / 60}-hour` : `${min}-minute`);
const count = (n) => Number(n || 0).toLocaleString("en-GB");

/** A file's lines when the engine's report was written before it said everything in plain words. */
function olderLines(e) {
  if (e.error) return [`This file could not be used: ${e.error}`];
  const out = [];
  if (e.indicator) out.push(e.indicator.passes ? "The indicator: the Lab's copy matches TradingView on every candle judged." : "The indicator: the Lab's copy does not yet match TradingView on every candle.");
  const a = e.mt5_agreement;
  if (a) out.push(a.overlap ? `Prices: ${count(a.bars_in_both)} candles compared; ${a.passes ? "every price is the same to the cent" : "the prices are not identical"}.` : "Prices: no dates in common with the Lab's history.");
  return out;
}

/**
 * What to show for the TradingView check.
 *   {kind: "never", headline, steps}                 the check has not run
 *   {kind: "waiting", headline, steps, at}           it ran, and there are no TradingView files to compare with
 *   {kind: "report", headline, at, badges, files}    files: [{name, title, lines, problem}]
 */
export function matchView(m) {
  if (!m) return { kind: "never", headline: "The TradingView check has not run yet.", steps: TV_STEPS };
  const files = m.exports || [];
  if (!files.length) return { kind: "waiting", headline: m.headline || "No TradingView files yet, so nothing has been compared with TradingView.", steps: TV_STEPS, at: m.checked_at };
  const badges = [
    m.passes ? { text: "indicator: the same as TradingView", kind: "good" } : { text: "indicator: not proven yet", kind: "warn" },
    m.mt5_passes ? { text: m.prices_accepted ? "prices: within the gap you accepted" : "prices: the same as TradingView", kind: "good" } : { text: "prices: not identical", kind: "warn" },
  ];
  const headline = m.headline || (m.passes ? "The Lab's copy of the indicator matches TradingView." : m.reason || "The Lab's copy of the indicator is not yet proven the same as TradingView's.");
  return {
    kind: "report", headline, at: m.checked_at, badges,
    files: files.map((e) => ({
      name: e.file,
      title: [e.lab_symbol || e.symbol || "Unknown symbol", e.timeframe ? `${candles(e.timeframe)} candles` : "", e.bars ? `${count(e.bars)} candles in the file` : ""].filter(Boolean).join(" · "),
      lines: [...(e.plain?.length ? e.plain : olderLines(e)), ...(e.notes || []).map((n) => `Note: ${n}.`)],
      problem: !!e.error || (e.indicator ? !e.indicator.passes : false),
    })),
  };
}

/**
 * Whether results are still provisional, and why, in one sentence that follows "TRIAL MODE — results are provisional: ".
 * Results stop being provisional when the Lab's copy of the indicator is proven the same as TradingView's and the Lab's
 * prices have been held against TradingView's candles.
 */
export function trialReason(m) {
  if (!m) return { trial: true, reason: "these are real FOREX.com prices, but nothing has been compared with TradingView yet. Settings shows how (TradingView check)." };
  if (!m.passes) {
    if (!(m.exports || []).length) return { trial: true, reason: "these are real FOREX.com prices, but the Lab's copy of your indicator has not been checked against TradingView yet. Settings shows the five-minute steps (TradingView check)." };
    return { trial: true, reason: m.headline || m.reason || "The Lab's copy of the indicator is not yet proven the same as TradingView's." };
  }
  if (!m.mt5_passes) return { trial: true, reason: "the indicator is proven the same as TradingView's, but the Lab's prices are not identical to TradingView's to the cent. The gaps are under Settings, waiting for your decision." };
  return { trial: false, reason: "" };
}
