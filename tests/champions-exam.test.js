// The edge study's exam as the Live page says it (js/champions/logic/exam.js). Every file here is made up, in the shape
// of the engine's own (champions/edge/exam.json). The page repeats the exam's counts, marks and its line about luck.
import { test } from "node:test";
import assert from "node:assert/strict";
import { examHeadline, examWinners, examLosers, examBase, examAfterStudy } from "../js/champions/logic/exam.js";

const NICOSIA = "Asia/Nicosia";
const kind = (group, ways, over = {}) => ({ group, ways, in_the_study: { signals: 806, average_r: 0.0543, worst_stretch_average_r: 0.0113, stretches_in_profit: 6 },
  signals: [100, 120, 110, 130, 90], average_r: [0.12, -0.03, 0.08, 0.02, 0.05], total_r: 26.4, average_r_over_all: 0.048, stretches_in_profit: 4, stretches_below_all_signals: 0, judged: true, ...over });
const EXAM = { written_at: "2026-11-18T01:15:00Z", asked_by: "Hassan, 18 Nov 2026: 'Exam first'", signals: 7104, signals_in_each_stretch: [1400, 1450, 1500, 1404, 1350],
  months: { stretches: [["2020-02", "2021-02"], ["2021-04", "2022-04"], ["2022-06", "2023-06"], ["2023-08", "2024-08"], ["2024-10", "2025-08"]], not_read: "the 6 unseen months; the study months were not read again" },
  design: { exit: "tp3+trail", a_winner_passes: "its results add up to more than nought in at least four of the five stretches, and over all of them together" },
  all_signals: { average_r: [-0.05, -0.09, -0.04, -0.06, 0.01], total_r: -331.2, average_r_over_all: -0.0466, stretches_in_profit: 1 },
  winners: { sat: 3, judged: 2, pass: 1, hold_everywhere: 0, shuffled: { times: 200, on_average: 0.21, at_most_in_19_of_20: 1, most: 2, shuffles_with_as_many: 31 }, beside_the_shuffles: "no more than luck gives",
    kinds: [kind("0.8 to 0.9", ["confidence"], { passes: true, holds_everywhere: false, shuffles_in_which_it_passes: 9 }),
      kind("setup C-TREND+ICT, buys", ["setup", "direction"], { average_r: [0.1, -0.2, -0.1, 0.02, -0.05], total_r: -30.5, average_r_over_all: -0.0555, stretches_in_profit: 2, passes: false, holds_everywhere: false, shuffles_in_which_it_passes: 14 }),
      kind("200 to 300, higher charts all agree", ["stop", "allagree"], { signals: [40, 41, 29, 35, 0], average_r: [0.2, 0.1, -0.1, 0.3, null], total_r: 20, average_r_over_all: 0.1379, stretches_in_profit: 3, judged: false, passes: false,
        holds_everywhere: false, shuffles_in_which_it_passes: 0, in_the_study: { signals: 293, average_r: 0.2038 } })] },
  losers: { sat: 2, judged: 2, worse_again: 2, shuffled: { times: 200, on_average: 0.4, at_most_in_19_of_20: 1, most: 1, shuffles_with_as_many: 0 }, beside_the_shuffles: "more than any of the shuffles gave",
    kinds: [kind("15-minute chart", ["chart"], { signals: [600, 620, 640, 610, 580], average_r: [-0.1, -0.12, -0.09, -0.11, -0.02], total_r: -271.1, average_r_over_all: -0.0889, stretches_in_profit: 0, stretches_below_all_signals: 5,
      worse_again: true, shuffles_in_which_it_is_worse: 3 }),
    kind("under 0.5", ["confidence"], { signals: [60, 62, 64, 61, 58], average_r: [-0.2, -0.1, -0.3, -0.2, 0.1], total_r: -44.0, average_r_over_all: -0.1443, stretches_in_profit: 1, stretches_below_all_signals: 4, worse_again: true,
      shuffles_in_which_it_is_worse: 21 })] } };

