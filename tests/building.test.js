// The building's logic without a browser: seating, taps and the replay of real events. The canvas is a stub.
import test from "node:test";
import assert from "node:assert/strict";

const noop = () => {};
const gradient = { addColorStop: noop };
const ctx = new Proxy({}, { get: (t, k) => (k === "measureText" ? (s) => ({ width: String(s).length * 5.5 }) : k === "createLinearGradient" || k === "createRadialGradient" ? () => gradient
  : typeof k === "string" && /^[a-z]/.test(k) ? (t[k] ?? noop) : undefined), set: () => true });
function canvasStub(width) {
  return { width: 0, height: 0, style: {}, getContext: () => ctx, addEventListener: noop, removeEventListener: noop, scrollIntoView: noop,
    getBoundingClientRect: () => ({ width, height: 900, left: 0, top: 0 }), parentElement: { getBoundingClientRect: () => ({ width }) } };
}
globalThis.window = { devicePixelRatio: 2, addEventListener: noop, removeEventListener: noop };
globalThis.document = { visibilityState: "visible" };
globalThis.requestAnimationFrame = noop;
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

const { Building, isRunning } = await import("../js/building.js");

/** A firm the shape the engine writes (firm/firm.json): 12 groups on floor 1 and two on each floor above. */
function firm() {
  const floors = {}, agents = {};
  let n = 0, gi = 0;
  for (const [floor, count] of [[1, 12], [2, 2], [3, 2], [4, 2], [5, 2]]) {
    floors[floor] = { groups: [], agents: [] };
    for (let r = 0; r < count; r++) {
      const g = { id: `G${String(++gi).padStart(2, "0")}`, room: r, members: [], strategy: null, progress: { basis: "none" } };
      for (let k = 0; k < 5; k++) {
        const id = `A${String(++n).padStart(3, "0")}`;
        g.members.push(id); floors[floor].agents.push(id);
        agents[id] = { name: `Name${n} Surname`, floor, level_n: floor, level: "x", group: g.id, mood: "neutral", status: "idle", progress: { basis: "practice", months: 4, pct: 50, day: { pct: 75 }, pips: { pct: 25 }, rr: { pct: 50 } } };
      }
      floors[floor].groups.push(g);
    }
  }
  return { floors, agents, managers: {}, cycle: 3 };
}

for (const width of [1150, 762, 362]) {
  test(`all 100 agents have a desk of their own and can be tapped (canvas ${width}px wide)`, () => {
    const b = new Building(canvasStub(width), { animations: false });
    b.setData(firm(), null);
    assert.equal(b.agents.size, 100);
    const seen = new Set();
    for (const id of b.agents.keys()) {
      const d = b.deskOf(id);
      assert.ok(d && d.x > b.liftW && d.x < b.W && d.y > 0 && d.y < b.H, `${id} is inside the building`);
      const k = `${Math.round(d.x)}:${Math.round(d.y)}`;
      assert.ok(!seen.has(k), `${id} does not share a desk`); seen.add(k);
      assert.deepEqual(b.hit(d.x, d.y - 10), { agent: id }, `a tap on ${id}'s desk opens ${id}`);
      assert.deepEqual(b.hit(d.x - d.w / 2 + 3, d.y + 30), { agent: id }, "the whole cell is the tap target, bars included");
    }
    if (width >= 700) assert.ok(b.deskOf("A001").w >= 40, "on an iPad a desk cell is at least 40 px wide");
    const room = b.rooms.find((r) => r.id === "F3R0");
    assert.equal(b.hit(room.x + 20, room.y + 8).room.id, "F3R0", "a tap on a room's header opens the room");
    b.destroy();
  });
}

test("a replay starts from the seats at the start of the cycle and applies its real events in order", () => {
  const b = new Building(canvasStub(1150), { animations: true });
  const f = firm();
  b.setData(f, null);
  const start = { agents: Object.fromEntries(Object.entries(f.agents).map(([id, a]) => [id, [a.floor, a.group]])), groups: Object.fromEntries(Object.values(f.floors).flatMap((fl, i) => fl.groups.map((g) => [g.id, [i + 1, g.room]]))) };
  const events = [
    { at: "t1", kind: "tested", agent: "A001", month_score: 41.2 },
    { at: "t2", kind: "meeting_start", group: "G01", floor: 1, members: ["A001", "A002", "A003", "A004", "A005"] },
    { at: "t3", kind: "meeting", group: "G01", strategy: "I00001" },
    { at: "t3a", kind: "meeting_start", group: "G13", floor: 2, members: ["A061", "A062", "A063", "A064", "A065"] },
    { at: "t3b", kind: "meeting", group: "G13", strategy: "I00002" },
    { at: "t3c", kind: "audit_start", group: "G13", floor: 2 },
    { at: "t4", kind: "level_up", agent: "A001", members: ["A001"], solo: true, group: "G13", from_group: "G01", from: 1, to: 2, skip: false },
    { at: "t5", kind: "swapped_down", agent: "A061", members: ["A061"], solo: true, group: "G01", from_group: "G13", from: 2, to: 1 },
  ];
  let ended = false;
  b.playReplay({ cycle: 3, start, events }, { speed: 8, onEnd: () => (ended = true) });
  assert.equal(b.mode, "replay");
  b.apply(b.queue.shift(), true);
  assert.equal(b.agents.get("A001").chip.text, "+41", "the Engine's real Month Score pops up at the desk");
  b.apply(b.queue.shift(), true);
  assert.equal(b.agents.get("A003").away.huddle, true, "a floor-1 group meets standing together in its own room (floor 1 has no discussion room)");
  b.apply(b.queue.shift(), true);
  assert.equal(b.agents.get("A003").away, null);
  b.apply(b.queue.shift(), true);
  assert.equal(b.agents.get("A063").away.room.id, "F2D", "on floors 2 to 5 a meeting walks the group to that floor's discussion room");
  b.apply(b.queue.shift(), true);
  assert.equal(b.agents.get("A063").away, null);
  b.apply(b.queue.shift(), true);
  assert.equal(b.agents.get("A063").status, "waiting_audit"); assert.equal(b.auditing.who, "G13", "the Audit desk shows whose challenge it is re-running");
  b.apply(b.queue.shift(), true);
  assert.equal(b.agents.get("A001").group, "G13"); assert.equal(b.agents.get("A001").level, 2);
  assert.ok(b.rides.length === 1 && b.rides[0].to === 2, "moving up takes the lift");
  b.apply(b.queue.shift(), true);
  assert.equal(b.agents.get("A061").group, "G01"); assert.equal(b.agents.get("A061").level, 1);
  assert.equal(b.groups.get("G13").seats.filter(Boolean).length, 5); assert.equal(b.groups.get("G01").seats.filter(Boolean).length, 5);
  for (let i = 0; i < 400; i++) b.tick(0.1);                       // let the lift rides and the replay finish
  assert.ok(ended && b.mode === "idle", "the replay ends and the building goes back to the present");
  assert.equal(b.agents.get("A001").group, "G01", "after a replay everyone is back where the engine's files say they are now");
  b.destroy();
});

