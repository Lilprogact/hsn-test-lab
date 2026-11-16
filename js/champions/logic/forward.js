// The forward test: what the site says about it. No page code in here, so the tests can hold it to its word.
// Nothing is worked out or estimated: every figure is read from the score the Engine wrote (live_test/scores/card_001.json)
// and every rule and pass mark from the frozen card (live_test/card_001.json). The test is paper only: the Engine replays
// frozen rules on real FOREX.com prices, and no order is sent to any account.
import { when } from "./check.js";

/** The scoring job follows a price download within minutes. Prices stored for longer than this and still not scored: it did not run. */
export const SCORE_GRACE_MS = 2 * 3600 * 1000;

const time = (iso) => { const t = Date.parse(iso || ""); return Number.isNaN(t) ? null : t; };
const count = (n) => Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const sentence = (s) => { const t = String(s || "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".") : ""; };
const ASK = "Tell Claude in the Champions chat: ";

/** Whole pounds with their sign: "+£325", "−£41", "£0". A figure that is missing is "no figure", never a nought.
 *  Halves round away from nought on both sides, so a gain and a loss of the same size read the same. */
export function pounds(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "no figure";
  const n = Math.sign(Number(v)) * Math.round(Math.abs(Number(v)));
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}£${Math.abs(n).toLocaleString("en-GB")}`;
}

/** A day in GMT: "13 Feb 2027". */
export function day(iso) {
  const t = time(iso);
  return t === null ? "an unknown day" : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(t));
}

const passed = (score) => (score.versions || []).filter((v) => v.verdict === "PASSED").length;
const ofTheVersions = (n, all) => `${n === 0 ? "none" : count(n)} of the ${count(all)} versions passed`;

/**
 * The page's line for the forward test: {ok, title, detail, todo, button}, like the four lines above it.
 * `score` is live_test/scores/card_001.json (null when there is none), `card` is live_test/card_001.json (may be null),
 * `stored` is {to: gold's newest stored minute, at: when the last price download ran} (either may be missing).
 * A cross names the one thing to do.
 */
export function forwardLine(score, card, stored, now, zone) {
  const line = (ok, title, detail, todo = null) => ({ ok, title, detail, todo, button: null });
  if (!score) {
    return line(false, "The forward test has not been scored yet",
      card ? `Its rules and pass marks were frozen on ${when(card.frozen_at, zone)}. It starts on ${when(card.start, zone)}.` : "No score is on record.", `${ASK}score the forward test.`);
  }
  const past = score.earlier_trades || {};
  if (past.same === false) {
    const turnedUp = past.appeared ? ` and ${count(past.appeared)} turned up inside a stretch that was already scored` : "";
    return line(false, "Trades of earlier weeks have changed in the forward test",
      `${count(past.changed)} of the trades that had closed by the last score ${past.changed === 1 ? "is" : "are"} different now${turnedUp}. A forward test may only add to what it has seen, so neither score can be trusted until the reason is found.`,
      `${ASK}the forward test's past changed.`);
  }
  const to = `Scored on prices up to ${when(score.prices_to, zone)}.`;
  if (score.judged) {
    return line(true, `The forward test is finished: ${ofTheVersions(passed(score), (score.versions || []).length)}`, `Judged on prices up to ${when(score.prices_to, zone)}. That score stands: the card is not scored again.`);
  }
  const storedTo = stored && stored.to;
  const behind = time(storedTo) !== null && time(score.prices_to) !== null && time(storedTo) > time(score.prices_to);
  const since = behind ? (time(stored.at) ?? time(storedTo)) : null;                   // when those newer prices arrived
  if (behind && now - since > SCORE_GRACE_MS) {
    return line(false, "The newest prices have not been scored in the forward test", `Prices are stored up to ${when(storedTo, zone)}. The score stops at ${when(score.prices_to, zone)}.`,
      `${ASK}the forward test was not scored.`);
  }
  const soon = behind ? " Newer prices are stored: their score follows within a few minutes of a download." : "";
  if (!score.started) {
    const begun = time(score.start) !== null && now >= time(score.start);
    return line(true, begun ? "The forward test has started" : "The forward test is ready",
      begun ? `It started on ${when(score.start, zone)}. The stored prices end before that, so its first score comes with the next price download.${soon}`
            : `It starts on ${when(score.start, zone)}. The stored prices end on ${when(score.prices_to, zone)}, so there is nothing to score yet.${soon}`);
  }
  const weeks = Number(score.weeks_complete || 0), all = Number(score.weeks_in_all || 12);
  return line(true, weeks ? `The forward test is running: ${count(weeks)} of ${count(all)} weeks scored` : "The forward test is running: the first week is not over yet",
    `${to} Nothing is decided before ${day(score.judged_on_the_first_score_at_or_after)}, whatever the weekly figures say.${soon}`);
}

