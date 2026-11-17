// The Live page's words and figures (js/champions/logic/progress.js). Every file here is made up, in the shape of the
// judge's own progress file. No sum is worked out anew except a difference between two of the judge's sums, and a
// figure that is missing is said to be missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { QUIET_MS, ago, clock, change, batchTrack, liveState, board, best, agentCard, sparkline, readout, roundRows, tryNotes, feedRows, measuredOn, judgedBy } from "../js/champions/logic/progress.js";

const NICOSIA = "Asia/Nicosia";
const AT = "2026-11-17T11:06:10Z", NOW = Date.parse("2026-11-17T11:06:30Z");
const practice = (middle, over = {}) => ({ middle, best: 900.4, worst: -120.5, average: 150, died: 3, runs: 2800, could_not_trade: 10, in_profit: 2100, ...over });
const SERIES = [
  { round: 0, step: 3, middle: 0, safe: false, kept: true, change: "the record as it is", tried_middle: 0 },
  { round: 1, step: 3, middle: 80, safe: true, kept: true, change: "skip small stops", tried_middle: 80 },
  { round: 2, step: 4, middle: 80, safe: true, kept: false, change: "add the 4-hour chart", tried_middle: 60.4 },
  { round: 3, step: 4, middle: 100, safe: true, kept: true, change: "close at target 2", tried_middle: 100 },
];
const TRIES = [
  { round: 2, at: "2026-11-17T11:05:00Z", batch: 1, change: "add the 4-hour chart", why_tried: "the 4-hour chart made money on both sets of months", kept: false, verdict: "safe, but not better on the practice months",
    safe: true, middle: 60.4, died: 0, exactly: ["timeframes: [15] -> [15, 240]"] },
  { round: 3, at: "2026-11-17T11:06:00Z", batch: 1, change: "close at target 2", why_tried: "target 2 is reached more often than target 3", kept: true, verdict: "safe, and better on the practice months",
    safe: true, middle: 100, died: 3, exactly: ["exit.style: tp3 -> tp2", "money plan: percent:5 -> percent:10"] },
];
const agent = (id, name, over = {}) => ({ id, name, known_for: "most pips", state: "thinking", now: null,
  standing: { version: `v-${id}`, plan_words: "10% of the balance on every set", in_words: ["Take the signals.", "Only when the market is quiet."], safe: true, practice: practice(100) },
  start_of_batch: { middle: 80, version: "v-0" }, series: SERIES, tries: TRIES, tried: 2, kept: 1, tried_this_batch: 2, tries_each: 3, ...over });
const second = () => agent("A2", "Made Up Two", { standing: { version: "v-A2", plan_words: "5% of the balance on every set", in_words: [], safe: true, practice: practice(40.5, { died: 0 }) },
  start_of_batch: { middle: 40.5, version: "v-A2" }, series: SERIES.slice(0, 2), tries: [], tried: 0, kept: 0, tried_this_batch: 0 });
const progress = (over = {}) => ({ step: 4, state: "working", batch: 1, tries_each: 3, started_at: "2026-11-17T11:00:00Z", updated_at: AT,
  judged_on: { practice_months: 7, older_practice_months: 35, runs_on_the_practice_months: 2800 }, totals: { tried: 2, kept: 1, tried_this_batch: 2, kept_this_batch: 1, refused: 0 },
  agents: [agent("A1", "Made Up One"), second()],
  feed: [{ at: "2026-11-17T11:06:00Z", agent: "A1", name: "Made Up One", round: 3, change: "close at target 2", kept: true, verdict: "safe, and better on the practice months", middle: 100 },
    { at: "2026-11-17T11:05:00Z", agent: "A1", name: "Made Up One", round: 2, change: "add the 4-hour chart", kept: false, verdict: "safe, but not better on the practice months", middle: 60.4 }], ...over });

test("how long ago, in plain words", () => {
  const t = Date.parse(AT);
  assert.deepEqual([0, 4000, 5000, 59000, 60000, 119000, 120000, 3600000, 47 * 3600000, 48 * 3600000, 100 * 3600000].map((ms) => ago(AT, t + ms)),
    ["just now", "just now", "5 seconds ago", "59 seconds ago", "1 minute ago", "1 minute ago", "2 minutes ago", "1 hour ago", "47 hours ago", "2 days ago", "4 days ago"]);
  assert.equal(ago(AT, t - 5000), "just now", "a clock that is a little behind never says a time to come");
  assert.equal(ago(null, t), "at an unknown time");
  assert.equal(clock("2026-11-17T11:06:00Z", NICOSIA), "11:06 GMT, 13:06 your time");
  assert.equal(clock("nonsense", NICOSIA), "an unknown time");
});

