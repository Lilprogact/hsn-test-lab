// The Connection check page's words (js/checklogic.js). No figure here is real: they are made-up reports in the
// shape of the engine's own files. A line is a tick only when its file says so, and a cross names one thing to do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { when, daysOld, loginLine, pricesLine, goldTo, indicatorLine, agentsLine, changedPriceFiles, verdict, demoFacts, STALE_DAYS } from "../js/checklogic.js";

const NICOSIA = "Asia/Nicosia";
const NOW = Date.parse("2026-11-16T16:30:00Z");

test("a time is given in GMT and in the reader's own time", () => {
  assert.equal(when("2026-11-16T08:01:39Z", NICOSIA), "16 Nov 2026, 08:01 GMT (10:01 your time)");
  assert.equal(when("2026-11-16T23:30:00Z", NICOSIA), "16 Nov 2026, 23:30 GMT (01:30 on 17 Nov, your time)", "past midnight for the reader, the day is said too");
  assert.equal(when("2026-07-01T00:05:00Z", NICOSIA), "1 Jul 2026, 00:05 GMT (03:05 your time)", "summer time is the zone's own business; midnight is 00, not 24");
  assert.equal(when("2026-11-16T08:01:39Z", "UTC"), "16 Nov 2026, 08:01 GMT (08:01 your time)");
  assert.equal(when("not a time", NICOSIA), "an unknown time");
  assert.equal(when(null), "an unknown time");
  assert.equal(daysOld("2026-11-07T16:29:00Z", NOW), 9);
  assert.equal(daysOld("2026-11-16T08:01:00Z", NOW), 0);
  assert.equal(daysOld("2026-11-17T08:01:00Z", NOW), 0, "a moment still to come is not old");
  assert.equal(daysOld("", NOW), null);
});

const LOGIN = { checked_at: "2026-11-16T08:01:39Z", state: "ok", connected: true, forexcom: true, read_only: false, demo: true, reason: "ok_demo_trading_password",
  detail: "The login works and it is a FOREX.com DEMO account (no real money)." };

test("the login: a tick when it worked this week, and when it last did", () => {
  const l = loginLine(LOGIN, NOW, NICOSIA);
  assert.deepEqual(l, { ok: true, title: "Your FOREX.com login works", detail: "It last logged in on 16 Nov 2026, 08:01 GMT (10:01 your time). It is a FOREX.com demo account.", todo: null, button: null });
  assert.equal(loginLine({ ...LOGIN, demo: false, read_only: true }, NOW, NICOSIA).detail, "It last logged in on 16 Nov 2026, 08:01 GMT (10:01 your time). It is a read-only login.");
});

