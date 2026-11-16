// The forward test's words (js/champions/logic/forward.js). No figure here is real: they are made-up
// scores and a made-up card in the shape of the engine's own files (live_test/). The page may only say what the score
// holds: nothing is decided before the judging date, a missing figure is never shown as a nought, and a cross names
// the one thing to do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pounds, day, forwardLine, versionFigures, forwardAgents, passMarks, forwardNotes, SCORE_GRACE_MS } from "../js/champions/logic/forward.js";

const NICOSIA = "Asia/Nicosia";
const START = "2026-11-16T23:00:00Z";

const CARD = {
  card: 1, frozen_at: "2026-11-16T20:00:06Z", start: START, judged_on_the_first_score_at_or_after: "2027-02-13T00:00:00Z",
  pass_marks: { 1: "the standard account made money over the whole test, on at least 20 trades", 2: "the middle run of the small account made money, over all 1,200 runs (400 in each of the three months)",
    3: "no more than 60 of those 1,200 accounts died (1 in 20)", verdict: "PASSED if all three hold. NOT JUDGED if the version made fewer than 20 trades.",
    a_pass_is: "one stretch of twelve weeks, not proof. A version that passes is followed for a second stretch unchanged before anything is built on it." },
  versions: [
    { id: "A1-record", in_words: ["Take the indicator's XAUUSD signals on the 30M chart.", "Exit: close the whole set at TP3."], plan_words: "12.5% of the balance on every set",
      on_the_unseen_months_before_this_test: { small_account: { middle: -62.53, died: 904, runs: 2400 }, counted: false } },
    { id: "A1-finished", in_words: ["Take the indicator's XAUUSD signals on the 1H chart."], plan_words: "10% of the balance on every set",
      on_the_unseen_months_before_this_test: { small_account: { middle: 4.2, died: 0, runs: 2400 }, counted: true } },
  ],
};

const version = (id, name, kind, { trades = 0, pnl = 0, open = 0, small = null, verdict = "running", why = "nothing is decided before 2027-02-13" } = {}) =>
  ({ id, name, kind, plan_words: id.endsWith("record") ? "12.5% of the balance on every set" : "10% of the balance on every set",
     standard_account: { trades, pips: 0, win_rate_pct: null, pnl_gbp: pnl, worst_drawdown_pct: 0 }, open_trades: open, small_account_all_months: small, verdict, why });

const score = (over = {}, versions = null) => ({
  card: 1, name: "Champions forward test 1", scored_at: "2026-11-30T03:10:00Z", prices_to: "2026-11-30T01:16:00Z", start: START, started: true, weeks_complete: 2, weeks_in_all: 12,
  judged_on_the_first_score_at_or_after: "2027-02-13T00:00:00Z", judged: false, places_orders: false,
  earlier_trades: { compared_with_the_score_of_prices_to: "2026-11-23T01:16:00Z", closed_trades_compared: 41, same: true, changed: 0, appeared: 0, examples: [] },
  versions: versions || [
    version("A1-record", "Made Up One", "the record as it was", { trades: 18, pnl: 325.37, open: 2, small: { middle: 12.4, died: 3, runs: 400 } }),
    version("A1-finished", "Made Up One", "finished version of Step 3", { trades: 1, pnl: -98.2, small: { middle: -40.98, died: 0, runs: 400 } }),
    version("A2-record", "Made Up Two", "the record as it was"),
  ],
  ...over,
});

const NOW = Date.parse("2026-11-30T09:00:00Z");
const stored = (to, at = to) => ({ to, at });                // gold's newest stored minute, and when that download ran

test("pounds carry their sign, and a missing figure is never a nought", () => {
  assert.equal(pounds(325.37), "+£325");
  assert.equal(pounds(-40.98), "−£41");
  assert.equal(pounds(0), "£0");
  assert.equal(pounds(-0.3), "£0", "under 50p either way is nought pounds, with no sign");
  assert.equal(pounds(12345.6), "+£12,346");
  assert.equal(pounds(20.5), "+£21");
  assert.equal(pounds(-20.5), "−£21", "a loss of twenty pounds fifty reads like a gain of twenty pounds fifty");
  assert.equal(pounds(null), "no figure");
  assert.equal(pounds(undefined), "no figure");
  assert.equal(pounds("x"), "no figure");
  assert.equal(day("2027-02-13T00:00:00Z"), "13 Feb 2027");
  assert.equal(day(""), "an unknown day");
});