test("a move is worked out on the pounds as they are shown, so the page's own figures add up", () => {
  assert.deepEqual(change(100.6, 50.4), { value: 51, dir: "up", text: "+£51" });       // shown as +£101 and +£50
  assert.deepEqual(change(114.25, 114.4), { value: 0, dir: "flat", text: "no change" });
  assert.deepEqual(change(88, 100.2), { value: -12, dir: "down", text: "−£12" });
  assert.equal(change(null, 100), null);
  assert.equal(change(100, null), null);
});

test("the batch: what was judged, kept and dropped, in the order it was judged, and what is still to come", () => {
  const p = progress();
  assert.deepEqual(batchTrack(p), { all: 6, done: 2, kept: 1, dropped: 1, left: 4, pips: ["dropped", "kept", "wait", "wait", "wait", "wait"], text: "2 of 6 judged", words: "1 kept, 1 dropped, 4 to come" });
  const later = progress({ batch: 2 });                       // the same tries belong to batch 1: none of them counts in batch 2
  assert.deepEqual([batchTrack(later).done, batchTrack(later).left, batchTrack(later).pips.length], [0, 6, 6]);
});

test("working, stopped part-way, resting, or no rounds yet", () => {
  assert.deepEqual(liveState(progress(), NOW, NICOSIA), { kind: "working", label: "Working now", detail: "Batch 1: 2 of 6 judged.", next: null });
  const stale = liveState(progress(), Date.parse(AT) + QUIET_MS + 1000, NICOSIA);
  assert.deepEqual(stale, { kind: "quiet", label: "Stopped part-way", detail: "Batch 1 stopped at 2 of 6 judged. Nothing new since 17 Nov 2026, 11:06 GMT (13:06 your time).",
    next: "Tell Claude in the Champions chat: carry on with the rounds." });
  assert.equal(liveState(progress(), Date.parse(AT) + QUIET_MS, NICOSIA).kind, "working", "exactly at the limit it still counts as working");
  assert.deepEqual(liveState(progress({ state: "resting" }), NOW + 5 * 3600000, NICOSIA), { kind: "resting", label: "Resting",
    detail: "Batch 1 ended on 17 Nov 2026, 11:06 GMT (13:06 your time), with 2 of 6 judged.", next: "The agents work while the Champions chat is working. To start another batch, tell Claude there: go." });
  for (const none of [null, {}, { agents: [] }]) assert.equal(liveState(none, NOW, NICOSIA).kind, "none");
});

test("the five by their money, the most first; equal sums keep the file's order; nothing is made up for a missing sum", () => {
  const rows = board(progress());
  assert.deepEqual(rows.map((r) => [r.name, r.text, r.startText, r.change.text, r.share, r.startShare]), [["Made Up One", "+£100", "+£80", "+£20", 1, 0.8], ["Made Up Two", "+£41", "+£41", "no change", 0.405, 0.405]]);
  const tie = board(progress({ agents: [second(), agent("A1", "Made Up One"), agent("A3", "Made Up Three")] }));
  assert.deepEqual(tie.map((r) => r.name), ["Made Up One", "Made Up Three", "Made Up Two"]);
  const blank = agent("A9", "No Figures", { standing: { version: "x" }, start_of_batch: {} });
  const withBlank = board(progress({ agents: [blank, agent("A1", "Made Up One")] }));
  assert.deepEqual(withBlank.map((r) => [r.name, r.text, r.change, r.share]), [["Made Up One", "+£100", { value: 20, dir: "up", text: "+£20" }, 1], ["No Figures", "no figure", null, 0]]);
  const loss = board(progress({ agents: [agent("A1", "Loser", { standing: { practice: practice(-30) }, start_of_batch: { middle: -10 } })] }));
  assert.deepEqual([loss[0].text, loss[0].share, loss[0].startShare, loss[0].change.text], ["−£30", 0, 0, "−£20"], "a loss has no bar, and its sum is still said");
  assert.deepEqual(board(null), []);
});

test("the headline names the best sum, everyone who is level on it, and where the best stood when the batch began", () => {
  const top = best(progress());
  assert.deepEqual([top.text, top.who, top.names, top.from, top.change], ["+£100", "Made Up One", ["Made Up One"], { name: "Made Up One", value: 80, text: "+£80" }, { value: 20, dir: "up", text: "+£20" }]);
  const level = best(progress({ agents: [agent("A1", "Made Up One"), agent("A3", "Made Up Three", { start_of_batch: { middle: 95 } }), second()] }));
  assert.deepEqual([level.who, level.from.name, level.from.text, level.change.text], ["Made Up One and Made Up Three, level", "Made Up Three", "+£95", "+£5"]);
  assert.equal(best(progress({ agents: [agent("A9", "No Figures", { standing: {} })] })), null);
  assert.equal(best(null), null);
});

