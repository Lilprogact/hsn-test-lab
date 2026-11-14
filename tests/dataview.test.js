// The words the Settings page uses for the price download's report. No figure here is real: they are made-up reports
// in the engine's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportView, matchView, trialReason, TV_STEPS } from "../js/dataview.js";

const report = {
  at: "2026-11-14T13:02:11Z", runner: "github-actions-windows", asked_back_to: "2023-11", more_to_do: false,
  server_utc_offset_seconds: 7200, offset_measured_from: "gold's weekends (market shut: no live tick to compare)",
  clock: { rule: "new_york", base_seconds: 25200, words: "the broker's clock is always 7 hours ahead of New York's, so it moves with American summer time", weeks: 156, agree: 153,
    week_closes_new_york: "Friday 17:00", week_opens_new_york: "Sunday 18:00", live_tick: "market shut", also_fits: [] },
  symbols: [
    { symbol: "GBPUSD", error: "GBPUSD not available", candidates: ["GBPUSD.r", "GBPUSD.m"] },
    { symbol: "XAUUSD", broker_symbol: "XAUUSD", bars_added: 1043210, months_touched: ["2026-11"], months_stored: 37, first_bar: "2023-11-01T00:00:00Z", last_bar: "2026-11-13T21:59:00Z", months_left: 0, stopped: null },
    { symbol: "NAS100", broker_symbol: "US100", bars_added: 400000, months_stored: 14, first_bar: "2025-10-01T00:00:00Z", last_bar: "2026-11-13T21:59:00Z", months_left: 0,
      stopped: "the broker's 1-minute history thins out in 2025-09 (700 bars over 500 trading hours), which is not real 1-minute data, so the stored history starts after it" },
  ],
  terminal: { company: "GAIN Global Markets, Inc.", name: "MetaTrader 5", build: 5100, max_bars: 50000000 },
  account: { company: "Gain Global Markets, Inc. (FOREX.com Global)", read_only_login: true, demo: true, currency: "USD", demo_trading_password: false },
};