test("no score yet: a cross, and the one thing to do", () => {
  const l = forwardLine(null, CARD, stored("2026-11-16T08:01:00Z"), Date.parse("2026-11-16T21:00:00Z"), NICOSIA);
  assert.equal(l.ok, false);
  assert.equal(l.title, "The forward test has not been scored yet");
  assert.equal(l.detail, "Its rules and pass marks were frozen on 16 Nov 2026, 20:00 GMT (22:00 your time). It starts on 16 Nov 2026, 23:00 GMT (01:00 on 17 Nov, your time).");
  assert.equal(l.todo, "Tell Claude in the Champions chat: score the forward test.");
  assert.equal(l.button, null);
  assert.equal(forwardLine(null, null, null, NOW, NICOSIA).detail, "No score is on record.");
});

test("before the start: ready, and it says when it starts and why there is nothing to score", () => {
  const waiting = score({ started: false, weeks_complete: 0, prices_to: "2026-11-16T08:01:00Z", earlier_trades: { same: null, closed_trades_compared: 0, changed: 0, appeared: 0 } });
  const before = forwardLine(waiting, CARD, stored("2026-11-16T08:01:00Z", "2026-11-16T08:02:02Z"), Date.parse("2026-11-16T21:30:00Z"), NICOSIA);
  assert.deepEqual(before, { ok: true, title: "The forward test is ready", todo: null, button: null,
    detail: "It starts on 16 Nov 2026, 23:00 GMT (01:00 on 17 Nov, your time). The stored prices end on 16 Nov 2026, 08:01 GMT (10:01 your time), so there is nothing to score yet." });
  const after = forwardLine(waiting, CARD, stored("2026-11-16T08:01:00Z", "2026-11-16T08:02:02Z"), Date.parse("2026-11-18T12:00:00Z"), NICOSIA);
  assert.equal(after.ok, true, "started by the clock, and the prices have not caught up: that is how a weekly download works, not a fault");
  assert.equal(after.title, "The forward test has started");
  assert.equal(after.detail, "It started on 16 Nov 2026, 23:00 GMT (01:00 on 17 Nov, your time). The stored prices end before that, so its first score comes with the next price download.");
});

test("running: how many weeks are scored, up to which minute, and that nothing is decided yet", () => {
  const l = forwardLine(score(), CARD, stored("2026-11-30T01:16:00Z"), NOW, NICOSIA);
  assert.deepEqual(l, { ok: true, title: "The forward test is running: 2 of 12 weeks scored", todo: null, button: null,
    detail: "Scored on prices up to 30 Nov 2026, 01:16 GMT (03:16 your time). Nothing is decided before 13 Feb 2027, whatever the weekly figures say." });
  assert.equal(forwardLine(score({ weeks_complete: 0 }), CARD, stored("2026-11-30T01:16:00Z"), NOW, NICOSIA).title, "The forward test is running: the first week is not over yet");
});

test("newer prices than the score: a note while the scoring job can still be on its way, then a cross", () => {
  const lastWeek = score({ prices_to: "2026-11-23T01:16:00Z" });
  const downloaded = stored("2026-11-30T01:16:00Z", "2026-11-30T01:17:30Z");
  const at = (iso) => forwardLine(lastWeek, CARD, downloaded, Date.parse(iso), NICOSIA);
  const justDownloaded = at("2026-11-30T01:20:00Z");
  assert.equal(justDownloaded.ok, true);
  assert.match(justDownloaded.detail, /Newer prices are stored: their score follows within a few minutes of a download\.$/);
  assert.equal(at("2026-11-30T03:17:00Z").ok, true, "inside the two hours");
  assert.equal(SCORE_GRACE_MS, 2 * 3600 * 1000);
  const stuck = at("2026-11-30T03:18:00Z");
  assert.equal(stuck.ok, false, "two hours after the download and still no score: the job did not run");
  const weekend = forwardLine(lastWeek, CARD, stored("2026-11-27T21:59:00Z", "2026-11-29T10:00:00Z"), Date.parse("2026-11-29T10:03:00Z"), NICOSIA);
  assert.equal(weekend.ok, true, "a download by hand at the weekend: the newest bar is Friday's, but the download is three minutes old");
  assert.equal(forwardLine(lastWeek, CARD, { to: "2026-11-27T21:59:00Z", at: null }, Date.parse("2026-11-29T10:03:00Z"), NICOSIA).ok, false, "when the download's time is not known, the newest bar's time is all there is to go by");
  assert.equal(stuck.title, "The newest prices have not been scored in the forward test");
  assert.equal(stuck.detail, "Prices are stored up to 30 Nov 2026, 01:16 GMT (03:16 your time). The score stops at 23 Nov 2026, 01:16 GMT (03:16 your time).");
  assert.equal(stuck.todo, "Tell Claude in the Champions chat: the forward test was not scored.");
  assert.equal(forwardLine(score(), CARD, null, NOW, NICOSIA).ok, true, "the stored prices could not be read: nothing is claimed about them");
  assert.equal(forwardLine(score(), CARD, { to: null, at: null }, NOW, NICOSIA).ok, true);
});

