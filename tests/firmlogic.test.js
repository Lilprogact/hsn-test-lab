// HSN Capital's page logic without a browser: the paces, the next shift, whether Start is allowed, the scoreboard,
// the ticker's lines and the token help. Every figure in these tests is made up; none is shown on the site.
import test from "node:test";
import assert from "node:assert/strict";
import { from500View, auditWords, roomView, roomEntryView, roomAuditWords, madeWords, planShort, roomLiveView, whyNotFree, roomSessionCost, ROOM_SESSION, sentView, keepView, sessionsLeft, KEEP_BLOCKS_RUNS, budgetCheck, stoppedLine } from "../js/firmlogic.js";
import { PACES, nextShift, readiness, scoreboard, eventLine, tokenHelp, MIN_TRADES_FOR_WIN_RANK, SHIFT, shiftsLeft, shiftPlan, shiftPlanWords, minutesUsedThisMonth, minutesNote, lookWords, CODE_WORDS } from "../js/firmlogic.js";

test("the four paces match the engine's schedules", () => {
  assert.deepEqual(Object.keys(PACES), ["6h", "3h", "1h", "nonstop"]);
  assert.deepEqual([PACES["6h"].cron, PACES["3h"].cron, PACES["1h"].cron, PACES.nonstop.cron], [{ minute: 17, every: 6 }, { minute: 23, every: 3 }, { minute: 29, every: 1 }, null]);
  for (const p of Object.values(PACES)) assert.ok(p.label && p.words && p.note);
});