test("the login: a cross says the one thing to do, and the button goes to the page that does it", () => {
  const refused = loginLine({ checked_at: "2026-11-16T08:01:39Z", state: "failed", connected: false, forexcom: null, reason: "login_refused",
    detail: "FOREX.com refused the login (wrong account number, password or server name)." }, NOW, NICOSIA);
  assert.equal(refused.ok, false);
  assert.equal(refused.title, "Your FOREX.com login is not working");
  assert.equal(refused.detail, "FOREX.com refused the login (wrong account number, password or server name). Checked on 16 Nov 2026, 08:01 GMT (10:01 your time).");
  assert.equal(refused.todo, "Put the login in again.");
  assert.equal(refused.button, "setup", "a login that is wrong is put right on the One-time setup page");
  for (const reason of ["not_read_only", "not_forexcom", "no_connection", "login_not_a_number"]) {
    assert.equal(loginLine({ ...refused, reason }, NOW, NICOSIA).button, "setup", reason);
  }
  // GitHub's machine failed: the login was never tried, so typing it again would change nothing
  const machine = loginLine({ checked_at: "2026-11-16T08:01:39Z", state: "failed", connected: false, reason: "machine_failed",
    detail: "GitHub's Windows machine could not install or start MetaTrader 5, so the login was never tried. This is the machine, not the login; run the check again." }, NOW, NICOSIA);
  assert.equal(machine.title, "The last login check could not run");
  assert.equal(machine.todo, "Open Settings and tap Export FOREX.com history now.");
  assert.equal(machine.button, "settings");
  // it worked, but long ago: nothing has checked it since
  const old = loginLine({ ...LOGIN, checked_at: "2026-11-06T08:00:00Z" }, NOW, NICOSIA);
  assert.equal(old.ok, false);
  assert.equal(old.title, "Your FOREX.com login has not been checked for 10 days");
  assert.equal(old.button, "settings");
  assert.equal(loginLine({ ...LOGIN, checked_at: "2026-11-08T17:00:00Z" }, NOW, NICOSIA).ok, true, `${STALE_DAYS} days is still this week's download`);
  // never checked at all
  const never = loginLine(null, NOW, NICOSIA);
  assert.equal(never.ok, false);
  assert.equal(never.button, "setup");
  assert.equal(never.todo, "Put your FOREX.com demo login in once.");
  // a login that connected to somebody else's server is not a tick, whatever its state says
  assert.equal(loginLine({ ...LOGIN, forexcom: false }, NOW, NICOSIA).ok, false);
  assert.equal(loginLine({ ...LOGIN, connected: false }, NOW, NICOSIA).ok, false);
});

const COVERAGE = { checked_at: "2026-11-16T08:03:04Z", symbols: {
  XAUUSD: { first_bar: "2025-10-01T00:00:00Z", last_bar: "2026-11-16T08:01:00Z", files: [{ month: "2025-10", bars: 31615, bytes: 497287 }, { month: "2025-11", bars: 27366, bytes: 417911 }, { month: "2026-11", bars: 14333, bytes: 227977 }] },
  GBPUSD: { first_bar: "2025-10-01T00:00:00Z", last_bar: "2026-11-16T08:01:00Z", files: [{ month: "2025-10", bars: 33000, bytes: 400000 }, { month: "2025-11", bars: 30000, bytes: 380000 }] } } };
const CLOUD = { at: "2026-11-16T08:02:02Z", symbols: [{ symbol: "XAUUSD", first_bar: "2025-10-01T00:00:00Z", last_bar: "2026-11-16T08:01:00Z" }] };

test("gold prices: up to date means this week's download ran, and the line says to which minute", () => {
  const p = pricesLine(COVERAGE, CLOUD, NOW, NICOSIA);
  assert.equal(p.ok, true);
  assert.equal(p.title, "Gold prices are up to date");
  assert.equal(p.detail, "Stored up to 16 Nov 2026, 08:01 GMT (10:01 your time). They are FOREX.com's own, and a new download runs every Monday.");
  assert.deepEqual(goldTo(null, CLOUD), { first: "2025-10-01T00:00:00Z", last: "2026-11-16T08:01:00Z" }, "without the coverage file, the download's own report says where gold ends");
  assert.equal(pricesLine(null, CLOUD, NOW, NICOSIA).ok, true);
  const behind = pricesLine({ symbols: { XAUUSD: { last_bar: "2026-11-02T08:00:00Z" } } }, null, NOW, NICOSIA);
  assert.equal(behind.ok, false);
  assert.equal(behind.title, "Gold prices are 14 days behind");
  assert.equal(behind.detail, "Stored up to 2 Nov 2026, 08:00 GMT (10:00 your time). The weekly download has not run.");
  assert.equal(behind.todo, "Open Settings and tap Export FOREX.com history now.");
  assert.equal(behind.button, "settings");
  const none = pricesLine(null, { status: "waiting for the FOREX.com login" }, NOW, NICOSIA);
  assert.equal(none.ok, false);
  assert.equal(none.title, "There are no gold prices stored yet");
  assert.equal(none.detail, "Waiting for the FOREX.com login.");
  assert.equal(none.button, "setup");
  assert.equal(pricesLine({ symbols: { NAS100: { last_bar: "2026-11-16T08:01:00Z" } } }, null, NOW, NICOSIA).ok, false, "the Nasdaq being fresh says nothing about gold");
});

