// The edge study (champions/edge/study.json in the engine): whether any kind of the indicator's raw signals makes
// money stretch after stretch, before any rule set is built on it. Words and figures only; every count and average is
// the study's own. Nothing is worked out here except a group's signals added up and its results divided by them.
import { when } from "./check.js";

const count = (n) => Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n) => WORDS[n] || count(n);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT = { "tp1+trail": "Target 1, trailing stop", "tp2+trail": "Target 2, trailing stop", "tp3+trail": "Target 3, trailing stop",
  tp3: "Target 3, stop left in place", "split5+trail": "Five positions, trailing stop" };

/** A result in R with its sign: "+0.05 R", "−0.11 R", and "−385 R" with no places. */
export function inR(v, places = 2) {
  if (num(v) === null) return "no figure";
  const n = Number(v), shown = Math.abs(n).toFixed(places);
  return `${Number(shown) === 0 ? "" : n > 0 ? "+" : "−"}${places ? shown : count(shown)} R`;
}

/** "2020-01" as "Jan 2020"; anything else as it is. */
export function monthWords(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ""));
  return m && MONTHS[Number(m[2]) - 1] ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(ym || "");
}

// A band of confidence or of stop size is only a pair of numbers in the study's own label: the page says which it is.
const SAY = { confidence: (label) => `confidence ${label}`, stop: (label, unit) => `stop ${label} ${unit}` };

/** A group in the page's words, with the unit a stop size is in ("pips" on gold, "points" on Nasdaq). */
export function groupWordsWith(group, unit) {
  const label = String((group && group.group) || ""), parts = label.split(", "), ways = (group && group.ways) || [];
  return cap(parts.length === ways.length ? parts.map((part, i) => (SAY[ways[i]] ? SAY[ways[i]](part, unit) : part)).join(", ") : label);
}

/** A group in the page's words: the study's own label, with the bands named ("0.8 to 0.9" is "confidence 0.8 to 0.9"). */
export function groupWords(group) {
  return groupWordsWith(group, "pips");
}

const exitsOf = (study) => (study && study.exits && typeof study.exits === "object" ? Object.entries(study.exits) : []);
const exitName = (key, e) => SHORT[key] || cap((e && e.exit) || key);
const luckOf = (e) => num((e.shuffled || {}).everywhere_most);

/** The exit under which the most groups hold everywhere (the first of them when level): its key, or null. */
export function clearestExit(study) {
  let best = null;
  for (const [key, e] of exitsOf(study)) if (best === null || Number(e.everywhere || 0) > Number(study.exits[best].everywhere || 0)) best = key;
  return best;
}

/** One bar for each exit, the one with the most first: the kinds that held in every stretch, and the most that luck alone gave. */
export function edgeBars(study) {
  const rows = exitsOf(study).map(([key, e]) => {
    const found = Number(e.everywhere || 0), luck = luckOf(e), times = count((e.shuffled || {}).times);
    return { key, name: exitName(key, e), found, luck, text: `${count(found)} kind${found === 1 ? "" : "s"}`, beyond: luck !== null && found > luck,
      words: luck === null ? "No check on luck is on file." : found > luck ? `More than luck gave in any of ${times} shuffles (at most ${count(luck)}).` : `No more than luck gives (up to ${count(luck)} in ${times} shuffles).` };
  });
  const top = Math.max(1, ...rows.map((r) => Math.max(r.found, r.luck || 0)));
  return rows.map((r) => ({ ...r, share: r.found / top, luckShare: r.luck === null ? null : r.luck / top })).sort((a, b) => b.found - a.found);
}

/** One line for each exit, in the study's own order: what all the signals do together, and how many groups hold beside what luck gave. */
export function edgeExits(study) {
  return exitsOf(study).map(([key, e]) => {
    const all = e.all_signals || {}, each = all.average_r || [], s = e.shuffled || {};
    const losing = each.filter((v) => Number(v) < 0).length;
    return { key, exit: exitName(key, e),
      together: each.length ? `${inR(all.total_r, 0)}, lost ${count(losing)} of ${count(each.length)} stretches` : "no figure",
      everywhere: `${count(e.everywhere)}${num(s.everywhere_most) === null ? "" : ` (luck: at most ${count(s.everywhere_most)})`}`,
      mostly: `${count(e.mostly)}${num(s.mostly_most) === null ? "" : ` (luck: at most ${count(s.mostly_most)})`}` };
  });
}

/** The groups that made money in every stretch under one exit: the group, its signals, its average over all of them, and its worst stretch. */
export function edgeGroups(study, key, unit = "pips") {
  const e = study && study.exits && study.exits[key];
  return ((e && e.holds_everywhere) || []).map((g) => {
    const signals = (g.signals || []).reduce((a, b) => a + Number(b || 0), 0);
    return { group: groupWordsWith(g, unit), signals: count(signals), average: inR(signals ? Number(g.total_r) / signals : null), worst: inR(g.worst_stretch_average_r, 3),
      stretches: (g.average_r || []).map((v) => inR(v)) };
  });
}

/** The study in two sentences, and when it was made: {title, detail, key, exit, beyond}, or null when there is no study. */
export function edgeHeadline(study, zone, months = "months the agents study") {
  const all = exitsOf(study);
  if (!all.length) return null;
  const key = clearestExit(study), e = study.exits[key], s = e.shuffled || {}, n = Number(e.everywhere || 0), luck = luckOf(e), beyond = luck !== null && n > luck;
  const totals = all.map(([, x]) => num((x.all_signals || {}).total_r));
  const together = totals.every((t) => t !== null && t < 0) ? "Taken together the signals lose." : totals.every((t) => t !== null && t > 0) ? "Taken together the signals make money."
    : "Taken together the signals lose with some exits and not with others.";
  const kinds = `kind${n > 1 ? "s" : ""} of signal made money in every stretch`;
  const title = `${together} ${n === 0 ? `No ${kinds}.` : beyond ? `${cap(word(n))} ${kinds}.` : `${cap(word(n))} ${kinds}, which is no more than luck gives.`}`;
  const runs = ((study.months || {}).stretches || []), first = runs.length ? runs[0][0] : null, last = runs.length ? runs[runs.length - 1].slice(-1)[0] : null;
  const detail = `${count(study.signals)} signals with no rule applied, grouped ${count(study.families)} ways, in ${runs.length ? `${word(runs.length)} stretches of ${months} (${monthWords(first)} to ${monthWords(last)})` : `stretches of the ${months}`}. `
    + (n && luck !== null ? `With ${e.exit || exitName(key, e).toLowerCase()}, ${count(n)} group${n === 1 ? "" : "s"} made money in every stretch; luck alone gave at most ${count(luck)} in ${count(s.times)} shuffles. ` : "")
    + `Made on ${study.written_at ? when(study.written_at, zone) : "a day that is not on file"}.`;
  return { title, detail, key, exit: exitName(key, e), beyond };
}
