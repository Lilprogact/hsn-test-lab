// Nasdaq as the Live page says it (js/champions/logic/nasdaq.js). Every file here is made up, in the shape of the
// engine's own (champions/nasdaq/tv_counting.json and study.json). The page repeats the engine's counts and marks; it
// decides nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nasdaqHeadline, nasdaqProof, nasdaqExamWords, nasdaqCarried, nasdaqUnit } from "../js/champions/logic/nasdaq.js";
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
