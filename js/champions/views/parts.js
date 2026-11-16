// Pieces the pages share.
import { h, chip, more } from "../ui.js";

/** A page's opening: one big sentence, a line under it, and whatever follows. */
export function pageHead(title, sub, ...extra) {
  return h("header", { class: "page-head wrap center" }, h("h1", { class: "headline" }, title), sub ? h("p", { class: "sub" }, sub) : null, ...extra);
}

/** A file that could not be read: said plainly, with GitHub's own reason. */
export function unreadNote(what, error) {
  return h("p", { class: "notice" }, `${what} could not be read. ${error && error.message ? error.message : ""}`.trim());
}

/** Something that needs doing: the problem in one line and the one thing to do. */
export function todoBox(todo, button = null) {
  return h("div", { class: "todo" }, h("p", {}, h("b", {}, "What to do: "), todo), button);
}

/**
 * One agent's tile: the name, then its versions. Each version has {kind, lines: [sentences], chip, why?, folds: [[label, node]]}.
 */
export function agentTile(name, versions, { note = null } = {}) {
  return h("article", { class: "tile agent" }, h("h2", { class: "tile-title" }, name), note ? h("p", { class: "cap" }, note) : null,
    h("ul", { class: "versions" }, ...versions.map((v) => h("li", {},
      h("div", { class: "version" },
        h("div", { class: "version-text" }, h("p", { class: "version-kind" }, v.kind), ...v.lines.filter(Boolean).map((t) => h("p", { class: "version-line" }, t)), v.why ? h("p", { class: "version-line" }, v.why) : null),
        v.chip ? chip(v.chip) : null),
      ...(v.folds || []).filter(Boolean).map(([label, body]) => more(label, body))))));
}

/** A list of plain sentences as bullet points. */
export function bullets(items, cls = "bullets") {
  return h("ul", { class: cls }, ...items.map((t) => h("li", {}, t)));
}

/** A table that scrolls inside its own box on a narrow screen, so the page itself never moves sideways. */
export function dataTable(head, rows, { numeric = [] } = {}) {
  return h("div", { class: "table-wrap", tabindex: "0", role: "group", "aria-label": "Table. Swipe sideways to see every column." },
    h("table", {}, h("thead", {}, h("tr", {}, ...head.map((c, i) => h("th", { class: numeric.includes(i) ? "num" : null, scope: "col" }, c)))),
      h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c, i) => {
        const cell = c && typeof c === "object" && !(c instanceof Node) ? c : { text: c };
        return h("td", { class: [numeric.includes(i) ? "num" : "", cell.sign || ""].join(" ").trim() || null }, cell.text ?? "");
      }))))));
}