test("live mode only animates events that arrive after the page was opened", () => {
  const b = new Building(canvasStub(1150), { animations: true });
  b.setData(firm(), null);
  const now = new Date().toISOString();
  const live = (events, status = {}) => ({ mode: "firm", cycle: 4, stage: "Agents thinking", updated_at: now, agents: { A002: { status: "researching", detail: "by session", floor: 1, group: "G01" }, ...status }, events });
  assert.ok(isRunning(live([])) && !isRunning({ ...live([]), stage: "Cycle finished" }) && !isRunning(null));
  b.applyLive(live([{ at: "a", kind: "tested", agent: "A001", month_score: 5 }]));
  assert.equal(b.queue.length, 0, "what happened before the page opened is not replayed as if it were happening now");
  assert.equal(b.agents.get("A002").status, "researching");
  b.applyLive(live([{ at: "a", kind: "tested", agent: "A001", month_score: 5 }, { at: "b", kind: "tested", agent: "A003", month_score: -7 }]));
  assert.deepEqual(b.queue.map((e) => e.agent), ["A003"]);
  b.destroy();
});

test("result chips speak in pips and win rate, the Engine's search is marked, and the top desks carry a mark", () => {
  const b = new Building(canvasStub(1150), { animations: true });
  const f = firm();
  b.setStars({ pips: "A007", win: "A012" });
  b.setData(f, null);
  assert.deepEqual(b.stars, { pips: "A007", win: "A012" });
  b.apply({ at: "t1", kind: "tested", agent: "A001", pips: 412.4, win: 57.6, month_score: 30 }, true);
  assert.equal(b.agents.get("A001").chip.text, "+412p 58%", "an agent's own idea: pips and win rate, straight from the Engine");
  b.apply({ at: "t2", kind: "tested", agent: "A002", pips: -80.2, win: 31, by: "engine search", what: "only the London session" }, true);
  assert.equal(b.agents.get("A002").chip.text, "⚙ -80p 31%", "the Engine's own search carries its own mark");
  assert.equal(b.agents.get("A002").chip.color, "#ff5c5c");
  b.apply({ at: "t3", kind: "tested", agent: "A003", month_score: 12.3 }, true);
  assert.equal(b.agents.get("A003").chip.text, "+12", "an older record without pips still shows its Month Score");
  b.apply({ at: "t4", kind: "coded", agent: "A004", name: "ema_cross", what: "strategy" }, true);
  assert.equal(b.agents.get("A004").chip.text, "</> own strategy");
  b.apply({ at: "t5", kind: "coded", group: "G02", name: "team_trend", what: "team strategy" }, true);
  assert.equal(b.agents.get("A006").chip.text, "</> team code", "a team's hand-in shows at the group's first desk");
  assert.ok(b.flashes.some((x) => x.gid === "G02"), "and its room flashes");
  b.apply({ at: "t6", kind: "tested", group: "G02", pips: 50, win: 60, by: "first test", strategy: "S0002" }, true);
  assert.equal(b.agents.get("A006").chip.text, "+50p 60%", "the first test of a team's code shows there too");
  b.setStars(null);
  assert.deepEqual(b.stars, { pips: null, win: null });
  b.draw();
  b.destroy();
});

// ── the 2D world: looks, routes, the lift, things in flight, the camera ─────────────────────────────────────────────
const { lookOf, hash } = await import("../js/sprites.js");
const { worldFrom, coverageWorld } = await import("../js/building.js");
const { skyAt } = await import("../js/scene.js");

function startOf(f) {
  return { agents: Object.fromEntries(Object.entries(f.agents).map(([id, a]) => [id, [a.floor, a.group]])), groups: Object.fromEntries(Object.values(f.floors).flatMap((fl, i) => fl.groups.map((g) => [g.id, [i + 1, g.room]]))) };
}
const run = (b, seconds, dt = 0.05) => { for (let i = 0; i < seconds / dt; i++) b.tick(dt); };

test("every agent has a look of its own that never changes, and a new Analyst in the same seat looks new", () => {
  assert.deepEqual(lookOf("A001", "Joris Coldby"), lookOf("A001", "Joris Coldby"), "the same agent always looks the same");
  assert.notDeepEqual(lookOf("A001", "Joris Coldby"), lookOf("A001", "Tessa Brightwater"), "a new person in the seat is a new look");
  const seen = new Set();
  for (let i = 1; i <= 100; i++) { const l = lookOf(`A${String(i).padStart(3, "0")}`, `Name${i}`); seen.add(`${l.skin}|${l.hair}|${l.style}|${l.glasses}`); }
  assert.ok(seen.size >= 60, `100 agents do not look alike (${seen.size} different looks)`);
  assert.equal(lookOf("M3", "Galra Northdale", { suit: true }).suit, true, "managers wear a suit");
  assert.equal(hash("A001"), hash("A001"));
  const b = new Building(canvasStub(1150), { animations: true });
  b.setData(firm(), null);
  const before = b.agents.get("A050").look;
  b.apply({ at: "r", kind: "rotation", agent: "A050", new_name: "Tessa Brightwater" }, true);
  assert.notDeepEqual(b.agents.get("A050").look, before);
  assert.equal(b.agents.get("A050").name, "Tessa Brightwater");
  b.destroy();
});

