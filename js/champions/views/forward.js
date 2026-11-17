// The forward test: its cards, one at a time. For each card: where it stands, its frozen versions agent by agent,
// every trade, and the pass marks. Card 1 (16 Nov 2026) holds the ten versions of Step 3; card 2 (17 Nov 2026) the
// five finished versions of the rounds that went on.
import { h, cx } from "../ui.js";
import { forwardLine, forwardAgents, passMarks, forwardNotes, cardTab, cardLength, day } from "../logic/forward.js";
import { when } from "../logic/check.js";
import { storedPrices } from "../logic/checks.js";
import { monthEnds } from "../logic/overview.js";
import { tradeRows, tradesSummary } from "../logic/trades.js";
import { pageHead, agentTile, bullets, dataTable, todoBox, unreadNote } from "./parts.js";

export const needs = ["score", "card", "trades", "score2", "card2", "trades2", "coverage", "cloud"];
const CARDS = [{ number: 1, score: "score", card: "card", trades: "trades" }, { number: 2, score: "score2", card: "card2", trades: "trades2" }];
let chosen = null;                                               // the card last opened here, while the site is open (nothing is saved)

function tradesFold(trades) {
  const rows = tradeRows(trades);
  if (!rows.length) return null;
  return ["Its trades", h("div", {}, h("p", { class: "cap" }, `${tradesSummary(trades)} Results are the Engine's standard account: £10,000 at 1% a trade. An open trade is counted at the last price.`),
    dataTable(["Entered", "Chart", "Side", "Ended", "How", "Result", "£"], rows.map((r) => [r.entered, r.chart, r.side, r.left, r.how, { text: r.r, sign: r.sign }, { text: r.money, sign: r.sign }]), { numeric: [5, 6] }))];
}

/** One card: its headline, its dates, its versions, its pass marks and its small print. */
function cardPanel(c, { out, failed, now }) {
  if (failed[c.score]) return h("div", {}, pageHead("The forward test", null), h("div", { class: "wrap" }, unreadNote(`The score of card ${c.number}`, failed[c.score])));
  const score = out[c.score], card = failed[c.card] ? null : out[c.card];
  const line = forwardLine(score, card, storedPrices(out, failed), now);
  const agents = forwardAgents(score, card);
  const marks = passMarks(card);
  const trades = !failed[c.trades] && out[c.trades] && out[c.trades].versions ? out[c.trades].versions : {};
  const start = (score && score.start) || (card && card.start);
  const facts = card ? [
    ["Starts", start ? when(start) : "Not known"],
    ["Length", cardLength(card, monthEnds(card))],
    ["Judged", `By the first score on or after ${day(card.judged_on_the_first_score_at_or_after)}`],
  ] : [];
  return h("div", {},
    pageHead(`${line.title}.`, line.detail, line.todo ? todoBox(line.todo) : null),
    facts.length ? h("section", { class: "wrap" }, h("dl", { class: "facts" }, ...facts.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v))))) : null,
    card && card.why ? h("section", { class: "wrap" }, h("p", { class: "cap why" }, `Why this card: ${card.why}`)) : null,
    failed[c.card] ? h("div", { class: "wrap" }, unreadNote("The frozen card", failed[c.card])) : null,
    failed[c.trades] ? h("div", { class: "wrap" }, unreadNote("The list of trades", failed[c.trades])) : null,
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

export function render(page) {
  const { out, failed, now } = page;
  // card 1 is always shown; a later card once anything of it is on file (or could not be read)
  const cards = CARDS.filter((c) => c.number === 1 || out[c.card] || out[c.score] || failed[c.card] || failed[c.score]);
  if (cards.length === 1) return cardPanel(cards[0], page);
  const open = cards.some((c) => c.number === chosen) ? chosen : cards[cards.length - 1].number;     // the newest card first
  const panels = cards.map((c) => { const el = cardPanel(c, page); el.setAttribute("role", "tabpanel"); el.setAttribute("aria-label", `Card ${c.number}`); return el; });
  const tabs = cards.map((c) => {
    const t = cardTab(c.number, failed[c.card] ? null : out[c.card], failed[c.score] ? null : out[c.score], now);
    return h("button", { type: "button", class: "card-tab", role: "tab" }, h("b", {}, t.label), t.caption ? h("span", {}, t.caption) : null);
  });
  const show = (number) => {
    chosen = number;
    cards.forEach((c, i) => {
      panels[i].hidden = c.number !== number;
      tabs[i].setAttribute("aria-selected", c.number === number ? "true" : "false");
    });
  };
  tabs.forEach((t, i) => t.addEventListener("click", () => show(cards[i].number)));
  show(open);
  const root = h("div", {}, h("div", { class: "wrap" }, h("div", { class: "card-tabs", role: "tablist", "aria-label": "The forward test's cards" }, ...tabs)), ...panels);
  root.classList.add(cx("forward"));
  return root;
}
