// Smart Money Concepts as the Live page says it (js/champions/logic/smc.js). The study here is made up, in the shape
// of the engine's own (champions/smc/study.json). The page repeats the engine's counts and marks; it decides nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDEAS, smcHeadline, smcTotals, smcIdeas, smcSpread, smcTrend, smcPublished, smcCandidates, smcRules, smcSmallest, smcRoundTwo } from "../js/champions/logic/smc.js";

const mark = (trades, average, t, stretches, judged = true, passes = false) => ({ trades, total_r: Math.round(trades * average * 100) / 100, average_r: average, t, days: trades,
  stretches_in_profit: stretches, judged, passes, by_stretch: [] });
const cand = (symbol, key, name, family, tf, exit, m, more = {}) => ({ id: `${symbol}:${key}${more.with_his_trend ? ":his" : ""}`, symbol, key, name, family, tf, exit, direction: "rule", with_his_trend: false,
  mark: m, spread_cost_r: 0.2, the_other_way_round: { total_r: -10, average_r: -0.119, t: -1.66, stretches_in_profit: 1 }, ...more });

const STUDY = {
  trades: 16991, sits_the_exam: [], rules: { XAUUSD: ["T5-PD-LDN", "AH"], NAS100: ["T5-PD-LDN", "OR5", "LH"] },
  luck_at_the_gate: { draws: 1000, average: 0.01, most: 1 },
  candidates: [
    cand("XAUUSD", "sweep-back-5", "sweep, traded back", "T", 5, "2R", mark(498, -0.266, -4.94, 0), { spread_cost_r: 0.335 }),
    cand("XAUUSD", "sweep-back-5", "sweep, traded back", "T", 5, "2R", mark(236, -0.266, -3.42, 1), { with_his_trend: true, spread_cost_r: 0.323 }),
    cand("XAUUSD", "gap-15", "gap entry", "FV", 15, "2R", mark(218, 0.001, 0.02, 3, false), { spread_cost_r: 0.098 }),
    cand("XAUUSD", "his-marks", "his marks, day trades", "HS", 15, "2R", mark(876, -0.174, -4.47, 0), { spread_cost_r: 0.105 }),
    cand("XAUUSD", "asian-hours", "Asian hours", "AH", 5, "run", mark(911, -0.015, -1.13, 2), { spread_cost_r: 0.039, the_other_way_round: { average_r: -0.067 } }),
    cand("NAS100", "sweep-back-5", "sweep, traded back", "T", 5, "2R", mark(578, -0.15, -2.75, 1), { spread_cost_r: 0.186 }),
    cand("NAS100", "gap-5", "gap entry", "FV", 5, "2R", mark(642, -0.084, -1.71, 1), { spread_cost_r: 0.057 }),
    cand("NAS100", "opening-range-5", "opening range, 5 minutes", "OR", 5, "run", mark(899, 0.0539, 0.71, 4), { spread_cost_r: 0.058 }),
    cand("NAS100", "last-half-hour", "last half hour", "LH", 5, "run", mark(835, -0.061, -1.92, 1), { spread_cost_r: 0.049, the_other_way_round: { average_r: -0.004 } }),
  ],
  his_trend_line: [{ id: "XAUUSD:H:his_1h", symbol: "XAUUSD", chart: "his_1h", mark: mark(4478, -0.0237, -1.09, 2) }, { id: "XAUUSD:H:his_4h", symbol: "XAUUSD", chart: "his_4h", mark: mark(4478, 0.0006, 0.03, 4) },
    { id: "NAS100:H:his_1h", symbol: "NAS100", chart: "his_1h", mark: mark(5373, 0.0257, 1.17, 4) }],
  every_rule: [
    { symbol: "XAUUSD", rule: "T5-PD-LDN", family: "T", trades: 103, "as_taught:tp2": -0.218, "mirrored:tp2": -0.406, "as_taught:tp3": 0.082, "mirrored:tp3": -0.188, middle_stop_pips: 26.3, middle_spread_share_of_stop: 0.261, smallest_position_risks_gbp: 1.99 },
    { symbol: "XAUUSD", rule: "AH", family: "AH", trades: 911, "as_taught:tp2": -0.015, "mirrored:tp2": -0.067, "as_taught:tp3": -0.015, "mirrored:tp3": -0.067, middle_stop_pips: 200.4, middle_spread_share_of_stop: 0.037, smallest_position_risks_gbp: 15.18 },
    { symbol: "NAS100", rule: "OR5", family: "OR", trades: 899, "as_taught:tp2": -0.013, "mirrored:tp2": -0.157, "as_taught:tp3": 0.054, "mirrored:tp3": -0.119, middle_stop_pips: 38.9, middle_spread_share_of_stop: 0.045, smallest_position_risks_gbp: 2.95 }],
};

