// Nasdaq (champions/nasdaq/ in the engine): whether the Lab's copy of the indicator is the same as TradingView's on
// Nasdaq (tv_counting.json), and the edge study on Nasdaq (study.json), with what gold's exam found tried on it and
// whether its own exam was earned. Words and figures only. Every count, every mark and every line that sets a count
// beside luck are the engine's own; the page adds a kind's signals up and decides nothing.
import { when } from "./check.js";
import { inR, monthWords, groupWordsWith, edgeHeadline, edgeBars } from "./edge.js";

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

/** Whether the Nasdaq study's exam was earned, in the study's own terms: {earned, text, why}, or null when the study
 *  does not say. `spent`: the months held back have since been read for the one lead (the long side). */
export function nasdaqExamWords(study, spent = false) {
  const g = study && study.the_exam;
  if (!g || typeof g.the_exam_is_sat !== "boolean") return null;
  const notRead = (study.months || {}).not_read;
  if (g.the_exam_is_sat) return { earned: true, text: "The exam on the months held back was earned and has been sat.", why: "" };
  const why = "To earn it the study had to stand above every one of its shuffles under some exit, or all the signals together had to make money in every stretch.";
  if (spent) return { earned: false, text: "The study did not earn its exam. The months held back were then read once, for the one lead the study left: the long side, below.", why };
  return { earned: false, text: "The exam was not earned, so the months held back were not read. One later idea can still be tried on them.", why: why + (notRead ? ` Not read: ${notRead}.` : "") };
}

const pipsOf = (averages) => (averages || []).map((v) => (num(v) === null ? "wait" : Number(v) > 0 ? "kept" : "dropped"));

/** The long side: the one lead of the Nasdaq study, tried once on the months held back. {title, why, chip, rows, gap,
 *  months, detail}, or null when it has not been sat. Every mark and the name of the answer are the exam's own. */
