// Champions, the first page: where the forward test stands in one sentence, then four tiles that lead to the rest.
import { h } from "../ui.js";
import { hero, weeksTrack, agentsTile } from "../logic/overview.js";
import { checkLines, checksSummary, storedPrices } from "../logic/checks.js";
import { challengeHeadline } from "../logic/challenge.js";
import { todoBox } from "./parts.js";

export const needs = ["login", "cloud", "coverage", "match", "agents", "score", "card", "finished"];

export function render({ out, failed, now }) {
  const card = failed.card ? null : out.card;
  const top = failed.score
    ? { ok: false, title: "The score could not be read.", sub: failed.score.message, todo: null }
    : hero(out.score, card, storedPrices(out, failed), now);
  const track = weeksTrack(failed.score ? null : out.score, card);
  const agents = agentsTile(failed.score ? null : out.score, failed.agents ? null : out.agents);
  const challenge = failed.finished ? { title: "The challenge", sub: "Its result file could not be read." } : challengeHeadline(out.finished);
  const lines = checkLines(out, failed, now);
  const checks = checksSummary(lines);
  const rounds = !failed.finished && out.finished ? Number(out.finished.rounds_played || 0) : null;

  return h("div", {},
    h("section", { class: "hero wrap center" },
      h("h1", { class: "hero-title" }, top.title),
      h("p", { class: "sub" }, top.sub),
      top.todo ? todoBox(top.todo) : null,
      h("p", { class: "hero-note" }, "Ten frozen versions of five agents, followed on new FOREX.com gold prices. Paper only: no order is sent to any account."),
      h("div", { class: "actions" }, h("a", { class: "button", href: "#champions", "data-cx-go": "forward" }, "Open the forward test"), h("a", { class: "link go", href: "#champions", "data-cx-go": "agents" }, "Meet the agents"))),

    h("section", { class: "wrap grid" },
      h("a", { class: "tile dark span-12 weeks-tile", href: "#champions", "data-cx-go": "forward" },
        h("p", { class: "tile-label" }, "The twelve weeks"),
        h("p", { class: "stat" }, track.stat, h("span", { class: "stat-cap" }, track.caption)),
        h("div", { class: "weeks", role: "img", "aria-label": `${track.stat} ${track.caption}` }, ...Array.from({ length: track.all }, (_, i) => h("i", { class: i < track.done ? "done" : null }))),
        h("div", { class: "weeks-ends" }, h("span", {}, track.start), h("span", {}, track.judged)),
        h("p", { class: "tile-foot" }, "Nothing is decided before the judging date, whatever the weekly figures say.")),

      h("a", { class: "tile span-6", href: "#champions", "data-cx-go": "agents" },
        h("p", { class: "tile-label" }, "The agents"),
        h("p", { class: "stat" }, agents.stat || "?", h("span", { class: "stat-cap" }, agents.caption)),
        h("p", { class: "tile-text" }, agents.names || "Their names could not be read."),
        h("span", { class: "link go" }, "What each one does")),

      h("a", { class: "tile span-6", href: "#champions", "data-cx-go": "challenge" },
        h("p", { class: "tile-label" }, "The challenge"),
        h("p", { class: "stat" }, rounds === null ? "?" : String(rounds), h("span", { class: "stat-cap" }, rounds === 1 ? "round" : "rounds")),
        h("p", { class: "tile-text" }, `${challenge.title} ${rounds === null ? challenge.sub : "A version counts only if it also makes money on the unseen months."}`),
        h("span", { class: "link go" }, "What was tried")),

      h("a", { class: `tile span-12 checks-tile ${checks.allOk ? "" : "attention"}`.trim(), href: "#champions", "data-cx-go": "checks" },
        h("div", {},
          h("p", { class: "tile-label" }, "Checks"),
          h("p", { class: "stat" }, checks.text, h("span", { class: "stat-cap" }, checks.caption)),
          h("p", { class: "tile-text" }, checks.first)),
        h("ul", { class: "dots", "aria-hidden": "true" }, ...lines.map((l) => h("li", { class: l.unread ? "unread" : l.ok ? "ok" : "no" }))),
        h("span", { class: "link go" }, "See each check"))));
}
