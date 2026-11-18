// Nasdaq as the Live page says it (js/champions/logic/nasdaq.js). Every file here is made up, in the shape of the
// engine's own (champions/nasdaq/tv_counting.json and study.json). The page repeats the engine's counts and marks; it
// decides nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nasdaqHeadline, nasdaqProof, nasdaqExamWords, nasdaqCarried, nasdaqLong, nasdaqVersion, nasdaqUnit } from "../js/champions/logic/nasdaq.js";
import { edgeGroups, edgeHeadline, groupWords, groupWordsWith } from "../js/champions/logic/edge.js";

const run = (same, of, passes, differ, marks, mine) => ({ candles_in_the_overlap: of, in_the_lab_at_the_same_time: same, the_labs_check_passes: passes,
  trend_line: { candles_judged: 513, differ_on_judged_candles: differ }, marks_on_tradingviews_own_candles: { buy: { tradingview: marks[0], copy: marks[0], differ: 0 }, sell: { tradingview: marks[1], copy: marks[1], differ: 0 } },
  marks_on_the_labs_own_candles: mine });
const own = (tv, lab, same) => ({ tradingview: tv, lab, same_candle: same });
const COUNTING = { the_labs_setting: "18:00", marks_on_tradingviews_own_candles: { tradingview: 66, lab: 66, same_candle: 66, files_counted: 3 }, marks_on_the_labs_own_candles: { tradingview: 62, lab: 63, same_candle: 60, files_counted: 3 },
  files: [
    { timeframe: 15, lines_up_counted_from: ["18:00", "17:00"], counted_from: { "18:00": run(329, 330, true, 0, [12, 12], own(14, 14, 14)), "17:00": run(329, 330, true, 0, [12, 12], own(14, 14, 14)) } },
    { timeframe: 60, lines_up_counted_from: ["18:00", "17:00"], counted_from: { "18:00": run(237, 242, false, 24, [7, 6], own(15, 16, 14)), "17:00": run(237, 242, false, 24, [7, 6], own(15, 16, 14)) } },
    { timeframe: 240, lines_up_counted_from: ["17:00"], counted_from: { "18:00": run(0, 549, false, 52, [15, 14], null), "17:00": run(549, 549, true, 0, [15, 14], own(33, 33, 32)) } }] };

test("the copy against TradingView: every mark, file by file, and the hour the candles are counted from", () => {
  const p = nasdaqProof(COUNTING);
  assert.equal(p.title, "The copy gives all 66 Buy and Sell marks of your TradingView files.");
  assert.deepEqual(p.rows[0], { chart: "15-minute", asLab: "329 of 330", other: "", marks: "24 of 24", mine: "14 of 14", check: "Passes", line: "" });
  assert.deepEqual(p.rows[1], { chart: "1-hour", asLab: "237 of 242", other: "", marks: "13 of 13", mine: "14 of 15", check: "Does not pass",
    line: "1-hour file: the trend line differs on 24 of 513 judged candles, so the Lab's own check does not pass it; every Buy and Sell mark is the same." });
  assert.deepEqual(p.rows[2], { chart: "4-hour", asLab: "0 of 549", other: "549 of 549 from 17:00", marks: "29 of 29", mine: "32 of 33", check: "Passes only from 17:00", line: "" });
  assert.deepEqual(p.notes, [p.rows[1].line]);
  assert.equal(p.fault, "Your chart counts Nasdaq's candles from 17:00 New York. The Lab counts them from 18:00, so none of its 549 4-hour candles line up with yours. "
    + "Counted from 17:00, all 549 do. The Champions study counts from 17:00; the Lab's own Engine still counts from 18:00.");
  assert.equal(p.detail, "On the Lab's own FOREX.com candles, 60 of TradingView's 62 marks are on the same candle (the Lab shows 63).");
});

test("a copy that misses a mark is not said to give them all, and no fault is named when every file lines up", () => {
  const short = { ...COUNTING, marks_on_tradingviews_own_candles: { tradingview: 37, same_candle: 35 }, files: COUNTING.files.slice(0, 2) };
  const p = nasdaqProof(short);
  assert.equal(p.title, "The copy gives 35 of the 37 Buy and Sell marks of your TradingView files.");
  assert.equal(p.fault, "");
  assert.equal(nasdaqProof(null), null);
  assert.equal(nasdaqProof({ files: [] }), null);
});