test("an earlier week's trades changed: a cross, whatever else the score says", () => {
  const bad = score({ earlier_trades: { compared_with_the_score_of_prices_to: "2026-11-23T01:16:00Z", closed_trades_compared: 41, same: false, changed: 3, appeared: 1, examples: [] } });
  const l = forwardLine(bad, CARD, stored("2026-11-30T01:16:00Z"), NOW, NICOSIA);
  assert.equal(l.ok, false);
  assert.equal(l.title, "Trades of earlier weeks have changed in the forward test");
  assert.equal(l.detail, "3 of the trades that had closed by the last score are different now and 1 turned up inside a stretch that was already scored. A forward test may only add to what it has seen, so neither score can be trusted until the reason is found.");
  assert.equal(l.todo, "Tell Claude in the Champions chat: the forward test's past changed.");
  const one = forwardLine(score({ judged: true, earlier_trades: { same: false, changed: 1, appeared: 0 } }), CARD, null, NOW, NICOSIA);
  assert.equal(one.ok, false, "even a judged score");
  assert.match(one.detail, /^1 of the trades that had closed by the last score is different now\. /);
});

test("judged: how many passed, said once, and nothing else", () => {
  const done = (verdicts) => score({ judged: true, weeks_complete: 12, prices_to: "2027-02-15T01:16:00Z" },
    verdicts.map((v, i) => version(`A${i}-record`, `Made Up ${i}`, "the record as it was", { trades: 40, pnl: 100, verdict: v, why: "all three pass marks hold" })));
  const two = forwardLine(done(["PASSED", "FAILED", "PASSED", "NOT JUDGED"]), CARD, stored("2027-02-22T01:16:00Z"), Date.parse("2027-03-01T09:00:00Z"), NICOSIA);
  assert.deepEqual(two, { ok: true, title: "The forward test is finished: 2 of the 4 versions passed", todo: null, button: null,
    detail: "Judged on prices up to 15 Feb 2027, 01:16 GMT (03:16 your time). That score stands: the card is not scored again." });
  assert.equal(forwardLine(done(["FAILED", "NOT JUDGED"]), CARD, null, NOW, NICOSIA).title, "The forward test is finished: none of the 2 versions passed");
});

test("a version's figures: only what the score holds", () => {
  const [a, b, c] = score().versions;
  assert.equal(versionFigures(a), "18 trades, 2 still open. Standard account +£325. Small accounts: middle run +£12, 3 of 400 died.");
  assert.equal(versionFigures(b), "1 trade. Standard account −£98. Small accounts: middle run −£41, 0 of 400 died.");
  assert.equal(versionFigures(c), "No trades yet.");
  assert.equal(versionFigures(version("x", "X", "k", { trades: 4, pnl: 10 })), "4 trades. Standard account +£10.", "no small account in the score: none is made up");
  assert.equal(versionFigures({}), "No trades yet.");
});