test("an agent's card: what it is doing, its money and how far it has come, its tries and its facts", () => {
  const p = progress();
  const c = agentCard(p.agents[0], p, NOW, NICOSIA);
  assert.deepEqual([c.name, c.knownFor, c.state, c.doing], ["Made Up One", "most pips", { kind: "thinking", text: "Thinking" }, "Working out its next change."]);
  assert.deepEqual([c.money, c.change, c.startText, c.safe], ["+£100", { value: 20, dir: "up", text: "+£20" }, "+£80", true]);
  assert.deepEqual([c.used, c.pips, c.keptNow], ["2 of 3 tries used", ["dropped", "kept", "wait"], 1]);
  assert.deepEqual(c.facts, [["Best run", "+£900"], ["Worst run", "−£121"], ["Accounts that died", "3 of 2,800"], ["Runs in profit", "75%"]]);
  assert.deepEqual([c.plan, c.version, c.rules], ["10% of the balance on every set", "v-A1", ["Take the signals.", "Only when the market is quiet."]]);
  const fresh = agentCard(p.agents[1], p, NOW, NICOSIA);
  assert.deepEqual([fresh.doing, fresh.used, fresh.pips, fresh.change.text], ["Reading its trades before its first change.", "0 of 3 tries used", ["wait", "wait", "wait"], "no change"]);
});

test("the card says what an agent is busy with, in the judge's own words, and never claims work that has stopped", () => {
  const card = (over, whole = {}) => { const p = progress({ agents: [agent("A1", "Made Up One", over)], ...whole }); return agentCard(p.agents[0], p, whole.now || NOW, NICOSIA); };
  const trying = card({ state: "trying", now: { kind: "try", change: "skip the first 30 minutes", why: "they lose", since: AT } });
  assert.deepEqual([trying.state.text, trying.doing], ["Being judged", "The judge is playing: skip the first 30 minutes."]);
  const studying = card({ state: "studying", now: { kind: "look", change: "studying its trades by hour on the older practice months", since: AT } });
  assert.deepEqual([studying.state.text, studying.doing], ["Studying its trades", "Studying its trades by hour on the older practice months."]);
  assert.equal(card({ state: "trying", now: null }).doing, "The judge is playing: its change.");
  const done = card({ state: "done", tries: [...TRIES, { ...TRIES[1], round: 4 }], tried_this_batch: 3 });
  assert.deepEqual([done.state.text, done.doing, done.pips], ["Done for this batch", "All 3 tries of this batch are used.", ["dropped", "kept", "kept"]]);
  const stopped = card({ state: "thinking" }, { now: Date.parse(AT) + QUIET_MS + 60000 });
  assert.deepEqual([stopped.state, stopped.doing], [{ kind: "stopped", text: "Stopped" }, "Stopped after 2 of 3 tries."]);
  const stillDone = card({ state: "done" }, { now: Date.parse(AT) + QUIET_MS + 60000 });
  assert.equal(stillDone.state.kind, "done", "an agent that had finished is not said to have stopped");
  const resting = card({ state: "resting" }, { state: "resting" });
  assert.deepEqual([resting.state.text, resting.doing], ["Resting", "Waiting for the next batch."]);
  const odd = card({ state: "something new" });
  assert.equal(odd.state.kind, "resting", "a state this page does not know is never shown as work");
  const blank = card({ standing: {}, start_of_batch: {} });
  assert.deepEqual([blank.money, blank.change, blank.safe, blank.plan, blank.rules, blank.facts.map((f) => f[1])], ["no figure", null, false, "no money plan read", [], ["no figure", "no figure", "no figure", "no figure"]]);
});

test("how often an agent has studied its trades, and what it last looked at, are the judge's own count and words", () => {
  const card = (over, whole = {}) => { const p = progress({ agents: [agent("A1", "Made Up One", over)], ...whole }); return agentCard(p.agents[0], p, whole.now || NOW, NICOSIA); };
  const last = { what: "its trades by UK hour on the older practice months", at: "2026-11-17T11:05:50Z" };
  const busy = card({ looks: { count: 14, last } });
  assert.deepEqual([busy.looks, busy.lastLook], ["Studied its trades 14 times in this batch", last]);
  assert.equal(card({ looks: { count: 1, last } }).looks, "Studied its trades once in this batch");
  assert.deepEqual([card({}).looks, card({}).lastLook], [null, null], "a file from before the judge kept count says nothing about it");
  assert.deepEqual([card({ looks: { count: 0, last: null } }).looks, card({ looks: { count: 0, last: null } }).lastLook], [null, null]);
  const resting = card({ state: "resting", looks: { count: 24, last } }, { state: "resting" });
  assert.deepEqual([resting.looks, resting.lastLook], ["Studied its trades 24 times in this batch", null], "at rest the count stays and the last look is not shown as news");
  const stopped = card({ state: "thinking", looks: { count: 3, last } }, { now: Date.parse(AT) + QUIET_MS + 60000 });
  assert.equal(stopped.lastLook, null);
  assert.deepEqual(judgedBy({ judged_by: ["It must be safe.", "", 7, "It must be better."] }), ["It must be safe.", "It must be better."]);
  assert.deepEqual([judgedBy(progress()), judgedBy(null)], [[], []], "nothing is said that the file does not say");
});