const kind = (group, ways, over = {}) => ({ group, ways, signals: [61, 61, 61, 52, 65, 61], average_r: [0.002, 0.104, -0.026, 0.224, -0.014, -0.039], total_r: 13.2, average_r_over_all: 0.0366,
  stretches_in_profit: 3, stretches_below_all_signals: 3, judged: true, on_golds_exam: { signals: 290, average_r: 0.0678, stretches_in_profit: 4, stretches_below_all_signals: 1 }, ...over });
const STUDY = { written_at: "2026-11-18T21:50:23Z", signals: 9281, families: 70, months: { stretches: [["2020-01", "2021-01"], ["2021-03"], ["2022-05"], ["2023-07"], ["2024-09"], ["2025-10", "2026-09"]], not_read: "the 6 unseen months" },
  exits: { "tp3+trail": { exit: "the whole set out at target 3, following the trailing stop", all_signals: { average_r: [0.009, 0.051, 0.017, 0.01, -0.01, -0.033], total_r: 63.1 }, everywhere: 16, mostly: 69,
    shuffled: { times: 200, everywhere_most: 30, mostly_most: 88 },
    holds_everywhere: [{ group: "buys, 180 to 250", ways: ["direction", "stop"], signals: [100, 100, 100, 100, 100, 109], average_r: [0.1, 0.1, 0.1, 0.3, 0.2, 0.026], total_r: 88.9, worst_stretch_average_r: 0.026 }] },
    "tp1+trail": { exit: "the whole set out at target 1, following the trailing stop", all_signals: { average_r: [-0.01, 0.009, -0.019, -0.029, -0.031, -0.038], total_r: -184.7 }, everywhere: 1, mostly: 17,
      shuffled: { times: 200, everywhere_most: 7, mostly_most: 32 }, holds_everywhere: [] } },
  carried_over_from_gold: {
    winners: { sat: 1, judged: 1, pass: 0, shuffled: { times: 200 }, beside_the_shuffles: "no more than luck gives", kinds: [kind("1-hour chart, 4-hour chart points the same way", ["chart", "htf240"], { passes: false, shuffles_in_which_it_passes: 21 })] },
    losers: { sat: 2, judged: 2, worse_again: 0, shuffled: { times: 200 }, beside_the_shuffles: "no more than luck gives",
      kinds: [kind("15-minute chart", ["chart"], { signals: [619, 614, 639, 638, 646, 661], average_r_over_all: -0.0025, stretches_below_all_signals: 4, worse_again: false, shuffles_in_which_it_is_worse: 23,
        on_golds_exam: { signals: 2954, average_r: -0.1067 } }),
      kind("under 0.5", ["confidence"], { signals: [10, 10, 10, 10, 10, 10], judged: false, worse_again: false, shuffles_in_which_it_is_worse: 0, on_golds_exam: { signals: 239, average_r: -0.1035 } })] } },
  the_exam: { the_exam_is_sat: false, exit: null } };

test("what gold's exam left standing, tried on Nasdaq: each kind's own mark and how often luck gave it", () => {
  const c = nasdaqCarried(STUDY);
  assert.equal(c.title, "None of the three things gold's exam left standing show again on Nasdaq.");
  assert.equal(c.verdict, "That is no more than luck gives.");
  assert.deepEqual(c.rows[0], { group: "1-hour chart, 4-hour chart points the same way", was: "Passed", gold: "+0.068 R over 290", average: "+0.037 R over 361", stretches: "3 of 6 in profit",
    again: "Does not hold", luck: "21 of 200" });
  assert.deepEqual(c.rows[1], { group: "15-minute chart", was: "Worse again", gold: "−0.107 R over 2,954", average: "−0.003 R over 3,817", stretches: "4 of 6 below", again: "Not worse", luck: "23 of 200" });
  assert.deepEqual([c.rows[2].group, c.rows[2].again, c.rows[2].luck], ["Confidence under 0.5", "Not judged", ""]);
  const one = nasdaqCarried({ carried_over_from_gold: { winners: { pass: 1, shuffled: { times: 200 }, beside_the_shuffles: "more than any of the shuffles gave", kinds: [kind("a", ["chart"], { passes: true, shuffles_in_which_it_passes: 0 })] },
    losers: { worse_again: 0, beside_the_shuffles: "no more than luck gives", kinds: [] } } });
  assert.equal(one.title, "One of the one things gold's exam left standing shows again on Nasdaq.");
  assert.equal(one.verdict, "", "two different lines beside the shuffles are not merged into one");
  assert.equal(one.rows[0].again, "Holds again");
  assert.equal(nasdaqCarried(null), null);
  assert.equal(nasdaqCarried({}), null);
});

