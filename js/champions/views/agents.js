// The five agents: what each one's record made, what it does, and whether any code was changed.
import { h, mark, more } from "../ui.js";
import { agentCards, agentsIntro } from "../logic/agents.js";
import { pageHead, bullets, dataTable, unreadNote } from "./parts.js";

export const needs = ["agents", "apart"];

const figures = (label, f) => h("div", { class: "fig" }, h("p", { class: "fig-label" }, label),
  f ? h("p", { class: "fig-main" }, f.pips, h("span", {}, " pips")) : h("p", { class: "fig-main" }, "No figures"),
  f ? h("p", { class: "cap" }, `${f.wins} wins, ${f.trades} trades`) : null);

export function render({ out, failed }) {
  if (failed.agents) return h("div", {}, pageHead("The five agents", null), h("div", { class: "wrap" }, unreadNote("The agents' check file", failed.agents)));
  const { champions, study } = agentCards(out.agents, failed.apart ? null : out.apart);
  return h("div", {},
    pageHead(champions.length === 5 ? "The five agents." : "The agents.", agentsIntro(out.agents)),
    failed.apart ? h("div", { class: "wrap" }, unreadNote("Step 2's file", failed.apart)) : null,
    h("section", { class: "wrap stack" }, ...champions.map((a) => h("article", { class: "tile agent" },
      h("div", { class: "agent-top" }, h("div", {}, h("h2", { class: "tile-title" }, a.name), h("p", { class: "cap" }, `${a.knownFor}. Record ${a.record}.`)),
        h("p", { class: "same" }, mark(a.same), h("span", {}, a.sameWords))),
      h("div", { class: "figs" }, figures("Practice months", a.practice), figures("Unseen months", a.unseen)),
      h("h3", { class: "tile-sub" }, "What it does"), bullets(a.does),
      h("p", { class: "cap" }, a.code),
      a.bare ? h("p", { class: "cap" }, a.bare) : null,
      a.changes.length ? more("One rule at a time", h("div", {}, h("p", { class: "cap" }, "The record with one rule taken out or changed, on the practice months."),
        dataTable(["Change", "Trades", "Pips", "Wins"], a.changes.map((c) => [c.what, c.trades || "", c.pips || "", c.wins || ""]), { numeric: [1, 2, 3] }))) : null))),
    study.length ? h("section", { class: "wrap" }, h("div", { class: "tile quiet" }, h("h2", { class: "tile-title" }, "Copied for study only"),
      h("ul", { class: "plain" }, ...study.map((s) => h("li", {}, h("b", {}, s.name), ` (${s.knownFor}, record ${s.record}). ${s.note}`))))) : null);
}