test("the line of the money: one point a round, with the judge's reason on the rounds of this step", () => {
  const s = sparkline(agent("A1", "Made Up One"));
  assert.deepEqual([s.points.length, s.low, s.high, s.firstNew], [4, 0, 100, 2]);
  assert.deepEqual(s.points.map((p) => [p.round, p.value, p.kept, p.tried, p.verdict]), [[0, 0, true, 0, ""], [1, 80, true, 80, ""], [2, 80, false, 60.4, "safe, but not better on the practice months"], [3, 100, true, 100, "safe, and better on the practice months"]]);
  assert.deepEqual(s.points.map(readout), [
    { kind: "start", label: "Start", text: "The record as it is. Middle month £0." },
    { kind: "kept", label: "Kept", text: "Round 1: Skip small stops. Middle month now +£80." },
    { kind: "dropped", label: "Dropped", text: "Round 2: Add the 4-hour chart. Safe, but not better on the practice months. That version made +£60; the middle month stays +£80." },
    { kind: "kept", label: "Kept", text: "Round 3: Close at target 2. Middle month now +£100." }]);
  assert.deepEqual(readout({ round: 5, step: 3, value: 80, kept: false, change: "an old try", tried: null, verdict: "" }), { kind: "dropped", label: "Dropped", text: "Round 5: An old try. The middle month stays +£80." });
  assert.deepEqual(readout(undefined), { kind: "start", label: "", text: "" });
  const below = sparkline(agent("A1", "Loser", { series: [{ round: 0, step: 3, middle: -20, kept: true, change: "x", tried_middle: -20 }] }));
  assert.deepEqual([below.low, below.high, below.firstNew], [-20, 0, -1], "nought is always on the scale, and an agent with no round of this step has none marked");
  assert.deepEqual(sparkline({}).points, []);
});

test("every round as a table, this step's tries with their reasons, and the latest decisions", () => {
  const a = agent("A1", "Made Up One");
  assert.deepEqual(roundRows(a), [["Start", "The record as it is", "", { text: "£0" }, { text: "£0" }], ["1 (step 3)", "Skip small stops", "Kept", { text: "+£80" }, { text: "+£80" }],
    ["2", "Add the 4-hour chart", "Dropped", { text: "+£60" }, { text: "+£80" }], ["3", "Close at target 2", "Kept", { text: "+£100" }, { text: "+£100" }]]);
  const notes = tryNotes(a, NICOSIA);
  assert.deepEqual(notes.map((n) => n.round), ["Round 3", "Round 2"], "the newest first");
  assert.deepEqual(notes[0], { round: "Round 3", kept: true, change: "Close at target 2", why: "Target 2 is reached more often than target 3", verdict: "Safe, and better on the practice months", money: "+£100", died: "3 died",
    exactly: ["exit.style: tp3 -> tp2", "money plan: percent:5 -> percent:10"], at: "11:06 GMT, 13:06 your time" });
  assert.deepEqual([notes[1].kept, notes[1].died], [false, "0 died"]);
  const feed = feedRows(progress(), NOW, NICOSIA);
  assert.deepEqual(feed[0], { name: "Made Up One", round: "Round 3", change: "Close at target 2", kept: true, verdict: "Safe, and better on the practice months", money: "+£100", at: "11:06 GMT, 13:06 your time",
    ago: "30 seconds ago", iso: "2026-11-17T11:06:00Z" });
  assert.deepEqual([feed.length, feed[1].kept, feed[1].ago], [2, false, "1 minute ago"]);
  assert.deepEqual(feedRows(null, NOW, NICOSIA), []);
});

test("what the money is measured on is said from the file's own counts", () => {
  assert.equal(measuredOn(progress()), "A middle month: of 2,800 one-month runs of a small account (£100 to £500) on the 7 practice months, half made more than this and half made less.");
  assert.equal(measuredOn({}), "A middle month: half the one-month runs of a small account made more than this, half made less.");
});
