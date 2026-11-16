// Step 3, the small-account challenge: what was tried and what it found, read from the files the rounds wrote
// (champions/step3/finished.json, rounds.jsonl, by_year.json). The page says what the files say: a version counts only
// if `counts` is true there, and nothing here decides that again.
import { pounds } from "./forward.js";

const count = (n) => Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const sentence = (s) => { const t = String(s || "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".") : ""; };
const ORDER = ["A032", "A014", "A040", "A013", "A042"];

const small = (x) => (x ? `middle run ${pounds(x.middle)}, ${count(x.died)} of ${count(x.runs)} died` : "no figures");

/** The headline and the line under it. */
export function challengeHeadline(finished) {
  if (!finished) return { title: "The challenge", sub: "Its result file could not be found." };
  const versions = Object.values(finished.finished || {});
  const counted = versions.filter((v) => v.counts).length;
  const rounds = Number(finished.rounds_played || 0);
  const title = counted === 0 ? "No version counted." : counted === 1 ? "One version counted." : `${count(counted)} versions counted.`;
  const sub = `${count(rounds)} round${rounds === 1 ? "" : "s"}, one change at a time, judged by the Engine. A version counts only if it also makes money on the unseen months, which were looked at once, at the end.${counted === 0 ? " None did." : ""}`;
  return { title, sub };
}

/** Agent by agent: the record as it was and the finished version, each on the practice months and on the unseen months. */
export function challengeAgents(finished) {
  if (!finished) return [];
  const ids = [...ORDER.filter((id) => (finished.finished || {})[id]), ...Object.keys(finished.finished || {}).filter((id) => !ORDER.includes(id))];
  return ids.map((id) => {
    const before = (finished.the_records_as_they_were || {})[id] || {}, standing = (finished.standing || {})[id] || {}, done = finished.finished[id];
    const row = (kind, plan, practice, unseen, std, counts, rules) => ({
      kind, plan: sentence(plan), practice: `Practice months: ${small(practice)}.`,
      unseen: `Unseen months: ${small(unseen)}.${std ? ` Standard account ${pounds(std.pnl_gbp)} on ${count(std.trades)} trades.` : ""}`,
      chip: counts ? { text: "counted", kind: "ok" } : { text: "did not count", kind: "no" }, rules: rules || [],
    });
    return { id, name: done.name || standing.name || before.name || id, versions: [
      row("The record as it was", before.plan_words, before.practice, before.unseen, before.standard_unseen, !!before.counts, []),
      row("Finished version", standing.plan_words, standing.practice, done.unseen, done.standard_unseen, !!done.counts, standing.in_words || []),
    ] };
  });
}

/** The rounds, newest last: [{round, title, rows: [{name, change, kept, why, exactly}]}]. Round 0 is the starting point. */
export function challengeRounds(rows) {
  const by = new Map();
  for (const r of rows || []) {
    if (!by.has(r.round)) by.set(r.round, []);
    by.get(r.round).push({ name: r.name, change: sentence(r.change).replace(/\.$/, ""), kept: !!r.kept, why: sentence(r.why || (r.not_safe_because || [])[0] || ""), exactly: r.exactly || [] });
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([round, list]) => {
    const kept = list.filter((x) => x.kept).length;
    return { round, title: round === 0 ? "Where each one started" : `Round ${round}`,
             summary: round === 0 ? `${count(list.length)} records, as they were` : `${count(list.length)} change${list.length === 1 ? "" : "s"}, ${kept === 0 ? "none" : count(kept)} kept`, rows: list };
  });
}

/** Totals over the rounds that changed something: "35 changes tried, 14 kept." */
export function challengeTotals(rows) {
  const tried = (rows || []).filter((r) => r.round > 0);
  if (!tried.length) return "";
  const kept = tried.filter((r) => r.kept).length;
  return `${count(tried.length)} changes tried, ${kept === 0 ? "none" : count(kept)} kept. Every one was a change of rules: no code was written.`;
}

/** Year by year on the Engine's standard account: {periods: [...], rows: [{name, version, cells: [{text, sign}]}]}. */
export function byYear(doc) {
  const rows = (doc && doc.rows) || [];
  if (!rows.length) return null;
  const periods = Object.keys(rows[0].by_period || {});
  const label = (p) => (/^\d{4}$/.test(p) ? p : "Oct 2025 on");
  return { periods: periods.map(label), rows: rows.map((r) => ({ name: r.agent, version: /^the record/.test(r.version) ? "Record" : "Finished",
    cells: periods.map((p) => { const v = (r.by_period[p] || {}).pnl_gbp; return { text: pounds(v), sign: v > 0 ? "up" : v < 0 ? "down" : "flat" }; }) })) };
}