test("the next shift is the next tick of the chosen schedule, said with 'about'", () => {
  const at = (iso) => new Date(iso);
  assert.equal(nextShift("6h", null, at("2026-11-14T05:00:00Z")).at.toISOString(), "2026-11-14T06:17:00.000Z");
  assert.equal(nextShift("6h", null, at("2026-11-14T06:17:00Z")).at.toISOString(), "2026-11-14T12:17:00.000Z", "a tick that has just passed is not 'next'");
  assert.equal(nextShift("6h", null, at("2026-11-14T22:30:00Z")).at.toISOString(), "2026-11-15T00:17:00.000Z", "over midnight");
  assert.equal(nextShift("3h", null, at("2026-11-14T10:00:00Z")).at.toISOString(), "2026-11-14T12:23:00.000Z");
  assert.equal(nextShift("1h", null, at("2026-11-14T10:40:00Z")).at.toISOString(), "2026-11-14T11:29:00.000Z");
  assert.match(nextShift("1h", null, at("2026-11-14T10:20:00Z")).text, /^Next shift about \d\d:\d\d UK \(in about 9 minutes\)\.$/);
  assert.match(nextShift("6h", null, at("2026-11-14T00:30:00Z")).text, /in about 6 hours/);
  assert.equal(nextShift("nonstop", null).at, null);
  assert.match(nextShift("nonstop", null).text, /as soon as this one ends/);
  assert.match(nextShift("3h", { on: false }).text, /No shift is scheduled right now \(the schedule is switched off on GitHub\)/);
  assert.equal(nextShift("nonstop", { on: false, waiting: "minutes" }).text, "No shift is scheduled: the firm's GitHub minutes for this month are used, so its schedule is off and it uses none. "
    + "It comes back by itself in the new month, or when the minutes budget is raised.");
  const slow = nextShift("1h", { on: true, slowed: true }, at("2026-11-14T10:40:00Z"));
  assert.equal(slow.at.toISOString(), "2026-11-14T12:17:00.000Z");
  assert.match(slow.text, /slower than the chosen pace because this month's AI budget is used up, so the Engine works alone\.$/);
  assert.equal(nextShift("weekly", null, at("2026-11-14T05:00:00Z")).at.toISOString(), "2026-11-14T06:17:00.000Z", "an unknown pace reads as every 6 hours");
});

// How long a shift may work. The same table is in the engine's tests (hsn-test-lab-engine: tests/test_firm_schedule.py):
// the Start dialog tells you what the engine will do, so the two sums must give the same numbers.
//   pace, minutes used, minutes limit, now (UTC)  ->  seconds of work, shifts still to come, shifts the minutes pay for, lasts the month
const SHIFT_VECTORS = [
  ["6h", 300, 1200, "2026-11-13T22:00:00Z", 602, 69, 69, true],
  ["6h", 300, 2000, "2026-11-13T22:00:00Z", 1298, 69, 69, true],
  ["6h", 0, 1200, "2026-11-01T00:00:00Z", 420, 120, 120, true],
  ["6h", 1195, 1200, "2026-11-13T22:00:00Z", 420, 69, 0, false],
  ["3h", 300, 1200, "2026-11-13T22:00:00Z", 420, 137, 90, false],
  ["3h", 300, 2000, "2026-11-13T22:00:00Z", 564, 137, 137, true],
  ["1h", 0, 2000, "2026-11-01T00:29:00Z", 420, 720, 200, false],
  ["1h", 1700, 2000, "2026-11-29T12:00:00Z", 420, 36, 30, false],
  ["nonstop", 300, 1200, "2026-11-13T22:00:00Z", 1500, null, 32, false],
  ["nonstop", 0, 2000, "2026-11-01T00:00:00Z", 1500, null, 71, false],
  ["6h", 50, 1200, "2026-12-31T23:30:00Z", 1500, 1, 41, true],
  ["6h", 1500, 1200, "2026-11-20T06:17:00Z", 420, 43, 0, false],
  ["weekly", 100, 1200, "2027-02-10T00:00:00Z", 688, 76, 76, true],
  ["3h", 0, 0, "2026-11-13T22:00:00Z", 420, 137, 0, false],
  ["6h", 212.5, 1200, "2028-02-28T18:17:31Z", 1500, 5, 35, true],
];

test("a shift gets an even share of the minutes left: the same numbers as the engine", () => {
  assert.deepEqual(SHIFT, { maxSeconds: 1500, minSeconds: 420, overheadMinutes: 3 });
  for (const [pace, used, limit, now, seconds, wanted, paidFor, lasts] of SHIFT_VECTORS) {
    const p = shiftPlan(pace, used, limit, new Date(now));
    assert.deepEqual([p.seconds, p.shiftsWanted, p.shiftsPaidFor, p.lastsTheMonth], [seconds, wanted, paidFor, lasts], `${pace} ${used}/${limit} at ${now}`);
  }
  assert.equal(shiftsLeft("6h", new Date("2026-11-30T23:59:59Z")), 1, "the last shift of a month is still one shift");
  assert.equal(shiftsLeft("1h", new Date("2026-12-01T00:00:00Z")), 744, "December, hour by hour");
});

test("at every 6 hours and the default limit the minutes last the whole month", () => {
  let now = new Date("2026-11-01T00:17:00Z"), used = 0, shifts = 0;
  while (now.getUTCMonth() === 10) {
    const p = shiftPlan("6h", used, 1200, now);
    assert.ok(used < 1200, `out of minutes on ${now.toISOString()} after ${shifts} shifts`);
    used += p.seconds / 60 + SHIFT.overheadMinutes; shifts += 1;
    now = new Date(now.getTime() + 6 * 3600000);
  }
  assert.equal(shifts, 120);
  assert.ok(used <= 1200 + 1e-6);
});

test("the plan is said in plain words, with the day the minutes run out when they will", () => {
  const now = new Date("2026-11-13T22:00:00Z"), say = (pace, used, limit) => shiftPlanWords(shiftPlan(pace, used, limit, now), now);
  assert.equal(say("6h", 300, 1200), "The firm paces itself: 69 shifts left this month, each working about 10 minutes, so the minutes last the whole month.");
  assert.match(say("6h", 0, 2000), /each working about 25 minutes \(the longest a shift runs\), so the minutes last the whole month\.$/);
  assert.equal(say("3h", 300, 1200), "At this pace even the shortest useful shift (7 minutes of work) uses this month's minutes up after about 90 of the 137 shifts, around 25 Nov. "
    + "The firm then waits for the new month. A slower pace or a higher minutes limit lasts longer.");
  assert.equal(say("nonstop", 300, 1200), "Non-stop: about 32 shifts of 25 minutes back to back, roughly 15 hours without a break. Then this month's minutes are used up and the firm waits for the new month.");
  assert.match(say("nonstop", 1100, 1200), /about 3 shifts of 25 minutes back to back, roughly 1\.4 hours/);
  assert.match(say("6h", 1300, 1200), /^This month's GitHub minutes are used up at this limit/);
  assert.match(say("nonstop", 1190, 1200), /^This month's GitHub minutes are used up at this limit/);
  assert.match(shiftPlanWords(shiftPlan("6h", 0, 1200, new Date("2026-11-30T23:00:00Z"))), /^The firm paces itself: 1 shift left this month, each working about 25 minutes/);
});

test("minutes counted in another month are not this month's", () => {
  const now = new Date("2026-11-13T22:00:00Z");
  assert.equal(minutesUsedThisMonth({ month: "2026-11", minutes_used: 212.4 }, now), 212.4);
  assert.equal(minutesUsedThisMonth({ month: "2026-10", minutes_used: 1900 }, now), 0);
  assert.equal(minutesUsedThisMonth(null, now), 0);
  assert.equal(minutesUsedThisMonth({ month: "2027-01", minutes_used: "x" }, new Date("2027-01-02T00:00:00Z")), 0);
});

test("the plan says what its minutes figure rests on, and says so when that count is old", () => {
  const now = new Date("2026-11-13T22:00:00Z"), when = (iso) => iso.slice(0, 10);
  assert.equal(minutesNote({ month: "2026-11", minutes_used: 212.4, checked_at: "2026-11-13T20:00:00Z" }, now, when), " (212 GitHub minutes already used this month, as counted 2026-11-13 UK.)");
  assert.equal(minutesNote({ month: "2026-11", minutes_used: 2.1, checked_at: "2026-11-08T21:23:14Z" }, now, when),
    " (2 GitHub minutes already used this month, as counted 2026-11-08 UK. That count is old: every shift recounts before it starts, so each shift's real share may be smaller.)");
  assert.equal(minutesNote({ month: "2026-10", minutes_used: 900, checked_at: "2026-10-30T00:00:00Z" }, now, when), "", "last month's count is not this month's");
  assert.equal(minutesNote(null, now, when), "");
  assert.equal(minutesNote({ month: "2026-11", minutes_used: 0, checked_at: "2026-11-13T20:00:00Z" }, now, when), "");
});

test("Start waits for price history and says exactly what is missing", () => {
  const none = readiness({ coverage: { symbols: {} } }, { secrets: {}, data: {} }, {});
  assert.equal(none.ok, false); assert.match(none.why, /put the FOREX.com MT5 login in/); assert.equal(none.setup, true);
  const wrong = readiness({ coverage: null }, { secrets: { forexcom_mt5_login: true }, logins_checked: { forexcom: { state: "failed" } }, data: { XAUUSD: { bars: 0 } } }, {});
  assert.match(wrong.why, /read-only investor password/);
  const loading = readiness({}, { secrets: { forexcom_mt5_login: true }, logins_checked: { forexcom: { state: "ok" } } }, {});
  assert.match(loading.why, /still downloading/);
  const ok = readiness({ coverage: { symbols: { XAUUSD: { months: 14 } } } }, { secrets: { anthropic_api_key: true } }, {});
  assert.deepEqual([ok.ok, ok.aiReady, ok.note], [true, true, ""]);
  const noKey = readiness({}, { data: { XAUUSD: { bars: 400000 } }, secrets: {} }, {});
  assert.equal(noKey.ok, true); assert.equal(noKey.aiReady, false); assert.match(noKey.note, /Engine-only/);
});

function firm() {
  const agents = {
    A001: { name: "Ann One", best_month_score: 40, best_pips: 900, best_win: 48, best_sets: 60, own_code: true },
    A002: { name: "Bo Two", best_month_score: 55, best_pips: 2100, best_win: 41, best_sets: 120 },
    A003: { name: "Cy Three", best_month_score: 12, best_pips: 300, best_win: 71, best_sets: 12 },          // too few trades to rank a win rate
    A004: { name: "Di Four", best_month_score: -30, best_pips: 5000, best_win: 90, best_sets: 200 },        // lost money: never on the board
    A005: { name: "Ed Five", best_month_score: 20, best_pips: 700, best_win: 63, best_sets: 45, own_code: true },
    A006: { name: "Fi Six" },
  };
  return { agents, library: { ideas: 321, verified: 4 }, strategies: { active: [{ id: "S0001" }, { id: "S0002" }], waiting: 3 }, attempts: { total: 17 },
    recent_events: [{ kind: "level_up" }, { kind: "tested" }, { kind: "level_up" }], budget: { firm_spent_usd: 12.5, firm_budget_usd: 60, minutes_budget: 1200 } };
}

test("when the login works but is the trading password, Start says exactly that", () => {
  const setup = { secrets: { forexcom_mt5_login: true }, logins_checked: { forexcom: { state: "failed", reason: "not_read_only", read_only: false, demo: true } } };
  const r = readiness({ coverage: { symbols: { XAUUSD: { months: 0 } } } }, setup, { paused: true });
  assert.equal(r.ok, false);
  assert.equal(r.why, "Waiting for the price history: the FOREX.com login works and it is a demo account, but the saved password is the trading password and the engine only accepts a read-only (investor) one. See Setup.");
  setup.logins_checked.forexcom.demo = false;
  assert.doesNotMatch(readiness({ coverage: null }, setup, {}).why, /demo account/);
});

test("the scoreboard ranks by pips and by win rate, money first, with a minimum number of trades", () => {
  const sb = scoreboard(firm());
  assert.deepEqual(sb.pips, { id: "A002", name: "Bo Two", pips: 2100, win: 41, sets: 120 }, "a losing idea's pips never lead the board");
  assert.deepEqual(sb.win, { id: "A005", name: "Ed Five", pips: 700, win: 63, sets: 45 }, `a win rate needs ${MIN_TRADES_FOR_WIN_RANK}+ trades and a profit`);
  assert.deepEqual(sb.stars, { pips: "A002", win: "A005" });
  assert.deepEqual([sb.ideas, sb.verified, sb.strategies, sb.waiting, sb.agentsWithCode, sb.levelUps, sb.challenges, sb.spent, sb.budget], [321, 4, 2, 3, 2, 2, 17, 12.5, 60]);
  const empty = scoreboard({ agents: { A001: { name: "x" } } });
  assert.deepEqual([empty.pips, empty.win, empty.stars, empty.ideas], [null, null, { pips: null, win: null }, 0]);
  assert.deepEqual(scoreboard(null).stars, { pips: null, win: null });
});

test("every real event becomes one plain line", () => {
  const name = (id) => ({ A001: "Ann One" }[id] || id);
  const line = (e) => eventLine({ at: "2026-11-14T10:00:00Z", ...e }, name);
  assert.deepEqual(line({ kind: "tested", agent: "A001", pips: 412.4, win: 57.6 }), { at: "2026-11-14T10:00:00Z", kind: "tested", text: "Ann One: +412 pips, 58% wins", cls: "up" });
  assert.equal(line({ kind: "tested", agent: "A001", pips: -80, win: 30, by: "engine search", what: "only the London session" }).text, "Ann One: −80 pips, 30% wins (the Engine's search: only the London session)".replace("−", "-"));
  assert.equal(line({ kind: "tested", agent: "A001", pips: 50, by: "first test", strategy: "S0003" }).text, "Ann One: +50 pips (first test of its own code S0003)");
  assert.equal(line({ kind: "tested", agent: "A001" }).cls, "dim");
  assert.equal(line({ kind: "coded", agent: "A001", what: "strategy", name: "ema_cross" }).text, "Ann One handed in its own strategy code: ema_cross");
  assert.equal(line({ kind: "coded", group: "G03", what: "team strategy", name: "team_trend" }).text, "Group G03 handed in the team's own strategy code: team_trend");
  assert.equal(line({ kind: "meeting", group: "G03", strategy: "I00042", ai: true }).text, "Group G03 agrees its strategy I00042");
  assert.equal(line({ kind: "meeting", group: "G03", strategy: "I00050", ai: false, team_code: "S0004" }).text, "Group G03 adopts its own code S0004");
  assert.equal(line({ kind: "level_up", agent: "A001", from: 1, to: 3, skip: true, solo: true }).text, "Ann One moves up: floor 1 → 3 (skipped a floor!) on its own");
  assert.equal(line({ kind: "level_up", group: "G03", from: 1, to: 2 }).cls, "big");
  assert.equal(line({ kind: "challenge_failed", group: "G03", reasons: ["2026-05: failed pips", "x"] }).text, "Group G03: challenge not passed — 2026-05: failed pips");
  assert.equal(line({ kind: "challenge_start", agent: "A001", floor: 1, months: ["2026-04"], solo: true }).text, "Ann One takes the floor 1 challenge on 2026-04 on its own");
  for (const quiet of ["turn_failed", "meeting_failed", "transfer_declined"]) assert.equal(line({ kind: quiet }), null);
  assert.equal(line({ kind: "something_new" }).text, "something new");
  assert.equal(eventLine(null), null); assert.equal(eventLine({}), null);
});

test("a token that cannot read says which permission to add, in steps", () => {
  const f = tokenHelp({ kind: "forbidden", message: "x" });
  assert.match(f.title, /Contents, Read-only/); assert.equal(f.steps.length, 3); assert.match(f.steps[1], /Add permissions/);
  assert.equal(f.link, "https://github.com/settings/personal-access-tokens");
  assert.match(tokenHelp({ kind: "token" }).title, /expired or was deleted/);
  assert.match(tokenHelp({ kind: "notfound" }).steps[0], /Only select repositories/);
  assert.deepEqual(tokenHelp({ kind: "network" }).steps, []);
  assert.equal(tokenHelp({ message: "odd" }).title, "odd");
  assert.equal(tokenHelp(null).title, "Something went wrong reading the firm's files.");
});

test("a look at the code or a question to the Engine is said in plain words", () => {
  const name = (id) => ({ A001: "Joris Coldby" }[id] || id);
  assert.equal(eventLine({ at: "t", kind: "looked", agent: "A001", tool: "read_code", what: "reading original" }, name).text, "Joris Coldby reads your indicator as the Engine runs it");
  assert.equal(eventLine({ at: "t", kind: "looked", agent: "A001", tool: "read_code", what: "reading waves for 'stop'" }, name).text, 'Joris Coldby reads your Waves rules, looking for "stop"');
  assert.equal(eventLine({ at: "t", kind: "looked", agent: "A001", tool: "read_code", what: "reading S0007" }, name).text, "Joris Coldby reads its own code S0007");
  assert.equal(eventLine({ at: "t", kind: "looked", agent: "A001", tool: "breakdown", what: "by session" }, name).text, "Joris Coldby asks the Engine for its results by session");
  assert.equal(eventLine({ at: "t", kind: "looked", agent: "A001", tool: "compare_exits", what: "exits" }, name).text, "Joris Coldby asks the Engine to compare ways of exiting");
  assert.equal(eventLine({ at: "t", kind: "looked", agent: "A001", tool: "library", what: "reading the library" }, name).text, "Joris Coldby reads the firm's library of tested ideas");
  assert.equal(eventLine({ at: "t", kind: "looked", agent: "A001", tool: "next_level", what: "checking the next level" }, name).text, "Joris Coldby checks what the next level needs");
  assert.equal(eventLine({ at: "t", kind: "looked", agent: "A001", tool: "read_code", what: "reading original" }, name).cls, "code");
  assert.equal(lookWords({ tool: "read_code", what: "reading price_model" }).short, "reading price model");
  assert.equal(lookWords({ tool: "something_new", what: "odd" }).text, "looks something up (odd)", "an unknown look is still said, never dropped");
  assert.deepEqual(Object.keys(CODE_WORDS), ["original", "original_pine", "chart_maths", "waves", "rules_engine", "price_model", "challenges"], "the engine's code room, name for name");
});

test("the scoreboard shows the firm's records when the engine publishes them, so a best never goes down", () => {
  const firm = { agents: { A001: { name: "Ana", best_month_score: 300, best_pips: 9000, best_win: 41, best_sets: 120 }, A002: { name: "Bo", best_month_score: 50, best_pips: 7000, best_win: 55, best_sets: 40 } } };
  const before = scoreboard(firm);
  assert.equal(before.win.win, 55);                       // without records: the best among the agents' current best ideas
  const withRecords = scoreboard({ ...firm, records: { min_trades: 30, top_win: { idea: "I00283", agent: "A001", name: "Ana", pips: 5000, win_rate_pct: 65.3, sets: 49 }, top_pips: { idea: "I00704", agent: "A009", name: "Wyn", pips: 25032.4, win_rate_pct: 47.4, sets: 114 } } });
  assert.deepEqual(withRecords.win, { id: "A001", name: "Ana", pips: 5000, win: 65.3, sets: 49, idea: "I00283", record: true });
  assert.equal(withRecords.pips.pips, 25032.4);
  assert.deepEqual(withRecords.stars, { pips: "A009", win: "A001" });
});

test("moved up counts every move since the firm started, not only the ones among the latest events", () => {
  const recent = [{ kind: "tested" }, { kind: "challenge_failed" }];
  assert.equal(scoreboard({ agents: {}, recent_events: recent }).levelUps, 0);
  assert.equal(scoreboard({ agents: {}, recent_events: recent, event_totals: { level_up: 2, swapped_down: 2 } }).levelUps, 2);
  assert.equal(scoreboard({ agents: {}, recent_events: [{ kind: "level_up" }] }).levelUps, 1);
});

test("the £500 test: one row a record holder, the engine's own figures, and the unseen months said apart", () => {
  assert.equal(from500View({}), null);
  const run = { start_gbp: 500, weeks: 4, risk_pct_per_trade: 1, runs: 50, middle_end: 530.77, worst_end: 433.44, best_end: 694.17, ended_in_profit_pct: 86, trades_per_run: 36.4,
    unseen: { months: ["2026-10", "2026-11"], runs: 12, middle_end: 557.69, worst_end: 498.53, best_end: 591.11, ended_in_profit_pct: 91.7 } };
  const firm = { records: { top_pips: { idea: "I1", agent: "A001", name: "Kelra" }, top_win: { idea: "I2", agent: "A002", name: "Nelen" }, top_money: { idea: "I3", agent: "A003", name: "Jora" }, best: { idea: "I3", agent: "A003", name: "Jora" } },
    from_500: { start_gbp: 500, weeks: 4, runs: 50, by_idea: { I1: { ...run, unseen: null }, I2: null, I3: run } } };
  const v = from500View(firm);
  assert.equal(v.title, "The £500 test: what £500 would have become in 4 weeks");
  assert.match(v.help, /50 random past start dates, risking 1% of the account on every trade/);
  assert.match(v.help, /not a promise/);
  assert.match(v.sizes, /exact, as if any size could be traded/);
  assert.match(v.sizes, /whole ounces/);
  assert.match(v.sizes, /with £500 the smallest real trade often risks far more than 1% of the account/);
  assert.match(v.sizes, /not as what a real £500 account would have made/);
  assert.deepEqual(v.rows.map((r) => r.Record), ["Most pips", "Highest win rate", "Most money made · best overall"]);
  assert.equal(v.rows[2]["Middle result"], "£530.77");
  assert.equal(v.rows[2].Worst, "£433.44");
  assert.equal(v.rows[2]["Ended in profit"], "86 in 100 starts");
  assert.equal(v.rows[2]["On months no agent has seen"], "£557.69 (worst £498.53, 12 starts)");
  assert.equal(v.rows[0]["On months no agent has seen"], "no full run fits yet");
  assert.equal(v.rows[1]["Middle result"], "—");
  assert.equal(v.rows[1]["On months no agent has seen"], "too few trades to test");
  // a record set since the engine last worked the test out (the Records Room's search set two on 15 Nov 2026) is said to be new, not "too few trades"
  const fresh = from500View({ ...firm, records: { ...firm.records, top_pips: { idea: "I9", agent: "A032", name: "Yelwen" } } });
  assert.equal(fresh.rows[0]["On months no agent has seen"], "a new record: worked out at the next Engine run");
  assert.equal(fresh.rows[0]["Middle result"], "—");
});

test("the Audit desk in words: what was judged, and the broker's real trade sizes beside it", () => {
  assert.equal(auditWords(null), "");
  const a = { ok: true, fast_pnl_gbp: 1241.64, audit_pnl_gbp: 1222.48, fast_sets: 31, audit_sets: 31, lookahead_violations: 0 };
  assert.equal(auditWords(a), "Audit desk re-run (separately written code): agreed — fast £1241.64 v event-driven £1222.48, 31 v 31 sets, 0 look-ahead violations.",
    "an audit from before the real sizes were kept reads as it always did");
  const real = auditWords({ ...a, real_lots: { pnl_gbp: 815.11, sets: 31, not_opened_below_minimum: 0 } });
  assert.match(real, /agreed — fast £1241\.64 v event-driven £1222\.48/);
  assert.match(real, /With the broker's real trade sizes on this account the same re-run made £815\.11 in 31 sets; that figure is for information and is not judged\.$/);
  assert.match(auditWords({ ...a, ok: false, real_lots: { pnl_gbp: 0, sets: 0, not_opened_below_minimum: 40 } }), /DISAGREED .* made £0 in 0 sets \(40 too small to open\);/);
  assert.equal(auditWords({ ok: false, reason: "no bars in the audit months" }), "Audit desk: could not re-run it (no bars in the audit months).");
});

test("a refused pass that the Audit desk re-checks is said plainly, either way", () => {
  const name = (id) => ({ A007: "Aden Bramcroft" }[id] || id);
  const ok = eventLine({ at: "t", kind: "audit_recheck", group: "G08", floor: 1, ok: true, fast_pnl: 1241.64, audit_pnl: 1222.48 }, name);
  assert.equal(ok.text, "Group G08: the Audit desk re-checked its refused pass like for like and agrees. The pass stands");
  assert.equal(ok.cls, "up");
  const no = eventLine({ at: "t", kind: "audit_recheck", agent: "A007", solo: true, floor: 1, ok: false }, name);
  assert.equal(no.text, "Aden Bramcroft: the Audit desk re-checked its refused pass like for like and still disagrees");
  assert.equal(no.cls, "down");
});


// ── the Records Room (every figure below is made up for the test) ────────────────────────────────────────────────────
const shape = (months, made, extra = {}) => ({ months, in: 1500, in_all: 1500 * months, out_all: 1500 * months + made, made, middle: 1600, worst: 900, best: 4000, in_profit: months - 1,
  hit_stop_line: 2, accounts: months * 5, sets: 90, by_start: { 100: { middle: 100, worst: 100, best: 100, could_not_trade: months, hit_stop_line: 0 }, 500: { middle: 620.4, worst: 240, best: 1900, could_not_trade: 0, hit_stop_line: 1 } }, ...extra });
const entry = (idea, madeUnseen, madePractice, extra = {}) => ({ tradable: true, idea, plan: { type: "percent", value: 20 }, plan_words: "20% of the balance on every set", starts: [100, 500], in: 1500,
  in_words: ["Take the indicator's XAUUSD signals on the 30M, 1H charts.", "Exit: close the whole set at TP3, following the indicator's trailing stop."],
  summary: { pips: 40881.6, win_rate_pct: 52.7, sets: 150, pnl_gbp: 11523.09 }, unseen: shape(6, madeUnseen), practice: shape(7, madePractice),
  by_month: { "2025-10": { role: "practice", total: 5297.09, sets: 192, stopped: 0 }, "2025-11": { role: "unseen", total: 1215.66, sets: 101, stopped: 1 }, "2026-11": { role: "incomplete", total: 2227.04, sets: 45, stopped: 0 } },
  build_up: { after_months: { 1: { runs: 13, middle: 1800, worst: 843.63, best: 7103.77 }, 12: { runs: 2, middle: 108095.43, worst: 22883.51, best: 193307.35 } },
    longest: { from: "2025-10", to: "2026-11", months: ["2025-10", "2025-11", "2026-11"], money_at_month_end: [5520.9, 3919.99, 254865.07], made_in_month: [4020.9, -1600.91, 250945.08], end: 254865.07,
      biggest_month: { month: "2026-11", made: 250945.08 }, first_month_over: { gbp: 50000, month: "2026-11", months_in: 3 }, hit_stop_line: 0, biggest_lots: 503, last_month_incomplete: true } }, ...extra });
const record = (idea, pips, win, by, by_name) => ({ idea, pips, win_rate_pct: win, sets: 304, pnl_gbp: 14793.04, by, by_name, rules: { instrument: "XAUUSD" }, in_words: ["Only when the market on that chart is sideways."] });
function roomFirm(patch = {}) {
  const audit = { ok: true, runs: 65, of: 65, complete: true, runs_to_the_penny: 65, worst_run_difference_gbp: 0, lookahead_violations: 0 };
  const room = { name: "The Records Room", open: true, opened_cycle: 100, opened_at: "2026-11-15T11:00:00Z", sessions: 1, order: ["A032", "A014", "A013"],
    last_session: { at: "2026-11-15T11:01:36Z", tested: 281, found_in_library: 64, mixes: 25 },
    rules: { keep_pips_share: 0.8, high_win_pct: 70, min_trades: 30, starts: [100, 200, 300, 400, 500], max_risk_pct: 20, stop_line: 0.5, leverage: 20 },
    months: { practice: ["2025-10", "2025-12"], unseen: ["2025-11", "2026-01"], incomplete: ["2026-11"] },
    members: {
      A032: { name: "Yelwen Kingsshaw", side: "pips", level: "Vice President", floor: 3, group: "G16", pool: 68, record: record("I13206", 43200.3, 46.8, "A032", "Yelwen Kingsshaw"),
        mission: { goal: "win_rate", keep: { pips_at_least: 34560.2 }, tried: 190, gain: 6.7, best: { idea: "I15156", pips: 37829, win_rate_pct: 53.5, sets: 144, by: "A032" } }, entry: entry("I15182", 2701.6, 12918.48, { audit }) },
      A014: { name: "Kelra Ravenmere", side: "pips", level: "Analyst", floor: 1, group: "G11", pool: 66, record: record("I09404", 43607.7, 46.7, "A014", "Kelra Ravenmere"),
        mission: { goal: "win_rate", keep: { pips_at_least: 34886.2 }, tried: 204, gain: 4.6, best: { idea: "I11978", pips: 40004.1, win_rate_pct: 51.3, sets: 152, by: "A032", by_name: "Yelwen Kingsshaw" } }, entry: entry("I11050", -305.66, 11939.58) },
      A013: { name: "Nelen Yewley", side: "win", level: "Director", floor: 4, group: "G18", pool: 59, record: record("I04062", 12188.9, 75, "A013", "Nelen Yewley"),
        mission: { goal: "pips", keep: { win_rate_at_least: 70 }, tried: 148, gain: 0, best: null }, entry: { tradable: false, tried: 12, why: "None of its strategies can be opened on accounts this small with the broker's real sizes." } },
    },
    frontier_at_open: [{ win_at_least: 45, idea: "I09404", pips: 43607.7, win_rate_pct: 46.7 }, { win_at_least: 75, idea: "I04062", pips: 12188.9, win_rate_pct: 75 }],
    frontier: [{ win_at_least: 45, idea: "I15049", pips: 44104.9, win_rate_pct: 46.6, by: "A032", by_name: "Yelwen Kingsshaw" }, { win_at_least: 75, idea: "I04062", pips: 12188.9, win_rate_pct: 75, by: "A013", by_name: "Nelen Yewley" },
      { win_at_least: 80, idea: null, pips: null }],
    standings: [{ rank: 1, agent: "A032", name: "Yelwen Kingsshaw", side: "pips", tradable: true, idea: "I15182", plan_words: "20% of the balance on every set", made_unseen: 2701.6, made_practice: 12918.48 },
      { rank: 2, agent: "A014", name: "Kelra Ravenmere", side: "pips", tradable: true, idea: "I11050", plan_words: "20% of the balance on every set", made_unseen: -305.66, made_practice: 11939.58 },
      { rank: 3, agent: "A013", name: "Nelen Yewley", side: "win", tradable: false, idea: null, plan_words: null, made_unseen: null, made_practice: null }],
    leader: { agent: "A032", name: "Yelwen Kingsshaw", idea: "I15182", plan_words: "20% of the balance on every set", made_unseen: 2701.6, audit_ok: true, can_be_rewarded: true },
    together: { ...entry("I14923", 3056.62, 8328.3), what: "Yelwen Kingsshaw's strategy with Nelen Yewley's trade limits", credit: ["A032", "A013"], plan_words: "15% of the balance on every set" },
    mixes: [{ idea: "I14923", what: "x", by: ["A032", "A013"] }], learned: ["A single-target exit, so a small account can open it."], meetings: [{ cycle: 101, minutes: "firm/minutes/cycle0101-ROOM.md" }],
    rewards: [{ at: "2026-11-15T12:00:00Z", cycle: 100, agent: "A032", name: "Yelwen Kingsshaw", idea: "I15182", plan_words: "20% of the balance on every set", made_unseen: 2701.6, unseen_months: 6, note: "well done" }],
    ...patch };
  return { room, agents: { A032: { name: "Yelwen Kingsshaw" } } };
}

test("the Records Room: who is in it, what each one's job is, and how far it has got against its pinned record", () => {
  assert.equal(roomView({}), null);
  assert.equal(roomView({ room: null }), null);
  const v = roomView(roomFirm());
  assert.equal(v.open, true);
  assert.deepEqual(v.names, ["Yelwen Kingsshaw", "Kelra Ravenmere", "Nelen Yewley"]);
  assert.deepEqual(v.sides.map((s) => [s.key, s.members.map((m) => m.id)]), [["pips", ["A032", "A014"]], ["win", ["A013"]]]);
  assert.match(v.sides[0].job, /raise the win rate and keep the pips \(at least 80% of the record's\)/);
  assert.match(v.sides[1].job, /raise the pips and keep the win rate \(70% or more\)/);
  const [yel, kel] = v.sides[0].members, nel = v.sides[1].members[0];
  assert.equal(yel.record, "43,200 pips · 46.8% wins · 304 trades");
  assert.equal(yel.recordIdea, "I13206");
  assert.equal(yel.where, "Vice President, floor 3, group G16");
  assert.equal(yel.progress, "Win rate 46.8% → 53.5%, keeping 37,829 of its 43,200 pips (I15156, 144 trades)");
  assert.equal(yel.improved, true);
  assert.equal(kel.firstBy, "First tested by Yelwen Kingsshaw; it counts here because it is one change away from this record.", "an idea another agent tested first is said to be so");
  assert.equal(yel.firstBy, "");
  assert.equal(nel.progress, "Nothing yet beats its record's pips while winning 70% or more.");
  assert.equal(nel.improved, false);
  assert.deepEqual(nel.words, ["Only when the market on that chart is sideways."], "what made the record is on the page");
  assert.match(v.intro, /Each one's record is pinned, so nobody forgets what made it/);
  // until the Engine has looked at the months nobody has seen there is no second line
  assert.equal(yel.recordUnseen, null); assert.equal(yel.bestUnseen, null); assert.equal(nel.bestUnseen, null);
});

test("the Records Room: every pinned record shows what it did on the months nobody has seen, beside the practice result", () => {
  const f = roomFirm();
  f.room.members.A032.record_unseen = { sets: 328, pips: 13192.4, win_rate_pct: 38.4, pnl_gbp: 2553.2, held: true, words: "it HELD: it made money on the months nobody has seen too" };
  f.room.members.A032.best_unseen = { sets: 150, pips: 9100, win_rate_pct: 41.3, pnl_gbp: -310.5, held: false, words: "it did NOT hold: it lost money on the months nobody has seen" };
  f.room.members.A014.record_unseen = { sets: 12, pips: 800, win_rate_pct: 50, pnl_gbp: 90, held: false, words: "too few trades on the months nobody has seen to say (fewer than 20)" };
  f.room.members.A013.record_unseen = { sets: null, held: false, words: "not checked on the months nobody has seen" };
  f.room.members.A013.best_unseen = { sets: 40, pips: 1, win_rate_pct: 50, pnl_gbp: 5, held: true, words: "x" };      // no best for its job yet: nothing is shown for one
  const v = roomView(f), [yel, kel] = v.sides[0].members, nel = v.sides[1].members[0];
  assert.deepEqual(yel.recordUnseen, { held: true, unknown: false, line: "On the months nobody has seen: 13,192 pips · 38.4% wins · 328 trades · made £2,553. It HELD." });
  assert.deepEqual(yel.bestUnseen, { held: false, unknown: false, line: "I15156 on the months nobody has seen: 9,100 pips · 41.3% wins · 150 trades · lost £311. It did NOT hold." });
  assert.deepEqual(kel.recordUnseen, { held: false, unknown: true, line: "On the months nobody has seen: 800 pips · 50% wins · 12 trades · made £90. Too few trades there to say." });
  assert.deepEqual(nel.recordUnseen, { held: false, unknown: true, line: "On the months nobody has seen: not checked (its price data is not loaded)." });
  assert.equal(nel.bestUnseen, null);
});

test("the Records Room: the frontier says where the room started and what has moved", () => {
  const v = roomView(roomFirm());
  assert.deepEqual(v.frontier.map((f) => [f["Win rate"], f["Most pips when the room opened"], f["Most pips now"], f["Held by"], f.up]), [
    ["45% or more", "43,608", "44,105 ▲ 497", "Yelwen Kingsshaw · I15049 · 46.6%", true],
    ["75% or more", "12,189", "12,189", "Nelen Yewley · I04062 · 75%", false],
    ["80% or more", "—", "—", "nobody yet", false]]);
});

test("the growth challenge: ranked on the months nobody has seen, with the broker's real sizes said plainly", () => {
  const v = roomView(roomFirm()), c = v.challenge;
  assert.match(c.rules[0], /^One account of each size, £100, £200, £300, £400, £500 \(£1,500 in all\)/);
  assert.match(c.rules[1], /gold trades in whole ounces.*20:1.*£100 cannot open a gold trade at all.*five positions needs five ounces/);
  assert.match(c.rules[2], /at most 20% of the balance.*below half its start opens nothing more/);
  assert.match(c.rules[3], /money made on the 2 months nobody in the firm has seen \(Nov 2025, Jan 2026\): £1,500 afresh each month, so £3,000 goes in over them\..*chosen by the Engine on the 2 practice months only/);
  assert.deepEqual(c.columns, ["#", "Who", "Entry", "Unseen months", "In profit", "Practice months", "Left to run"]);
  assert.deepEqual(c.rows.map((r) => [r["#"], r.Who, r.Entry, r["Unseen months"], r["In profit"], r["Practice months"], r["Left to run"], r.leader]), [
    [1, "Yelwen Kingsshaw", "I15182 · 20% a trade", "made £2,702", "5 of 6", "made £12,918", "£254,865", true],
    [2, "Kelra Ravenmere", "I11050 · 20% a trade", "lost £306", "5 of 6", "made £11,940", "£254,865", false],
    [3, "Nelen Yewley", "no entry yet", "None of its strategies can be opened on accounts this small with the broker's real sizes.", "—", "—", "—", false]]);
  assert.deepEqual([planShort({ type: "stepped" }), planShort({ type: "percent", value: 7.5 }), planShort(null)], ["your stepped cap", "7.5% a trade", "—"]);
  assert.equal(c.leader.line, "Yelwen Kingsshaw leads: I15182 with 20% of the balance on every set made £2,702 on the months nobody has seen.");
  assert.equal(c.leader.canReward, true);
  assert.match(c.leader.audit, /re-ran all 65 of its accounts through the Simulator.*Every one came out the same to the penny\./);
  assert.equal(v.rewards[0].line, 'Yelwen Kingsshaw was rewarded for I15182 with 20% of the balance on every set: made £2,702 on the 6 months nobody had seen (shift 100). "well done"');
  // nobody to reward: the engine's own reason is shown; a closed room rewards nobody; an unaudited leader cannot be rewarded
  const none = roomView(roomFirm({ leader: null, leader_note: "The best entry lost money on the months nobody has seen, so there is nobody to reward yet." })).challenge;
  assert.equal(none.leader, null);
  assert.match(none.note, /lost money on the months nobody has seen/);
  assert.equal(roomView(roomFirm({ open: false })).challenge.leader.canReward, false);
  assert.equal(roomView(roomFirm({ leader: { agent: "A032", name: "Yelwen Kingsshaw", idea: "I15182", plan_words: "p", made_unseen: 1, can_be_rewarded: false } })).challenge.leader.canReward, false);
});

test("the growth challenge together: the joint entry, who it is credited to, and whether it beats every member alone", () => {
  const t = roomView(roomFirm()).together;
  assert.equal(t.line, "Together: Yelwen Kingsshaw's strategy with Nelen Yewley's trade limits (I14923, 15% of the balance on every set). On the months nobody has seen: £9,000 in, £12,057 out: made £3,057. On practice months: made £8,328.");
  assert.deepEqual(t.credit, ["Yelwen Kingsshaw", "Nelen Yewley"]);
  assert.equal(t.beats, true);
  const worse = roomFirm();
  worse.room.together.unseen.made = 100;
  assert.equal(roomView(worse).together.beats, false);
  assert.equal(roomView(roomFirm({ together: { tradable: false } })).together, null);
  const v = roomView(roomFirm());
  assert.deepEqual([v.mixes, v.learned.length, v.meetings[0].minutes, v.sessions, v.last.tested], [1, 1, "firm/minutes/cycle0101-ROOM.md", 1, 281]);
});

test("one entry in full: every account size, every month, and what it became when left to run", () => {
  assert.equal(roomEntryView(null), null);
  assert.equal(roomEntryView({ tradable: false }), null);
  const e = roomEntryView(roomFirm().room.members.A032.entry);
  assert.equal(e.title, "I15182 with 20% of the balance on every set");
  assert.equal(e.unseen, "On the 6 months nobody has seen: £9,000 in (£1,500 afresh each month), £11,702 out: made £2,702. Middle month £1,600, worst £900, best £4,000; in profit 5 of 6; 2 of 30 accounts hit the stop line.");
  assert.match(e.practice, /^On the 7 months they practised on: £10,500 in, £23,418 out: made £12,918\./);
  assert.deepEqual(e.byStart.map((r) => [r["Starts with"], r["Middle month"], r["No trade possible"], r["Stopped at half"]]), [["£100", "cannot trade", "6 of 6 months", "0 of 6 months"], ["£500", "£620", "0 of 6 months", "1 of 6 months"]]);
  assert.deepEqual(e.months.map((m) => [m.Month, m.Kind, m["£1,500 became"], m.Result, m.Trades]), [["Oct 2025", "practised on", "£5,297", "made £3,797", 192], ["Nov 2025", "nobody has seen", "£1,216", "lost £284", 101],
    ["Nov 2026", "not finished (not judged)", "£2,227", "made £727", 45]]);
  assert.deepEqual(e.lengths.map((l) => [l["Left to run for"], l["Middle result"], l["Start months tried"]]), [["1 month", "£1,800", 13], ["12 months", "£108,095", 2]]);
  assert.equal(e.longLine, "Started in Oct 2025 and never stopped: £1,500 became £254,865 by the last price on file in Nov 2026. Its biggest month was Nov 2026: made £250,945. The first month it made £50,000 or more was Nov 2026, month 3 of the run.");
  assert.deepEqual(e.curve, [{ label: "Oct 25", value: 5520.9 }, { label: "Nov 25", value: 3919.99 }, { label: "Nov 26", value: 254865.07 }]);
  assert.match(e.longHelp, /passes through months the agents practised on.*not a promise/);
  assert.match(e.audit, /to the penny/);
  const quiet = roomFirm().room.members.A014.entry;
  quiet.build_up.longest.first_month_over = { gbp: 50000, month: null, months_in: null };
  quiet.build_up.longest.hit_stop_line = 2;
  quiet.build_up.longest.last_month_incomplete = false;
  assert.match(roomEntryView(quiet).longLine, /by the end of Nov 2026\..*No month of the run made £50,000 or more\. 2 of the 2 accounts hit the stop line on the way\.$/);
});

test("the Audit desk on a growth-challenge entry, and money in words", () => {
  assert.equal(roomAuditWords(null), "");
  assert.equal(roomAuditWords({ ok: false, reason: "this entry's data is not loaded" }), "Audit desk: could not re-run it (this entry's data is not loaded).");
  assert.match(roomAuditWords({ ok: true, runs: 30, of: 65, complete: false, runs_to_the_penny: 28, worst_run_difference_gbp: 12.4 }), /re-ran 30 of its 65 accounts \(the months nobody has seen first\).*They agree \(28 to the penny; the biggest difference in one account is £12\)/);
  assert.match(roomAuditWords({ ok: false, runs: 65, of: 65, complete: true, runs_to_the_penny: 3, lookahead_violations: 2 }), /does NOT agree with this entry \(2 trades looked ahead\)\. It cannot be rewarded\.$/);
  assert.deepEqual([madeWords(2701.6), madeWords(-305.66), madeWords(0), madeWords(null)], ["made £2,702", "lost £306", "made £0", "—"]);
});

test("the room's real events each become one plain line", () => {
  const name = (id) => ({ A032: "Yelwen Kingsshaw", A014: "Kelra Ravenmere" }[id] || id);
  const line = (e) => eventLine({ at: "t", ...e }, name);
  assert.equal(line({ kind: "room_opened", members: ["A032", "A014"] }).text, "The Records Room opens: Yelwen Kingsshaw, Kelra Ravenmere");
  assert.equal(line({ kind: "room_session", tested: 281, leader: "A032" }).text, "The Records Room: the Engine tested 281 strategies for it; Yelwen Kingsshaw leads the growth challenge");
  assert.equal(line({ kind: "room_session", tested: 0 }).text, "The Records Room: the Engine tested 0 strategies for it");
  assert.equal(line({ kind: "room_entry", agent: "A014", idea: "I11050", plan: "20% of the balance on every set" }).text, "Kelra Ravenmere enters the growth challenge with I11050 (20% of the balance on every set)");
  assert.deepEqual([line({ kind: "room_leader", agent: "A032", made: 2701.6 }).text, line({ kind: "room_leader", agent: "A032", made: 2701.6 }).cls], ["Yelwen Kingsshaw takes the lead in the growth challenge: made £2,702 on the months nobody has seen", "big"]);
  assert.equal(line({ kind: "room_put_forward", agent: "A014", idea: "I15001" }).text, "Kelra Ravenmere puts I15001 forward for the growth challenge");
  assert.equal(line({ kind: "room_meeting_start", members: ["A032"] }).text, "The Records Room meets: the six sit at one table and everyone's work goes on it");
  assert.equal(line({ kind: "room_meeting", strategy: "I15200" }).text, "The Records Room agrees its joint strategy I15200", "a meeting on record from before the room voted");
  assert.equal(line({ kind: "ceo_reward", agent: "A032", made: 2701.6 }).text, "The CEO rewards Yelwen Kingsshaw: the best in the growth challenge (made £2,702 on the months nobody has seen)");
  assert.equal(line({ kind: "tested", agent: "A032", pips: 44104.9, win: 46.6, by: "records room" }).text, "Yelwen Kingsshaw: +44,105 pips, 47% wins (the Records Room's search)");
});

test("a session of the room, event by event: alone, then together, in plain lines", () => {
  const name = (id) => ({ A032: "Yelwen Kingsshaw", A013: "Nelen Yewley" }[id] || id), line = (e) => eventLine({ at: "t", ...e }, name);
  assert.deepEqual([line({ kind: "room_thinking", members: ["A032"], session: 3 }).text, line({ kind: "room_thinking", members: ["A032"], session: 3 }).cls],
    ["The Records Room, session 3: its six think first, each alone at its own desk", "big"]);
  assert.equal(line({ kind: "looked", agent: "A013", tool: "growth_check", what: "the growth challenge for I04158" }).text, "Nelen Yewley asks the Engine how I04158 does in the growth challenge (practice months)");
  assert.deepEqual([line({ kind: "room_brought", agent: "A013", idea: "I15301", pips: 15545.6, win: 70.8 }).text, line({ kind: "room_brought", agent: "A013", idea: "I15301", pips: 15545.6, win: 70.8 }).cls],
    ["Nelen Yewley has finished thinking alone and brings I15301 to the room: +15,546 pips, 71% wins", "up"]);
  assert.equal(line({ kind: "room_brought", agent: "A013", idea: "I15302", pips: -120.4, win: 40 }).cls, "down");
  assert.equal(line({ kind: "room_brought", agent: "A013", idea: null }).text, "Nelen Yewley has finished thinking alone and brings nothing new this time");
  assert.equal(line({ kind: "room_voice", agent: "A032", vote: "merge", say: " I would take its exit. " }).text, 'Yelwen Kingsshaw at the table (wants one joint strategy): "I would take its exit."');
  assert.equal(line({ kind: "room_voice", agent: "A013", vote: "keep_separate", say: "They do not fit." }).text, 'Nelen Yewley at the table (wants the ideas kept apart): "They do not fit."');
  assert.equal(line({ kind: "room_voice_missed", agent: "A013", error: "timed out" }).text, "Nelen Yewley did not speak at the table (the call did not come back)");
  assert.equal(line({ kind: "room_decision", decision: "merge", merge: 4, keep: 2 }).text, "The Records Room votes 4 to 2 to make ONE joint strategy");
  assert.equal(line({ kind: "room_decision", decision: "keep_separate", merge: 3, keep: 3 }).text, "The Records Room votes 3 to 3 to keep its ideas apart");
  assert.equal(line({ kind: "room_decision", decision: "no_quorum", merge: 1, keep: 0 }).text, "The Records Room could not decide: too few of its six spoke");
  assert.equal(line({ kind: "tested", agent: "A032", idea: "I15310", pips: 30120.5, win: 55.2, by: "records room meeting", room: true }).text,
    "Yelwen Kingsshaw: +30,121 pips, 55% wins (the Records Room's meeting had the Engine test I15310)");
  assert.equal(line({ kind: "room_meeting", decision: "merge", strategy: "I15310", pips: 30120.5, win: 55.2 }).text, "The Records Room's meeting ends: its joint strategy is I15310 (+30,121 pips, 55% wins)");
  assert.equal(line({ kind: "room_meeting", decision: "keep_separate", strategy: null }).text, "The Records Room's meeting ends: its ideas stay apart");
  assert.equal(line({ kind: "room_meeting", decision: "merge", strategy: null }).text, "The Records Room's meeting ends: it voted for one strategy, but none could be written down this time");
});

const card = (idea, pips, win, sets = 144) => ({ idea, pips, win_rate_pct: win, sets, pnl_gbp: 1000 });
function sessionRoom(decision = "merge") {
  const one = decision === "merge";
  const voices = {
    A032: { say: "I15301 keeps 37,829 pips at 53.5% wins. I would take Nelen's two-a-day limit.", vote: "merge", take_from: [{ agent: "A013", what: "its two sets a day limit" }], next: "try the limit on my record", proposal_idea: "I15311" },
    A014: { say: "The win-rate side trades too little to carry my pips.", vote: one ? "merge" : "keep_separate", take_from: [], next: "raise confidence to 0.7", unverified: ["99.9"] },
  };
  const meeting = { cycle: 100, at: "2026-11-15T13:20:00Z", think: 3, decision, votes: { merge: one ? 2 : 1, keep_separate: one ? 0 : 1, silent: 1 },
    brought: { A032: { ...card("I15301", 37829, 53.5), hypothesis: "raise confidence and cap the day" }, A014: null, A013: { ...card("I15303", 15545.6, 70.8, 48), hypothesis: "trade the tp3 exit" } },
    voices, idea: one ? "I15310" : null, plan: one ? { type: "percent", value: 15 } : null, rules: one ? { instrument: "XAUUSD" } : null, result: one ? card("I15310", 30120.5, 55.2, 210) : null,
    why: one ? "Yelwen's entries with Nelen's limit." : "", credits: one ? ["A013", "A032"] : [], credit_notes: one ? { A032: ["its entries"], A013: ["its two sets a day limit"] } : {},
    ideas: one ? [{ idea: "I15310", by: "room", result: card("I15310", 30120.5, 55.2, 210) }, { idea: "I15311", by: "A032", result: card("I15311", 28849.3, 47.3, 245) }] : [],
    learned: one ? ["A single-target exit, so a small account can open it."] : [], corrections: one ? ["I15301 made £9,696, not £23,659.", " "] : undefined,
    minutes: "firm/minutes/cycle0100-ROOM-S3.md", cost_usd: 0.61 };
  const f = roomFirm({ thinks: 3, meetings: [{ cycle: 99, minutes: "firm/minutes/cycle0099-ROOM.md" }, meeting],
    last_think: { session: 3, at: "2026-11-15T13:27:00Z", seconds: 722, cost_usd: 2.4312, ai_calls: 13, allowance_usd: 5.2, model: "claude-opus-5-5", effort: "high", replay: "firm/replays/room.json",
      members: { A032: { came_back: true, idea: "I15301", lookups: 9, cost_usd: 0.31 }, A014: { came_back: false, idea: null, lookups: null, cost_usd: 0.02 }, A013: { came_back: true, idea: "I15303", lookups: 11, cost_usd: 0.35 } },
      meeting: { decision, votes: meeting.votes, idea: meeting.idea }, engine: { tested: 60, found_in_library: 9, mixes: 0 }, warnings: [], errors: [] } });
  f.room.members.A032.last_turn = { think: 3, ok: true, idea: "I15301", note: "The 0.7 confidence cut keeps most of the pips.", calls: 9, looked: ["by session", "the growth challenge for I15301"] };
  f.room.members.A014.last_turn = { think: 3, ok: false, idea: null, note: "", calls: 0, error: "timed out" };
  f.room.members.A013.last_turn = { think: 3, ok: true, idea: "I15303", note: "tp3 lets a small account open it.", calls: 11 };
  return f;
}

test("the room's last session: who thought alone, what each brought and said in its own words, the vote and what came of it", () => {
  const v = roomView(sessionRoom("merge"));
  assert.equal(v.thinks, 3);
  assert.equal(v.think.line, "Session 3: 2 of 3 thought alone, then the room voted 2 to 0 to make one joint strategy (I15310). It took 12 minutes and $2.43 of AI (13 calls, claude-opus-5-5, high effort).");
  assert.equal(v.think.replay, "firm/replays/room.json");
  const m = v.meeting;
  assert.equal(m.session, 3); assert.equal(m.one, true);
  assert.equal(m.votesLine, "2 wanted one joint strategy, 0 wanted to keep the ideas apart, 1 did not speak.");
  assert.equal(m.outcome, "More wanted one than not, so the room made ONE joint strategy.");
  assert.deepEqual(m.joint, { idea: "I15310", line: "30,121 pips · 55.2% wins · 210 trades", why: "Yelwen's entries with Nelen's limit.", plan: "15% a trade", credit: ["Yelwen Kingsshaw: its entries", "Nelen Yewley: its two sets a day limit"] });
  assert.deepEqual(m.proposals, [{ idea: "I15311", by: "Yelwen Kingsshaw", line: "28,849 pips · 47.3% wins · 245 trades" }]);
  assert.deepEqual(m.learned, ["A single-target exit, so a small account can open it."]);
  assert.deepEqual(m.corrections, ["I15301 made £9,696, not £23,659."], "what the Engine put right is carried with the meeting; the members' words stay as said");
  const [yel, kel, nel] = m.seats;
  assert.deepEqual([yel.name, yel.brought.idea, yel.brought.line, yel.spoke, yel.voteWords, yel.proposal], ["Yelwen Kingsshaw", "I15301", "37,829 pips · 53.5% wins · 144 trades", true, "wants one joint strategy", "I15311"]);
  assert.equal(yel.say, "I15301 keeps 37,829 pips at 53.5% wins. I would take Nelen's two-a-day limit.", "its own words, as recorded");
  assert.deepEqual(yel.take, ["Nelen Yewley: its two sets a day limit"]); assert.equal(yel.note, "The 0.7 confidence cut keeps most of the pips."); assert.equal(yel.lookups, 9);
  assert.deepEqual([kel.brought, kel.alone, kel.spoke, kel.unverified], [null, "Its own turn did not come back, so it brought nothing new.", true, ["99.9"]], "a member whose turn failed still sat at the table");
  assert.deepEqual([nel.brought.idea, nel.spoke, nel.voteWords, nel.say], ["I15303", false, "did not speak", ""]);
  // kept apart: nothing is claimed that did not happen
  const k = roomView(sessionRoom("keep_separate"));
  assert.equal(k.meeting.one, false); assert.equal(k.meeting.joint, null); assert.deepEqual(k.meeting.proposals, []); assert.deepEqual(k.meeting.corrections, []);
  assert.equal(k.meeting.outcome, "The room did not want one strategy this time, so its ideas stay apart. Nobody has to merge.");
  assert.match(k.think.line, /then the room voted 1 to 1 to keep its ideas apart\. /);
  // a room that has never had a session of thinking and meeting
  const plain = roomView(roomFirm());
  assert.equal(plain.think, null); assert.equal(plain.meeting, null, "a meeting from before the room voted has no voices to show");
  assert.equal(plain.seats[0].alone, "Has not had a turn of its own in the room yet.");
});

test("what the room carries: the lessons of its newest meeting that wrote any, with the Engine's corrections to that meeting", () => {
  const merged = roomView(sessionRoom("merge"));
  assert.deepEqual([merged.learned, merged.learnedFrom, merged.learnedCorrections], [["A single-target exit, so a small account can open it."], "session 3", ["I15301 made £9,696, not £23,659."]]);
  // a later meeting keeps the ideas apart and writes no lessons: the earlier lessons still stand, and their corrections stay with them
  const f = sessionRoom("merge");
  f.room.meetings.push({ cycle: 100, at: "2026-11-15T14:52:41Z", think: 4, decision: "keep_separate", votes: { merge: 1, keep_separate: 5, silent: 0 }, voices: f.room.meetings[1].voices, brought: {}, learned: [] });
  f.room.learned = null;                                    // as after "Pick the six again" on 15 Nov 2026, which dropped the room's own copy
  const later = roomView(f);
  assert.equal(later.meeting.session, 4); assert.deepEqual(later.meeting.learned, []); assert.deepEqual(later.meeting.corrections, []);
  assert.deepEqual([later.learned, later.learnedFrom, later.learnedCorrections], [["A single-target exit, so a small account can open it."], "session 3", ["I15301 made £9,696, not £23,659."]]);
  // no meeting has written lessons: whatever the room's record itself holds, and nothing to correct
  const apart = roomView(sessionRoom("keep_separate"));
  assert.deepEqual([apart.learned, apart.learnedFrom, apart.learnedCorrections], [["A single-target exit, so a small account can open it."], "", []]);
});

test("one thing at a time: a second press is refused while a run is in flight, and says what is still running", () => {
  assert.equal(whyNotFree("", null), ""); assert.equal(whyNotFree(undefined, undefined), ""); assert.equal(whyNotFree("", { running: false, session: 2 }), "");
  assert.equal(whyNotFree("The Records Room's Engine session is running… (about ten minutes)", null),
    "One thing at a time. The last thing you pressed is still running on GitHub: The Records Room's Engine session is running. Wait for it to finish, then press again.");
  assert.equal(whyNotFree("The Records Room is opening… (the Engine is working; about ten minutes)", null),
    "One thing at a time. The last thing you pressed is still running on GitHub: The Records Room is opening. Wait for it to finish, then press again.");
  assert.match(whyNotFree("Saving…", { running: true, session: 2, phaseWords: "x" }), /^One thing at a time\. The last thing you pressed is still running on GitHub: Saving\. /, "what this page has in flight comes first");
  // a session somebody started that this page does not have in flight (the page was reloaded, or it was started on another device)
  const f = sessionRoom(), now = Date.parse("2026-11-15T13:20:30Z");
  const live = roomLiveView({ mode: "firm", cycle: 100, stage: "The Records Room: each of the six is thinking on its own", percent: 30, updated_at: "2026-11-15T13:20:00Z", elapsed_s: 185,
    room: { session: 4, phase: "thinking", members: {}, voices: {}, votes: null } }, f, now);
  assert.equal(whyNotFree("", live), "A session of the Records Room is running now (session 4: Alone: each of the six is thinking on its own). Wait for it to finish, then press again. You can watch it on the Records Room page.");
});

test("a session of the room while it runs: which part it is in, what each of the six is doing, who has said what", () => {
  const f = sessionRoom(), now = Date.parse("2026-11-15T13:20:30Z");
  const live = (room, extra = {}) => ({ mode: "firm", cycle: 100, stage: "The Records Room: each of the six is thinking on its own", percent: 30, updated_at: "2026-11-15T13:20:00Z", elapsed_s: 185, room, ...extra });
  assert.equal(roomLiveView(null, f, now), null); assert.equal(roomLiveView({ mode: "firm", stage: "Agents thinking", updated_at: "2026-11-15T13:20:00Z" }, f, now), null, "an ordinary shift is not a session of the room");
  const t = roomLiveView(live({ session: 4, phase: "thinking", members: { A032: { state: "researching", detail: "by session" }, A014: { state: "brought", idea: "I15320", pips: 812.4, win: 51.2, sets: 40 }, A013: { state: "researching", detail: "the growth challenge for I04158" } }, voices: {}, votes: null }), f, now);
  assert.equal(t.running, true); assert.equal(t.session, 4); assert.equal(t.phaseWords, "Alone: each of the six is thinking on its own"); assert.equal(t.minutes, 3);
  assert.deepEqual(t.steps.map((x) => x.state), ["now", "todo", "todo", "todo"]);
  assert.deepEqual(t.members.map((m) => [m.name, m.doing, m.busy, m.done]), [["Yelwen Kingsshaw", "asks the Engine for its results by session", true, false],
    ["Kelra Ravenmere", "finished alone: brings I15320 (812 pips, 51.2% wins, 40 trades)", false, true], ["Nelen Yewley", "asks the Engine about the growth challenge for I04158", true, false]]);
  assert.equal(t.finished, 1); assert.equal(t.of, 3);
  const m = roomLiveView(live({ session: 4, phase: "meeting", members: { A032: { state: "in_meeting" }, A014: { state: "in_meeting" }, A013: { state: "in_meeting" } },
    voices: { A032: { vote: "merge", say: "I would take its exit." } }, votes: null }), f, now);
  assert.deepEqual(m.steps.map((x) => x.state), ["done", "now", "todo", "todo"]); assert.equal(m.spoke, 1); assert.equal(m.members[0].say, "I would take its exit."); assert.equal(m.members[0].vote, "merge"); assert.equal(m.votesLine, "");
  const e = roomLiveView(live({ session: 4, phase: "engine", members: {}, voices: {}, votes: { merge: 1, keep_separate: 2, silent: 0, decision: "keep_separate" } }), f, now);
  assert.deepEqual(e.steps.map((x) => x.state), ["done", "done", "now", "todo"]); assert.equal(e.votesLine, "The vote: 2 to 1 to keep the ideas apart.");
  const co = roomLiveView(live({ session: 4, phase: "company", members: {}, voices: {}, votes: null }), f, now);
  assert.deepEqual(co.steps.map((x) => [x.label, x.state]), [["1 · Alone", "done"], ["2 · Together", "done"], ["3 · The Engine", "done"], ["4 · The company", "now"]]);
  assert.equal(co.phaseWords, "The Engine is trying what the room sent on every agent's own best idea");
  const done = roomLiveView(live({ session: 4, phase: "done", members: {}, voices: {}, votes: { merge: 3, keep_separate: 0, decision: "merge" } }, { stage: "Cycle finished" }), f, now);
  assert.equal(done.running, false); assert.deepEqual(done.steps.map((x) => x.state), ["done", "done", "done", "done"]); assert.equal(done.votesLine, "The vote: 3 to 0 for ONE joint strategy.");
  assert.equal(roomLiveView(live({ session: 4, phase: "thinking", members: {} }), f, now + 7 * 60 * 1000).running, false, "a live file that has gone quiet is not shown as running");
});

test("before a session of the room is started, its cost is said in the firm's own figures", () => {
  const f = roomFirm(); f.budget = { firm_spent_usd: 181.08, firm_budget_usd: 200 };
  const c = roomSessionCost(f, 1818);
  assert.equal(c.ok, true); assert.equal(c.left.toFixed(2), "18.92"); assert.equal(c.minutes, ROOM_SESSION.githubMinutes);
  assert.equal(c.line, "About $2.50 of AI (every call has a ceiling, so never more than $6.10; $18.92 of this month's $200 is left) and about 8 GitHub minutes (1,818 of the free 2,000 are used this month).");
  const after = sessionRoom(); after.budget = { firm_spent_usd: 197.4, firm_budget_usd: 200 };
  const d = roomSessionCost(after);
  assert.equal(d.line, "The last one cost $2.43 of AI (every call has a ceiling, so never more than $2.60; $2.60 of this month's $200 is left) and about 15 GitHub minutes.", "once one has been run, its real cost and time are what is quoted");
  const poor = roomFirm(); poor.budget = { firm_spent_usd: 199.5, firm_budget_usd: 200 };
  assert.equal(roomSessionCost(poor).ok, false); assert.match(roomSessionCost(poor).why, /^\$0\.50 is left of this month's AI budget, and a session needs at least \$1\.00\./);
  assert.equal(roomSessionCost({}).ok, false);
});

// ── one strategy goes to the whole company after every session (15 Nov 2026, evening) ──────────────────────────────
function sentRoom() {
  const f = sessionRoom("keep_separate");
  f.budget = { firm_spent_usd: 185.43, firm_budget_usd: 200 };
  f.room.last_think = { ...(f.room.last_think || {}), session: 3, at: "2026-11-15T19:10:00Z", cost_usd: 2.35, seconds: 540 };
  f.room.thinks = 3;
  f.room.sent = [{ session: 3, cycle: 100, at: "2026-11-15T19:06:00Z", idea: "I15288", by: "A013", by_name: "Nelen Yewley", votes: 3, of: 5, voters: ["A032", "A014", "A013"], tie: false,
    why: [{ agent: "A032", why: "Its exit is the plainest thing here." }], rules: { instrument: "XAUUSD", timeframes: [60] }, in_words: ["Take the indicator's XAUUSD signals on the 1H chart."], hypothesis: "one hour, flat chart",
    card: { idea: "I15288", pips: 24374.2, win_rate_pct: 54.3, sets: 151, pnl_gbp: 7100.4 }, unseen: { sets: 148, pips: 5216.1, win_rate_pct: 31.1, pnl_gbp: 351.2 },
    tally: [{ idea: "I15474", votes: 2, voters: ["A015", "A016"], held: false, note: "did not hold: it lost money on the months nobody has seen" }, { idea: "I15288", votes: 3, held: true, note: "held" }],
    note: "3 of the 5 who spoke named it.",
    carried: { at: 99, of: 99, done: true, agents: 61, tried: 244, no_gain: 40, did_not_hold: 9, not_comparable: 38,
      kept: [{ agent: "A041", name: "Mira Holt", base: "I09001", idea: "I15601", what: "its exit", own: true, before: { pips: 9100, win_rate_pct: 44.2 }, after: { pips: 12850.6, win_rate_pct: 47.9 } },
        { agent: "A050", name: "Tam Ode", base: "I09002", idea: "I11111", what: "its charts", own: false, before: { pips: 500, win_rate_pct: 40 }, after: { pips: 900, win_rate_pct: 41 } }] } }];
  f.room.keep = { session: 3, can_go_on: true, ai_left_usd: 14.57, why_not: "" };
  return f;
}

test("what the room sent to the whole company: both sets of months side by side, who named it, what else was named, what the Engine made of it", () => {
  const v = roomView(sentRoom());
  assert.equal(v.sent.length, 1); assert.equal(v.notSent, null); assert.equal(v.keep.can_go_on, true);
  const x = v.sent[0];
  assert.equal(x.title, "Session 3: I15288 by Nelen Yewley"); assert.equal(x.votesLine, "3 of the 5 who spoke named it.");
  assert.deepEqual(x.voters, ["Yelwen Kingsshaw", "Kelra Ravenmere", "Nelen Yewley"]); assert.deepEqual(x.why, [{ who: "Yelwen Kingsshaw", words: "Its exit is the plainest thing here." }]);
  assert.equal(x.practice, "24,374 pips · 54.3% wins · 151 trades · made £7,100"); assert.equal(x.unseen, "5,216 pips · 31.1% wins · 148 trades · made £351", "the CEO sees what it did on the months nobody had seen");
  assert.deepEqual(x.passedOver, ["I15474: 2 votes, did not hold: it lost money on the months nobody has seen"]);
  assert.equal(x.carried.done, true); assert.equal(x.carried.kept.length, 2);
  assert.match(x.carried.line, /^The Engine tried its parts \(its filters, its exit, its trade limits, its charts\) on 61 agents' own best ideas: 2 of them are better for it and held too; 9 improved on the practice months but did not hold, so nothing was kept; 40 were not improved; 38 could not be compared /);
  assert.equal(x.carried.kept[0].line, "Mira Holt: its best I09001 with its exit is I15601: 9,100 → 12,851 pips, 44.2% → 47.9% wins on the practice months");
  assert.match(x.carried.kept[1].line, / \(already in the library\)$/);
  const part = sentView({ ...sentRoom().room.sent[0], tie: true, carried: { at: 40, of: 99, done: false, agents: 25, kept: [] } });
  assert.match(part.votesLine, /Another had as many votes: this one made more money on the months nobody has seen\.$/); assert.match(part.carried.line, /It has reached 40 of 99 agents and carries on in the next session\.$/);
  assert.equal(sentView({ idea: "I1", by: "A1", at: "x" }).carried, null);
  const none = sentRoom(); none.room.last_send = { session: 4, idea: null, note: "None of the six named a strategy to send." };
  assert.deepEqual(roomView(none).notSent, { session: 4, note: "None of the six named a strategy to send." });
  assert.equal(eventLine({ kind: "room_sent", agent: "A013", idea: "I15288", votes: 3, of: 5 }, (id) => ({ A013: "Nelen Yewley" }[id] || id)).text,
    "The Records Room sends I15288 to the whole company: 3 of the 5 who spoke named it, and it made money on the months nobody has seen too (Nelen Yewley's strategy)");
  assert.equal(eventLine({ kind: "room_not_sent", note: "None of the six named a strategy to send." }).text, "The Records Room sends nothing to the company this time: None of the six named a strategy to send");
  assert.equal(eventLine({ kind: "room_carried", idea: "I15288", agents: 61, kept: 2, done: true }).text, "The Engine tried I15288 on 61 agents' own best ideas: 2 of them are better for it and held too");
  assert.match(eventLine({ kind: "room_carried", idea: "I15288", agents: 20, kept: 0, done: false }).text, /\(it carries on with the rest next time\)$/);
});

test("back to back: how many sessions the money pays for, what the strip says, and that nothing else is sent while it runs", () => {
  assert.equal(sessionsLeft(14.57, 2.35), 6, "six sessions: the sixth starts with $2.82 left and the seventh would have $0.47");
  assert.equal(sessionsLeft(2.5, 2.35), 1); assert.equal(sessionsLeft(0.99, 2.35), 0); assert.equal(sessionsLeft(4.4, 2.35), 2); assert.equal(sessionsLeft(4.3, 2.35), 1, "a next one needs $2.00 left");
  assert.equal(sessionsLeft(10, 0), 4, "before any session has been run: at the usual $2.50 (the fourth starts with $2.50 left)");
  const f = sentRoom(), now = Date.parse("2026-11-15T19:12:00Z");
  const off = keepView(f, { firm: {} }, null, null, "", now);
  assert.equal(off.on, false); assert.equal(off.canStart, true); assert.equal(off.sessions, 6);
  assert.equal(off.line, "$14.57 of this month's AI money is left: enough for about 6 sessions (the last one cost $2.35).");
  assert.match(off.confirm, /^Keep the Records Room running, back to back\?/); assert.match(off.confirm, /until this month's AI money is used or you press Stop/); assert.match(off.confirm, /only if it also made money on the months nobody has seen/);
  const live = { running: true, session: 4, phaseWords: "Alone: each of the six is thinking on its own" };
  const on = keepView(f, { firm: { room_keep_running: true } }, { next: true, at: "2026-11-15T19:10:30Z", why: "Session 2 of this run of sessions has been started." }, live, "", now);
  assert.equal(on.on, true); assert.equal(on.canStart, false);
  assert.match(on.line, /^Running back to back\. Session 4 is in progress; when it has saved, the next one starts by itself\. \$14\.57 of this month's AI money is left/);
  const between = keepView(f, { firm: { room_keep_running: true } }, { next: true, at: "2026-11-15T19:10:30Z" }, null, "", now);
  assert.match(between.line, /^Switched on\. The next session starts by itself within a minute or two/);
  // the chain's own word that it has ended counts before the switch has been switched off
  const ended = keepView(f, { firm: { room_keep_running: true } }, { next: false, at: "2026-11-15T19:10:40Z", why: "No further session was started: $0.47 is left of the month's AI money and a session needs about $2.00." }, null, "", now);
  assert.equal(ended.on, false); assert.match(ended.line, /^No further session was started: \$0\.47 is left of the month's AI money and a session needs about \$2\.00\. /);
  // a chain's word from before the newest session is old news
  assert.equal(keepView(f, { firm: { room_keep_running: true } }, { next: false, at: "2026-11-15T18:00:00Z", why: "x" }, null, "", now).on, true);
  // ... and so is the "no more" of the run of sessions BEFORE this one, once the switch has been switched on again: the
  // settings carry the time they were last saved, and the first session of the new run is under way (found in a real
  // browser on 15 Nov 2026: the page said "not running back to back" all through the first session of a second run)
  const again = keepView(f, { updated_at: "2026-11-15T19:11:30Z", firm: { room_keep_running: true } }, { next: false, at: "2026-11-15T19:10:40Z", why: "Stopped by the CEO" }, live, "", now);
  assert.equal(again.on, true); assert.match(again.line, /^Running back to back\. Session 4 is in progress/);
  const justOn = keepView(f, { updated_at: "2026-11-15T19:11:30Z", firm: { room_keep_running: true } }, { next: false, at: "2026-11-15T19:10:40Z", why: "Stopped by the CEO" }, null, "", now);
  assert.match(justOn.line, /^Switched on\. /, "switched on a moment ago and the session has not shown yet: that is not a stall");
  // the chain said "no more" after the settings were last saved: it has ended, whatever the switch still says
  assert.equal(keepView(f, { updated_at: "2026-11-15T19:00:00Z", firm: { room_keep_running: true } }, { next: false, at: "2026-11-15T19:10:40Z", why: "x" }, null, "", now).on, false);
  // the page's own "The Records Room is in session…" counts as running before GitHub shows it
  assert.match(keepView(f, { updated_at: "2026-11-15T19:11:50Z", firm: { room_keep_running: true } }, null, null, "The Records Room is in session… (the first of a run of sessions, back to back)", now).line, /^Running back to back\. Session 4 is in progress/);
  // switched on, but nothing has started for a long time: say so
  const dead = keepView(f, { firm: { room_keep_running: true } }, { next: true, at: "2026-11-15T19:10:30Z" }, null, "", now + 30 * 60 * 1000);
  assert.match(dead.line, /^It is switched on, but no session has started since 32 minutes ago, so something stopped it\. Press Stop, then start it again\./);
  // the CEO's Stop while a session runs
  assert.equal(keepView(f, { firm: { room_keep_running: false } }, null, live, "", now).line, "Not running back to back: the session in progress is the last one. Nothing more starts by itself.");
  const closed = sentRoom(); closed.room.open = false;
  assert.equal(keepView(closed, {}, null, null).canStart, false); assert.equal(keepView(closed, {}, null, null).startWhy, "The room is closed.");
  const poor = sentRoom(); poor.budget = { firm_spent_usd: 199.5, firm_budget_usd: 200 };
  assert.equal(keepView(poor, {}, null, null).canStart, false); assert.match(keepView(poor, {}, null, null).startWhy, /^\$0\.50 is left of this month's AI money/);
  // while it runs back to back nothing else is sent to GitHub, not even between two sessions
  assert.match(whyNotFree("", null, true), /^One thing at a time\. The Records Room is running back to back: .* Press “Stop after this session” on the Records Room page/);
  assert.equal(whyNotFree("", null, false), ""); assert.match(whyNotFree("Saving…", null, true), /still running on GitHub: Saving/);
  // the other pages (a backtest, the Million Challenge) ask with the settings and the chain's word alone, no firm file
  assert.equal(keepView(null, { updated_at: "2026-11-15T19:11:30Z", firm: { room_keep_running: true } }, { next: true, at: "2026-11-15T19:21:00Z" }, null).on, true);
  assert.equal(keepView(null, { updated_at: "2026-11-15T19:11:30Z", firm: { room_keep_running: true } }, { next: false, at: "2026-11-15T19:21:00Z" }, null).on, false);
  assert.equal(keepView(null, { firm: {} }, null, null).on, false); assert.equal(keepView(null, null, null, null).on, false);
  assert.match(KEEP_BLOCKS_RUNS, /^The Records Room is running back to back, so this was not started/); assert.match(KEEP_BLOCKS_RUNS, /Stop after this session/);
});


test("the budget boxes are for the whole month: a number that would stop the work is said before it is sent (15 Nov 2026)", () => {
  // Start was pressed with 6 in the AI budget box while $185.43 had been spent: nothing could use AI any more
  const f = { budget: { firm_spent_usd: 185.4322, firm_budget_usd: 200 }, settings: { monthly_api_budget_usd: 200, monthly_minutes_budget: 1800 } };
  const six = budgetCheck(f, 6, 2000, 1838);
  assert.equal(six.apiStops, true); assert.equal(six.minutesStop, false);
  assert.equal(six.lines[0], "$185.43 of AI is already spent this month. A budget of $6.00 would stop ALL AI until the new month: the firm's shifts and the Records Room's sessions. "
    + "The budget is for the whole month: to allow $6 more, for example, enter 191.43.");
  assert.match(six.confirm, /Start anyway\?$/); assert.match(budgetCheck(f, 6, 2000, 1838, "Save").confirm, /Save anyway\?$/);
  assert.equal(six.usedLine, "Used so far this month: $185.43 of AI and 1,838 GitHub minutes. Both boxes are for the whole month, not an extra amount.");
  // the firm's own minutes budget is used: no shift runs, whatever the AI budget
  const mins = budgetCheck(f, 200, 1800, 1838);
  assert.equal(mins.apiStops, false); assert.equal(mins.minutesStop, true);
  assert.equal(mins.lines[0], "The firm's GitHub minutes for this month are used (1,838 of 1,800), so no shift runs until the new month unless this number is raised (GitHub gives 2,000 free a month). The Records Room's sessions do not come under it.");
  assert.equal(budgetCheck(f, 6, 1800, 1838).lines.length, 2);
  // nothing to say, nothing to ask
  const fine = budgetCheck(f, 200, 2000, 1838);
  assert.deepEqual([fine.apiStops, fine.minutesStop, fine.lines.length, fine.confirm], [false, false, 0, ""]);
  assert.equal(budgetCheck({ budget: {} }, 0, 0, 0).confirm, "", "a new firm with nothing spent is not warned about a zero");
  assert.equal(budgetCheck(f, 185.44, 2000, 0).apiStops, false); assert.equal(budgetCheck(f, 185.4322, 2000, 0).apiStops, true, "as the engine counts it: spent >= budget stops");

  // the top strip for a firm that is started while a budget is used up
  assert.equal(stoppedLine(f, 1700), "");
  const firmSix = { ...f, settings: { monthly_api_budget_usd: 6, monthly_minutes_budget: 1800 } };
  const noAi = "Started. No money can be spent: this month's AI budget is set to $6.00 and $185.43 is already spent, so no AI runs (not the firm's agents, not the Records Room's thinking). ";
  // ... the engine has switched the firm's schedule off (16 Nov 2026: a started firm that cannot run costs nothing)
  assert.equal(stoppedLine(firmSix, 1840, { on: false, waiting: "minutes" }), noAi
    + "On GitHub no shift can run before the new month either: the firm's GitHub minutes for this month are used (1,840 of 1,800). "
    + "Its schedule there is off meanwhile, so it uses no GitHub minutes, and it comes back by itself in the new month or when the minutes budget is raised. The Engine's own work needs no AI: see the Records Room page.");
  // ... it has not looked in yet since that change: the schedule is still on until it does
  assert.equal(stoppedLine(firmSix, 1840, { on: true, slowed: true }), noAi
    + "On GitHub no shift can run before the new month either: the firm's GitHub minutes for this month are used (1,840 of 1,800). "
    + "At its next look the firm switches its own schedule off until the new month, so that waiting uses no GitHub minutes. The Engine's own work needs no AI: see the Records Room page.");
  assert.equal(stoppedLine(firmSix, 1840), stoppedLine(firmSix, 1840, { on: true }), "no word from the schedule file reads as still on");
  assert.equal(stoppedLine(f, 1838, { on: false, waiting: "minutes" }), "Started. On GitHub no shift can run before the new month: the firm's GitHub minutes for this month are used (1,838 of 1,800). "
    + "Its schedule there is off meanwhile, so it uses no GitHub minutes, and it comes back by itself in the new month or when the minutes budget is raised. The Records Room can still run its own sessions.");
  assert.equal(stoppedLine({ ...f, settings: { monthly_api_budget_usd: 6, monthly_minutes_budget: 2000 } }, 1840, { on: true, slowed: true }),
    noAi + "The firm's shifts go on with the Engine only, four times a day. The Engine's own work needs no AI: see the Records Room page.");

  // the Records Room's strip: nothing left because the budget is set below what is spent
  const room = sentRoom(); room.budget = { firm_spent_usd: 185.4322, firm_budget_usd: 6 };
  const kv = keepView(room, { firm: {} }, null, null);
  assert.equal(kv.canStart, false); assert.equal(kv.sessions, 0);
  const low = "No money can be spent: this month's AI budget is set to $6.00 and $185.43 is already spent, so no session with AI can run. "
    + "The room's Engine work needs no AI and goes on. (To allow sessions again, raise the AI budget in the CEO's office, How the firm works: for $6 more, for example, enter 191.43.)";
  assert.equal(kv.line, low); assert.equal(kv.startWhy, low);
  // the chain's last word (the session it tried was refused for the same reason) is not said twice
  assert.equal(keepView(room, { firm: {} }, { next: false, at: "2026-11-15T20:22:39Z", why: "No further session was started: the session that has just ended was not run or did not finish ($0.00 is left)." }, null).line, low);
  // the money really used up (budget 200, spent 199.50) keeps the ordinary words
  const used = sentRoom(); used.budget = { firm_spent_usd: 199.5, firm_budget_usd: 200 };
  assert.match(keepView(used, {}, null, null).line, /^\$0\.50 of this month's AI money is left/);
});
