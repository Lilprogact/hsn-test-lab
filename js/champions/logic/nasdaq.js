// Nasdaq (champions/nasdaq/ in the engine): whether the Lab's copy of the indicator is the same as TradingView's on
// Nasdaq (tv_counting.json), and the edge study on Nasdaq (study.json), with what gold's exam found tried on it and
// whether its own exam was earned. Words and figures only. Every count, every mark and every line that sets a count
// beside luck are the engine's own; the page adds a kind's signals up and decides nothing.
import { inR, groupWordsWith, edgeHeadline, edgeBars } from "./edge.js";

const count = (n) => Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n) => WORDS[n] || count(n);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
const sum = (list) => (list || []).reduce((a, b) => a + Number(b || 0), 0);
const chart = (minutes) => (Number(minutes) < 60 ? `${minutes}-minute` : `${Number(minutes) / 60}-hour`);
const UNIT = "points";

/** The stop size's unit on Nasdaq, for the kinds of signal the page names. */
export const nasdaqUnit = UNIT;

const marksOf = (run) => {
  const sides = Object.values((run && run.marks_on_tradingviews_own_candles) || {});
  return { same: sum(sides.map((s) => Number(s.tradingview || 0) - Number(s.differ || 0))), of: sum(sides.map((s) => s.tradingview)) };
};

/** The Nasdaq study in two short sentences: how many exits make money taken together, and whether any kind of signal
 *  beats luck. {title, detail, key, exit, beyond}, or null when there is no study. */
export function nasdaqHeadline(study, zone) {
  const base = edgeHeadline(study, zone, "Nasdaq's study months");
  if (!base) return null;
  const totals = Object.values(study.exits).map((e) => num((e.all_signals || {}).total_r)).filter((t) => t !== null);
  const up = totals.filter((t) => t > 0).length, best = totals.length ? Math.max(...totals) : null, signals = Number(study.signals || 0);
  const together = !totals.length ? "No figure for all the signals together." : up === 0 ? "Every exit loses, taken together."
    : `${up === totals.length ? "Every exit makes" : `${cap(word(up))} exit${up === 1 ? "" : "s"} of ${word(totals.length)} make${up === 1 ? "s" : ""}`} money: ${inR(best, 0)} at best over ${count(signals)} signals.`;
  const beyond = edgeBars(study).some((b) => b.beyond);
  const each = best !== null && signals ? `Under the best exit all the signals together come to ${inR(best / signals, 3)} a signal. ` : "";
  return { ...base, beyond, title: `${together} ${beyond ? "Some kinds of signal held beyond luck." : "No kind of signal beats luck."}`, detail: each + base.detail };
}

/** The copy against TradingView on Nasdaq: {title, fault, rows, notes, detail}, or null when the comparison is not on file. */
export function nasdaqProof(counting) {
  const files = counting && Array.isArray(counting.files) ? counting.files : [];
  if (!files.length) return null;
  const a = counting.marks_on_tradingviews_own_candles || {}, b = counting.marks_on_the_labs_own_candles || {}, own = counting.the_labs_setting || "18:00";
  const all = Number(a.tradingview || 0), same = Number(a.same_candle || 0);
  const title = all && same === all ? `The copy gives all ${count(all)} Buy and Sell marks of your TradingView files.`
    : `The copy gives ${count(same)} of the ${count(all)} Buy and Sell marks of your TradingView files.`;
  const rows = files.map((f) => {
    const runs = f.counted_from || {}, asLab = runs[own] || {}, lined = (f.lines_up_counted_from || []), best = runs[lined[lined.length - 1]] || asLab;
    const m = marksOf(best), mine = best.marks_on_the_labs_own_candles;
    return { chart: cap(chart(f.timeframe)),
      asLab: `${count(asLab.in_the_lab_at_the_same_time)} of ${count(asLab.candles_in_the_overlap)}`,
      other: lined.length && !lined.includes(own) ? `${count(best.in_the_lab_at_the_same_time)} of ${count(best.candles_in_the_overlap)} from ${lined[lined.length - 1]}` : "",
      marks: `${count(m.same)} of ${count(m.of)}`,
      mine: mine ? `${count(mine.same_candle)} of ${count(mine.tradingview)}` : "not compared",
      check: !best.the_labs_check_passes ? "Does not pass" : lined.includes(own) ? "Passes" : `Passes only from ${lined[lined.length - 1]}`,
      line: best.the_labs_check_passes || !best.trend_line ? "" : `${cap(chart(f.timeframe))} file: the trend line differs on ${count(best.trend_line.differ_on_judged_candles)} of ${count(best.trend_line.candles_judged)} judged candles, `
        + "so the Lab's own check does not pass it; every Buy and Sell mark is the same." };
  });
  const off = files.find((f) => (f.lines_up_counted_from || []).length && !(f.lines_up_counted_from || []).includes(own));
  let fault = "";
  if (off) {
    const from = off.lines_up_counted_from[off.lines_up_counted_from.length - 1], asLab = off.counted_from[own], right = off.counted_from[from];
    fault = `Your chart counts Nasdaq's candles from ${from} New York. The Lab counts them from ${own}, so ${asLab.in_the_lab_at_the_same_time ? count(asLab.in_the_lab_at_the_same_time) : "none"} of its `
      + `${count(asLab.candles_in_the_overlap)} ${chart(off.timeframe)} candles line up with yours. Counted from ${from}, ${Number(right.in_the_lab_at_the_same_time) === Number(right.candles_in_the_overlap) ? "all" : count(right.in_the_lab_at_the_same_time)} `
      + `${count(right.candles_in_the_overlap)} do. The Champions study counts from ${from}; the Lab's own Engine still counts from ${own}.`;
  }
  const detail = `On the Lab's own FOREX.com candles, ${count(b.same_candle)} of TradingView's ${count(b.tradingview)} marks are on the same candle (the Lab shows ${count(b.lab)}).`;
  return { title, fault, rows, notes: rows.map((r) => r.line).filter(Boolean), detail };
}

