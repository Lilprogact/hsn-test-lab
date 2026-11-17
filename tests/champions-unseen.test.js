// The one look at the unseen months as the pages say it (js/champions/logic/unseen.js). Every file here is made up, in
// the shape of the engine's own (champions/step4/finished.json). Whether a version counts is the Engine's word: the
// page repeats it and never decides it, and a figure that is missing is said to be missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unseenRows, unseenHeadline, unseenFor } from "../js/champions/logic/unseen.js";

const NICOSIA = "Asia/Nicosia";
const look = (name, version, practice, unseen, died, over = {}) => ({ name, version, plan_words: "17.5% of the balance on every set", the_same_version_as: [],
  on_the_practice_months: { small_account: { middle: practice, died: 0, runs: 2800 } },
  unseen: { middle: unseen, average: unseen + 100, best: 3000, worst: -280, died, runs: 2400 }, standard_unseen: { trades: 97, win_rate_pct: 29.9, pnl_gbp: -118.82 },
  counts: false, inside_the_death_cap_on_unseen: died <= 120, ...over });
const FINISHED = { written_at: "2026-11-17T17:34:51Z", months: { unseen: ["2025-11", "2026-01", "2026-04", "2026-06", "2026-08", "2026-10"], older_locked: 34 }, distinct_versions: 3,
  finished: {                                                 // the file's own order is by id, not the page's
    A013: look("Made Up Nelen", "v-nel", 57.28, 0, 0, { standard_unseen: { trades: 44, win_rate_pct: 45.5, pnl_gbp: 401.56 } }),
    A014: look("Made Up Kelra", "v-kel", 208.69, -67.73, 644, { the_same_version_as: ["A032"] }),
    A032: look("Made Up Yelwen", "v-kel", 208.69, -67.73, 644, { the_same_version_as: ["A014"] }),
  } };

test("each finished version's look: practice beside unseen, the dead, and whether it counts, in the page's order", () => {
  const rows = unseenRows(FINISHED, ["A032", "A014", "A013"]);
  assert.deepEqual(rows.map((r) => r.name), ["Made Up Yelwen", "Made Up Kelra", "Made Up Nelen"]);
  assert.deepEqual(rows[0], { id: "A032", name: "Made Up Yelwen", version: "v-kel", plan: "17.5% of the balance on every set", practice: "+£209", unseen: "−£68", unseenValue: -67.73,
    died: "644 of 2,400", diedShare: 644 / 2400, standard: "97 trades, 29.9% won, −£119", counts: false, sameAs: "The same rules as Made Up Kelra's" });
  assert.deepEqual([rows[2].unseen, rows[2].died, rows[2].standard, rows[2].sameAs, rows[2].counts], ["£0", "0 of 2,400", "44 trades, 45.5% won, +£402", "", false]);
  assert.deepEqual(unseenRows(FINISHED).map((r) => r.id), ["A013", "A014", "A032"], "with no order given, the file's own");
  assert.deepEqual(unseenRows(FINISHED, ["A040", "A014"]).map((r) => r.id), ["A014", "A013", "A032"], "an agent with no look is not given a row");
  for (const none of [null, {}, { finished: null }]) assert.deepEqual(unseenRows(none), []);
});

test("a look with figures missing says so, and counts only when the Engine says it counts", () => {
  const bare = { finished: { A040: { name: "Bare", version: "v", counts: "yes" } } };
  assert.deepEqual(unseenRows(bare)[0], { id: "A040", name: "Bare", version: "v", plan: "", practice: "no figure", unseen: "no figure", unseenValue: null, died: "no figure", diedShare: null,
    standard: "no trades", counts: false, sameAs: "" });
  const counted = { ...FINISHED, finished: { A013: look("Made Up Nelen", "v-nel", 57, 31, 4, { counts: true }) } };
  assert.equal(unseenRows(counted)[0].counts, true);
});

test("the look in one sentence", () => {
  const none = unseenHeadline(FINISHED, NICOSIA);
  assert.deepEqual([none.title, none.counted, none.of], ["None of the three counted on the unseen months.", 0, 3]);
  assert.equal(none.detail, "Each finished version was looked at once, on 17 Nov 2026, 17:34 GMT (19:34 your time), on six months no agent had studied. "
    + "A version counts only if its middle run and its average run both make money there, and the standard account does too.");
  const one = { ...FINISHED, finished: { ...FINISHED.finished, A013: { ...FINISHED.finished.A013, counts: true } } };
  assert.equal(unseenHeadline(one, NICOSIA).title, "One of the three counted on the unseen months.");
  const all = { ...FINISHED, finished: Object.fromEntries(Object.entries(FINISHED.finished).map(([k, v]) => [k, { ...v, counts: true }])) };
  assert.equal(unseenHeadline(all, NICOSIA).title, "All three counted on the unseen months.");
  assert.equal(unseenHeadline(null, NICOSIA), null);
  assert.equal(unseenHeadline({ finished: {} }, NICOSIA), null, "no look, no sentence");
});

test("an agent's tile shows the look only for the version it stands on now", () => {
  const agent = { id: "A032", standing: { version: "v-kel" } };
  assert.deepEqual(unseenFor(FINISHED, agent), { counts: false, label: "Does not count", text: "On the unseen months: −£68 in a middle month, 644 of 2,400 accounts died." });
  assert.equal(unseenFor(FINISHED, { id: "A032", standing: { version: "v-new" } }), null, "it has changed its rules since: the look is not its standing version's");
  assert.equal(unseenFor(FINISHED, { id: "A040", standing: { version: "v" } }), null);
  assert.equal(unseenFor(null, agent), null);
  assert.equal(unseenFor(FINISHED, undefined), null);
  const counted = { finished: { A013: look("Made Up Nelen", "v-nel", 57, 31, 4, { counts: true }) } };
  assert.deepEqual(unseenFor(counted, { id: "A013", standing: { version: "v-nel" } }), { counts: true, label: "Counts", text: "On the unseen months: +£31 in a middle month, 4 of 2,400 accounts died." });
});
