// The trade list's words (js/champions/logic/trades.js). The trades here are made up, in the shape the scorer saves them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shortTime, wayOut, tradeRows, tradesSummary } from "../js/champions/logic/trades.js";

const T = (over) => ({ id: "XAUUSD-30-x", chart: 30, side: "LONG", in: "2026-11-17T09:00:00Z", out: "2026-11-17T12:31:00Z", r: 1.2082, pips: 371.5, gbp: 118.49, how: "TP3", ...over });

test("a trade's moment is short and in GMT", () => {
  assert.equal(shortTime("2026-11-17T09:00:00Z"), "17 Nov, 09:00 GMT");
  assert.equal(shortTime("2026-12-01T00:05:00Z"), "1 Dec, 00:05 GMT");
  assert.equal(shortTime(null), "");
});

test("how a trade ended, in plain words, from the Engine's own reason", () => {
  assert.equal(wayOut(T({ how: "TP3" })), "Target 3");
  assert.equal(wayOut(T({ how: "TP1" })), "Target 1");
  assert.equal(wayOut(T({ how: "SL", r: -1 })), "Stop");
  assert.equal(wayOut(T({ how: "SL", r: 0.69 })), "Trailing stop", "a stop that closed in profit had been trailed");
  assert.equal(wayOut(T({ how: "OPEN", r: -0.37 })), "Closed by the indicator", "it has an exit: the indicator's own close or the opposite signal");
  assert.equal(wayOut(T({ how: "OPEN", out: null })), "Still open");
  assert.equal(wayOut(T({ how: "SL+TP1", r: 0.1 })), "Trailing stop and target 1");
  assert.equal(wayOut(T({ how: "OPEN+TP1", out: null })), "Still open and target 1");
  assert.equal(wayOut(T({ how: "", out: null })), "Still open");
});

test("the rows are newest first, keep their sign, and an open trade says so", () => {
  const rows = tradeRows([T({}), T({ id: "b", in: "2026-11-18T10:15:00Z", out: null, how: "OPEN", r: -0.2, gbp: -20.5, side: "SHORT", chart: 180 }), T({ id: "c", in: "2026-11-16T23:30:00Z", r: 0, gbp: 0, how: "OPEN" })]);
  assert.deepEqual(rows.map((r) => r.id), ["b", "XAUUSD-30-x", "c"]);
  assert.deepEqual(rows[0], { id: "b", entered: "18 Nov, 10:15 GMT", chart: "3H", side: "Sell", left: "Open", how: "Still open", open: true, r: "−0.20R", money: "−£21", sign: "down" });
  assert.deepEqual(rows[1], { id: "XAUUSD-30-x", entered: "17 Nov, 09:00 GMT", chart: "30M", side: "Buy", left: "17 Nov, 12:31 GMT", how: "Target 3", open: false, r: "+1.21R", money: "+£118", sign: "up" });
  assert.equal(rows[2].r, "0.00R");
  assert.equal(rows[2].sign, "flat");
  assert.deepEqual(tradeRows(null), []);
  assert.equal(tradeRows([T({ chart: 7 })])[0].chart, "7M", "a chart the list does not know is shown in minutes, not dropped");
});

test("the summary only counts what is in the rows", () => {
  assert.equal(tradesSummary([]), "No trades yet.");
  assert.equal(tradesSummary(undefined), "No trades yet.");
  assert.equal(tradesSummary([T({})]), "1 trade: 1 won, 0 lost.");
  assert.equal(tradesSummary([T({}), T({ r: -1 }), T({ r: -0.5 }), T({ r: 0 }), T({ out: null, r: 0.4 })]), "5 trades: 1 won, 2 lost, 1 level, 1 still open.");
});
