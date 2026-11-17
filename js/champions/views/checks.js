// Champions, the Connection check page (Hassan's Step 1): a tick or a cross for the login, the prices, the indicator,
// the agents and the forward test.
// A cross says the one thing to do. This page only reads: it starts nothing on GitHub.
import { h, mark } from "../ui.js";
import { verdict, demoFacts, when } from "../logic/check.js";
import { checkLines } from "../logic/checks.js";
import { pageHead } from "./parts.js";

export const needs = ["login", "cloud", "coverage", "match", "agents", "probe", "score", "card", "score2", "card2"];

const BUTTONS = { setup: "Open One-time setup", settings: "Open Settings" };      // the page of this site that puts a cross right

function agentsList(line) {
  if (!line.rows || !line.rows.length) return null;
  return h("div", {}, h("ul", { class: "mini" }, ...line.rows.map((r) => h("li", {}, mark(r.ok),
    h("span", { class: "mini-text" }, h("b", {}, r.name), h("span", { class: "cap" }, `${r.record}: ${r.figures}`)),
    h("span", { class: `mini-same ${r.ok ? "ok" : "no"}` }, !r.copied ? "not copied" : r.same ? "same" : "different")))),
    line.study && line.study.length ? h("p", { class: "cap" }, `Also copied, for study only: ${line.study.map((s) => s.name).join(", ")}.`) : null);
}

export function render({ out, failed, now }) {
  const lines = checkLines(out, failed, now);
  const v = verdict(lines);
  const facts = failed.probe ? null : demoFacts(out.probe);
  const row = (line) => {
    const button = line.button && BUTTONS[line.button] ? h("button", { type: "button", class: "button small", "data-cx-view": line.button }, BUTTONS[line.button]) : null;
    const todo = line.ok || !line.todo ? null : line.sameFixAsAbove ? h("p", { class: "cap" }, "The same fix as above puts this right too.") : h("div", { class: "todo" }, h("p", {}, h("b", {}, "What to do: "), line.todo), button);
    return h("li", { class: "row" }, mark(line.ok, line.unread), h("div", { class: "row-text" }, h("p", { class: "row-title" }, line.title), line.detail ? h("p", { class: "cap" }, line.detail) : null, agentsList(line), todo));
  };
  return h("div", {},
    pageHead(v.text, `Read from GitHub on ${when(new Date(now).toISOString())}.`),
    h("section", { class: "wrap" }, h("ul", { class: "group" }, ...lines.map(row))),
    facts ? h("section", { class: "wrap" }, h("div", { class: "tile quiet" }, h("h2", { class: "tile-title" }, "What the FOREX.com demo account itself reports"),
      h("ul", { class: "bullets" }, ...facts.lines.map((t) => h("li", {}, t))), h("p", { class: "cap" }, `Read from the account on ${facts.at}. No order was placed.`))) : null,
    h("section", { class: "wrap small-print" }, h("p", {}, "A tick for the login and the prices means the weekly download ran in the last 8 days.")));
}
