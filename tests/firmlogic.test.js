// HSN Capital's page logic without a browser: the paces, the next shift, whether Start is allowed, the scoreboard,
// the ticker's lines and the token help. Every figure in these tests is made up; none is shown on the site.
import test from "node:test";
import assert from "node:assert/strict";
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
  assert.match(nextShift("3h", { on: false }).text, /No shift is scheduled/);
  const slow = nextShift("1h", { on: true, slowed: true }, at("2026-11-14T10:40:00Z"));
  assert.equal(slow.at.toISOString(), "2026-11-14T12:17:00.000Z");
  assert.match(slow.text, /minutes limit is used up/);
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