const MATCH = { checked_at: "2026-11-16T08:03:04Z", passes: true, mt5_passes: true, prices_accepted: true, exports: [{ file: "FOREXCOM_XAUUSD, 5.csv" }, { file: "FOREXCOM_XAUUSD, 60.csv" }],
  headline: "The Lab's copy of the indicator is proven the same as TradingView's." };

test("the indicator: judged exactly as the rest of the site judges it", () => {
  const i = indicatorLine(MATCH, NICOSIA);
  assert.deepEqual(i, { ok: true, title: "Your indicator matches TradingView", detail: "Checked on 16 Nov 2026, 08:03 GMT (10:03 your time), against 2 of your TradingView chart files.", todo: null, button: null });
  const not = indicatorLine({ ...MATCH, passes: false, headline: "The Lab's copy differs from TradingView on 3 candles of the 5-minute file" }, NICOSIA);
  assert.equal(not.ok, false);
  assert.equal(not.title, "Your indicator is not proven to match TradingView");
  assert.equal(not.detail, "The Lab's copy differs from TradingView on 3 candles of the 5-minute file.");
  assert.equal(not.button, "settings");
  assert.equal(indicatorLine(null, NICOSIA).ok, false, "no check on record is not a tick");
  assert.equal(indicatorLine({ ...MATCH, mt5_passes: false }, NICOSIA).ok, false, "the same indicator on different prices is not a tick either");
});

const agent = (id, name, role, record, { copied = true, same = true, why = [] } = {}) => ({ id, name, role, record, known_for: "most pips", copied, same, not_same_because: why,
  rerun: { practice: { stored: { sets: 356, pips: 44104.9, win_rate_pct: 46.6, pnl_gbp: 16841.78 }, now: { sets: 356, pips: 44104.9, win_rate_pct: 46.6, pnl_gbp: 16841.78 } } } });
const FIVE = [agent("A032", "Yelwen Kingsshaw", "champion", "I15049"), agent("A014", "Kelra Ravenmere", "champion", "I09404"), agent("A040", "Galiel Quillwell", "champion", "I14165"),
  agent("A013", "Nelen Yewley", "champion", "I14927"), agent("A042", "Doran Ravenley", "champion", "I15069")];
const STATUS = { written_at: "2026-11-16T16:20:26Z", prices_to: "2026-11-16T08:01:00Z", with_the_audit_desks_rerun: true, champions_ok: true,
  summary: "All 5 champions are copied and each one's record re-runs to the same numbers.",
  agents: [...FIVE, agent("A061", "Veruel Coldstead", "study only", "I15474"),
    agent("A035", "Lorys Underton", "study only", "I14665", { same: false, why: ["the minute-by-minute re-run took 960 trades on the practice months where the fast evaluation took 956"] })],
  price_files_of_the_judged_months: { XAUUSD: { "2025-10": { bars: 31615, bytes: 497287 }, "2025-11": { bars: 27366, bytes: 417911 } }, GBPUSD: { "2025-10": { bars: 33000, bytes: 400000 }, "2025-11": { bars: 30000, bytes: 380000 } } } };

