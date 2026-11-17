// The forward test in short, for the Live page: one sentence for where it stands, and its twelve weeks as a track. All
// of it comes from the same files the other pages read. Nothing is decided here.
import { forwardLine, day } from "./forward.js";
import { when } from "./check.js";

const time = (iso) => { const t = Date.parse(iso || ""); return Number.isNaN(t) ? null : t; };
const count = (n) => Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const list = (names) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The headline, the line under it, and the one thing to do when something is wrong. */
export function hero(score, card, stored, now, zone) {
  const line = forwardLine(score, card, stored, now, zone);
  if (!line.ok) return { ok: false, title: score ? "Something needs you." : "No score yet.", sub: `${line.title}. ${line.detail}`, todo: line.todo };
  let title, sub;                                          // the short form: the forward test's own page says the rest
  const versions = (score.versions || []).length;
  if (score.judged) {
    const passed = score.versions.filter((v) => v.verdict === "PASSED").length;
    title = passed === 0 ? `None of the ${count(versions)} passed.` : `${count(passed)} of ${count(versions)} passed.`;
    sub = `Judged on prices up to ${when(score.prices_to, zone)}.`;
  } else if (!score.started) {
    const begun = time(score.start) !== null && now >= time(score.start);
    title = begun ? "It has started." : "Ready to start.";
    sub = begun ? `It started on ${when(score.start, zone)}. Its first score comes with the next price download.` : `It starts on ${when(score.start, zone)}.`;
  } else {
    const weeks = Number(score.weeks_complete || 0);
    title = weeks ? `${count(weeks)} of ${count(score.weeks_in_all || 12)} weeks scored.` : "Week one is under way.";
    sub = `Scored on prices up to ${when(score.prices_to, zone)}.`;
  }
  return { ok: true, title, sub, todo: null };
}

/** The twelve weeks as a track: how many are scored, and its two ends. */
export function weeksTrack(score, card) {
  const all = Number((score && score.weeks_in_all) || 12);
  const done = Math.max(0, Math.min(all, Number((score && score.weeks_complete) || 0)));
  const start = (score && score.start) || (card && card.start) || null;
  const judged = (score && score.judged_on_the_first_score_at_or_after) || (card && card.judged_on_the_first_score_at_or_after) || null;
  return { all, done, stat: `${count(done)} of ${count(all)}`, caption: "weeks scored", start: start ? `Starts ${day(start)}` : "", judged: judged ? `Judged from ${day(judged)}` : "",
           started: !!(score && score.started), finished: !!(score && score.judged) };
}

/** The three months of the card as their end days: "12 Dec 2026, 9 Jan 2027 and 6 Feb 2027". */
export function monthEnds(card) {
  const ends = ((card && card.months) || []).map((m) => day(m.to));
  return list(ends);
}