test("price history that arrived since the firm's last shift shows in the building", () => {
  // the firm's own file only learns of new price history at its next shift; the Data check's coverage file knows at once
  assert.deepEqual(coverageWorld(null), {});
  assert.deepEqual(coverageWorld({ symbols: { XAUUSD: { months: 0 } } }), {}, "nothing on file: the firm's own file still speaks");
  const now = coverageWorld({ symbols: { XAUUSD: { months: 14, last_bar: "2026-11-13T21:59:00Z" }, NAS100: { months: 14, last_bar: "2026-11-13T21:59:00Z" }, GBPUSD: { months: 0 } } });
  assert.deepEqual(now, { hasData: true, data: [{ label: "Gold", months: 14, to: "2026-11-13" }, { label: "Nasdaq 100", months: 14, to: "2026-11-13" }], dataTo: "2026-11-13" });
  const b = new Building(canvasStub(1150), { animations: true });
  b.setWorld(now);
  b.setData({ ...firm(), paused: true, data_coverage: { symbols: {} } }, null);          // a firm that has not had a shift since the download
  assert.equal(b.world.hasData, true);
  assert.equal(b.world.paused, true, "everything else still comes from the firm's own file");
  assert.match(b.tour().map((s) => s.label).join(" | "), /Price history on file: Gold 14 months, Nasdaq 100 14 months\./);
  assert.doesNotMatch(b.tour().map((s) => s.label).join(" | "), /waiting for price history|none yet/);
  b.destroy();
});

test("the basement's machines only show what the firm's file says", () => {
  const none = worldFrom({ paused: true, data_coverage: { symbols: { XAUUSD: { months: 0, bars: 0 } } }, library: { ideas: 0, verified: 0 } });
  assert.equal(none.hasData, false); assert.deepEqual(none.data, []); assert.equal(none.paused, true); assert.equal(none.ideas, 0);
  const some = worldFrom({ paused: false, data_coverage: { symbols: { XAUUSD: { months: 94, last_bar: "2026-11-13T21:59:00Z" }, NAS100: { months: 0 } } }, library: { ideas: 814, verified: 3 },
    strategies: { active: [{}, {}], waiting: 1, rejected: 4 }, code_room: ["original", "waves"] });
  assert.deepEqual(some.data, [{ label: "Gold", months: 94, to: "2026-11-13" }]);
  assert.deepEqual([some.hasData, some.dataTo, some.ideas, some.verified, some.codeSources], [true, "2026-11-13", 814, 3, 2]);
  assert.deepEqual(some.strategies, { active: 2, waiting: 1, rejected: 4 });
  const b = new Building(canvasStub(1150), { animations: true });
  b.setData({ ...firm(), paused: true, managers: { 1: { name: "Selwen Penmoor", title: "Floor 1 Manager" }, 5: { name: "Loren Bramton", title: "Head of Trading" } } }, null);
  assert.deepEqual(b.engineLines().map((x) => x[0]), ["ideas tested so far:", "checked by the Audit desk:"]);
  for (const id of ["ENGINE", "DATA", "CODE", "SANDBOX", "AUDIT", "CEO"]) assert.ok(b.byId[id], `${id} is in the building`);
  assert.equal(b.hit(b.byId.ENGINE.x + 10, b.byId.ENGINE.y + 10).room.kind, "engine", "the Engine can be tapped");
  const m1 = b.staff.find((m) => m.id === "M1");
  assert.deepEqual(b.staff.map((m) => m.id), ["M1", "M5", "AUD", "CEO"], "the managers the firm's file names, the auditor, and whoever is watching (the CEO)");
  assert.equal(b.hit(b.ceoDesk().x, b.ceoDesk().y - 8).room.kind, "ceo", "a tap on the CEO's desk opens the CEO's office");
  assert.deepEqual(b.hit(m1.x, m1.y - 10).room, { kind: "manager", floor: 1, name: "Selwen Penmoor" }, "a floor manager can be tapped");
  b.destroy();
});

test("a test is an idea going down to the Engine and its real result coming back; code goes to the sandbox", () => {
  const b = new Building(canvasStub(1150), { animations: true });
  b.setData(firm(), null);
  const eng = b.port("engine"), box = b.port("sandbox"), code = b.port("code"), desk = b.screenOf("A001");
  b.apply({ at: "t1", kind: "tested", agent: "A001", pips: 120, win: 55 }, true);
  assert.equal(b.flights.length, 2);
  assert.deepEqual([b.flights[0].x0, b.flights[0].y0, b.flights[0].x1, b.flights[0].y1], [desk.x, desk.y, eng.x, eng.y], "out: from the agent's own screen to the Engine");
  assert.deepEqual([b.flights[1].x0, b.flights[1].x1, b.flights[1].color], [eng.x, desk.x, "#35d07f"], "back: the result, green because it made pips");
  assert.ok(b.agents.get("A001").chip.born > b.clock, "the numbers show when the result has come back, not before");
  b.flights = [];
  b.apply({ at: "t2", kind: "tested", agent: "A002", pips: -40, win: 30, by: "engine search", what: "x" }, true);
  assert.equal(b.flights.length, 1); assert.deepEqual([b.flights[0].x0, b.flights[0].y0], [eng.x, eng.y], "the Engine's own search starts at the Engine");
  b.flights = [];
  b.apply({ at: "t3", kind: "coded", agent: "A003", name: "x", what: "strategy" }, true);
  assert.deepEqual([b.flights[0].x1, b.flights[0].y1, b.flights[0].hit], [box.x, box.y, "sandbox"], "code an agent wrote goes to the sandbox");
  b.flights = [];
  b.apply({ at: "t4", kind: "looked", agent: "A004", tool: "read_code", what: "reading original" }, true);
  assert.deepEqual([b.flights[0].x0, b.flights[0].y0], [code.x, code.y], "reading the code brings it up from the code room");
  assert.deepEqual([b.agents.get("A004").status, b.agents.get("A004").detail], ["researching", "reading original"]);
  b.flights = [];
  b.apply({ at: "t5", kind: "looked", agent: "A005", tool: "breakdown", what: "by session" }, true);
  assert.equal(b.flights.length, 2, "a question to the Engine goes there and back");
  const pulse0 = b.engine.pulse; run(b, 1.2);
  assert.ok(b.engine.pulse > pulse0 && b.flights.length === 0, "the Engine pulses when something reaches it, and the flight ends");
  for (let i = 0; i < 200; i++) b.apply({ at: `m${i}`, kind: "tested", agent: "A010", pips: 1, win: 50 }, true);
  assert.ok(b.flights.length <= 70, "a burst of tests never floods the picture");
  // with movement switched off nothing flies: the result is simply there
  const still = new Building(canvasStub(1150), { animations: false });
  still.setData(firm(), null);
  still.apply({ at: "t1", kind: "tested", agent: "A001", pips: 120, win: 55 }, false);
  assert.equal(still.flights.length, 0);
  b.destroy(); still.destroy();
});