test("the headline says how many ways were tried, how many could be judged and that none beat luck", () => {
  const h = smcHeadline(STUDY);
  assert.equal(h.title, "None of the 9 ways to trade these ideas made money beyond luck.");
  assert.equal(h.detail, "5 fixed rules, 16,991 trades on the 42 study months, each also taken the other way round, all judged by the Engine after the real spread. "
    + "8 of the 9 had enough trades to be judged; one made any money at all, and the strongest reached 0.71 on a mark that asks for 2.");
  assert.equal(h.luck, "To earn the exam a way had to make money, in at least 5 of the 6 stretches, and be clearly more than luck. With a coin choosing each day's direction, 0.01 earn it on average.");
  assert.equal(h.earned, 0);
  assert.equal(smcHeadline({ ...STUDY, sits_the_exam: ["NAS100:opening-range-5"] }).title, "One of the 9 ways to trade these ideas earned the exam.");
  assert.equal(smcHeadline(null), null);
  assert.equal(smcHeadline({ candidates: [] }), null);
});

test("gold beside Nasdaq: the engine's own counts, added up and nothing else", () => {
  assert.deepEqual(smcTotals(STUDY), [
    { what: "Rules tested", gold: "2", nasdaq: "3" }, { what: "Trades the Engine judged", gold: "1,014", nasdaq: "899" }, { what: "Ways with enough trades", gold: "4", nasdaq: "4" },
    { what: "In profit after the spread", gold: "0", nasdaq: "1" }, { what: "Clearly more than luck", gold: "0", nasdaq: "0" }]);
});

test("each idea's average a trade, gold beside Nasdaq, with a blank where an idea was not tried", () => {
  const rows = smcIdeas(STUDY);
  assert.deepEqual(rows[0], { idea: "Liquidity sweep, traded back (as taught)", gold: { text: "−0.27 R", sign: "down" }, nasdaq: { text: "−0.15 R", sign: "down" } });
  assert.deepEqual(rows.map((r) => r.idea), ["Liquidity sweep, traded back (as taught)", "Fair value gap entry", "Your Buy and Sell as day trades, target at twice the risk"]);
  assert.deepEqual(rows[1], { idea: "Fair value gap entry", gold: { text: "", sign: "" }, nasdaq: { text: "−0.08 R", sign: "down" } });
  assert.equal(IDEAS.length, 7);
});

test("what the spread took is the range over the judged ways of the taught families", () => {
  assert.equal(smcSpread(STUDY), "Why they lose: the spread. These trades use tight stops, so the spread takes 11% to 34% of what a trade risks on gold and 6% to 19% on Nasdaq before the trade starts. "
    + "Which way round a pattern is traded hardly matters next to that.");
  assert.equal(smcSpread({ candidates: [] }), "");
});

test("his trend line as a filter: one plain sentence an instrument, from the 1-hour line only", () => {
  assert.deepEqual(smcTrend(STUDY), [
    "Gold: trading with your 1-hour trend line instead of against it was worth −0.024 R a trade over 4,478 entries, in 2 of 6 stretches. Not more than luck.",
    "Nasdaq: trading with your 1-hour trend line instead of against it was worth +0.026 R a trade over 5,373 entries, in 4 of 6 stretches. Not more than luck."]);
});

test("the published rules: in profit but not earned is 'too small to tell'; a loss is 'not there'", () => {
  const p = smcPublished(STUDY);
  assert.deepEqual(p.map((r) => [r.rule, r.chip.text, r.chip.kind]), [["Nasdaq: the opening 5 minutes", "Too small to tell", ""], ["Nasdaq: the last half hour", "Not there", "no"], ["Gold: Asian hours", "Not there", "no"]]);
  assert.equal(p[0].text, "+0.054 R a trade after the spread over 899 trades (the spread cost 0.058 R of it), in profit in 4 of 6 stretches. The same trades the other way round: −0.119 R.");
  const earned = smcPublished({ ...STUDY, candidates: STUDY.candidates.map((c) => (c.key === "opening-range-5" ? { ...c, mark: { ...c.mark, passes: true } } : c)) });
  assert.deepEqual(earned[0].chip, { kind: "ok", text: "Earned the exam" });
});

