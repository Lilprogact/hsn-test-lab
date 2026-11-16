// Step 3, the small-account challenge: the finding first, then each agent's versions, the rounds, and the years.
import { h, chip, more } from "../ui.js";
import { challengeHeadline, challengeAgents, challengeRounds, challengeTotals, byYear } from "../logic/challenge.js";
import { pageHead, agentTile, bullets, dataTable, unreadNote } from "./parts.js";

export const needs = ["finished", "rounds", "byYear"];

export function render({ out, failed }) {
  if (failed.finished) return h("div", {}, pageHead("The challenge", null), h("div", { class: "wrap" }, unreadNote("The challenge's result file", failed.finished)));
  const head = challengeHeadline(out.finished);
  const agents = challengeAgents(out.finished);
  const rounds = failed.rounds ? [] : challengeRounds(out.rounds);
  const years = failed.byYear ? null : byYear(out.byYear);
  const safe = (out.finished && out.finished.safe_means) || [];
  const roundRow = (r, x) => h("li", {}, h("div", { class: "round-row" },
    h("div", {}, h("p", { class: "round-name" }, x.name), h("p", {}, x.change), x.why ? h("p", { class: "cap" }, x.why) : null),
    r.round === 0 ? null : chip(x.kept ? { text: "kept", kind: "ok" } : { text: "dropped", kind: "" })));
  const howKept = safe.length ? more("When a change was kept", h("div", {},
    h("p", { class: "cap" }, "A changed version replaced the standing one only if it was safe and better on the practice months. Safe meant all of these:"),
    bullets(safe.map((t) => `${t.charAt(0).toUpperCase()}${t.slice(1)}.`)))) : null;
  const roundsTile = rounds.length ? h("section", { class: "wrap" }, h("div", { class: "tile" },
    h("h2", { class: "tile-title" }, "The rounds"), h("p", { class: "cap" }, challengeTotals(out.rounds)),
    ...rounds.map((r) => more(`${r.title}: ${r.summary}`, h("ul", { class: "round" }, ...r.rows.map((x) => roundRow(r, x))))),
    howKept)) : null;
  return h("div", {},
    pageHead(head.title, head.sub),
    h("section", { class: "wrap stack" }, ...agents.map((a) => agentTile(a.name, a.versions.map((v) => ({
      kind: v.kind, lines: [v.practice, v.unseen], chip: v.chip,
      folds: [v.rules.length ? ["Its rules", h("div", {}, bullets(v.rules), h("p", { class: "cap" }, `Money plan: ${v.plan}`))] : null],
    }))))),
    failed.rounds ? h("div", { class: "wrap" }, unreadNote("The rounds", failed.rounds)) : null,
    roundsTile,
    years ? h("section", { class: "wrap" }, h("div", { class: "tile" }, h("h2", { class: "tile-title" }, "Year by year"),
      h("p", { class: "cap" }, "The Engine's standard account, £10,000 at 1% a trade, on FOREX.com gold. 2025 is January to September; the last column is the months the firm was built on."),
      dataTable(["Agent", "Version", ...years.periods], years.rows.map((r) => [r.name, r.version, ...r.cells]), { numeric: years.periods.map((_, i) => i + 2) }))) : null,
    failed.byYear ? h("div", { class: "wrap" }, unreadNote("The year-by-year file", failed.byYear)) : null);
}
