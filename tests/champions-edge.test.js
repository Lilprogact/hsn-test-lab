// The edge study as the Live page says it (js/champions/logic/edge.js). Every file here is made up, in the shape of the
// engine's own (champions/edge/study.json). The page repeats the study's counts beside what luck gave; it decides nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inR, monthWords, groupWords, clearestExit, edgeBars, edgeExits, edgeGroups, edgeHeadline } from "../js/champions/logic/edge.js";

const NICOSIA = "Asia/Nicosia";
const exit = (words, everywhere, most, over = {}) => ({ exit: words, all_signals: { signals: [100, 100, 100, 100, 100, 100], average_r: [-0.04, -0.1, -0.06, -0.07, 0.01, 0.008], total_r: -384.6 },
  judged: 381, everywhere, mostly: everywhere * 3, carry_cases: 69, carry_hits: 48, carry_share: 0.6957, any_stretch_share: 0.36,
  shuffled: { times: 200, everywhere_on_average: 0.35, everywhere_most: most, mostly_on_average: 4.44, mostly_most: 16, carry_share_on_average: 0.17 },
  holds_everywhere: [{ group: "setup C-TREND+ICT, 0.8 to 0.9", ways: ["setup", "confidence"], signals: [73, 97, 103, 116, 70, 102], average_r: [0.1016, 0.0598, 0.047, 0.1555, 0.1486, 0.1038], total_r: 57.08,
    worst_stretch_average_r: 0.047 }].slice(0, everywhere ? 1 : 0), holds_mostly_only: [], ...over });
const STUDY = { written_at: "2026-11-17T20:08:49Z", signals: 8629, families: 70, months: { stretches: [["2020-01", "2021-01"], ["2021-03"], ["2022-05"], ["2023-07"], ["2024-09"], ["2025-10", "2026-09"]] },
  exits: { "tp1+trail": exit("the whole set out at target 1, following the trailing stop", 2, 1), "tp3+trail": exit("the whole set out at target 3, following the trailing stop", 8, 4),
    tp3: exit("the whole set out at target 3, the stop left where it was set", 1, 3, { all_signals: { average_r: [-0.04, -0.1, -0.07, -0.08, -0.005, -0.01], total_r: -479.91 } }) } };

test("a result in R is said with its sign, and a missing one is said to be missing", () => {
  assert.deepEqual([0.0544, -0.1055, 0.001, -0.004, 0, 1.5].map((v) => inR(v)), ["+0.05 R", "−0.11 R", "0.00 R", "0.00 R", "0.00 R", "+1.50 R"]);
  assert.deepEqual([inR(0.0013, 3), inR(-384.6, 0), inR(1234.5, 0), inR(0.4, 0), inR(null), inR(undefined), inR("")], ["+0.001 R", "−385 R", "+1,235 R", "0 R", "no figure", "no figure", "no figure"]);
  assert.deepEqual([monthWords("2020-01"), monthWords("2026-09"), monthWords("soon"), monthWords(null), monthWords("2026-13")], ["Jan 2020", "Sep 2026", "soon", "", "2026-13"]);
});

test("one bar for each exit: what was found beside the most that luck gave, the clearest first", () => {
  const bars = edgeBars(STUDY);
  assert.deepEqual(bars.map((b) => b.key), ["tp3+trail", "tp1+trail", "tp3"]);
  assert.deepEqual(bars[0], { key: "tp3+trail", name: "Target 3, trailing stop", found: 8, luck: 4, text: "8 kinds", beyond: true,
    words: "More than luck gave in any of 200 shuffles (at most 4).", share: 1, luckShare: 0.5 });
  assert.deepEqual([bars[2].name, bars[2].text, bars[2].beyond, bars[2].words, bars[2].share, bars[2].luckShare],
    ["Target 3, stop left in place", "1 kind", false, "No more than luck gives (up to 3 in 200 shuffles).", 0.125, 0.375], "one group where luck gave up to three is not beyond luck");
  const level = edgeBars({ exits: { a: exit("an exit the page has no short name for", 3, 3), b: { everywhere: 0 } } });
  assert.deepEqual(level.map((b) => [b.name, b.beyond, b.words, b.share, b.luckShare]), [["An exit the page has no short name for", false, "No more than luck gives (up to 3 in 200 shuffles).", 1, 1],
    ["B", false, "No check on luck is on file.", 0, null]]);
  assert.deepEqual(edgeBars(null), []);
});

