// The building's logic without a browser: seating, taps and the replay of real events. The canvas is a stub.
import test from "node:test";
import assert from "node:assert/strict";

const noop = () => {};
const ctx = new Proxy({}, { get: (t, k) => (k === "measureText" ? (s) => ({ width: String(s).length * 5.5 }) : typeof k === "string" && /^[a-z]/.test(k) ? (t[k] ?? noop) : undefined), set: () => true });
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
