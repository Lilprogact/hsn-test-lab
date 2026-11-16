// Connection check (Hassan, 16 Nov 2026): one page that says, with a tick or a cross, whether the FOREX.com login
// works, whether gold prices are up to date, whether the indicator matches TradingView, whether the five agents
// are copied with records that re-run to the same numbers, and where the forward test stands (his Step 4: frozen
// rules followed on new prices, paper only), with its ten versions below. A cross says the one thing to do, with a
// button when a page of this site does it. The page only reads: it starts nothing on GitHub and spends no minutes.
import * as gh from "./github.js";
import { state, switchView } from "./app.js";
import { h, fill } from "./ui.js";
import { loginLine, pricesLine, goldTo, indicatorLine, agentsLine, verdict, demoFacts, when } from "./checklogic.js";
import { forwardLine, forwardAgents, passMarks, forwardNotes } from "./forwardlogic.js";

const FILES = {
  login: "status/forexcom_login.json", cloud: "status/mt5_cloud.json", coverage: "status/data_coverage.json", match: "status/data_match.json",
  agents: "champions/status.json", probe: "champions/probe/forexcom_demo.json",
  score: "live_test/scores/card_001.json", card: "live_test/card_001.json",
};
const BUTTONS = { setup: "Open One-time setup", settings: "Open Settings" };

function mark(ok, unread) {
  return h("span", { class: `check-mark ${unread ? "unread" : ok ? "ok" : "no"}`, role: "img", "aria-label": unread ? "Could not be read" : ok ? "Yes" : "No" }, unread ? "?" : ok ? "✓" : "✕");
}

function row(line) {
  const todo = line.ok || !line.todo ? null : line.sameFixAsAbove ? h("p", { class: "check-detail" }, "The same fix as above puts this right too.") : h("div", { class: "check-todo" },
    h("span", {}, h("b", {}, "What to do: "), line.todo),
    line.button ? h("button", { type: "button", class: "primary", onclick: () => switchView(line.button) }, BUTTONS[line.button]) : null);
  return h("li", { class: `check-row ${line.ok ? "ok" : "no"}` }, mark(line.ok, line.unread),
    h("div", { class: "check-body" }, h("p", { class: "check-title" }, line.title), line.detail ? h("p", { class: "check-detail" }, line.detail) : null, line.extra || null, todo));
}

function agentsTable(line) {
  if (!line.rows?.length) return null;
  const list = h("ul", { class: "check-agents" }, ...line.rows.map((r) => h("li", {},
    mark(r.ok), h("span", { class: "check-agent" }, h("b", {}, r.name), h("span", { class: "check-detail" }, `${r.record}: ${r.figures}`)),
    h("span", { class: `check-same ${r.ok ? "ok" : "no"}` }, !r.copied ? "not copied" : r.same ? "same" : "different"))));
  const study = line.study?.length
    ? h("div", {}, h("p", { class: "check-detail" }, `Also copied, for study only: ${line.study.map((s) => s.name).join(", ")}.`),
        ...line.study.filter((s) => !s.ok).map((s) => h("p", { class: "check-detail" }, `${s.name}: ${s.why}.`)))
    : null;
  return h("div", {}, list, study);
}

/** The forward test's ten versions, agent by agent: each with its figures, where it stands, and its frozen rules to open. */
function forwardCard(score, card) {
  const agents = forwardAgents(score, card);
  if (!agents.length) return null;
  const marks = passMarks(card);
  const version = (v) => h("li", {},
    h("div", { class: "check-version" },
      h("span", { class: "check-agent" }, h("span", { class: "check-kind" }, v.kind), h("span", { class: "check-detail" }, v.figures), v.why ? h("span", { class: "check-detail" }, v.why) : null),
      h("span", { class: `check-chip ${v.chip.kind}` }, v.chip.text)),
    v.rules.length ? h("details", { class: "check-rules" }, h("summary", {}, "Its rules"), h("ul", {}, ...v.rules.map((r) => h("li", {}, r))),
      h("p", { class: "check-detail" }, `Money plan: ${v.plan}`), v.before ? h("p", { class: "check-detail" }, v.before) : null) : null);
  return h("div", { class: "check-facts check-forward" },
    h("p", { class: "check-title" }, "The forward test, version by version"),
    ...forwardNotes(score, card).map((n) => h("p", { class: "check-detail" }, n)),
    ...agents.map((a) => h("div", { class: "check-group" }, h("p", { class: "check-name" }, a.name), h("ul", { class: "check-versions" }, ...a.versions.map(version)))),
    marks ? h("div", { class: "check-marks" }, h("p", { class: "check-title" }, "To pass, a version needs all three"), h("ol", {}, ...marks.marks.map((m) => h("li", {}, m))),
      h("p", { class: "check-detail" }, `${marks.judged} ${marks.rule}`), marks.pass ? h("p", { class: "check-detail" }, marks.pass) : null) : null);
}