test("whether the exam was earned is the study's own word, with what was not read", () => {
  assert.deepEqual(nasdaqExamWords(STUDY), { earned: false, text: "The exam was not earned, so the months held back were not read. One later idea can still be tried on them.",
    why: "To earn it the study had to stand above every one of its shuffles under some exit, or all the signals together had to make money in every stretch. Not read: the 6 unseen months." });
  assert.deepEqual(nasdaqExamWords({ the_exam: { the_exam_is_sat: true, exit: "tp3+trail" } }), { earned: true, text: "The exam on the months held back was earned and has been sat.", why: "" });
  assert.equal(nasdaqExamWords({}), null);
  assert.equal(nasdaqExamWords({ the_exam: {} }), null);
});

test("Nasdaq's stop sizes are said in points, gold's stay in pips, and the study's headline names Nasdaq's months", () => {
  assert.equal(nasdaqUnit, "points");
  assert.deepEqual(edgeGroups(STUDY, "tp3+trail", nasdaqUnit).map((g) => [g.group, g.signals, g.worst]), [["Buys, stop 180 to 250 points", "609", "+0.026 R"]]);
  assert.equal(edgeGroups(STUDY, "tp3+trail")[0].group, "Buys, stop 180 to 250 pips");
  assert.equal(groupWords({ group: "180 to 250", ways: ["stop"] }), "Stop 180 to 250 pips");
  assert.equal(groupWordsWith({ group: "180 to 250, buys", ways: ["stop", "direction"] }, "points"), "Stop 180 to 250 points, buys");
  const h = edgeHeadline(STUDY, "Europe/London", "Nasdaq's study months");
  assert.equal(h.title, "Taken together the signals lose with some exits and not with others. 16 kinds of signal made money in every stretch, which is no more than luck gives.");
  assert.ok(h.detail.startsWith("9,281 signals with no rule applied, grouped 70 ways, in six stretches of Nasdaq's study months (Jan 2020 to Sep 2026). "));
  assert.ok(edgeHeadline(STUDY, "Europe/London").detail.includes("in six stretches of months the agents study (Jan 2020 to Sep 2026)"), "gold's words are as they were");
  assert.equal(h.beyond, false);
});

test("the Nasdaq study's headline: how many exits make money taken together, and whether any kind beats luck", () => {
  const h = nasdaqHeadline(STUDY, "Europe/London");
  assert.equal(h.title, "One exit of two makes money: +63 R at best over 9,281 signals. No kind of signal beats luck.");
  assert.ok(h.detail.startsWith("Under the best exit all the signals together come to +0.007 R a signal. 9,281 signals with no rule applied, grouped 70 ways, in six stretches of Nasdaq's study months (Jan 2020 to Sep 2026). "));
  assert.deepEqual([h.key, h.exit, h.beyond], ["tp3+trail", "Target 3, trailing stop", false]);
  const lose = { ...STUDY, exits: { "tp1+trail": STUDY.exits["tp1+trail"] } };
  assert.equal(nasdaqHeadline(lose, "Europe/London").title, "Every exit loses, taken together. No kind of signal beats luck.");
  const win = { ...STUDY, exits: { "tp3+trail": { ...STUDY.exits["tp3+trail"], everywhere: 40 } } };
  assert.equal(nasdaqHeadline(win, "Europe/London").title, "Every exit makes money: +63 R at best over 9,281 signals. Some kinds of signal held beyond luck.");
  assert.equal(nasdaqHeadline(win, "Europe/London").beyond, true);
  assert.equal(nasdaqHeadline(null), null);
  assert.equal(nasdaqHeadline({}), null);
});

