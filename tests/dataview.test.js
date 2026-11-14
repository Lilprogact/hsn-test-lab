// The words the Settings page uses for the price download's report. No figure here is real: they are made-up reports
// in the engine's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportView } from "../js/dataview.js";

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
