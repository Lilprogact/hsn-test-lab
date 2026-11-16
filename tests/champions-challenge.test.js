// The challenge page's words (js/champions/logic/challenge.js). No figure here is real: made-up files in the shape of Step 3's own.
// The page may only repeat what the files say: a version counts only where the file says `counts`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { challengeHeadline, challengeAgents, challengeRounds, challengeTotals, byYear } from "../js/champions/logic/challenge.js";

const small = (middle, died, runs) => ({ middle, died, runs });
const FINISHED = { rounds_played: 7,
  the_records_as_they_were: { A032: { name: "Made Up One", plan_words: "12.5% of the balance on every set", practice: small(210.4, 1900, 2800), unseen: small(-62.53, 904, 2400), standard_unseen: { pnl_gbp: 2552.84, trades: 328 }, counts: false } },
  standing: { A032: { name: "Made Up One", plan_words: "10% of the balance on every set", practice: small(114.25, 0, 2800), in_words: ["Take the indicator's XAUUSD signals on the 1H chart."] } },
  finished: { A032: { name: "Made Up One", unseen: small(-8.1, 138, 2400), standard_unseen: { pnl_gbp: -685.2, trades: 96 }, counts: false } } };

test("the headline says how many versions counted, and only the file decides that", () => {
  assert.deepEqual(challengeHeadline(FINISHED), { title: "No version counted.",
    sub: "7 rounds, one change at a time, judged by the Engine. A version counts only if it also makes money on the unseen months, which were looked at once, at the end. None did." });
  const one = { rounds_played: 1, finished: { A: { counts: true }, B: { counts: false } } };
  assert.equal(challengeHeadline(one).title, "One version counted.");
  assert.match(challengeHeadline(one).sub, /^1 round, one change at a time/);
  assert.doesNotMatch(challengeHeadline(one).sub, /None did/);
  assert.equal(challengeHeadline({ rounds_played: 3, finished: { A: { counts: true }, B: { counts: true } } }).title, "2 versions counted.");
  assert.deepEqual(challengeHeadline(null), { title: "The challenge", sub: "Its result file could not be found." });
});

test("each agent: the record as it was and the finished version, on the practice months and on the unseen months", () => {
  const [a] = challengeAgents(FINISHED);
  assert.equal(a.name, "Made Up One");
  assert.deepEqual(a.versions[0], { kind: "The record as it was", plan: "12.5% of the balance on every set.", practice: "Practice months: middle run +£210, 1,900 of 2,800 died.",
    unseen: "Unseen months: middle run −£63, 904 of 2,400 died. Standard account +£2,553 on 328 trades.", chip: { text: "did not count", kind: "no" }, rules: [] });
  assert.deepEqual(a.versions[1], { kind: "Finished version", plan: "10% of the balance on every set.", practice: "Practice months: middle run +£114, 0 of 2,800 died.",
    unseen: "Unseen months: middle run −£8, 138 of 2,400 died. Standard account −£685 on 96 trades.", chip: { text: "did not count", kind: "no" }, rules: ["Take the indicator's XAUUSD signals on the 1H chart."] });
  const counted = JSON.parse(JSON.stringify(FINISHED));
  counted.finished.A032.counts = true;
  assert.deepEqual(challengeAgents(counted)[0].versions[1].chip, { text: "counted", kind: "ok" });
  const bare = { finished: { A099: { name: "No Figures", counts: false } } };
  assert.equal(challengeAgents(bare)[0].versions[0].practice, "Practice months: no figures.", "a figure that is not in the file is not made up");
  assert.deepEqual(challengeAgents(null), []);
});

test("the agents come in the order the five are always listed", () => {
  const f = { finished: { A042: { name: "E" }, A013: { name: "D" }, A999: { name: "Z" }, A032: { name: "A" }, A040: { name: "C" }, A014: { name: "B" } } };
  assert.deepEqual(challengeAgents(f).map((a) => a.name), ["A", "B", "C", "D", "E", "Z"]);
});

const ROUNDS = [
  { round: 0, name: "Made Up One", change: "the record I1 as it is", kept: true, why: "the starting point", exactly: [] },
  { round: 1, name: "Made Up One", change: "skip a signal whose stop is under 150 pips", kept: true, why: "safe, and better on the practice months", exactly: ["filters.min_risk_pips: 0.0 -> 150.0"] },
  { round: 1, name: "Made Up Two", change: "add the 15-minute chart", kept: false, why: "safe, but not better on the practice months", exactly: [] },
  { round: 2, name: "Made Up Two", change: "only sells", kept: false, not_safe_because: ["the middle run lost money on the older practice months"], exactly: [] },
];

test("the rounds are listed in order with what was tried and whether it was kept", () => {
  const rounds = challengeRounds(ROUNDS);
  assert.deepEqual(rounds.map((r) => [r.title, r.summary]), [["Where each one started", "1 records, as they were"], ["Round 1", "2 changes, 1 kept"], ["Round 2", "1 change, none kept"]]);
  assert.deepEqual(rounds[1].rows[0], { name: "Made Up One", change: "Skip a signal whose stop is under 150 pips", kept: true, why: "Safe, and better on the practice months.", exactly: ["filters.min_risk_pips: 0.0 -> 150.0"] });
  assert.equal(rounds[2].rows[0].why, "The middle run lost money on the older practice months.", "with no reason given, the first thing that made it unsafe is the reason");
  assert.equal(challengeTotals(ROUNDS), "3 changes tried, 1 kept. Every one was a change of rules: no code was written.");
  assert.equal(challengeTotals(ROUNDS.slice(0, 1)), "", "the starting point is not a change");
  assert.deepEqual(challengeRounds(null), []);
});

test("year by year: pounds with their sign, a missing year is not a nought", () => {
  const doc = { rows: [{ agent: "Made Up One", version: "the record I1", by_period: { 2020: { pnl_gbp: -135.48 }, 2021: { pnl_gbp: 4928.2 }, "the firm's months": { pnl_gbp: 23694 } } },
    { agent: "Made Up One", version: "finished version abc", by_period: { 2020: { pnl_gbp: 0 }, 2021: {}, "the firm's months": { pnl_gbp: -5 } } }] };
  const t = byYear(doc);
  assert.deepEqual(t.periods, ["2020", "2021", "Oct 2025 on"]);
  assert.deepEqual(t.rows[0], { name: "Made Up One", version: "Record", cells: [{ text: "−£135", sign: "down" }, { text: "+£4,928", sign: "up" }, { text: "+£23,694", sign: "up" }] });
  assert.deepEqual(t.rows[1].cells, [{ text: "£0", sign: "flat" }, { text: "no figure", sign: "flat" }, { text: "−£5", sign: "down" }]);
  assert.equal(t.rows[1].version, "Finished");
  assert.equal(byYear(null), null);
  assert.equal(byYear({ rows: [] }), null);
});