test("people walk along the floor, take the stairs between rows of rooms and the lift between floors", () => {
  const b = new Building(canvasStub(762), { animations: true });      // an iPad in portrait: floor 1 has four rows of rooms
  const f = firm();
  b.setData(f, null);
  const a = b.agents.get("A001"), g1 = b.groups.get("G01"), g12 = b.groups.get("G12");
  assert.equal(b.poseOf(a), "sit");
  assert.ok(g1.rect.lane !== g12.rect.lane, "G01 and G12 are on different rows of floor 1");
  // a seat in another row of the same floor: out to the walkway, to the landing, down the stairs, along, and in
  b.apply({ at: "x", kind: "transfer", agent: "A001", swapped: "A056", from_group: "G01", to_group: "G12" }, true);
  b.tick(0.05);
  const lx = b.liftW + b.land / 2;
  assert.deepEqual(a.path.map((p) => [Math.round(p.x), Math.round(p.y)]).slice(0, 3), [[Math.round(a.x), Math.round(g1.rect.lane)], [Math.round(lx), Math.round(g1.rect.lane)], [Math.round(lx), Math.round(g12.rect.lane)]]);
  assert.equal(b.rides.length, 0, "the same floor needs no lift");
  let wentToLanding = false;
  for (let i = 0; i < 1200 && (a.walking || a.path.length || i < 5); i++) { b.tick(0.05); if (Math.abs(a.x - lx) < 1) wentToLanding = true; }
  assert.ok(wentToLanding, "it went by the landing's stairs");
  assert.equal(b.poseOf(a), "sit"); assert.deepEqual(b.deskOf("A001") && [Math.round(a.x), Math.round(a.y)], [Math.round(b.deskOf("A001").x), Math.round(b.deskOf("A001").y)], "and sits down at its new desk");
  // a seat on another floor: the lift, shared by people going the same way
  b.apply({ at: "y", kind: "transfer", agent: "A002", swapped: "A061", from_group: "G01", to_group: "G13" }, true);
  assert.equal(b.rides.length, 2, "one ride up, one ride down");
  assert.deepEqual([b.agents.get("A002").shirt, b.agents.get("A002").level], [1, 2], "its shirt keeps the old floor's colour until it arrives");
  assert.equal(b.poseOf(b.agents.get("A002")), "sit", "and it stays in its old chair until its turn for the lift");
  b.ride(["A003"], 1, 2); b.ride(["A004"], 1, 2);
  const up = b.rides.filter((r) => r.from === 1 && r.to === 2);
  assert.deepEqual([up.length, up[0].ids], [1, ["A002", "A003", "A004"]], "people going the same way before the lift is called share one ride");
  up[0].ids = ["A002"]; b.agents.get("A003").rides = 0; b.agents.get("A004").rides = 0;
  let inLift = false;
  for (let i = 0; i < 2400 && b.rides.length; i++) { b.tick(0.05); if (b.lift.riders.includes("A002")) inLift = true; }
  assert.ok(inLift && b.rides.length === 0, "it rode the lift");
  run(b, 20);
  const a2 = b.agents.get("A002");
  assert.deepEqual([a2.at, a2.shirt, b.poseOf(a2)], [2, null, "sit"], "and is at its desk on floor 2 in the new colour");
  b.destroy();
});

test("a re-checked pass is shown at the Audit desk, and the building carries on", () => {
  const b = new Building(canvasStub(1150), { animations: true });
  b.setData(firm(), null);
  b.apply({ at: "a", kind: "audit_recheck", group: "G13", floor: 2, ok: true, members: b.groups.get("G13").seats.filter(Boolean) }, true);
  assert.equal(b.auditing.who, "G13", "the Audit desk shows whose pass it is re-checking");
  assert.deepEqual(b.placeOf({ kind: "audit_recheck", group: "G13" }), { rect: b.byId.AUDIT }, "and the camera goes to the Audit desk");
  const one = b.groups.get("G13").seats.find(Boolean);
  b.apply({ at: "b", kind: "audit_recheck", agent: one, solo: true, floor: 2, ok: false, members: [one] }, true);
  assert.match(b.agents.get(one).chip.text, /still disagrees/);
  b.apply({ at: "c", kind: "solo_passed_no_seat", agent: one, floor: 2 }, true);
  assert.equal(b.agents.get(one).mood, "proud");
  b.destroy();
});

