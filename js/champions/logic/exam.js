// The edge study's exam (champions/edge/exam.json in the engine): the kinds of signal the study found, tried once on
// months the study never read. Words and figures only. Every count, every mark and the line that sets the count
// beside luck are the exam's own; the page adds up a kind's signals and decides nothing.
import { when } from "./check.js";
import { inR, monthWords, groupWords } from "./edge.js";

const count = (n) => Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n) => WORDS[n] || count(n);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
const sum = (list) => (list || []).reduce((a, b) => a + Number(b || 0), 0);
const sideOf = (exam, side) => (exam && exam[side] && Array.isArray(exam[side].kinds) ? exam[side] : null);

/** A side's count in one sentence, and the exam's own line that sets it beside the shuffles. */
function counted(s, n, of, did) {
  const title = n === 0 ? `None of the ${word(of)} ${did}.` : n === of ? `All ${word(of)} ${did}.` : `${cap(word(n))} of the ${word(of)} ${did}.`;
  const sh = s.shuffled || {};
  const verdict = s.beside_the_shuffles ? `That is ${s.beside_the_shuffles}.${num(sh.most) === null ? "" : ` Shuffled ${count(sh.times)} times, at most ${word(Number(sh.most))} did.`}` : "";
  return { title, verdict, luck: s.beside_the_shuffles === "no more than luck gives" };
}

/** The exam in two sentences, and when it was sat: {title, verdict, detail, pass, judged, sat, luck}, or null when there is no exam. */
export function examHeadline(exam, zone) {
  const w = sideOf(exam, "winners");
  if (!w) return null;
  const sat = Number(w.sat || w.kinds.length), judged = Number(w.judged || 0), pass = Number(w.pass || 0);
  const runs = (exam.months || {}).stretches || [], months = runs.reduce((a, r) => a + r.length, 0), d = exam.design || {};
  const span = runs.length ? ` (${monthWords(runs[0][0])} to ${monthWords(runs[runs.length - 1].slice(-1)[0])})` : "";
  const detail = `${count(exam.signals)} signals with no rule applied, in ${months ? `${count(months)} months` : "months"} held back from the study${span}${runs.length ? `, in ${word(runs.length)} stretches` : ""}. `
    + (d.a_winner_passes ? `A kind holds again if ${d.a_winner_passes}. ` : "")
    + (judged < sat ? `${cap(word(sat - judged))} could not be judged: too few signals in a stretch. ` : "")
    + `Sat once, on ${exam.written_at ? when(exam.written_at, zone) : "a day that is not on file"}.`
    + ((exam.months || {}).not_read ? ` Not read: ${exam.months.not_read}.` : "");
  return { ...counted(w, pass, sat, "kinds held again on months the study never read"), detail, pass, judged, sat };
}

/** One row for each kind that sat the exam as a winner: a mark for each stretch, whether it held again, and its figures beside the study's. */
export function examWinners(exam) {
  const w = sideOf(exam, "winners");
  if (!w) return [];
  const times = count((w.shuffled || {}).times);
  return w.kinds.map((k) => {
    const n = sum(k.signals), study = k.in_the_study || {}, of = (k.signals || []).length;
    return { group: groupWords(k), pips: (k.average_r || []).map((v) => (num(v) === null ? "wait" : Number(v) > 0 ? "kept" : "dropped")),
      chip: !k.judged ? { kind: "", text: "Not judged" } : k.passes ? { kind: "ok", text: "Held again" } : { kind: "no", text: "Did not hold" },
      text: n ? `${inR(k.average_r_over_all, 3)} a signal over ${count(n)} signals` : "No signals",
      stretches: `${count(k.stretches_in_profit)} of ${count(of)} stretches in profit`,
      study: num(study.average_r) === null ? "" : `In the study: ${inR(study.average_r, 3)} over ${count(study.signals)}`,
      luck: k.judged ? `By luck alone it held in ${count(k.shuffles_in_which_it_passes)} of ${times} shuffles` : "Too few signals in a stretch",
      passes: k.passes === true, judged: k.judged === true };
  });
}

/** The kinds that lost every time in the study: whether each did worse than all the signals again. {title, verdict, luck, rows}, or null. */
export function examLosers(exam) {
  const lo = sideOf(exam, "losers");
  if (!lo) return null;
  const sat = Number(lo.sat || lo.kinds.length), times = count((lo.shuffled || {}).times);
  const rows = lo.kinds.map((k) => {
    const n = sum(k.signals), of = (k.signals || []).length;
    return { group: groupWords(k), average: n ? inR(k.average_r_over_all, 3) : "no signals", signals: count(n), below: `${count(k.stretches_below_all_signals)} of ${count(of)}`,
      again: !k.judged ? "Not judged" : k.worse_again ? "Yes" : "No", luck: k.judged ? `${count(k.shuffles_in_which_it_is_worse)} of ${times}` : "" };
  });
  return { ...counted(lo, Number(lo.worse_again || 0), sat, "kinds that lost every time did worse than the rest again"), rows };
}

/** One line for the study's own tile once the exam has been sat: what became of its kinds. "" when there is no exam. */
export function examAfterStudy(exam) {
  const w = sideOf(exam, "winners");
  if (!w) return "";
  const sat = Number(w.sat || w.kinds.length), pass = Number(w.pass || 0);
  return `Tried since on months the study never read: ${pass === 0 ? "none" : word(pass)} of the ${word(sat)} held again${w.beside_the_shuffles ? `, which is ${w.beside_the_shuffles}` : ""}. The exam is below.`;
}

/** All the signals of the exam months together, as the line the kinds are read against. */
export function examBase(exam) {
  const a = exam && exam.all_signals;
  if (!a || num(a.total_r) === null) return "";
  const of = (a.average_r || []).length;
  return `All the signals of those months together: ${inR(a.average_r_over_all, 3)} a signal (${inR(a.total_r, 0)} in all), in profit in ${word(Number(a.stretches_in_profit || 0))} of the ${word(of)} stretches.`;
}
