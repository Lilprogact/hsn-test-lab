// The forward test in short and the checks list (js/champions/logic/overview.js, js/champions/logic/checks.js). Every file here is made up, in the
// shape of the engine's own. A file that could not be read is never guessed at.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hero, weeksTrack, monthEnds } from "../js/champions/logic/overview.js";
import { checkLines, checksSummary, storedPrices } from "../js/champions/logic/checks.js";

const NICOSIA = "Asia/Nicosia";
const START = "2026-11-16T23:00:00Z";
const CARD = { frozen_at: "2026-11-16T20:00:06Z", start: START, judged_on_the_first_score_at_or_after: "2027-02-13T00:00:00Z",
  months: [{ number: 1, from: START, to: "2026-12-12T00:00:00Z" }, { number: 2, from: "2026-12-12T00:00:00Z", to: "2027-01-09T00:00:00Z" }, { number: 3, from: "2027-01-09T00:00:00Z", to: "2027-02-06T00:00:00Z" }] };
const version = (name, verdict = "running") => ({ id: name, name, kind: "the record as it was", verdict, standard_account: { trades: 0, pnl_gbp: 0 } });
const score = (over = {}) => ({ start: START, started: true, weeks_complete: 3, weeks_in_all: 12, judged: false, prices_to: "2026-12-07T01:16:00Z", judged_on_the_first_score_at_or_after: "2027-02-13T00:00:00Z",
  earlier_trades: { same: true, closed_trades_compared: 40 }, versions: [version("Made Up One"), version("Made Up One"), version("Made Up Two")], ...over });
const stored = { to: "2026-12-07T01:16:00Z", at: "2026-12-07T01:17:00Z" };
const NOW = Date.parse("2026-12-07T09:00:00Z");

test("the headline says where the forward test stands, in a few words", () => {
  const waiting = score({ started: false, weeks_complete: 0, prices_to: "2026-11-16T08:01:00Z" });
  const early = { to: "2026-11-16T08:01:00Z", at: "2026-11-16T08:02:00Z" };
  assert.deepEqual(hero(waiting, CARD, early, Date.parse("2026-11-16T22:30:00Z"), NICOSIA), { ok: true, title: "Ready to start.", todo: null,
    sub: "It starts on 16 Nov 2026, 23:00 GMT (01:00 on 17 Nov, your time)." });
  assert.deepEqual(hero(waiting, CARD, early, Date.parse("2026-11-18T10:00:00Z"), NICOSIA), { ok: true, title: "It has started.", todo: null,
    sub: "It started on 16 Nov 2026, 23:00 GMT (01:00 on 17 Nov, your time). Its first score comes with the next price download." });
  assert.deepEqual(hero(score(), CARD, stored, NOW, NICOSIA), { ok: true, title: "3 of 12 weeks scored.", todo: null, sub: "Scored on prices up to 7 Dec 2026, 01:16 GMT (03:16 your time)." });
  assert.equal(hero(score({ weeks_complete: 0 }), CARD, stored, NOW, NICOSIA).title, "Week one is under way.");
  const done = (verdicts) => score({ judged: true, weeks_complete: 12, versions: verdicts.map((v, i) => version(`V${i}`, v)) });
  assert.equal(hero(done(["PASSED", "FAILED", "PASSED"]), CARD, stored, NOW, NICOSIA).title, "2 of 3 passed.");
  assert.equal(hero(done(["FAILED", "NOT JUDGED"]), CARD, stored, NOW, NICOSIA).title, "None of the 2 passed.");
});

test("when something is wrong the headline says so, with the one thing to do", () => {
  const none = hero(null, CARD, stored, NOW, NICOSIA);
  assert.equal(none.ok, false);
  assert.equal(none.title, "No score yet.");
  assert.match(none.sub, /^The forward test has not been scored yet\. /);
  assert.equal(none.todo, "Tell Claude in the Champions chat: score the forward test.");
  const changed = hero(score({ earlier_trades: { same: false, changed: 2, appeared: 0 } }), CARD, stored, NOW, NICOSIA);
  assert.deepEqual([changed.ok, changed.title, changed.todo], [false, "Something needs you.", "Tell Claude in the Champions chat: the forward test's past changed."]);
});

