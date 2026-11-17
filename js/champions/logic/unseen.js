// The one look at the unseen months (champions/step4/finished.json in the engine): what each finished version did on
// months no agent had studied, beside what it did on the practice months. Words and figures only; every sum is the
// Engine's own. "Counts" is the Engine's word for it, by the rule written down before any look: the page never
// decides it.
import { pounds } from "./forward.js";
import { when } from "./check.js";

const count = (n) => Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const list = (names) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n) => WORDS[n] || count(n);

const lookOf = (finished) => (finished && finished.finished && typeof finished.finished === "object" ? finished.finished : null);
const died = (arena) => (arena && num(arena.runs) ? `${count(arena.died)} of ${count(arena.runs)}` : "no figure");

/** One finished version's look, in the page's words. `order` is the agents' ids in the order the page shows them. */
function row(id, f, all) {
  const practice = (f.on_the_practice_months || {}).small_account || null, unseen = f.unseen || null, std = f.standard_unseen || null;
  const same = (f.the_same_version_as || []).map((a) => (all[a] && all[a].name) || a);
  return { id, name: f.name || id, version: f.version || "", plan: f.plan_words || "",
    practice: pounds(num(practice && practice.middle)), unseen: pounds(num(unseen && unseen.middle)), unseenValue: num(unseen && unseen.middle),
    died: died(unseen), diedShare: unseen && num(unseen.runs) ? Number(unseen.died) / Number(unseen.runs) : null,
    standard: std && std.trades ? `${count(std.trades)} trades, ${std.win_rate_pct}% won, ${pounds(num(std.pnl_gbp))}` : "no trades",
    counts: f.counts === true, sameAs: same.length ? `The same rules as ${list(same)}'s` : "" };
}

/** Every finished version's look, in the order given (the agents' own order on the page), then any others. */
export function unseenRows(finished, order = []) {
  const all = lookOf(finished);
  if (!all) return [];
  const ids = [...order.filter((id) => all[id]), ...Object.keys(all).filter((id) => !order.includes(id))];
  return ids.map((id) => row(id, all[id], all));
}

/** The look in one sentence, and when it was taken: {title, detail}, or null when there has been no look. */
export function unseenHeadline(finished, zone) {
  const rows = unseenRows(finished);
  if (!rows.length) return null;
  const counted = rows.filter((r) => r.counts).length, n = rows.length;
  const months = ((finished.months || {}).unseen || []).length;
  const title = counted === 0 ? `None of the ${word(n)} counted on the unseen months.` : counted === n ? `All ${word(n)} counted on the unseen months.`
    : `${word(counted)[0].toUpperCase()}${word(counted).slice(1)} of the ${word(n)} counted on the unseen months.`;
  const detail = `Each finished version was looked at once, on ${finished.written_at ? when(finished.written_at, zone) : "a day that is not on file"}, `
    + `on ${months ? `${word(months)} months` : "months"} no agent had studied. A version counts only if its middle run and its average run both make money there, and the standard account does too.`;
  return { title, detail, counted, of: n };
}

/** The look that belongs to an agent's STANDING version, for its tile: null when there is none, or when the agent has changed its rules since the look. */
export function unseenFor(finished, agent) {
  const all = lookOf(finished);
  const f = all && agent && all[agent.id];
  if (!f || !agent.standing || f.version !== agent.standing.version) return null;
  const r = row(agent.id, f, all);
  return { counts: r.counts, label: r.counts ? "Counts" : "Does not count",
    text: `On the unseen months: ${r.unseen} in a middle month, ${r.died} accounts died.` };
}
