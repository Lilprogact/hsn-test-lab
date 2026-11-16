// The agents page's words (js/champions/logic/agents.js). No figure here is real: made-up files in the shape of the engine's own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { figures, codeLine, agentCards, agentsIntro } from "../js/champions/logic/agents.js";

const NICOSIA = "Asia/Nicosia";
const agent = (over) => ({ id: "A1", name: "Made Up One", role: "champion", known_for: "most pips", record: "I1", copied: true, same: true, not_same_because: [],
  in_words: ["Take the indicator's XAUUSD signals on the 30M chart.", "Never in quiet markets."], uses_agent_code: { strategy: null, features: [] },
  rerun: { practice: { now: { sets: 356, pips: 44104.9, win_rate_pct: 46.6 } }, unseen: { now: { sets: 328, pips: 13192, win_rate_pct: 38.4 }, held: true } }, ...over });
const STATUS = { written_at: "2026-11-16T16:27:25Z", champions_ok: true, summary: "All 5 champions are copied.", agents: [agent({}),
  agent({ id: "A2", name: "Made Up Two", same: false, not_same_because: ["on the practice months pips was 10 and is now 9"], uses_agent_code: { strategy: null, features: ["F0017"] } }),
  agent({ id: "S1", name: "Study One", role: "study only", known_for: "the 87.9% win rate", record: "I9", rerun: { unseen: { held: false } } })] };
const APART = { agents: [{ id: "A1", one_change_at_a_time: [{ kind: "bare", what: "the indicator as it is", sets: 1318, pips: 7125.9, win_rate_pct: 38.8 },
  { kind: "without", what: "without: only when that chart is sideways", sets: 985, pips: 21483, win_rate_pct: 39.9 }] }] };

test("figures are the re-run's own, and none are made up when it has none", () => {
  assert.deepEqual(figures({ sets: 356, pips: 44104.9, win_rate_pct: 46.6 }), { pips: "44,105", wins: "46.6%", trades: "356" });
  assert.deepEqual(figures({ sets: 0, pips: 0, win_rate_pct: 0 }), { pips: "0", wins: "0.0%", trades: "0" });
  assert.equal(figures(null), null);
  assert.equal(figures({}), null);
});

test("whether any code was written beside the indicator is said in one sentence", () => {
  assert.equal(codeLine({ strategy: null, features: [] }), "No agent-written code. It takes your indicator's signals and applies rules to them.");
  assert.equal(codeLine(undefined), "No agent-written code. It takes your indicator's signals and applies rules to them.");
  assert.equal(codeLine({ strategy: null, features: ["F0017", "F0018"] }), "It uses agent-written features F0017, F0018 beside your indicator.");
  assert.equal(codeLine({ strategy: "S0003", features: ["F0017"] }), "It uses an agent-written strategy (S0003) and agent-written feature F0017 beside your indicator.");
});

test("a champion's card: what it made, what it does, and whether it re-runs to the same numbers", () => {
  const { champions, study } = agentCards(STATUS, APART);
  assert.equal(champions.length, 2);
  const a = champions[0];
  assert.equal(a.name, "Made Up One");
  assert.equal(a.knownFor, "Most pips");
  assert.deepEqual(a.practice, { pips: "44,105", wins: "46.6%", trades: "356" });
  assert.deepEqual(a.unseen, { pips: "13,192", wins: "38.4%", trades: "328" });
  assert.equal(a.same, true);
  assert.equal(a.sameWords, "Re-runs to the same numbers.");
  assert.deepEqual(a.does, ["Take the indicator's XAUUSD signals on the 30M chart.", "Never in quiet markets."]);
  assert.equal(a.bare, "The same charts with no rules at all: 1,318 trades, 7,126 pips, 38.8% wins.");
  assert.deepEqual(a.changes, [{ what: "Without: only when that chart is sideways", pips: "21,483", wins: "39.9%", trades: "985" }]);
  const b = champions[1];
  assert.equal(b.same, false);
  assert.equal(b.sameWords, "On the practice months pips was 10 and is now 9.");
  assert.equal(b.code, "It uses agent-written feature F0017 beside your indicator.");
  assert.equal(b.bare, "", "Step 2 has nothing for this one: nothing is made up");
  assert.deepEqual(b.changes, []);
  assert.deepEqual(study, [{ name: "Study One", knownFor: "The 87.9% win rate", record: "I9", note: "Its record did not hold on the unseen months." }]);
  assert.equal(agentCards(STATUS, null).champions[0].bare, "", "without Step 2's file the cards still stand");
  assert.deepEqual(agentCards(null, null), { champions: [], study: [] });
  assert.equal(agentCards({ agents: [agent({ copied: false, same: false })] }, null).champions[0].sameWords, "The copy is not complete.");
});

test("the line under the heading says when they were re-run and whether all came out the same", () => {
  assert.equal(agentsIntro(STATUS, NICOSIA), "Copied from HSN Capital, with the originals left as they are. Re-run by the Engine on 16 Nov 2026, 16:27 GMT (18:27 your time). Each record re-runs to the same numbers.");
  assert.match(agentsIntro({ ...STATUS, champions_ok: false, summary: "one record did not re-run to the same numbers" }, NICOSIA), /One record did not re-run to the same numbers\.$/);
  assert.equal(agentsIntro(null), "The agents' check file could not be found.");
});