test("the five agents: a tick when all five are copied and every record re-ran the same on the prices as they are today", () => {
  const a = agentsLine(STATUS, COVERAGE, NICOSIA);
  assert.equal(a.ok, true);
  assert.equal(a.title, "The five agents are copied, and each record re-runs to the same numbers");
  assert.equal(a.detail, "Re-run on 16 Nov 2026, 16:20 GMT (18:20 your time), on prices up to 16 Nov 2026, 08:01 GMT (10:01 your time). The minute-by-minute re-run agrees too. The price files of the judged months are the same ones today.");
  assert.equal(a.todo, null);
  assert.equal(a.rows.length, 5);
  assert.deepEqual(a.rows[0], { name: "Yelwen Kingsshaw", record: "I15049", knownFor: "most pips", copied: true, same: true, ok: true, why: "",
    figures: "44,105 pips, 46.6% wins, 356 trades", stored: "44,105 pips, 46.6% wins, 356 trades" });
  assert.deepEqual(a.study, [{ name: "Veruel Coldstead", record: "I15474", ok: true, why: "" },
    { name: "Lorys Underton", record: "I14665", ok: false, why: "the minute-by-minute re-run took 960 trades on the practice months where the fast evaluation took 956" }],
    "the ones copied for study do not decide the tick, and what fell short is said in plain words");
  assert.equal(agentsLine(STATUS, null, NICOSIA).detail.includes("same ones today"), false, "with no coverage file to compare with, the page does not claim the comparison");
  assert.equal(agentsLine({ ...STATUS, with_the_audit_desks_rerun: false }, COVERAGE, NICOSIA).detail.includes("minute-by-minute"), false);
});

test("the five agents: every way it can be a cross, each with one thing to do", () => {
  const ask = "Tell Claude in the Champions chat: re-run the five agents.";
  const none = agentsLine(null, COVERAGE, NICOSIA);
  assert.equal(none.ok, false);
  assert.equal(none.title, "The five agents are not copied yet");
  assert.equal(none.todo, "Tell Claude in the Champions chat: copy the five agents.");
  const swap = (i, change) => ({ ...STATUS, agents: STATUS.agents.map((a, k) => (k === i ? { ...a, ...change } : a)) });
  const uncopied = agentsLine(swap(1, { copied: false }), COVERAGE, NICOSIA);
  assert.equal(uncopied.ok, false);
  assert.equal(uncopied.title, "Kelra Ravenmere is not fully copied");
  assert.equal(uncopied.rows[1].why, "its copy is not complete");
  const two = agentsLine({ ...swap(1, { copied: false }), agents: swap(1, { copied: false }).agents.map((a, k) => (k === 3 ? { ...a, copied: false } : a)) }, COVERAGE, NICOSIA);
  assert.equal(two.title, "Kelra Ravenmere and Nelen Yewley are not fully copied");
  const off = agentsLine(swap(2, { same: false, not_same_because: ["on the practice months pips was 40463.1 and is now 40460.0"] }), COVERAGE, NICOSIA);
  assert.equal(off.ok, false);
  assert.equal(off.title, "Galiel Quillwell did not re-run to the same numbers");
  assert.ok(off.detail.startsWith("On the practice months pips was 40463.1 and is now 40460.0. Re-run on 16 Nov 2026"));
  assert.equal(off.todo, ask);
  assert.equal(off.button, null, "nothing on the site can re-run them: the line says who can");
  const flag = agentsLine({ ...STATUS, champions_ok: false, summary: "Not all champions passed" }, COVERAGE, NICOSIA);
  assert.equal(flag.ok, false, "the file's own verdict is never overruled by the page");
  const four = agentsLine({ ...STATUS, agents: STATUS.agents.filter((a) => a.id !== "A042") }, COVERAGE, NICOSIA);
  assert.equal(four.ok, false);
  assert.equal(four.title, "The check file holds 4 champions, not five");
  // the prices the records are judged on were replaced after the re-run: the re-run no longer speaks for them
  const moved = { symbols: { ...COVERAGE.symbols, XAUUSD: { ...COVERAGE.symbols.XAUUSD, files: [{ month: "2025-10", bars: 31615, bytes: 497287 }, { month: "2025-11", bars: 27367, bytes: 417990 }] } } };
  assert.deepEqual(changedPriceFiles(STATUS, moved), ["XAUUSD 2025-11"]);
  assert.deepEqual(changedPriceFiles(STATUS, COVERAGE), [], "this month's file growing does not touch the judged months");
  assert.deepEqual(changedPriceFiles(STATUS, { symbols: { XAUUSD: { files: [{ month: "2025-10", bars: 31615, bytes: 497287 }] } } }), ["XAUUSD 2025-11"], "a judged month that is gone has changed");
  const stale = agentsLine(STATUS, moved, NICOSIA);
  assert.equal(stale.ok, false);
  assert.equal(stale.title, "The prices these records are judged on have changed since the last re-run");
  assert.ok(stale.detail.startsWith("1 stored price file differs (XAUUSD 2025-11). Re-run on"));
  assert.equal(stale.todo, ask);
});