export class CheckView {
  constructor(root) { this.root = root; this.busy = false; }
  onUnlock() {}
  onLock() { fill(this.root); }
  show() { this.load(); }

  async read() {
    const out = {}, failed = {};
    await Promise.all(Object.entries(FILES).map(async ([key, path]) => {
      try { out[key] = await gh.getJson(state.token, state.owner, path); } catch (error) { out[key] = null; failed[key] = error; }
    }));
    return { out, failed };
  }

  async load() {
    if (this.busy) return;
    if (!state.token || !state.owner) {
      fill(this.root, h("div", { class: "check" }, h("p", { class: "check-verdict no" }, "The site is not connected to GitHub yet."),
        h("div", { class: "check-todo" }, h("span", {}, h("b", {}, "What to do: "), "Paste your GitHub token in Settings."),
          h("button", { type: "button", class: "primary", onclick: () => switchView("settings") }, BUTTONS.settings))));
      return;
    }
    this.busy = true;
    if (!this.root.firstChild) fill(this.root, h("div", { class: "check" }, h("p", { class: "check-verdict" }, "Checking…")));
    try {
      const { out, failed } = await this.read();
      const now = Date.now();
      const unread = (key, what) => ({ ok: false, unread: true, title: `${what} could not be read`, detail: failed[key].message, todo: null, button: null });
      const agents = failed.agents ? unread("agents", "The agents' check file") : agentsLine(out.agents, failed.coverage ? null : out.coverage);
      agents.extra = agentsTable(agents);
      const lines = [
        failed.login ? unread("login", "The login check") : loginLine(out.login, now),
        failed.coverage && failed.cloud ? unread("coverage", "The price files") : pricesLine(out.coverage, out.cloud, now),
        failed.match ? unread("match", "The TradingView check") : indicatorLine(out.match),
        agents,
        failed.score ? unread("score", "The forward test's score")
          : forwardLine(out.score, failed.card ? null : out.card, { to: goldTo(out.coverage, out.cloud)?.last || null, at: out.cloud?.at || out.coverage?.checked_at || null }, now),
      ];
      const v = verdict(lines);
      const facts = failed.probe ? null : demoFacts(out.probe);
      const versions = failed.score || !out.score ? null : forwardCard(out.score, failed.card ? null : out.card);
      const fixes = new Set();                                   // one fix is said once, on the first line it mends
      for (const l of lines) if (!l.ok && l.todo) { l.sameFixAsAbove = fixes.has(l.todo); fixes.add(l.todo); }
      if (lines.every((l) => l.unread)) {                        // nothing could be read (the token, or no connection): say why once
        const token = Object.values(failed).some((e) => e.kind === "token" || e.kind === "forbidden");
        fill(this.root, h("div", { class: "check" }, h("p", { class: "check-verdict no" }, v.text), h("p", { class: "check-detail" }, lines[0].detail),
          h("div", { class: "check-todo" }, h("span", {}, h("b", {}, "What to do: "), token ? "Put the token right in Settings, then check again." : "Check your connection, then check again."),
            token ? h("button", { type: "button", class: "primary", onclick: () => switchView("settings") }, BUTTONS.settings) : null,
            h("button", { type: "button", class: "secondary", onclick: () => this.load() }, "Check again"))));
        return;
      }
      fill(this.root, h("div", { class: "check" },
        h("div", { class: "check-head" },
          h("div", {}, h("p", { class: `check-verdict ${v.ok ? "ok" : "no"}` }, v.text), h("p", { class: "check-detail" }, `Read from GitHub on ${when(new Date(now).toISOString())}.`)),
          h("button", { type: "button", class: "secondary", onclick: () => this.load() }, "Check again")),
        h("ul", { class: "check-list" }, ...lines.map(row)),
        facts ? h("div", { class: "check-facts" }, h("p", { class: "check-title" }, "What the FOREX.com demo account itself reports"),
          h("ul", {}, ...facts.lines.map((t) => h("li", {}, t))), h("p", { class: "check-detail" }, `Read from the account on ${facts.at}. No order was placed.`)) : null,
        versions,
        h("p", { class: "check-detail" }, "This page only reads what is saved. It starts nothing and uses no GitHub minutes. A tick for the login and the prices means the weekly download ran in the last 8 days.")));
    } finally {
      this.busy = false;
    }
  }
}