test("the versions are shown agent by agent, with the card's own words for each", () => {
  const agents = forwardAgents(score(), CARD);
  assert.deepEqual(agents.map((a) => [a.name, a.versions.length]), [["Made Up One", 2], ["Made Up Two", 1]]);
  const [record, finished] = agents[0].versions;
  assert.deepEqual(record, { id: "A1-record", kind: "The record as it was", plan: "12.5% of the balance on every set.", figures: "18 trades, 2 still open. Standard account +£325. Small accounts: middle run +£12, 3 of 400 died.",
    chip: { text: "running", kind: "" }, why: "", rules: ["Take the indicator's XAUUSD signals on the 30M chart.", "Exit: close the whole set at TP3."],
    before: "Before this test, on the unseen months: small accounts' middle run −£63, 904 of 2,400 died. It did not count." });
  assert.equal(finished.kind, "Finished version of Step 3");
  assert.equal(finished.before, "Before this test, on the unseen months: small accounts' middle run +£4, 0 of 2,400 died.");
  assert.deepEqual(agents[1].versions[0].rules, [], "a version the card does not hold gets no rules made up for it");
  assert.equal(agents[1].versions[0].before, "");
  assert.equal(forwardAgents(score({ started: false }), null)[0].versions[0].chip.text, "waiting");
  assert.deepEqual(forwardAgents(null, CARD), []);
});

test("a verdict is shown only when the score gives one, with its reason", () => {
  const judged = score({ judged: true }, [
    version("A1-record", "Made Up One", "the record as it was", { trades: 40, pnl: 900, verdict: "PASSED", why: "all three pass marks hold" }),
    version("A1-finished", "Made Up One", "finished version of Step 3", { trades: 40, pnl: -5, verdict: "FAILED", why: "the standard account made money: no" }),
    version("A2-record", "Made Up Two", "the record as it was", { trades: 7, pnl: 50, verdict: "NOT JUDGED", why: "only 7 trades in the whole test (at least 20 are needed)" }),
  ]);
  const rows = forwardAgents(judged, CARD).flatMap((a) => a.versions);
  assert.deepEqual(rows.map((r) => [r.chip.text, r.chip.kind, r.why]), [
    ["passed", "ok", "All three pass marks hold."],
    ["failed", "no", "The standard account made money: no."],
    ["not judged", "unread", "Only 7 trades in the whole test (at least 20 are needed)."]]);
  assert.equal(forwardAgents(score(), CARD)[0].versions[0].why, "", "while it runs, no reason is given because nothing is decided");
});

test("the pass marks are the card's own, and the small print says what kind of test this is", () => {
  const p = passMarks(CARD);
  assert.deepEqual(p.marks, ["The standard account made money over the whole test, on at least 20 trades.", "The middle run of the small account made money, over all 1,200 runs (400 in each of the three months).",
    "No more than 60 of those 1,200 accounts died (1 in 20)."]);
  assert.equal(p.rule, "PASSED if all three hold. NOT JUDGED if the version made fewer than 20 trades.");
  assert.equal(p.pass, "A pass is one stretch of twelve weeks, not proof. A version that passes is followed for a second stretch unchanged before anything is built on it.");
  assert.equal(p.judged, "Judged on the first score on or after 13 Feb 2027.");
  assert.equal(passMarks(null), null);
  const notes = forwardNotes(score(), CARD, NICOSIA);
  assert.equal(notes[0], "Paper only: the Engine replays the frozen rules on real FOREX.com prices. No order is sent to any account, and it does not show how a real order would fill.");
  assert.equal(notes[1], "The rules and the pass marks were frozen on 16 Nov 2026, 20:00 GMT (22:00 your time), before the start. They cannot be changed: a changed version goes on a new card.");
  assert.equal(notes[2], "Earlier weeks are unchanged: the 41 trades that had closed by the last score are exactly as they were.");
  assert.equal(forwardNotes(score({ earlier_trades: { same: true, closed_trades_compared: 1 } }), CARD, NICOSIA)[2], "Earlier weeks are unchanged: the 1 trade that had closed by the last score is exactly as it was.");
  assert.equal(forwardNotes(score({ earlier_trades: { same: null } }), null, NICOSIA).length, 1, "nothing to compare with yet, and no card: only what kind of test it is");
  assert.equal(forwardNotes(score({ earlier_trades: { same: true, closed_trades_compared: 0 } }), null, NICOSIA).length, 1, "no trade had closed by the last score: nothing was compared, so nothing is claimed");
});
