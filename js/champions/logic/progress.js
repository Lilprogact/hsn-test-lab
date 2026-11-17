// The Live page: where the five agents stand in the rounds, what each is doing now and what the judge decided. All of it
// is read from the one file the judge writes as it works (champions/step4/progress.json in the engine). Words and
// figures only: nothing is drawn here. Every sum is the judge's own; the only things worked out here are the
// difference between two of its sums and a share of its own counts.
import { pounds } from "./forward.js";
import { when } from "./check.js";

/** A judge that is working writes far more often than this. Older than this while it says "working": it has stopped. */
export const QUIET_MS = 10 * 60 * 1000;

const time = (iso) => { const t = Date.parse(iso || ""); return Number.isNaN(t) ? null : t; };
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const count = (n) => Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const plural = (n, one, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;
const sentence = (s) => { const t = String(s || "").trim(); return t ? t[0].toUpperCase() + t.slice(1) : ""; };
const whole = (v) => Math.sign(Number(v)) * Math.round(Math.abs(Number(v)));     // to the pound, halves away from nought (as pounds() does)
const middleOf = (agent) => num(agent && agent.standing && agent.standing.practice && agent.standing.practice.middle);
const startOf = (agent) => num(agent && agent.start_of_batch && agent.start_of_batch.middle);

/** "just now", "40 seconds ago", "3 minutes ago", "2 hours ago", "4 days ago". */
export function ago(iso, now) {
  const t = time(iso);
  if (t === null) return "at an unknown time";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${plural(m, "minute")} ago`;
  const hours = Math.floor(m / 60);
  if (hours < 48) return `${plural(hours, "hour")} ago`;
  return `${plural(Math.floor(hours / 24), "day")} ago`;
}

/** The clock time of a decision, in GMT and on this device: "11:06 GMT, 13:06 your time". */
export function clock(iso, zone) {
  const t = time(iso);
  if (t === null) return "an unknown time";
  const at = (tz) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(tz ? { timeZone: tz } : {}) }).format(new Date(t));
  return `${at("UTC")} GMT, ${at(zone)} your time`;
}

/** How far a sum has moved, on the pounds as they are shown (so the page's own figures always add up). */
export function change(now, start) {
  if (now === null || start === null) return null;
  const d = whole(now) - whole(start);
  return { value: d, dir: d > 0 ? "up" : d < 0 ? "down" : "flat", text: d === 0 ? "no change" : pounds(d) };
}

/** How many changes this batch has judged, kept and dropped, and how many are still to come: in the order they were judged. */
export function batchTrack(progress) {
  const agents = (progress && progress.agents) || [];
  const all = agents.length * Number((progress && progress.tries_each) || 0);
  const tries = agents.flatMap((a) => (a.tries || []).filter((t) => t.batch === progress.batch)).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const kept = tries.filter((t) => t.kept).length, left = Math.max(0, all - tries.length);
  return { all, done: tries.length, kept, dropped: tries.length - kept, left,
    pips: [...tries.map((t) => (t.kept ? "kept" : "dropped")), ...Array.from({ length: left }, () => "wait")],
    text: `${count(tries.length)} of ${count(all)} judged`, words: `${count(kept)} kept, ${count(tries.length - kept)} dropped, ${count(left)} to come` };
}

/** Working, gone quiet (the file says working but nothing has been written for a while), resting, or no rounds yet. */
export function liveState(progress, now, zone) {
  if (!progress || !Array.isArray(progress.agents) || !progress.agents.length) {
    return { kind: "none", label: "No rounds yet", detail: "No progress of the rounds has been saved yet.", next: null };
  }
  const track = batchTrack(progress), batch = `Batch ${count(progress.batch)}`;
  const updated = time(progress.updated_at);
  if (progress.state === "working") {
    if (updated !== null && now - updated > QUIET_MS) {
      return { kind: "quiet", label: "Stopped part-way", detail: `${batch} stopped at ${track.text}. Nothing new since ${when(progress.updated_at, zone)}.`,
        next: "Tell Claude in the Champions chat: carry on with the rounds." };
    }
    return { kind: "working", label: "Working now", detail: `${batch}: ${track.text}.`, next: null };
  }
  return { kind: "resting", label: "Resting", detail: `${batch} ended on ${when(progress.updated_at, zone)}, with ${track.text}.`,
    next: "The agents work while the Champions chat is working. To start another batch, tell Claude there: go." };
}

/** The five agents by the money their standing version makes in a middle month, the most first. `share` is each sum as a part of the largest. */
export function board(progress) {
  const rows = ((progress && progress.agents) || []).map((a) => {
    const value = middleOf(a), start = startOf(a);
    return { id: a.id, name: a.name, value, start, text: pounds(value), startText: pounds(start), change: change(value, start) };
  });
  const top = Math.max(0, ...rows.map((r) => Math.max(r.value || 0, r.start || 0)));
  for (const r of rows) {
    r.share = top > 0 ? Math.max(0, (r.value || 0) / top) : 0;
    r.startShare = top > 0 ? Math.max(0, (r.start || 0) / top) : 0;
  }
  return rows.map((r, i) => [r, i]).sort(([a, i], [b, j]) => ((b.value ?? -Infinity) - (a.value ?? -Infinity)) || i - j).map(([r]) => r);
}

const list = (names) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The headline: the best agent's middle month now (every agent on that sum is named), and how far that is above the best one when this batch began. */
export function best(progress) {
  const rows = board(progress).filter((r) => r.value !== null);
  if (!rows.length) return null;
  const top = rows[0], level = rows.filter((r) => r.value === top.value).map((r) => r.name);
  const from = rows.filter((r) => r.start !== null).sort((a, b) => b.start - a.start)[0] || null;
  return { id: top.id, name: top.name, names: level, who: level.length > 1 ? `${list(level)}, level` : top.name, value: top.value, text: top.text,
    from: from ? { name: from.name, value: from.start, text: pounds(from.start) } : null,
    change: from ? change(top.value, from.start) : null };
}

const STATE = { trying: "Being judged", studying: "Studying its trades", thinking: "Thinking", done: "Done for this batch", resting: "Resting", stopped: "Stopped" };

/** One agent's card: what it is doing, the money now and since the batch began, its tries, its last verdict and its facts. */
export function agentCard(agent, progress, now, zone) {
  const s = agent.standing || {}, p = s.practice || {};
  const tries = agent.tries || [], mine = tries.filter((t) => t.batch === progress.batch);
  const each = Number(agent.tries_each || progress.tries_each || 0);
  const last = tries.length ? tries[tries.length - 1] : null;
  const live = liveState(progress, now, zone).kind;
  let kind = STATE[agent.state] ? agent.state : "resting";
  if (live === "quiet" && ["trying", "studying", "thinking"].includes(kind)) kind = "stopped";
  if (live === "resting" && kind !== "done") kind = "resting";
  const busyWith = agent.now && typeof agent.now === "object" ? String(agent.now.change || "") : String(agent.now || "");   // {kind, change, since} while it tries or studies
  const doing = kind === "trying" ? `The judge is playing: ${busyWith || "its change"}.`
    : kind === "studying" ? `${sentence(busyWith || "studying its trades")}.`
    : kind === "thinking" ? (mine.length ? "Working out its next change." : "Reading its trades before its first change.")
    : kind === "done" ? `All ${count(each)} tries of this batch are used.`
    : kind === "stopped" ? `Stopped after ${count(mine.length)} of ${count(each)} tries.`
    : "Waiting for the next batch.";
  const value = num(p.middle), start = startOf(agent);
  const runs = Number(p.runs || 0);
  const looked = agent.looks && typeof agent.looks === "object" ? agent.looks : null;          // {count, last: {what, at}}: the judge counts every look at the trades
  const lastLook = looked && looked.last && looked.last.what ? { what: String(looked.last.what), at: looked.last.at || null } : null;
  return {
    id: agent.id, name: agent.name, knownFor: agent.known_for || "",
    state: { kind, text: STATE[kind] }, doing,
    money: pounds(value), change: change(value, start), startText: pounds(start),
    safe: s.safe === true,
    looks: looked && Number(looked.count) > 0 ? `Studied its trades ${Number(looked.count) === 1 ? "once" : `${count(looked.count)} times`} in this batch` : null,
    lastLook: lastLook && ["trying", "studying", "thinking", "done"].includes(kind) ? lastLook : null,
    used: `${count(mine.length)} of ${count(each)} tries used`,
    pips: [...mine.map((t) => (t.kept ? "kept" : "dropped")), ...Array.from({ length: Math.max(0, each - mine.length) }, () => "wait")],
    keptNow: mine.filter((t) => t.kept).length,
    facts: [
      ["Best run", pounds(num(p.best))], ["Worst run", pounds(num(p.worst))],
      ["Accounts that died", runs ? `${count(p.died)} of ${count(runs)}` : "no figure"],
      ["Runs in profit", runs && num(p.in_profit) !== null ? `${Math.round((100 * Number(p.in_profit)) / runs)}%` : "no figure"],
    ],
    plan: s.plan_words ? sentence(s.plan_words) : "no money plan read", version: s.version || "",
    rules: Array.isArray(s.in_words) ? s.in_words : [],
  };
}

/** The line the money has followed, round by round: the standing version's middle month after each round. A round of this step also has the judge's reason and its time. */
export function sparkline(agent) {
  const judged = new Map((agent.tries || []).map((t) => [Number(t.round), t]));
  const points = (agent.series || []).map((x) => ({ round: Number(x.round), step: Number(x.step), value: num(x.middle) ?? 0, kept: !!x.kept,
    change: String(x.change || ""), tried: num(x.tried_middle),
    verdict: Number(x.step) >= 4 && judged.has(Number(x.round)) ? String(judged.get(Number(x.round)).verdict || "") : "",
    at: Number(x.step) >= 4 && judged.has(Number(x.round)) ? judged.get(Number(x.round)).at || null : null }));
  const values = points.map((p) => p.value);
  const firstNew = points.findIndex((p) => p.step >= 4);
  return { points, low: Math.min(0, ...values), high: Math.max(0, ...values), firstNew };
}

/** One round for the line under the drawing and for a screen reader: {kind: start | kept | dropped, label, text}. */
export function readout(point) {
  if (!point) return { kind: "start", label: "", text: "" };
  const what = sentence(point.change) || "A change";
  if (point.round === 0) return { kind: "start", label: "Start", text: `${what}. Middle month ${pounds(point.value)}.` };
  const round = `Round ${count(point.round)}`;
  if (point.kept) return { kind: "kept", label: "Kept", text: `${round}: ${what}. Middle month now ${pounds(point.value)}.` };
  const why = point.verdict ? ` ${sentence(point.verdict)}.` : "";
  const tried = point.tried === null ? "" : ` That version made ${pounds(point.tried)};`;
  return { kind: "dropped", label: "Dropped", text: `${round}: ${what}.${why}${tried} the middle month stays ${pounds(point.value)}.`.replace(". the middle", ". The middle") };
}

/** Every round as table rows: round, what was changed, kept or dropped, that version's middle month, the standing middle month after it. */
export function roundRows(agent) {
  return sparkline(agent).points.map((p) => [
    p.round === 0 ? "Start" : `${count(p.round)}${p.step >= 4 ? "" : " (step 3)"}`, sentence(p.change),
    p.round === 0 ? "" : p.kept ? "Kept" : "Dropped",
    { text: p.tried === null ? "" : pounds(p.tried) }, { text: pounds(p.value) },
  ]);
}

/** This step's tries with their reasons, the newest first: what, why it was tried, what the judge said, and the exact settings. */
export function tryNotes(agent, zone) {
  return [...(agent.tries || [])].reverse().map((t) => ({
    round: `Round ${count(t.round)}`, kept: !!t.kept, change: sentence(t.change), why: sentence(t.why_tried), verdict: sentence(t.verdict),
    money: pounds(num(t.middle)), died: t.died === null || t.died === undefined ? "" : `${count(t.died)} died`,
    exactly: Array.isArray(t.exactly) ? t.exactly : [], at: clock(t.at, zone),
  }));
}

/** The latest decisions, the newest first. */
export function feedRows(progress, now, zone) {
  return ((progress && progress.feed) || []).map((f) => ({
    name: f.name, round: `Round ${count(f.round)}`, change: sentence(f.change), kept: !!f.kept, verdict: sentence(f.verdict),
    money: pounds(num(f.middle)), at: clock(f.at, zone), ago: ago(f.at, now), iso: f.at,
  }));
}

/** How a change is judged, in the judge's own sentences (the file carries them). Nothing is said here that the file does not say. */
export function judgedBy(progress) {
  const lines = progress && Array.isArray(progress.judged_by) ? progress.judged_by.filter((l) => typeof l === "string" && l.trim()) : [];
  return lines;
}

/** What the money is measured on, in one sentence, from the file's own counts. */
export function measuredOn(progress) {
  const j = (progress && progress.judged_on) || {};
  const runs = Number(j.runs_on_the_practice_months || 0), months = Number(j.practice_months || 0);
  if (!runs || !months) return "A middle month: half the one-month runs of a small account made more than this, half made less.";
  return `A middle month: of ${count(runs)} one-month runs of a small account (£100 to £500) on the ${count(months)} practice months, half made more than this and half made less.`;
}
