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