test("the twelve weeks: how many are scored, never more than there are, and both ends", () => {
  assert.deepEqual(weeksTrack(score(), CARD), { all: 12, done: 3, stat: "3 of 12", caption: "weeks scored", start: "Starts 16 Nov 2026", judged: "Judged from 13 Feb 2027", started: true, finished: false });
  assert.equal(weeksTrack(score({ weeks_complete: 40 }), CARD).done, 12);
  assert.equal(weeksTrack(score({ weeks_complete: -2 }), CARD).done, 0);
  const noScore = weeksTrack(null, CARD);
  assert.deepEqual([noScore.done, noScore.start, noScore.judged], [0, "Starts 16 Nov 2026", "Judged from 13 Feb 2027"], "before any score the card still gives the dates");
  assert.deepEqual([weeksTrack(null, null).start, weeksTrack(null, null).judged], ["", ""], "with neither file, no date is made up");
});

test("the card's three months are named by their last days", () => {
  assert.equal(monthEnds(CARD), "12 Dec 2026, 9 Jan 2027 and 6 Feb 2027");
  assert.equal(monthEnds(null), "");
});

const LOGIN = { checked_at: "2026-12-07T01:16:30Z", state: "ok", connected: true, forexcom: true, demo: true };
const COVERAGE = { checked_at: "2026-12-07T01:18:00Z", symbols: { XAUUSD: { first_bar: "2025-10-01T00:00:00Z", last_bar: "2026-12-07T01:16:00Z" } } };
const CLOUD = { at: "2026-12-07T01:17:00Z" };
const MATCH = { passes: true, mt5_passes: true, checked_at: "2026-11-16T08:03:00Z", exports: [1, 2] };
const champion = (i) => ({ role: "champion", name: `Champion ${i}`, record: `I${i}`, copied: true, same: true, rerun: { practice: { now: { sets: 10, pips: 100, win_rate_pct: 50 } } } });
const AGENTS = { written_at: "2026-11-16T16:27:25Z", prices_to: "2026-11-16T08:01:00Z", champions_ok: true, agents: [1, 2, 3, 4, 5].map(champion) };
const FILES = { login: LOGIN, coverage: COVERAGE, cloud: CLOUD, match: MATCH, agents: AGENTS, score: score(), card: CARD };

test("five checks, five ticks, when every file says so", () => {
  const lines = checkLines(FILES, {}, NOW, NICOSIA);
  assert.deepEqual(lines.map((l) => [l.ok, l.title]), [[true, "Your FOREX.com login works"], [true, "Gold prices are up to date"], [true, "Your indicator matches TradingView"],
    [true, "The five agents are copied, and each record re-runs to the same numbers"], [true, "The forward test is running: 3 of 12 weeks scored"]]);
  assert.deepEqual(checksSummary(lines), { ok: 5, all: 5, allOk: true, text: "5 of 5", caption: "checks pass", first: "Login, prices, indicator, agents and the forward test." });
  assert.deepEqual(storedPrices(FILES, {}), { to: "2026-12-07T01:16:00Z", at: "2026-12-07T01:17:00Z" });
});

test("a file that could not be read is a question mark with GitHub's reason, never a guess", () => {
  const failed = { login: new Error("GitHub could not be reached. Check your connection."), score: new Error("Not allowed.") };
  const lines = checkLines({ ...FILES, login: null, score: null }, failed, NOW, NICOSIA);
  assert.deepEqual([lines[0].ok, lines[0].unread, lines[0].title, lines[0].detail], [false, true, "The login check could not be read", "GitHub could not be reached. Check your connection."]);
  assert.deepEqual([lines[4].unread, lines[4].title], [true, "The forward test's score could not be read"]);
  const sum = checksSummary(lines);
  assert.deepEqual([sum.ok, sum.all, sum.allOk, sum.first], [3, 5, false, "The login check could not be read"]);
  assert.equal(storedPrices({ coverage: null, cloud: null }, { coverage: new Error("x"), cloud: new Error("x") }), null);
});

test("one fix is said once, on the first line it mends", () => {
  const old = { ...FILES, login: { ...LOGIN, checked_at: "2026-11-20T01:16:30Z" }, coverage: { symbols: { XAUUSD: { last_bar: "2026-11-20T01:16:00Z" } } }, cloud: { at: "2026-11-20T01:17:00Z" } };
  const lines = checkLines(old, {}, NOW, NICOSIA);
  assert.equal(lines[0].ok, false);
  assert.equal(lines[1].ok, false);
  assert.equal(lines[0].todo, lines[1].todo);
  assert.deepEqual([lines[0].sameFixAsAbove, lines[1].sameFixAsAbove], [false, true]);
});