const side = (group, over) => ({ group, ways: ["direction"], signals: [735, 721, 794, 793, 639], average_r: [0.05, -0.02, 0.08, 0.04, 0.01], total_r: 121.5, average_r_over_all: 0.033, stretches_in_profit: 4,
  stretches_below_all_signals: 1, judged: true, in_the_study: { signals: 4764, average_r: 0.0457, stretches_in_profit: 5 }, ...over });
const LONG = { written_at: "2026-11-18T22:40:00Z", signals: 7209, months: { stretches: [["2020-02", "2021-02"], ["2021-04"], ["2022-06"], ["2023-08"], ["2024-10", "2025-08"]], not_read: "the 6 unseen months" },
  design: { exit: "tp3+trail", exit_in_words: "the whole set out at target 3, following the trailing stop" },
  all_signals: { average_r: [0.01, -0.03, 0.02, 0.01, -0.02], total_r: -14.2, average_r_over_all: -0.002, stretches_in_profit: 3, passes: false },
  winners: { sat: 1, shuffled: { times: 200 }, kinds: [side("buys", { passes: true, shuffles_in_which_it_passes: 31 })] },
  losers: { sat: 1, shuffled: { times: 200 }, kinds: [side("sells", { signals: [705, 687, 768, 755, 612], average_r: [-0.03, -0.04, -0.04, -0.02, -0.05], total_r: -135.7, average_r_over_all: -0.0386, stretches_in_profit: 0,
    stretches_below_all_signals: 5, worse_again: true, shuffles_in_which_it_is_worse: 2, in_the_study: { signals: 4517, average_r: -0.0342 } })] },
  the_gap: { buys_average_r: 0.033, sells_average_r: -0.0386, gap_r: 0.0716, shuffled: { times: 200, shuffles_with_a_gap_as_large: 3, largest_gap: 0.081, gap_at_19_in_20: 0.052 } },
  the_answer: { called: "the lead holds", the_buys_pass: true, the_sells_are_worse: true, all_the_signals_pass: false, the_gap_is_as_large_in: 3, of_shuffles: 200, at_most_for_the_lead_to_hold: 9,
    the_names: { "the lead holds": "the buys pass and the gap is as large in at most 9 of the 200 shuffles", "the lead is dead": "the buys do not pass" } },
  the_buys_month_by_month: { months: 34, months_with_buys: 34, months_in_profit: 21, best_month_r: 31.4, worst_month_r: -22.06, middle_month_r: 2.6 } };

test("the long side: the exam's own answer, each side's marks, the gap beside its shuffles, and the months", () => {
  const l = nasdaqLong(LONG, "Europe/London");
  assert.equal(l.title, "The lead holds.");
  assert.equal(l.why, "The buys pass and the gap is as large in at most 9 of the 200 shuffles.");
  assert.deepEqual(l.chip, { kind: "ok", text: "Holds" });
  assert.equal(l.size, "For size: +122 R over 7 months is about +17.4 R a month, from about 526 buys a month.");
  assert.deepEqual(l.rows[0], { who: "Buys", average: "+0.033 R over 3,682", total: "+122 R", stretches: "4 of 5", study: "+0.046 R over 4,764", mark: "Pass", luck: "31 of 200", pips: ["kept", "dropped", "kept", "kept", "kept"] });
  assert.deepEqual(l.rows[1], { who: "Sells", average: "−0.039 R over 3,527", total: "−136 R", stretches: "0 of 5", study: "−0.034 R over 4,517", mark: "Worse again", luck: "2 of 200", pips: ["dropped", "dropped", "dropped", "dropped", "dropped"] });
  assert.deepEqual(l.rows[2], { who: "All the signals", average: "−0.002 R over 7,209", total: "−14 R", stretches: "3 of 5", study: "", mark: "Do not pass", luck: "", pips: ["kept", "dropped", "kept", "kept", "dropped"] });
  assert.equal(l.gap, "The buys' average less the sells' is +0.072 R a signal. With the results shuffled 200 times, the gap was as large in 3 (for the lead to hold: at most 9).");
  assert.equal(l.months, "Month by month, the buys made money in 21 of the 34 months: +31.4 R in the best, +2.6 R in the middle one, −22.1 R in the worst.");
  assert.ok(l.detail.startsWith("7,209 signals with no rule applied, in 7 months that had never been read (Feb 2020 to Aug 2025), the whole set out at target 3, following the trailing stop. "));
  assert.ok(l.detail.includes("Sat once, on 18 Nov 2026, 22:40") && l.detail.endsWith("Not read: the 6 unseen months."));
});