export function nasdaqLong(exam, zone) {
  const buys = exam && exam.winners && (exam.winners.kinds || [])[0], sells = exam && exam.losers && (exam.losers.kinds || [])[0], ans = exam && exam.the_answer;
  if (!buys || !sells || !ans || !ans.called) return null;
  const all = exam.all_signals || {}, g = exam.the_gap || {}, sh = g.shuffled || {}, m = exam.the_buys_month_by_month || {}, times = count((exam.winners.shuffled || {}).times);
  const runs = (exam.months || {}).stretches || [], of = runs.length || (buys.average_r || []).length, held = runs.reduce((a, r) => a + r.length, 0);
  const line = (name, k, mark, luck) => {
    const n = sum(k.signals), study = k.in_the_study || {};
    return { who: name, average: n ? `${inR(k.average_r_over_all, 3)} over ${count(n)}` : "no signals", total: inR(k.total_r, 0), stretches: `${count(k.stretches_in_profit)} of ${count(of)}`,
      study: num(study.average_r) === null ? "" : `${inR(study.average_r, 3)} over ${count(study.signals)}`, mark, luck, pips: pipsOf(k.average_r) };
  };
  const rows = [
    line("Buys", buys, !buys.judged ? "Not judged" : buys.passes ? "Pass" : "Do not pass", buys.judged ? `${count(buys.shuffles_in_which_it_passes)} of ${times}` : ""),
    line("Sells", sells, !sells.judged ? "Not judged" : sells.worse_again ? "Worse again" : "Not worse", sells.judged ? `${count(sells.shuffles_in_which_it_is_worse)} of ${times}` : ""),
    { who: "All the signals", average: num(all.average_r_over_all) === null ? "no figure" : `${inR(all.average_r_over_all, 3)} over ${count(exam.signals)}`, total: inR(all.total_r, 0),
      stretches: `${count(all.stretches_in_profit)} of ${count(of)}`, study: "", mark: all.passes === true ? "Pass" : all.passes === false ? "Do not pass" : "", luck: "", pips: pipsOf(all.average_r) }];
  const good = ans.the_buys_pass === true && ans.called === "the lead holds", nBuys = sum(buys.signals);
  return { title: `${cap(ans.called)}.`, why: (ans.the_names || {})[ans.called] ? `${cap(ans.the_names[ans.called])}.` : "",
    size: held && nBuys && num(buys.total_r) !== null ? `For size: ${inR(buys.total_r, 0)} over ${count(held)} months is about ${inR(Number(buys.total_r) / held, 1)} a month, from about ${count(nBuys / held)} buys a month.` : "",
    chip: good ? { kind: "ok", text: "Holds" } : ans.the_buys_pass ? { kind: "", text: "Not shown" } : { kind: "no", text: "Dead" }, rows,
    gap: num(g.gap_r) === null ? "" : `The buys' average less the sells' is ${inR(g.gap_r, 3)} a signal. With the results shuffled ${count(sh.times)} times, the gap was as large in ${count(sh.shuffles_with_a_gap_as_large)}`
      + `${num(ans.at_most_for_the_lead_to_hold) === null ? "" : ` (for the lead to hold: at most ${count(ans.at_most_for_the_lead_to_hold)})`}.`,
    months: num(m.months_in_profit) === null ? "" : `Month by month, the buys made money in ${count(m.months_in_profit)} of the ${count(m.months)} months: ${inR(m.best_month_r, 1)} in the best, ${inR(m.middle_month_r, 1)} in the middle one, ${inR(m.worst_month_r, 1)} in the worst.`,
    detail: `${count(exam.signals)} signals with no rule applied, in ${held ? `${count(held)} months` : "months"} that had never been read${runs.length ? ` (${monthWords(runs[0][0])} to ${monthWords(runs[runs.length - 1].slice(-1)[0])})` : ""}, `
      + `${(exam.design || {}).exit_in_words || "under one exit"}. The rule and the names of the answers were written down first. Sat once, on ${exam.written_at ? when(exam.written_at, zone) : "a day that is not on file"}.`
      + ((exam.months || {}).not_read ? ` Not read: ${exam.months.not_read}.` : "") };
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

const pounds = (v) => (num(v) === null ? "no figure" : `${Number(v) < 0 ? "−" : Number(v) > 0 ? "+" : ""}£${Math.abs(Number(v)).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const runWords = (x) => (!x ? "not played" : `middle run ${pounds(x.middle)}, average ${pounds(x.average)}, best ${pounds(x.best)}, worst ${pounds(x.worst)}; ${count(x.died)} of ${count(x.runs)} accounts died`
  + `${Number(x.could_not_trade) ? `; ${count(x.could_not_trade)} could not open a single set` : ""}`);

/** The buys-only Nasdaq version on a small account, and its one look at the unseen months. {title, chip, money, unseen,
 *  standard, plan, safe, study, rows, record, detail}, or null when it has not been built. Every figure is the Engine's own. */
export function nasdaqVersion(v, zone) {
  const c = v && v.chosen;
  if (!c || typeof v.counts !== "boolean") return null;
  const u = v.unseen || null, std = v.standard_unseen || {}, ch = v.the_challenge || {}, run = c.losing_run || {};
  const why = (v.not_safe_because || []).join("; ");
  const idle = (t) => Number((t.practice || {}).could_not_trade || 0) + Number((t.older || {}).could_not_trade || 0);
  const trades = (v.plans_tried || []).find((t) => idle(t) === 0);
  const reasons = [];
  if (u && Number(u.runs) && Number(u.could_not_trade) === Number(u.runs)) reasons.push(`Not one of the ${count(u.runs)} accounts could open a single set there: with this plan the smallest Nasdaq position the broker allows risks more than the plan lets a set risk.`);
  if (trades) reasons.push(`At ${String(trades.plan || "").replace(" on every set", "")} a set, every account could trade: ${count((trades.practice || {}).died)} of ${count((trades.practice || {}).runs)} died on the practice months, and the middle run was ${pounds((trades.practice || {}).middle)}.`);
  return { title: v.counts ? "The buys-only version counts." : "The buys-only version does not count.", chip: v.counts ? { kind: "ok", text: "Counts" } : { kind: "no", text: "Does not count" },
    money: u ? pounds(u.middle) : "no figure",
    unseen: `On the ${count(((v.months || {}).unseen || []).length)} unseen months, a small account: ${runWords(u)}.`,
    standard: num(std.pnl_gbp) === null ? "" : `The Engine's standard account on those months: ${count(std.trades)} trades, ${pounds(std.pnl_gbp)}.`,
    plan: `The plan that stands: ${c.plan_words || "not on file"}.`,
    safe: v.safe_on_the_study_months ? "Safe on the study months." : `Not safe on the study months: ${why || "no reason on file"}.`, reasons,
    study: `Practice months: ${runWords(c.practice)}. Older practice months: ${runWords(c.older)}.`,
    limit: num(run.deepest_r) === null ? "" : `Its deepest losing run within one study month is ${Number(run.deepest_r).toFixed(1)} R (${monthWords(run.month)}), so a set may risk at most ${Number(run.largest_percent_plan).toFixed(2)}% of the balance.`,
    rows: (v.plans_tried || []).map((t) => ({ plan: `${String(t.plan || "").replace(" of the balance on every set", "").replace(/ \(.*$/, "")}${t.safe ? " (safe)" : ""}`, practice: pounds((t.practice || {}).middle),
      practiceDied: `${count((t.practice || {}).died)} of ${count((t.practice || {}).runs)}`, older: pounds((t.older || {}).middle), olderDied: `${count((t.older || {}).died)} of ${count((t.older || {}).runs)}`,
      idle: count(idle(t)) })),
    record: v.the_exam_months_for_the_record ? `For the record, with no say in the answer, the months the lead was tried on: ${runWords(v.the_exam_months_for_the_record.small_account)}.` : "",
    detail: `${count(ch.runs_in_every_month)} runs started in every month, starting balances from £${count(ch.start_from_gbp)} to £${count(ch.start_to_gbp)}, FOREX.com's real sizes and costs; an account that falls to half is dead. `
      + `It counts only if ${v.counts_if || "it is safe and makes money on the unseen months"}. Built and looked at once, on ${v.written_at ? when(v.written_at, zone) : "a day that is not on file"}.` };
}