test("each exit's line: all the signals together, and the groups that held beside what luck gave", () => {
  const rows = edgeExits(STUDY);
  assert.deepEqual(rows.map((r) => r.key), ["tp1+trail", "tp3+trail", "tp3"], "in the study's own order");
  assert.deepEqual(rows[1], { key: "tp3+trail", exit: "Target 3, trailing stop", together: "−385 R, lost 4 of 6 stretches", everywhere: "8 (luck: at most 4)", mostly: "24 (luck: at most 16)" });
  assert.equal(rows[2].together, "−480 R, lost 6 of 6 stretches");
  assert.deepEqual(edgeExits({ exits: { x: {} } })[0], { key: "x", exit: "X", together: "no figure", everywhere: "0", mostly: "0" });
  assert.deepEqual(edgeExits(null), []);
});

test("the groups that held in every stretch, under the exit where the most held", () => {
  assert.equal(clearestExit(STUDY), "tp3+trail");
  assert.equal(clearestExit(null), null);
  assert.deepEqual(edgeGroups(STUDY, "tp3+trail"), [{ group: "Setup C-TREND+ICT, confidence 0.8 to 0.9", signals: "561", average: "+0.10 R", worst: "+0.047 R",
    stretches: ["+0.10 R", "+0.06 R", "+0.05 R", "+0.16 R", "+0.15 R", "+0.10 R"] }]);
  assert.deepEqual(edgeGroups(STUDY, "nothing"), []);
});

test("a band is named for what it is a band of, and any other label is the study's own", () => {
  assert.deepEqual([{ group: "0.8 to 0.9", ways: ["confidence"] }, { group: "200 to 300, higher charts all agree", ways: ["stop", "allagree"] }, { group: "setup C-TREND+ICT, buys", ways: ["setup", "direction"] },
    { group: "1-hour chart, under 0.5", ways: ["chart", "confidence"] }, { group: "a label, with a comma, 0.8 to 0.9", ways: ["setup", "confidence"] }, { group: "0.8 to 0.9" }, {}, null].map(groupWords),
  ["Confidence 0.8 to 0.9", "Stop 200 to 300 pips, higher charts all agree", "Setup C-TREND+ICT, buys", "1-hour chart, confidence under 0.5", "A label, with a comma, 0.8 to 0.9", "0.8 to 0.9", "", ""]);
});

test("the study in two sentences, and it does not make more of a find than luck allows", () => {
  const h = edgeHeadline(STUDY, NICOSIA);
  assert.equal(h.title, "Taken together the signals lose. Eight kinds of signal made money in every stretch.");
  assert.equal(h.detail, "8,629 signals with no rule applied, grouped 70 ways, in six stretches of months the agents study (Jan 2020 to Sep 2026). "
    + "With the whole set out at target 3, following the trailing stop, 8 groups made money in every stretch; luck alone gave at most 4 in 200 shuffles. Made on 17 Nov 2026, 20:08 GMT (22:08 your time).");
  assert.deepEqual([h.key, h.exit, h.beyond], ["tp3+trail", "Target 3, trailing stop", true]);
  const within = edgeHeadline({ ...STUDY, exits: { tp3: STUDY.exits.tp3 } }, NICOSIA);
  assert.equal(within.title, "Taken together the signals lose. One kind of signal made money in every stretch, which is no more than luck gives.");
  assert.equal(within.beyond, false);
  const none = edgeHeadline({ ...STUDY, exits: { tp3: exit("x", 0, 3) } }, NICOSIA);
  assert.equal(none.title, "Taken together the signals lose. No kind of signal made money in every stretch.");
  const up = edgeHeadline({ exits: { a: exit("x", 2, 1, { all_signals: { average_r: [0.1], total_r: 12 } }) } }, NICOSIA);
  assert.equal(up.title, "Taken together the signals make money. Two kinds of signal made money in every stretch.");
  assert.equal(up.detail, "0 signals with no rule applied, grouped 0 ways, in stretches of the months the agents study. With x, 2 groups made money in every stretch; luck alone gave at most 1 in 200 shuffles. Made on a day that is not on file.");
  const mixed = edgeHeadline({ exits: { a: exit("x", 0, 1, { all_signals: { total_r: 12 } }), b: exit("y", 0, 1) } }, NICOSIA);
  assert.equal(mixed.title, "Taken together the signals lose with some exits and not with others. No kind of signal made money in every stretch.");
  assert.equal(edgeHeadline(null, NICOSIA), null);
  assert.equal(edgeHeadline({ exits: {} }, NICOSIA), null);
});