test("a dead lead and a lead that is not shown are said as the exam names them, and nothing is said before it is sat", () => {
  const dead = nasdaqLong({ ...LONG, winners: { ...LONG.winners, kinds: [side("buys", { passes: false, stretches_in_profit: 2, shuffles_in_which_it_passes: 60 })] },
    the_answer: { ...LONG.the_answer, called: "the lead is dead", the_buys_pass: false } });
  assert.deepEqual([dead.title, dead.why, dead.chip, dead.rows[0].mark], ["The lead is dead.", "The buys do not pass.", { kind: "no", text: "Dead" }, "Do not pass"]);
  const dim = nasdaqLong({ ...LONG, the_answer: { ...LONG.the_answer, called: "the buys pass, but the direction is not shown to matter", the_names: {} } });
  assert.deepEqual([dim.title, dim.why, dim.chip], ["The buys pass, but the direction is not shown to matter.", "", { kind: "", text: "Not shown" }]);
  assert.equal(nasdaqLong(null), null);
  assert.equal(nasdaqLong({ winners: { kinds: [] }, losers: { kinds: [] } }), null);
  assert.equal(nasdaqLong({ winners: LONG.winners, losers: LONG.losers }), null, "no answer on file, nothing said");
});

test("once the months held back have been read for the lead, the study's tile no longer says they are unread", () => {
  assert.equal(nasdaqExamWords(STUDY, true).text, "The study did not earn its exam. The months held back were then read once, for the one lead the study left: the long side, below.");
  assert.ok(!nasdaqExamWords(STUDY, true).why.includes("Not read"));
  assert.ok(nasdaqExamWords(STUDY).text.includes("One later idea can still be tried on them."));
});

const played = (middle, over = {}) => ({ middle, average: middle + 1.5, best: 240.1, worst: -210.55, died: 96, runs: 2400, could_not_trade: 310, sets: 9000, too_small: 4000, ...over });
const VERSION = { written_at: "2026-11-18T23:10:00Z", counts: false, counts_if: "it is safe on the study months and it makes money on the unseen months",
  months: { practice: ["2025-10"], older_practice: ["2020-01"], unseen: ["2025-11", "2026-01", "2026-04", "2026-06", "2026-08", "2026-10"], exam: ["2020-02"] },
  the_challenge: { start_from_gbp: 100, start_to_gbp: 500, runs_in_every_month: 400, leverage: 200, an_account_is_dead_below: 0.5, death_cap: 0.05 },
  plans_tried: [{ plan: "0.25% of the balance on every set", plan_key: "percent:0.25", safe: false, not_safe_because: ["x"], practice: { middle: 0, died: 0, runs: 2800, could_not_trade: 2800 }, older: { middle: 0, died: 0, runs: 14000, could_not_trade: 14000 } },
    { plan: "2% of the balance on every set", plan_key: "percent:2", safe: false, not_safe_because: ["y"], practice: { middle: -4.2, died: 120, runs: 2800, could_not_trade: 300 }, older: { middle: 1.1, died: 800, runs: 14000, could_not_trade: 5000 } }],
  chosen: { version: "abc", plan: { type: "percent", value: 2 }, plan_words: "2% of the balance on every set", losing_run: { deepest_r: 31.26, month: "2022-01", where: "older practice", largest_percent_plan: 2.19 },
    practice: played(-4.2, { runs: 2800, died: 120, could_not_trade: 300 }), older: played(1.1, { runs: 14000, died: 800, could_not_trade: 5000 }) },
  safe_on_the_study_months: false, not_safe_because: ["more than 1 account in 20 died on the older practice months", "the money plan is too big"],
  unseen: played(-6.05), standard_unseen: { trades: 640, pnl_gbp: -312.4 }, makes_money_on_the_unseen_months: false,
  the_exam_months_for_the_record: { small_account: played(2.4, { runs: 13600, could_not_trade: 0 }), standard: { trades: 3000, pnl_gbp: 810 } } };