test("a level-up is the lift and a celebration on the new floor", () => {
  const b = new Building(canvasStub(1150), { animations: true });
  const f = firm();
  b.setData(f, null);
  b.apply({ at: "a", kind: "audit_start", group: "G13", floor: 2 }, true);
  assert.ok(b.flights.some((x) => Math.round(x.x1) === Math.round(b.port("audit").x)), "the papers go up to the Audit desk");
  b.apply({ at: "b", kind: "swapped_down", group: "G15", from: 3, to: 2, members: b.groups.get("G15").seats.filter(Boolean), room: 0 }, true);
  b.apply({ at: "c", kind: "level_up", group: "G13", from: 2, to: 3, members: b.groups.get("G13").seats.filter(Boolean), room: 0 }, true);
  assert.equal(b.rides.length, 2);
  assert.ok(b.texts.some((x) => x.text === "verified ✓"), "the Audit desk's verdict is said");
  let cheered = false, word = false, confetti = 0, sadWord = false;
  for (let i = 0; i < 3000 && (b.rides.length || i < 40); i++) {
    b.tick(0.05);
    if (b.poseOf(b.agents.get("A061")) === "cheer") cheered = true;
    if (b.texts.some((x) => x.text === "LEVEL UP")) word = true;
    if (b.poseOf(b.agents.get("A071")) === "cheer") sadWord = true;
    confetti = Math.max(confetti, b.effects.length);
  }
  for (let i = 0; i < 80; i++) { b.tick(0.05); if (b.poseOf(b.agents.get("A061")) === "cheer") cheered = true; }
  assert.ok(cheered && word && confetti > 0, "the group that moved up cheers, the words LEVEL UP rise and confetti falls");
  assert.equal(sadWord, false, "the group that was swapped down does not celebrate");
  run(b, 25);
  assert.deepEqual([b.agents.get("A061").at, b.poseOf(b.agents.get("A061")), b.agents.get("A071").at], [3, "sit", 2], "both groups end at their desks on their new floors");
  b.destroy();
});

test("the camera goes to what matters most, stays with a room while things keep happening in it, and never invents a caption", () => {
  const b = new Building(canvasStub(1150), { animations: true, describe: (e) => `said:${e.kind}:${e.agent || e.group || ""}` });
  const f = firm();
  b.setData({ ...f, paused: true, data_coverage: { symbols: { XAUUSD: { months: 0 } } } }, null);
  const stage = canvasStub(800);
  b.attachStage(stage);
  stage.getBoundingClientRect = () => ({ width: 800, height: b.sh, left: 0, top: 0 });
  assert.ok(b.sw === 800 && b.sh >= 230 && b.sh <= 450);
  // nothing happening: a walk round the building, saying what is true there
  b.tick(0.05);
  assert.equal(b.shot.real, false);
  const labels = b.tour().map((s) => s.label).join(" | ");
  assert.match(labels, /The Engine is waiting for price history/); assert.match(labels, /There is no price history yet, so nobody can work/); assert.match(labels, /Price history: none yet/);
  assert.doesNotMatch(labels, /pips so far/, "no star is claimed before there are results");
  b.setStars({ pips: "A007", win: null });
  assert.match(b.tour()[0].label, /Name7 Surname has the most pips so far/);
  // real events
  b.playReplay({ cycle: 2, start: startOf(f), events: [{ at: "z", kind: "data_update", months: 3 }] }, { speed: 2 });
  b.apply({ at: "1", kind: "tested", agent: "A001", pips: 10, win: 50 }, true);
  assert.deepEqual([b.shot.real, b.shot.pri, b.shot.label, b.shot.rect], [true, 1, "said:tested:A001", b.groups.get("G01").rect]);
  b.apply({ at: "2", kind: "tested", agent: "A002", pips: 20, win: 50 }, true);
  assert.equal(b.shot.label, "said:tested:A002", "more in the room on screen: the camera stays and the caption follows");
  b.apply({ at: "3", kind: "tested", agent: "A030", pips: 20, win: 50 }, true);
  assert.equal(b.shot.label, "said:tested:A002", "a small event elsewhere does not pull the camera away at once");
  b.apply({ at: "4", kind: "challenge_start", group: "G05", floor: 1, members: b.groups.get("G05").seats.filter(Boolean) }, true);
  assert.deepEqual([b.shot.pri, b.shot.label, b.shot.rect], [4, "said:challenge_start:G05", b.groups.get("G05").rect], "a challenge takes the picture");
  b.apply({ at: "5", kind: "level_up", agent: "A001", members: ["A001"], solo: true, group: "G13", from_group: "G01", from: 1, to: 2 }, true);
  assert.deepEqual([b.shot.pri, b.shot.follow, b.shot.ids], [5, "A001", ["A001"]], "a level-up takes it from anything and follows the one who moved");
  b.apply({ at: "6", kind: "tested", agent: "A040", pips: 5, win: 50 }, true);
  assert.equal(b.shot.pri, 5);
  const frame = b.frame(b.groups.get("G01").rect);
  assert.ok(frame.s >= 1.15 && frame.s <= 3.4 && frame.x > 0 && frame.y > 0);
  // the mode on the picture is the truth: a replay says REPLAY
  assert.equal(b.mode, "replay");
  assert.match(b.engineLines()[0][0], /^replay/);
  // a tap on the camera's picture opens what is under it
  let opened = null; b.onAgent = (id) => (opened = id);
  const d = b.deskOf("A020"); b.cam = { x: d.x, y: d.y, s: 2 };
  b.tapStage({ clientX: 400, clientY: (b.sh - 34) / 2 - 20 });
  assert.equal(opened, "A020");
  b.draw();
  b.destroy();
});

test("the sky over the building follows London's clock", () => {
  const night = skyAt(new Date("2026-11-14T01:16:00Z")), noon = skyAt(new Date("2026-06-21T12:00:00Z")), winterNoon = skyAt(new Date("2026-12-21T12:30:00Z")), dusk = skyAt(new Date("2026-11-14T16:20:00Z"));
  assert.deepEqual([night.day, night.light, night.night], [false, 0, 1]);
  assert.deepEqual([noon.day, noon.light], [true, 1]); assert.equal(winterNoon.day, true);
  assert.ok(dusk.light > 0 && dusk.light < 1, "between day and night at sunset");
  assert.ok(noon.set - noon.rise > 15.5 && winterNoon.set - winterNoon.rise < 8.5, "long days in June, short in December");
  assert.ok(Math.abs(noon.hour - 13) < 0.01, "12:00 UTC in June is 13:00 in London");
});

