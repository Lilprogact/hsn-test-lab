// The forward test: where it stands, the ten frozen versions agent by agent, every trade, and the pass marks.
import { h } from "../ui.js";
import { forwardLine, forwardAgents, passMarks, forwardNotes, day } from "../logic/forward.js";
import { when } from "../logic/check.js";
import { storedPrices } from "../logic/checks.js";
import { monthEnds } from "../logic/overview.js";
import { tradeRows, tradesSummary } from "../logic/trades.js";
import { pageHead, agentTile, bullets, dataTable, todoBox, unreadNote } from "./parts.js";

export const needs = ["score", "card", "trades", "coverage", "cloud"];

function tradesFold(trades) {
  const rows = tradeRows(trades);
  if (!rows.length) return null;
  return ["Its trades", h("div", {}, h("p", { class: "cap" }, `${tradesSummary(trades)} Results are the Engine's standard account: £10,000 at 1% a trade. An open trade is counted at the last price.`),
    dataTable(["Entered", "Chart", "Side", "Ended", "How", "Result", "£"], rows.map((r) => [r.entered, r.chart, r.side, r.left, r.how, { text: r.r, sign: r.sign }, { text: r.money, sign: r.sign }]), { numeric: [5, 6] }))];
}

export function render({ out, failed, now }) {
  if (failed.score) return h("div", {}, pageHead("The forward test", null), h("div", { class: "wrap" }, unreadNote("The forward test's score", failed.score)));
  const score = out.score, card = failed.card ? null : out.card;
  const line = forwardLine(score, card, storedPrices(out, failed), now);
  const agents = forwardAgents(score, card);
  const marks = passMarks(card);
  const trades = !failed.trades && out.trades && out.trades.versions ? out.trades.versions : {};
  const start = (score && score.start) || (card && card.start);
  const facts = card ? [
    ["Starts", start ? when(start) : "Not known"],
    ["Length", `Twelve weeks, in three months ending ${monthEnds(card)}`],
    ["Judged", `By the first score on or after ${day(card.judged_on_the_first_score_at_or_after)}`],
  ] : [];

  return h("div", {},
    pageHead(`${line.title}.`, line.detail, line.todo ? todoBox(line.todo) : null),
    facts.length ? h("section", { class: "wrap" }, h("dl", { class: "facts" }, ...facts.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v))))) : null,
    failed.card ? h("div", { class: "wrap" }, unreadNote("The frozen card", failed.card)) : null,
    failed.trades ? h("div", { class: "wrap" }, unreadNote("The list of trades", failed.trades)) : null,
    agents.length ? h("section", { class: "wrap stack" }, ...agents.map((a) => agentTile(a.name, a.versions.map((v) => ({
      kind: v.kind, lines: [v.figures], why: v.why, chip: v.chip,
      folds: [v.rules.length ? ["Its rules", h("div", {}, bullets(v.rules), h("p", { class: "cap" }, `Money plan: ${v.plan}`), v.before ? h("p", { class: "cap" }, v.before) : null)] : null, tradesFold(trades[v.id])],
    }))))) : null,
    marks ? h("section", { class: "wrap" }, h("div", { class: "tile dark marks" },
      h("h2", { class: "tile-title" }, "To pass, a version needs all three."),
      h("ol", { class: "marks-list" }, ...marks.marks.map((m) => h("li", {}, m))),
      h("p", { class: "tile-foot" }, `${marks.judged} ${marks.rule}`), marks.pass ? h("p", { class: "tile-foot" }, marks.pass) : null)) : null,
    h("section", { class: "wrap small-print" }, ...forwardNotes(score, card).map((n) => h("p", {}, n))));
}
