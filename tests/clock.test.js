// Market clock: gold's Sunday reopen in UK time across the clock-change mismatch weeks, Friday close, forex vs gold.
import test from "node:test";
import assert from "node:assert/strict";
import { MarketHours, ukTime, sessionStatus } from "../js/clock.js";

const gold = MarketHours.defaultFor("XAUUSD");
const fx = MarketHours.defaultFor("GBPUSD");
const uk = (d) => ukTime(d, true);

test("Sunday reopen: 23:00 UK when both clocks agree", () => {
  const a = gold.nextChange(new Date("2026-04-05T12:00:00Z"));
  assert.equal(a.opens, true); assert.match(uk(a.at), /Sun 05 Apr, 23:00|Sun, 05 Apr, 23:00/);
  const b = gold.nextChange(new Date("2026-11-08T12:00:00Z"));
  assert.match(uk(b.at), /08 Nov, 23:00/);
});

test("Sunday reopen: 22:00 UK in the mismatch weeks", () => {
  const a = gold.nextChange(new Date("2026-03-15T12:00:00Z"));
  assert.match(uk(a.at), /15 Mar, 22:00/);
  const b = gold.nextChange(new Date("2026-10-25T12:00:00Z"));
  assert.match(uk(b.at), /25 Oct, 22:00/);
});

test("daily break and Friday close", () => {
  assert.equal(gold.isOpen(new Date("2026-11-11T22:30:00Z")), false);   // 17:30 EST
  assert.equal(gold.isOpen(new Date("2026-11-11T23:00:00Z")), true);    // 18:00 EST
  assert.equal(gold.isOpen(new Date("2026-11-13T21:59:00Z")), true);
  assert.equal(gold.isOpen(new Date("2026-11-13T22:00:00Z")), false);
  const c = gold.nextChange(new Date("2026-11-13T20:00:00Z"));
  assert.equal(c.opens, false); assert.match(uk(c.at), /13 Nov, 22:00/);
});

test("forex opens an hour before gold on Sunday", () => {
  const t = new Date("2026-11-08T22:30:00Z");
  assert.equal(fx.isOpen(t), true); assert.equal(gold.isOpen(t), false);
});

test("holiday closure window closes only that session", () => {
  const h = new MarketHours("XAUUSD", undefined, [{ kind: "holiday", session_start_utc: "2026-11-24T23:00:00Z", session_end_utc: "2026-11-25T22:00:00Z" }]);
  assert.equal(h.isOpen(new Date("2026-11-25T15:00:00Z")), false);
  assert.equal(h.isOpen(new Date("2026-11-25T23:30:00Z")), true);
});

test("sessions in their own time zones", () => {
  const s = sessionStatus(new Date("2026-11-10T14:00:00Z"));
  assert.equal(s.London.open, true); assert.equal(s["New York"].open, true); assert.equal(s.Tokyo.open, false);
});