test("a meeting is not ended before the group has walked to its table and sat down", () => {
  const b = new Building(canvasStub(1150), { animations: true });
  const f = firm();
  b.setData(f, null);
  const members = ["A061", "A062", "A063", "A064", "A065"];
  b.playReplay({ cycle: 1, start: startOf(f), events: [{ at: "1", kind: "meeting_start", group: "G13", floor: 2, members }, { at: "2", kind: "meeting", group: "G13", strategy: "I1" }, { at: "3", kind: "tested", agent: "A001", pips: 5, win: 50 }] }, { speed: 4 });
  run(b, 0.6);
  assert.equal(b.queue.length, 2, "the meeting has been called");
  assert.ok(b.gathering && members.some((id) => b.agents.get(id).walking), "and the group is on its way");
  let satTogether = false, ticks = 0;
  while (b.queue.length === 2 && ticks++ < 4000) { b.tick(0.05); if (members.every((id) => b.poseOf(b.agents.get(id)) === "table")) satTogether = true; }
  assert.ok(satTogether, "everyone was at the table before the meeting was allowed to end");
  assert.equal(b.queue.length, 1, "then the meeting ends");
  assert.equal(b.agents.get("A063").away, null);
  // a meeting that cannot gather in time is not waited for for ever
  const c = new Building(canvasStub(1150), { animations: true });
  c.setData(f, null);
  c.gathering = { ids: ["A001"], until: c.clock + 1, sit: 0.5, at: null };
  c.agents.get("A001").walking = true;
  assert.equal(c.gathered(), false); c.clock += 2; assert.equal(c.gathered(), true);
  b.destroy(); c.destroy();
});

test("the camera can be held on one floor, and let go again", () => {
  const b = new Building(canvasStub(1150), { animations: true, describe: (e) => `said:${e.kind}` });
  const f = firm();
  b.setData(f, null);
  b.attachStage(canvasStub(800));
  b.hold("3");
  run(b, 3);
  assert.equal(b.shot.held, true); assert.match(b.shot.label, /^Floor 3 · Vice Presidents\./);
  const r3 = b.floorRect[3];
  assert.ok(Math.abs(b.cam.y - (r3.y + r3.h / 2)) < 12, "it looks at floor 3");
  b.apply({ at: "1", kind: "level_up", agent: "A001", members: ["A001"], solo: true, group: "G13", from_group: "G01", from: 1, to: 2 }, true);
  b.tick(0.05);
  assert.equal(b.shot.held, true, "a held camera stays, whatever happens elsewhere");
  assert.match(b.shot.label, /Just now: said:level_up/, "and still says what has just happened");
  b.hold("basement"); run(b, 3);
  assert.ok(b.cam.y + (b.sh - 34) / 2 / b.cam.s > b.H - 4, "the picture's bottom edge is the bottom of the basement"); assert.match(b.shot.label, /^The basement/);
  b.hold("top"); run(b, 3); assert.ok(b.cam.y - (b.sh - 34) / 2 / b.cam.s < 4, "the picture's top edge is the sky above the roof");
  b.follow(); b.tick(0.05);
  assert.ok(!b.shot.held, "let go: the camera follows the action again");
  b.hold("nowhere"); b.tick(0.05); assert.equal(b.manual, null, "an unknown place is not held");
  b.destroy();
});

test("the Records Room shows as labels over its six, who stay at their own desks", () => {
  const b = new Building(canvasStub(1150), { animations: true });
  b.setData(firm(), null);
  const six = ["A003", "A021", "A047", "A061", "A066", "A081"], seats = six.map((id) => ({ ...b.agents.get(id) }));
  b.apply({ at: "a", kind: "room_opened", members: six, pips: six.slice(0, 3), win: six.slice(3) }, true);
  assert.deepEqual(six.map((id) => b.agents.get(id).chip.text), ["Records Room · most pips", "Records Room · most pips", "Records Room · most pips", "Records Room · win rate", "Records Room · win rate", "Records Room · win rate"]);
  assert.match(b.banner.text, /^The Records Room opens/);
  six.forEach((id, k) => { const a = b.agents.get(id); assert.equal(a.group, seats[k].group, "nobody changes group"); assert.equal(a.away, seats[k].away); });
  assert.deepEqual(b.placeOf({ kind: "room_opened", members: six }).ids, six, "the camera goes to the room's people");
  assert.ok(b.placeOf({ kind: "room_session", members: six }).rect, "an event about the whole room still has somewhere to look");
  b.apply({ at: "b", kind: "room_session", members: six, tested: 281, mixes: 25, leader: "A021", made: 2701.6 }, true);
  assert.equal(b.banner.text, "The Records Room: the Engine tested 281 strategies for its six");
  b.apply({ at: "c", kind: "room_leader", agent: "A021", idea: "I15182", made: 2701.6 }, true);
  assert.equal(b.agents.get("A021").chip.text, "leads the growth challenge");
  assert.equal(b.agents.get("A021").mood, "proud");
  b.apply({ at: "d", kind: "ceo_reward", agent: "A021", idea: "I15182", made: 2701.6 }, true);
  assert.equal(b.agents.get("A021").chip.text, "★ rewarded by the CEO");
  assert.match(b.banner.text, /^The CEO rewards Name21 Surname$/);
  // a firm file from before the room had a place of its own: its meeting still shows, as labels at the desks
  assert.equal(b.byId.ROOM, undefined);
  for (const kind of ["room_entry", "room_put_forward", "room_meeting_start", "room_meeting"]) b.apply({ at: "e", kind, agent: "A003", members: six, idea: "I1", strategy: "I2" }, true);
  assert.equal(b.agents.get("A003").chip.text, "joint strategy agreed");
  assert.equal(b.agents.get("A003").away, null);
  b.apply({ at: "e2", kind: "room_meeting", members: six, decision: "keep_separate" }, true);
  assert.equal(b.agents.get("A003").chip.text, "meeting over", "no joint strategy is claimed when the room kept its ideas apart");
  b.apply({ at: "f", kind: "room_opened", members: six, pips: six.slice(0, 3) }, false);
  assert.equal(b.agents.get("A081").group, seats[5].group, "applied without animation, it moves nobody either");
});