test("the sentence at the top counts what needs him, and never says all is well when a file could not be read", () => {
  const ok = { ok: true }, no = { ok: false }, unread = { ok: false, unread: true };
  assert.deepEqual(verdict([ok, ok, ok, ok]), { ok: true, text: "Everything is connected." });
  assert.deepEqual(verdict([ok, no, ok, ok]), { ok: false, text: "One thing needs you." });
  assert.deepEqual(verdict([no, no, ok, no]), { ok: false, text: "3 things need you." });
  const download = { ok: false, todo: "Open Settings and tap Export FOREX.com history now." };
  assert.deepEqual(verdict([download, download, ok, ok]), { ok: false, text: "One thing needs you." }, "the login and the prices both waiting for the weekly download are one thing to do");
  assert.deepEqual(verdict([download, download, ok, { ok: false, todo: "Tell Claude in the Champions chat: re-run the five agents." }]), { ok: false, text: "2 things need you." });
  assert.deepEqual(verdict([unread, unread, unread, unread]), { ok: false, text: "The checks could not be read." });
  assert.deepEqual(verdict([ok, unread, ok, ok]), { ok: false, text: "The checks could not be read." });
  assert.deepEqual(verdict([no, unread, ok, ok]), { ok: false, text: "2 things need you." });
});

test("what the demo account itself reports: facts only, in plain sentences", () => {
  assert.equal(demoFacts(null, NICOSIA), null, "no file, no block on the page");
  const probe = { at: "2026-11-16T16:40:00Z", ok: true, account: { leverage: 200, hedging: true },
    symbols: { XAUUSD: { margin_for_smallest_trade: { lots: 1, price: 3854.31, margin: 19.27, in: "USD", market_value_over_margin: 200.02 } } },
    history: { XAUUSD: { served: true, stopped: "two empty years in a row", one_minute_bars_back_to: "2021-10-13", any_bars_back_to: "2016-07-13" } } };
  const f = demoFacts(probe, NICOSIA);
  assert.equal(f.ok, true);
  assert.equal(f.at, "16 Nov 2026, 16:40 GMT (18:40 your time)");
  assert.deepEqual(f.lines, ["Leverage 1:200. It is a hedging account: a buy and a sell can be open together.",
    "The smallest gold trade is 1 ounce. MetaTrader works out 19.27 USD of margin for it at a price of 3,854.31, which is 1:200.",
    "Real 1-minute gold bars go back to at least 2021-10.", "Thinner gold bars go back to 2016-07."]);
  const short = demoFacts({ ...probe, history: { XAUUSD: { served: true, stopped: "out of time", one_minute_bars_back_to: "2023-07-12", any_bars_back_to: "2023-07-12" } } }, NICOSIA);
  assert.equal(short.lines[2], "Real 1-minute gold bars go back to at least 2023-07. The look back ran out of time there, so it may go further.");
  assert.equal(short.lines.length, 3);
  assert.equal(demoFacts({ ...probe, history: { XAUUSD: { served: false } } }, NICOSIA).lines[2], "MetaTrader gave no gold history in the time allowed, so how far back it goes is not known yet.");
  const refused = demoFacts({ at: "2026-11-16T16:40:00Z", ok: false, refused: "not_demo", why: "This is not a demo account. The Champions probe only ever looks at a demo account." }, NICOSIA);
  assert.deepEqual(refused.lines, ["This is not a demo account. The Champions probe only ever looks at a demo account."]);
  assert.equal(refused.ok, false);
});