test("the buys-only version on a small account: the Engine's own pounds, the plan that stands, and whether it counts", () => {
  const v = nasdaqVersion(VERSION, "Europe/London");
  assert.deepEqual([v.title, v.chip, v.money], ["The buys-only version does not count.", { kind: "no", text: "Does not count" }, "−£6.05"]);
  assert.equal(v.unseen, "On the 6 unseen months, a small account: middle run −£6.05, average −£4.55, best +£240.10, worst −£210.55; 96 of 2,400 accounts died; 310 could not open a single set.");
  assert.equal(v.standard, "The Engine's standard account on those months: 640 trades, −£312.40.");
  assert.equal(v.plan, "The plan that stands: 2% of the balance on every set.");
  assert.equal(v.safe, "Not safe on the study months: more than 1 account in 20 died on the older practice months; the money plan is too big.");
  assert.equal(v.limit, "Its deepest losing run within one study month is 31.3 R (Jan 2022), so a set may risk at most 2.19% of the balance.");
  assert.ok(v.study.startsWith("Practice months: middle run −£4.20, average −£2.70, best +£240.10, worst −£210.55; 120 of 2,800 accounts died; 300 could not open a single set. Older practice months: middle run +£1.10"));
  assert.deepEqual(v.rows, [{ plan: "0.25%", practice: "£0.00", practiceDied: "0 of 2,800", older: "£0.00", olderDied: "0 of 14,000", idle: "16,800" },
    { plan: "2%", practice: "−£4.20", practiceDied: "120 of 2,800", older: "+£1.10", olderDied: "800 of 14,000", idle: "5,300" }]);
  assert.deepEqual(v.reasons, [], "some accounts traded on the unseen months, and no plan let every account trade: nothing is said that the file does not show");
  const idle = nasdaqVersion({ ...VERSION, unseen: played(0, { could_not_trade: 2400, died: 0 }), plans_tried: [...VERSION.plans_tried, { plan: "5% of the balance on every set", safe: false,
    practice: { middle: -12.33, died: 231, runs: 2800, could_not_trade: 0 }, older: { middle: -12.49, died: 1419, runs: 14000, could_not_trade: 0 } }, { plan: "Hassan's stepped cap (20% of the start a set)", safe: true,
    practice: { middle: 1, died: 0, runs: 2800, could_not_trade: 0 }, older: { middle: 1, died: 0, runs: 14000, could_not_trade: 0 } }] });
  assert.deepEqual(idle.reasons, ["Not one of the 2,400 accounts could open a single set there: with this plan the smallest Nasdaq position the broker allows risks more than the plan lets a set risk.",
    "At 5% of the balance a set, every account could trade: 231 of 2,800 died on the practice months, and the middle run was −£12.33."]);
  assert.deepEqual(idle.rows.slice(2).map((r) => r.plan), ["5%", "Hassan's stepped cap (safe)"]);
  assert.ok(v.record.startsWith("For the record, with no say in the answer, the months the lead was tried on: middle run +£2.40") && !v.record.includes("could not open"));
  assert.ok(v.detail.startsWith("400 runs started in every month, starting balances from £100 to £500") && v.detail.includes("It counts only if it is safe on the study months and it makes money on the unseen months.")
    && v.detail.includes("Built and looked at once, on 18 Nov 2026, 23:10"));
  const good = nasdaqVersion({ ...VERSION, counts: true, safe_on_the_study_months: true, not_safe_because: [], unseen: played(12.5) });
  assert.deepEqual([good.title, good.chip, good.money, good.safe], ["The buys-only version counts.", { kind: "ok", text: "Counts" }, "+£12.50", "Safe on the study months."]);
  assert.equal(nasdaqVersion(null), null);
  assert.equal(nasdaqVersion({ chosen: {} }), null, "no answer on file, nothing said");
});