test("every way, plain and with his trend, and every rule on its own", () => {
  const plain = smcCandidates(STUDY, "XAUUSD", false), his = smcCandidates(STUDY, "XAUUSD", true);
  assert.deepEqual(plain[0], { name: "sweep, traded back, 5-minute", exit: "Twice the risk", trades: "498", average: { text: "−0.266 R", sign: "down" }, cost: "0.335 R", stretches: "0 of 6", verdict: "No" });
  assert.deepEqual(plain.map((r) => r.verdict), ["No", "Too few trades", "No", "No"]);
  assert.equal(plain[3].name, "Asian hours");
  assert.equal(plain[3].exit, "No target");
  assert.equal(his.length, 1);
  assert.equal(his[0].trades, "236");
  const rules = smcRules(STUDY);
  assert.deepEqual(rules[0], { rule: "Gold T5-PD-LDN", trades: "103", taught: { text: "−0.218 R", sign: "down" }, mirror: { text: "−0.406 R", sign: "down" },
    taughtRun: { text: "+0.082 R", sign: "up" }, mirrorRun: { text: "−0.188 R", sign: "down" }, stop: "26.3 pips", spread: "26%", least: "£1.99" });
  assert.equal(smcSmallest(STUDY), "On scaling up: there is nothing here to scale. The size of a trade cannot turn a rule that loses after costs into one that wins. "
    + "These day trades could be sized on £100 to £500 (FOREX.com's smallest position would risk £1.99 to £2.95 on a rule's middle stop); they have no edge to size.");
  assert.equal(smcSmallest({ every_rule: [] }), "");
});

const way = (symbol, key, m, his = false) => ({ id: `${symbol}:${key}${his ? ":his" : ""}`, symbol, key, name: "noise area", with_his_trend: his, mark: m, the_other_way_round: { average_r: -0.02 } });
const ROUND = { trades: 3012, luck: { average: 0.03 }, sits_the_exam: [],
  candidates: [way("XAUUSD", "NA-FAR", mark(505, -0.011, -0.84, 2)), way("XAUUSD", "NA-IN", mark(505, -0.004, -0.4, 3), true), way("NAS100", "NA-AVG", mark(498, 0.012, 1.31, 4)), way("NAS100", "NA-IN", mark(140, 0.02, 0.9, 5, false))] };

test("round 2: none earned the exam, in plain words, with every way listed", () => {
  const r = smcRoundTwo(ROUND, null);
  assert.equal(r.title, "None of the 4 ways to trade it made money beyond luck.");
  assert.deepEqual(r.chip, { kind: "no", text: "Not more than luck" });
  assert.equal(r.detail, "Buy when price is above its usual range for that time of day, sell when below, looked at on the hour and the half hour; one trade a day, out by 16:00 New York. "
    + "3,012 trades on the 42 study months, each also taken the other way round. The strongest way reached 1.31 on a mark that asks for 2. With a coin choosing each day's direction, 0.03 earn the exam on average.");
  assert.deepEqual(r.rows[0], { who: "Gold", way: "Out beyond the far edge", trades: "505", average: { text: "−0.011 R", sign: "down" }, other: { text: "−0.020 R", sign: "down" }, stretches: "2 of 6", verdict: "No" });
  assert.deepEqual(r.rows.map((x) => [x.who, x.verdict]), [["Gold", "No"], ["Gold, with your trend line", "No"], ["Nasdaq", "No"], ["Nasdaq", "Too few trades"]]);
  assert.deepEqual(r.summary, [{ way: "Out beyond the far edge", gold: { text: "−0.011 R", sign: "down" }, nasdaq: { text: "", sign: "" } },
    { way: "Out when back inside", gold: { text: "", sign: "" }, nasdaq: { text: "+0.020 R", sign: "up" } },
    { way: "Out when back inside or across the day's average", gold: { text: "", sign: "" }, nasdaq: { text: "+0.012 R", sign: "up" } }], "the plain ways only: the one with his trend line is in the fold");
  assert.equal(r.exam, null);
  assert.equal(smcRoundTwo(null, null), null);
});

test("round 2: a way that earned the exam waits for it, then passes or does not hold", () => {
  const earned = { ...ROUND, sits_the_exam: ["NAS100:NA-AVG"], candidates: ROUND.candidates.map((c) => (c.key === "NA-AVG" ? { ...c, mark: { ...c.mark, t: 2.4, passes: true } } : c)) };
  const waiting = smcRoundTwo(earned, null);
  assert.equal(waiting.title, "One of the 4 ways earned the exam. The exam has not been sat.");
  assert.deepEqual(waiting.chip, { kind: "unread", text: "Exam to sit" });
  const failed = smcRoundTwo(earned, { candidates: [way("NAS100", "NA-AVG", mark(410, -0.003, -0.2, 2))] });
  assert.equal(failed.title, "One way earned the exam, and it did not pass it.");
  assert.deepEqual(failed.chip, { kind: "no", text: "Did not hold" });
  assert.deepEqual(failed.exam[0].stretches, "2 of 5");
  const held = smcRoundTwo(earned, { candidates: [way("NAS100", "NA-AVG", { ...mark(410, 0.02, 2.2, 4), passes: true })] });
  assert.equal(held.title, "One way passed the exam on months never read.");
  assert.deepEqual(held.chip, { kind: "ok", text: "Passed the exam" });
});