for (const width of [1150, 762, 362]) {
  test(`the Records Room is a room on the top floor with a table for its six (canvas ${width}px wide)`, () => {
    const b = new Building(canvasStub(width), { animations: false });
    const f = firm(); f.room = { open: true, leader: { name: "Name21 Surname", made_unseen: 3345.68 } };
    b.setData(f, null);
    const room = b.byId.ROOM, audit = b.byId.AUDIT, ceo = b.byId.CEO;
    assert.ok(room && room.kind === "records" && room.floor === 6);
    assert.ok(audit.x + audit.w <= room.x && room.x + room.w <= ceo.x && ceo.x + ceo.w <= b.W, "the Audit desk, the Records Room and the CEO's office stand side by side");
    assert.ok(audit.w >= 80 && room.w >= 110 && ceo.w >= 90, `each of the three is wide enough to read (${Math.round(audit.w)}, ${Math.round(room.w)}, ${Math.round(ceo.w)})`);
    assert.equal(room.y, audit.y); assert.equal(room.h, ceo.h);
    const t = b.tableOf(room), spots = [0, 1, 2, 3, 4, 5].map((i) => b.spot(room, i));
    assert.equal(t.per, 6, "six chairs");
    for (const sp of spots) { assert.ok(sp.table && sp.floor === 6 && sp.x > room.x + 8 && sp.x < room.x + room.w - (t.board ? t.board : 8) && sp.y > room.y + 20 && sp.y < room.y + room.h, "every chair is inside the room, clear of its board"); }
    assert.ok(spots.every((sp, i) => !i || sp.x - spots[i - 1].x >= 11.9), "nobody sits on top of anybody");
    const board = b.roomBoard();
    if (t.board) assert.ok(board.x >= spots[5].x + 8 && board.x + board.w <= room.x + room.w - 2, "the board hangs beside the table, inside the room");
    assert.equal(b.hit(room.x + room.w / 2, room.y + 6).room.id, "ROOM", "a tap on the room opens it");
    assert.match(b.heldPlace.call({ ...b, manual: "room", byId: b.byId, liftW: b.liftW }).name, /^The Records Room$/);
    const stop = b.tour().find((x) => x.rect === room);
    assert.equal(stop.label, "The Records Room: Name21 Surname leads the growth challenge.");
    // no room in the firm's file: the top floor is as it was
    const plain = new Building(canvasStub(width), { animations: false });
    plain.setData(firm(), null);
    assert.equal(plain.byId.ROOM, undefined); assert.ok(plain.byId.CEO.w > ceo.w);
    b.destroy(); plain.destroy();
  });
}