const CHIP = { PASSED: { text: "passed", kind: "ok" }, FAILED: { text: "failed", kind: "no" }, "NOT JUDGED": { text: "not judged", kind: "unread" } };

/** One version's figures as a sentence. Only what the score holds: no trades is said as no trades. */
export function versionFigures(v) {
  const std = v.standard_account || {}, small = v.small_account_all_months;
  const trades = Number(std.trades || 0);
  if (!trades) return "No trades yet.";
  const open = v.open_trades ? `, ${count(v.open_trades)} still open` : "";
  const accounts = small ? ` Small accounts: middle run ${pounds(small.middle)}, ${count(small.died)} of ${count(small.runs)} died.` : "";
  return `${count(trades)} trade${trades === 1 ? "" : "s"}${open}. Standard account ${pounds(std.pnl_gbp)}.${accounts}`;
}

/**
 * The ten versions, agent by agent: [{name, versions: [{id, kind, plan, figures, chip, why, rules, before}]}].
 * `rules` and `before` come from the frozen card (empty when the card could not be read).
 */
export function forwardAgents(score, card) {
  const frozen = new Map(((card && card.versions) || []).map((v) => [v.id, v]));
  const agents = [];
  for (const v of (score && score.versions) || []) {
    const c = frozen.get(v.id);
    const u = c && c.on_the_unseen_months_before_this_test;
    const before = u && u.small_account
      ? `Before this test, on the unseen months: small accounts' middle run ${pounds(u.small_account.middle)}, ${count(u.small_account.died)} of ${count(u.small_account.runs)} died.${u.counted ? "" : " It did not count."}`
      : "";
    const row = { id: v.id, kind: sentence(v.kind).replace(/\.$/, ""), plan: sentence(v.plan_words), figures: versionFigures(v),
                  chip: CHIP[v.verdict] || { text: score.started ? "running" : "waiting", kind: "" }, why: CHIP[v.verdict] ? sentence(v.why) : "",
                  rules: (c && c.in_words) || [], before };
    const last = agents[agents.length - 1];
    if (last && last.name === v.name) last.versions.push(row); else agents.push({ name: v.name, versions: [row] });
  }
  return agents;
}

/** The pass marks and what a pass means, in the card's own words: {marks: [three sentences], rule, pass, judged}, or null without the card. */
export function passMarks(card) {
  const p = card && card.pass_marks;
  if (!p) return null;
  return { marks: ["1", "2", "3"].map((k) => sentence(p[k])), rule: sentence(p.verdict), pass: p.a_pass_is ? sentence(`A pass is ${p.a_pass_is}`) : "",
           judged: `Judged on the first score on or after ${day(card.judged_on_the_first_score_at_or_after)}.` };
}

/** The small print under the versions: what kind of test this is, and whether the weeks already scored have stayed as they were. */
export function forwardNotes(score, card, zone) {
  const notes = ["Paper only: the Engine replays the frozen rules on real FOREX.com prices. No order is sent to any account, and it does not show how a real order would fill."];
  if (card && card.frozen_at) notes.push(`The rules and the pass marks were frozen on ${when(card.frozen_at, zone)}, before the start. They cannot be changed: a changed version goes on a new card.`);
  const past = (score && score.earlier_trades) || {};
  if (past.same === true && past.closed_trades_compared > 0) {            // with nothing closed by the last score there was nothing to compare
    notes.push(`Earlier weeks are unchanged: the ${count(past.closed_trades_compared)} trade${past.closed_trades_compared === 1 ? "" : "s"} that had closed by the last score ${past.closed_trades_compared === 1 ? "is" : "are"} exactly as ${past.closed_trades_compared === 1 ? "it was" : "they were"}.`);
  }
  return notes;
}