test("the exam in two sentences: how many held again, and the exam's own line about luck", () => {
  const h = examHeadline(EXAM, NICOSIA);
  assert.equal(h.title, "One of the three kinds held again on months the study never read.");
  assert.equal(h.verdict, "That is no more than luck gives. Shuffled 200 times, at most two did.");
  assert.equal(h.detail, "7,104 signals with no rule applied, in 10 months held back from the study (Feb 2020 to Aug 2025), in five stretches. "
    + "A kind holds again if its results add up to more than nought in at least four of the five stretches, and over all of them together. One could not be judged: too few signals in a stretch. "
    + "Sat once, on 18 Nov 2026, 01:15 GMT (03:15 your time). Not read: the 6 unseen months; the study months were not read again.");
  assert.deepEqual([h.pass, h.judged, h.sat, h.luck], [1, 2, 3, true]);
  const none = examHeadline({ ...EXAM, winners: { ...EXAM.winners, pass: 0 } }, NICOSIA), all = examHeadline({ ...EXAM, winners: { ...EXAM.winners, pass: 3, judged: 3, beside_the_shuffles: "more than any of the shuffles gave" } }, NICOSIA);
  assert.equal(none.title, "None of the three kinds held again on months the study never read.");
  assert.deepEqual([all.title, all.verdict, all.luck], ["All three kinds held again on months the study never read.", "That is more than any of the shuffles gave. Shuffled 200 times, at most two did.", false]);
  assert.ok(!all.detail.includes("could not be judged"));
  const bare = examHeadline({ winners: { kinds: [] } }, NICOSIA);
  assert.deepEqual([bare.title, bare.verdict, bare.detail], ["None of the none kinds held again on months the study never read.", "", "0 signals with no rule applied, in months held back from the study. Sat once, on a day that is not on file."]);
  assert.equal(examHeadline(null, NICOSIA), null);
  assert.equal(examHeadline({ winners: {} }, NICOSIA), null);
});

test("each winner: a mark for every stretch, whether it held, and its figures beside the study's", () => {
  const rows = examWinners(EXAM);
  assert.deepEqual(rows[0], { group: "Confidence 0.8 to 0.9", pips: ["kept", "dropped", "kept", "kept", "kept"], chip: { kind: "ok", text: "Held again" }, text: "+0.048 R a signal over 550 signals",
    stretches: "4 of 5 stretches in profit", study: "In the study: +0.054 R over 806", luck: "By luck alone it held in 9 of 200 shuffles", passes: true, judged: true });
  assert.deepEqual([rows[1].group, rows[1].chip, rows[1].text, rows[1].pips], ["Setup C-TREND+ICT, buys", { kind: "no", text: "Did not hold" }, "−0.056 R a signal over 550 signals", ["kept", "dropped", "dropped", "kept", "dropped"]]);
  assert.deepEqual([rows[2].group, rows[2].chip, rows[2].luck, rows[2].pips, rows[2].study, rows[2].judged],
    ["Stop 200 to 300 pips, higher charts all agree", { kind: "", text: "Not judged" }, "Too few signals in a stretch", ["kept", "kept", "dropped", "kept", "wait"], "In the study: +0.204 R over 293", false]);
  assert.deepEqual(examWinners(null), []);
  assert.deepEqual(examWinners({ winners: { kinds: [{ group: "x" }] } })[0], { group: "X", pips: [], chip: { kind: "", text: "Not judged" }, text: "No signals", stretches: "0 of 0 stretches in profit", study: "", luck: "Too few signals in a stretch",
    passes: false, judged: false });
});

test("the losers: whether each did worse than all the signals again", () => {
  const lo = examLosers(EXAM);
  assert.equal(lo.title, "All two kinds that lost every time did worse than the rest again.");
  assert.equal(lo.verdict, "That is more than any of the shuffles gave. Shuffled 200 times, at most one did.");
  assert.equal(lo.luck, false);
  assert.deepEqual(lo.rows, [{ group: "15-minute chart", average: "−0.089 R", signals: "3,050", below: "5 of 5", again: "Yes", luck: "3 of 200" },
    { group: "Confidence under 0.5", average: "−0.144 R", signals: "305", below: "4 of 5", again: "Yes", luck: "21 of 200" }]);
  const mixed = examLosers({ losers: { sat: 3, worse_again: 1, kinds: [{ group: "a", ways: ["chart"], signals: [40], judged: true, worse_again: false, average_r_over_all: 0.01, stretches_below_all_signals: 0, shuffles_in_which_it_is_worse: 2 },
    { group: "b", ways: ["chart"], signals: [10], judged: false }] } });
  assert.deepEqual([mixed.title, mixed.verdict, mixed.rows.map((r) => r.again), mixed.rows[1].luck], ["One of the three kinds that lost every time did worse than the rest again.", "", ["No", "Not judged"], ""]);
  assert.equal(examLosers(null), null);
});

test("the study's own tile says what became of its kinds once the exam is sat", () => {
  assert.equal(examAfterStudy(EXAM), "Tried since on months the study never read: one of the three held again, which is no more than luck gives. The exam is below.");
  assert.equal(examAfterStudy({ winners: { sat: 8, pass: 0, kinds: [] } }), "Tried since on months the study never read: none of the eight held again. The exam is below.");
  assert.equal(examAfterStudy(null), "");
  assert.equal(examAfterStudy({}), "");
});

test("all the signals of the exam months together", () => {
  assert.equal(examBase(EXAM), "All the signals of those months together: −0.047 R a signal (−331 R in all), in profit in one of the five stretches.");
  assert.equal(examBase(null), "");
  assert.equal(examBase({ all_signals: {} }), "");
});