test("a finished download: the clock in words, one row a symbol, and why a history starts where it does", () => {
  const v = exportView(report);
  assert.equal(v.kind, "report");
  assert.deepEqual(v.login, { text: "read-only login (investor password)", kind: "good" });
  assert.equal(v.terminal, "GAIN Global Markets, Inc. · build 5100");
  assert.equal(v.clock, "Bar times: the broker's clock is always 7 hours ahead of New York's, so it moves with American summer time. Read from the broker's own weekends (153 of 156 agree; the week opens Sunday 18:00 New York). The market was shut, so there was no live tick to compare.");
  assert.deepEqual(v.notes, []);
  assert.deepEqual(v.rows[0], { Symbol: "GBPUSD", Note: "GBPUSD not available. Names on this server that look like it: GBPUSD.r, GBPUSD.m", problem: true });
  assert.deepEqual(v.rows[1], { Symbol: "XAUUSD", "Bars read": 1043210, Months: 37, From: "2023-11-01", To: "2026-11-13 21:59", Note: "", problem: false });
  assert.equal(v.rows[2].Symbol, "NAS100 (US100 at FOREX.com)");
  assert.match(v.rows[2].Note, /^The broker's 1-minute history thins out in 2025-09/);
  assert.equal(v.askedBackTo, "2023-11");
  assert.match(exportView({ ...report, clock: { ...report.clock, live_tick: "agrees" } }).clock, /, and a live price tick agrees\.$/);
});

test("a download that ran out of time says the next run carries on, and how much is left", () => {
  const v = exportView({ ...report, more_to_do: true, symbols: [{ ...report.symbols[1], months_stored: 9, months_left: 28 }, { ...report.symbols[1], symbol: "NAS100", months_left: 1 }] });
  assert.deepEqual(v.notes, ["This run ran out of time before it reached the oldest month asked for. The next run starts by itself and carries on from there."]);
  assert.equal(v.rows[0].Note, "28 older months still to fetch");
  assert.equal(v.rows[1].Note, "1 older month still to fetch");
});

test("never run, waiting, and stopped on purpose each get their own words", () => {
  assert.deepEqual(exportView(null), { kind: "never" });
  assert.deepEqual(exportView({ at: "2026-11-14T12:00:00Z", status: "waiting for the FOREX.com login", note: "Put the three values in." }),
    { kind: "status", text: "waiting for the FOREX.com login — Put the three values in.", at: "2026-11-14T12:00:00Z" });
  assert.deepEqual(exportView({ at: "2026-11-14T12:00:00Z", status: "stopped", problem: "only 3 of 40 weekends end at the same New York time under any clock rule, so the bars' true times cannot be told" }),
    { kind: "stopped", text: "only 3 of 40 weekends end at the same New York time under any clock rule, so the bars' true times cannot be told", at: "2026-11-14T12:00:00Z" });
  assert.equal(exportView({ probe: true, terminal_started: true }).kind, "probe");
  // a login that is the demo's trading password (only when the owner has allowed it) is said as such
  assert.deepEqual(exportView({ ...report, account: { read_only_login: false, demo_trading_password: true } }).login, { text: "demo account, its trading password (allowed by you for a demo)", kind: "warn" });
  assert.deepEqual(exportView({ ...report, account: { read_only_login: false, demo_trading_password: false } }).login, { text: "login could trade: refused", kind: "bad" });
});

// ── the TradingView check ───────────────────────────────────────────────────────────────────────────────────────────

test("before the check has run, and while there are no TradingView files, the page shows how to make them", () => {
  const never = matchView(null);
  assert.equal(never.kind, "never");
  assert.equal(never.steps, TV_STEPS);
  const waiting = matchView({ checked_at: "2026-11-14T12:33:27Z", exports: [], passes: false, mt5_passes: false, reason: "No TradingView exports in data/exports/." });
  assert.equal(waiting.kind, "waiting");
  assert.equal(waiting.headline, "No TradingView files yet, so nothing has been compared with TradingView.");
  assert.equal(waiting.at, "2026-11-14T12:33:27Z");
});

test("the steps make a new layout before anything is changed, and never touch an alert", () => {
  const layout = TV_STEPS.findIndex((s) => /new layout/i.test(s));
  const firstChange = TV_STEPS.findIndex((s) => /symbol|indicator|clock|minutes/i.test(s));
  assert.ok(layout >= 0 && layout < firstChange, "the new layout comes before the first change to a chart");
  assert.ok(TV_STEPS.every((s) => !/alert/i.test(s)));
  assert.ok(TV_STEPS.some((s) => s.includes("FOREXCOM:XAUUSD")) && TV_STEPS.some((s) => /Volume/.test(s)) && TV_STEPS.some((s) => /UTC/.test(s)));
});

const matched = {
  checked_at: "2026-11-15T09:10:00Z", passes: true, mt5_passes: false,
  headline: "The Lab's copy of the indicator is proven the same as TradingView's. Its FOREX.com prices are not identical to TradingView's to the cent; the gaps are listed for each file, for Hassan to decide on.",
  exports: [
    { file: "FOREXCOM_XAUUSD, 5_1a2b3.csv", exchange: "FOREXCOM", symbol: "XAUUSD", lab_symbol: "XAUUSD", timeframe: 5, bars: 20000, notes: [],
      indicator: { passes: true }, plain: ["The indicator: the Lab's copy gives exactly what TradingView shows on all 19,899 candles judged (the trend line, and all 3,102 Buy and Sell marks).",
        "Prices: All 20,000 TradingView candles are in the Lab at the same times. The typical gap between the two prices is 0.04, and 95 in 100 are within 0.12. A typical candle here is 2.10 tall. The largest gap is 0.61.",
        "Buy and Sell on the Lab's own prices: TradingView shows 3,050 marks and the Lab 3,049; 2,890 are on the same candle, and 61 more are one candle apart (90.2% of all marks agree exactly)."] },
    { file: "FOREXCOM_NSXUSD, 60.csv", exchange: "FOREXCOM", symbol: "NSXUSD", lab_symbol: "NAS100", timeframe: 60, bars: 5000, notes: ["the times in the file carry no time zone; they were read as UTC"],
      indicator: { passes: true }, plain: ["The indicator: the Lab's copy gives exactly what TradingView shows on all 4,899 candles judged (the trend line, and all 80 Buy and Sell marks)."] },
    { file: "FOREXCOM_XAUUSD, 1D.csv", symbol: "XAUUSD", lab_symbol: "XAUUSD", timeframe: 1440, bars: 300, indicator: { passes: true }, plain: ["The indicator: fine."] },
  ],
};

test("a report: the headline, two badges, and each file's results as the engine's own plain lines", () => {
  const v = matchView(matched);
  assert.equal(v.kind, "report");
  assert.equal(v.headline, matched.headline);
  assert.deepEqual(v.badges, [{ text: "indicator: the same as TradingView", kind: "good" }, { text: "prices: not identical", kind: "warn" }]);
  assert.equal(v.files[0].title, "XAUUSD · 5-minute candles · 20,000 candles in the file");
  assert.equal(v.files[0].name, "FOREXCOM_XAUUSD, 5_1a2b3.csv");
  assert.deepEqual(v.files[0].lines, matched.exports[0].plain);
  assert.equal(v.files[0].problem, false);
  assert.equal(v.files[1].title, "NAS100 · 1-hour candles · 5,000 candles in the file");
  assert.equal(v.files[1].lines.at(-1), "Note: the times in the file carry no time zone; they were read as UTC.");
  assert.equal(v.files[2].title, "XAUUSD · 1-day candles · 300 candles in the file");
});

test("a file that could not be used, or an indicator that does not match, is marked as a problem", () => {
  const v = matchView({ checked_at: "2026-11-15T09:10:00Z", passes: false, mt5_passes: false, reason: "At least one TradingView file could not be used; see each file's line.",
    exports: [
      { file: "OANDA_XAUUSD, 5.csv", exchange: "OANDA", symbol: "XAUUSD", lab_symbol: "XAUUSD", timeframe: 5, bars: 500, error: "the file is from OANDA, not FOREXCOM: not used",
        plain: ["This file was not used: its name does not say it is from TradingView's FOREX.com feed. Keep the name TradingView gave it (it starts with FOREXCOM_)."] },
      { file: "FOREXCOM_XAUUSD, 15.csv", symbol: "XAUUSD", lab_symbol: "XAUUSD", timeframe: 15, bars: 900, indicator: { passes: false }, plain: ["The indicator: the Lab's copy differs from TradingView on 12 of 799 candles judged, so it is not yet proven the same."] },
    ] });
  assert.deepEqual(v.badges.map((b) => b.kind), ["warn", "warn"]);
  assert.equal(v.headline, "At least one TradingView file could not be used; see each file's line.");
  assert.deepEqual(v.files.map((f) => f.problem), [true, true]);
});

test("a report written before the engine said everything in plain words still reads sensibly", () => {
  const v = matchView({ checked_at: "2026-11-10T09:00:00Z", passes: true, mt5_passes: true, exports: [
    { file: "FOREXCOM_XAUUSD, 5.csv", symbol: "XAUUSD", timeframe: 5, bars: 1500, indicator: { passes: true, signal_match_rate_after_warmup: 100 }, mt5_agreement: { overlap: true, bars_in_both: 1400, passes: true } },
    { file: "bad.csv", error: "ValueError: no 'open' column" },
  ] });
  assert.equal(v.headline, "The Lab's copy of the indicator matches TradingView.");
  assert.deepEqual(v.files[0].lines, ["The indicator: the Lab's copy matches TradingView on every candle judged.", "Prices: 1,400 candles compared; every price is the same to the cent."]);
  assert.equal(v.files[1].title, "Unknown symbol");
  assert.deepEqual(v.files[1].lines, ["This file could not be used: ValueError: no 'open' column"]);
});

test("TRIAL MODE says what is real and what is still unproven, and ends only when both checks pass", () => {
  assert.match(trialReason(null).reason, /real FOREX\.com prices, but nothing has been compared with TradingView/);
  const none = trialReason({ exports: [], passes: false, mt5_passes: false, reason: "No TradingView exports in data/exports/." });
  assert.equal(none.trial, true);
  assert.match(none.reason, /real FOREX\.com prices, but the Lab's copy of your indicator has not been checked against TradingView yet/);
  const failing = trialReason({ exports: [{ file: "a.csv" }], passes: false, mt5_passes: false, headline: "The Lab's copy of the indicator is not yet proven the same as TradingView's." });
  assert.equal(failing.reason, "The Lab's copy of the indicator is not yet proven the same as TradingView's.");
  const halfway = trialReason(matched);
  assert.equal(halfway.trial, true);
  assert.match(halfway.reason, /indicator is proven the same.*not identical.*waiting for your decision/);
  assert.deepEqual(trialReason({ exports: [{ file: "a.csv" }], passes: true, mt5_passes: true }), { trial: false, reason: "" });
});