test("a session of the Records Room: its six think alone at their desks, meet at the room's table, vote, and go back", () => {
  const b = new Building(canvasStub(1150), { animations: true });
  const f = firm(); f.room = { open: true };
  b.setData(f, null);
  const six = ["A003", "A021", "A047", "A061", "A066", "A081"], room = b.byId.ROOM;      // floors 1, 1, 1, 2, 2, 4
  const at = (id) => b.agents.get(id);
  const inRoom = (a) => a.x > room.x && a.x < room.x + room.w && a.y > room.y && a.y < room.y + room.h;
  const events = [
    { at: "t0", kind: "room_thinking", members: six, session: 1 },
    { at: "t1", kind: "thinking", agent: "A003" }, { at: "t1", kind: "thinking", agent: "A061" },
    { at: "t2", kind: "looked", agent: "A003", tool: "growth_check", what: "the growth challenge for I00007" },
    { at: "t3", kind: "tested", agent: "A003", idea: "I00101", pips: 812.4, win: 51.2 },
    { at: "t4", kind: "room_brought", agent: "A003", idea: "I00101", pips: 812.4, win: 51.2 },
    { at: "t4", kind: "room_brought", agent: "A061", idea: null },
    { at: "t5", kind: "room_meeting_start", members: six, session: 1, brought: { A003: { idea: "I00101", pips: 812.4, win_rate_pct: 51.2 }, A061: null } },
    { at: "t6", kind: "room_voice", agent: "A021", vote: "merge", say: "I would take its exit.", take_from: ["A003"] },
    { at: "t6", kind: "room_voice", agent: "A003", vote: "keep_separate", say: "They do not fit.", take_from: [] },
    { at: "t6", kind: "room_voice_missed", agent: "A081", error: "timed out" },
    { at: "t7", kind: "room_decision", members: six, decision: "merge", merge: 4, keep: 1, silent: 1 },
    { at: "t7", kind: "room_sent", members: six, agent: "A021", idea: "I00007", votes: 3, of: 5, pips: 9000, win: 45 },
    { at: "t8", kind: "tested", agent: "A003", idea: "I00102", pips: 1500.5, win: 56, by: "records room meeting", room: true },
    { at: "t9", kind: "room_meeting", members: six, ai: true, decision: "merge", merge: 4, keep: 1, strategy: "I00102", pips: 1500.5, win: 56 },
    { at: "t10", kind: "room_session", members: six, tested: 60, mixes: 0, leader: "A021", made: 3345.68 },
    { at: "t11", kind: "room_carried", idea: "I00007", agent: "A021", agents: 61, kept: 2, new: 2, done: true, members: ["A010", "A050"] },
  ];
  let ended = false;
  const seen = [];
  b.playReplay({ cycle: 3, title: "the Records Room's session 1", start: startOf(f), events }, { speed: 4, onProgress: (i, n, e) => seen.push([e.kind, e.agent || "", six.map((id) => (at(id).atTable && inRoom(at(id)) ? 1 : 0)).join("")]), onEnd: () => (ended = true) });
  assert.equal(b.banner.text, "Replay of the Records Room's session 1: 17 real events");
  for (let i = 0; i < 3000 && !ended; i++) b.tick(0.05);
  assert.ok(ended, "the replay plays to its end");
  const kinds = seen.map((x) => x[0]);
  assert.deepEqual(kinds, events.map((e) => e.kind), "every real event is shown, in order");
  // alone first: while they think and bring their work, nobody is in the room
  for (const [kind, , seated] of seen.slice(0, kinds.indexOf("room_meeting_start") + 1)) assert.equal(seated, "000000", `nobody is at the table at ${kind}`);
  // together: the first voice is only heard once all six have come up by lift and sat down
  assert.equal(seen[kinds.indexOf("room_voice")][2], "111111", "the six had all taken the lift to the top floor and sat at the room's table before anyone spoke");
  assert.equal(seen[kinds.indexOf("room_decision")][2], "111111");
  assert.equal(b.mode, "idle");
  for (const id of six) { const a = at(id), h = b.home(id); assert.equal(a.away, null); assert.ok(Math.abs(a.x - h.x) < 1 && Math.abs(a.y - h.y) < 1, `${id} is back at its own desk`); assert.equal(b.poseOf(a), "sit"); }
  b.destroy();

  // step by step, for what is shown at each event
  const c = new Building(canvasStub(1150), { animations: true });
  c.setData(f, null);
  const who = (id) => c.agents.get(id);
  c.apply(events[0], true);
  assert.deepEqual(six.map((id) => who(id).chip.text), six.map(() => "thinking alone")); assert.ok(six.every((id) => who(id).status === "thinking" && !who(id).away));
  assert.match(c.banner.text, /each alone at its own desk$/);
  c.apply(events[5], true); c.apply(events[6], true);
  assert.equal(who("A003").chip.text, "brings I00101 +812p 51%"); assert.equal(who("A061").chip.text, "brings nothing new");
  c.apply(events[7], true);
  assert.ok(six.every((id) => who(id).away.room === c.byId.ROOM && who(id).away.sticky && who(id).status === "in_meeting"), "the meeting sends all six to the room");
  assert.deepEqual(c.placeOf(events[7]).ids, six); assert.ok(c.placeOf(events[8]).rect.y < c.byId.ROOM.y && c.placeOf(events[11]).rect.w > c.byId.ROOM.w, "the camera frames the room for the meeting");
  c.apply(events[8], true); c.apply(events[9], true); c.apply(events[10], true);
  assert.equal(who("A021").chip.text, "Name21: make it one"); assert.equal(who("A003").chip.text, "Name3: keep them apart"); assert.equal(who("A081").chip.text, "did not speak");
  c.apply(events[11], true);
  assert.ok(c.texts.some((x) => x.text === "ONE JOINT STRATEGY · 4 to 1" && x.big)); assert.equal(c.banner.text, "The Records Room has voted: 4 of 5 want one joint strategy");
  // one strategy goes to the whole company: it is said at the room, and a sheet flies from the room to the desks
  const before = c.flights.length;
  c.apply(events[12], true);
  assert.ok(c.texts.some((x) => x.text === "TO THE WHOLE COMPANY · I00007" && x.big)); assert.equal(who("A021").chip.text, "its strategy goes to everyone");
  assert.equal(c.banner.text, "The Records Room sends I00007 to the whole company: 3 of 5 named it, and it held on the months nobody has seen");
  assert.ok(c.flights.length >= before + 40, "sheets leave the room for the desks all over the building"); assert.ok(c.placeOf(events[12]).rect.w > c.byId.ROOM.w, "the camera is on the room");
  c.flights = [];
  const flights = c.flights.length;
  c.apply(events[13], true);
  const board = c.roomBoard();
  assert.ok(c.flights.length > flights && c.flights.slice(flights).every((fl) => Math.abs(fl.x0 - (board.x + board.w / 2)) < 1 || Math.abs(fl.x1 - (board.x + board.w / 2)) < 1), "what the meeting had tested leaves from the room's board and comes back to it");
  assert.equal(who("A003").status, "in_meeting", "the member it is filed under stays at the table");
  c.apply(events[14], true);
  assert.ok(six.every((id) => who(id).away === null && who(id).status === "idle")); assert.ok(c.texts.some((x) => x.text === "joint strategy I00102"));
  c.apply({ at: "k", kind: "room_decision", members: six, decision: "keep_separate", merge: 2, keep: 4, silent: 0 }, true);
  assert.ok(c.texts.some((x) => x.text === "KEPT APART · 4 to 2")); assert.equal(c.banner.text, "The Records Room has voted: 4 of 6 want to keep their ideas apart");
  c.apply({ at: "n", kind: "room_decision", members: six, decision: "no_quorum", merge: 1, keep: 0, silent: 5 }, true);
  assert.ok(c.texts.some((x) => x.text === "NO DECISION"));
  c.apply(events[16], true);
  assert.equal(who("A010").chip.text, "its best is better for it"); assert.equal(who("A050").chip.text, "its best is better for it");
  assert.equal(c.banner.text, "The Engine tried I00007 on 61 agents' own best ideas: 2 are better for it and held too");
  c.apply({ at: "x", kind: "room_not_sent", members: six, note: "None of the six named a strategy to send." }, true);
  assert.match(c.banner.text, /^The Records Room sends nothing to the company this time/);
  c.destroy();
});

test("while a session of the Records Room runs, the live file puts its six at the room's table for the meeting", () => {
  const b = new Building(canvasStub(1150), { animations: true });
  const f = firm(); f.room = { open: true };
  b.setData(f, null);
  const six = ["A003", "A021", "A047", "A061", "A066", "A081"], now = new Date().toISOString();
  const agents = (status, detail) => Object.fromEntries(Object.keys(f.agents).map((id) => [id, six.includes(id) ? { status, detail, floor: f.agents[id].floor } : { status: "idle", detail: "" }]));
  b.applyLive({ mode: "firm", cycle: 3, stage: "The Records Room: each of the six is thinking on its own", updated_at: now, agents: agents("thinking", ""), events: [], room: { session: 1, phase: "thinking" } });
  assert.equal(b.mode, "live"); assert.ok(six.every((id) => b.agents.get(id).status === "thinking" && !b.agents.get(id).away), "thinking: each at its own desk");
  b.applyLive({ mode: "firm", cycle: 3, stage: "The Records Room: the six are at one table", updated_at: now, agents: agents("in_meeting", "the Records Room's meeting"), events: [], room: { session: 1, phase: "meeting" } });
  assert.ok(six.every((id) => b.agents.get(id).away.room === b.byId.ROOM), "the meeting: in the Records Room, not in a floor's discussion room");
  run(b, 60);
  assert.ok(six.every((id) => b.agents.get(id).atTable && b.agents.get(id).at === 6), "they have come up by lift and sat down");
  b.applyLive({ mode: "firm", cycle: 3, stage: "Cycle finished", updated_at: now, agents: agents("idle", ""), events: [] });
  assert.equal(b.mode, "idle"); assert.ok(six.every((id) => b.agents.get(id).away === null));
  b.destroy();
});