/** Whether the Nasdaq study's exam was earned, in the study's own terms: {earned, text}, or null when the study does not say. */
export function nasdaqExamWords(study) {
  const g = study && study.the_exam;
  if (!g || typeof g.the_exam_is_sat !== "boolean") return null;
  const notRead = (study.months || {}).not_read;
  if (g.the_exam_is_sat) return { earned: true, text: "The exam on the months held back was earned and has been sat.", why: "" };
  return { earned: false, text: "The exam was not earned, so the months held back were not read. One later idea can still be tried on them.",
    why: "To earn it the study had to stand above every one of its shuffles under some exit, or all the signals together had to make money in every stretch."
      + (notRead ? ` Not read: ${notRead}.` : "") };
}

/** What gold's exam left standing, tried on Nasdaq: {title, verdict, rows}, or null when the study does not hold it. */
export function nasdaqCarried(study) {
  const c = study && study.carried_over_from_gold;
  if (!c || !c.winners || !c.losers) return null;
  const times = count((c.winners.shuffled || {}).times);
  const row = (k, winner) => {
    const n = sum(k.signals), of = (k.signals || []).length, gold = k.on_golds_exam || {};
    return { group: groupWordsWith(k, UNIT), was: winner ? "Passed" : "Worse again",
      gold: num(gold.average_r) === null ? "" : `${inR(gold.average_r, 3)} over ${count(gold.signals)}`,
      average: n ? `${inR(k.average_r_over_all, 3)} over ${count(n)}` : "no signals",
      stretches: winner ? `${count(k.stretches_in_profit)} of ${count(of)} in profit` : `${count(k.stretches_below_all_signals)} of ${count(of)} below`,
      again: !k.judged ? "Not judged" : winner ? (k.passes ? "Holds again" : "Does not hold") : (k.worse_again ? "Worse again" : "Not worse"),
      luck: k.judged ? `${count(winner ? k.shuffles_in_which_it_passes : k.shuffles_in_which_it_is_worse)} of ${times}` : "" };
  };
  const rows = [...(c.winners.kinds || []).map((k) => row(k, true)), ...(c.losers.kinds || []).map((k) => row(k, false))];
  const held = Number(c.winners.pass || 0) + Number(c.losers.worse_again || 0);
  const title = `${held === 0 ? "None" : cap(word(held))} of the ${word(rows.length)} things gold's exam left standing ${held === 1 ? "shows" : "show"} again on Nasdaq.`;
  return { title, verdict: c.winners.beside_the_shuffles && c.winners.beside_the_shuffles === c.losers.beside_the_shuffles ? `That is ${c.winners.beside_the_shuffles}.` : "", rows };
}
