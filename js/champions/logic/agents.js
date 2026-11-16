// The five agents: who they are, what each record does and what it made, as the Champions check found it
// (champions/status.json: copies and re-runs) and as Step 2 took it apart (champions/step2/take_apart.json).
// Every figure is the Engine's own re-run. Nothing is rounded up or filled in.
import { when } from "./check.js";

const count = (n) => Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const sentence = (s) => { const t = String(s || "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".") : ""; };

/** {pips, wins, trades} as short figures, or null when the re-run has none. */
export function figures(s) {
  if (!s || s.sets === undefined || s.sets === null) return null;
  return { pips: count(Math.round(s.pips)), wins: `${Number(s.win_rate_pct).toFixed(1)}%`, trades: count(s.sets) };
}

/** Does the record use any agent-written code beside the indicator? In one sentence. */
export function codeLine(uses) {
  const strategy = uses && uses.strategy, features = (uses && uses.features) || [];
  if (!strategy && !features.length) return "No agent-written code. It takes your indicator's signals and applies rules to them.";
  const bits = [];
  if (strategy) bits.push(`an agent-written strategy (${strategy})`);
  if (features.length) bits.push(`agent-written feature${features.length === 1 ? "" : "s"} ${features.join(", ")}`);
  return `It uses ${bits.join(" and ")} beside your indicator.`;
}

/**
 * The champions as cards and the study-only agents as a short list.
 * `status` is champions/status.json, `apart` is champions/step2/take_apart.json (may be null: then no "one rule at a time").
 */
export function agentCards(status, apart) {
  const all = (status && status.agents) || [];
  const taken = new Map(((apart && apart.agents) || []).map((a) => [a.id, a]));
  const card = (a) => {
    const t = taken.get(a.id);
    const bare = t ? (t.one_change_at_a_time || []).find((c) => c.kind === "bare") : null;
    const changes = t ? (t.one_change_at_a_time || []).filter((c) => c.kind !== "bare").map((c) => ({ what: sentence(c.what).replace(/\.$/, ""), ...figures(c) })) : [];
    return {
      id: a.id, name: a.name, knownFor: sentence(a.known_for).replace(/\.$/, ""), record: a.record,
      practice: figures(a.rerun && a.rerun.practice && a.rerun.practice.now), unseen: figures(a.rerun && a.rerun.unseen && a.rerun.unseen.now),
      held: a.rerun && a.rerun.unseen ? a.rerun.unseen.held : null,
      same: !!a.copied && !!a.same, sameWords: !a.copied ? "The copy is not complete." : a.same ? "Re-runs to the same numbers." : sentence((a.not_same_because || [])[0] || "it did not re-run to the same numbers"),
      does: a.in_words || (t && t.in_words) || [], code: codeLine(a.uses_agent_code || (t && t.uses_agent_code)),
      bare: bare && figures(bare) ? `The same charts with no rules at all: ${figures(bare).trades} trades, ${figures(bare).pips} pips, ${figures(bare).wins} wins.` : "",
      changes,
    };
  };
  const champions = all.filter((a) => a.role === "champion").map(card);
  const study = all.filter((a) => a.role !== "champion").map((a) => ({ name: a.name, knownFor: sentence(a.known_for).replace(/\.$/, ""), record: a.record,
    note: a.rerun && a.rerun.unseen && a.rerun.unseen.held === false ? "Its record did not hold on the unseen months." : "Copied for study only." }));
  return { champions, study };
}

/** The line under the page's heading: when they were copied and re-run, and whether all five came out the same. */
export function agentsIntro(status, zone) {
  if (!status) return "The agents' check file could not be found.";
  const ok = status.champions_ok ? "Each record re-runs to the same numbers." : sentence(status.summary) || "Not every record re-ran to the same numbers.";
  return `Copied from HSN Capital, with the originals left as they are. Re-run by the Engine on ${when(status.written_at, zone)}. ${ok}`;
}
