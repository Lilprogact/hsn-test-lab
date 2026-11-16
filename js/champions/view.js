// Champions (Hassan, 16 and 17 Nov 2026): the five agents, the small-account challenge, the forward test and the
// Connection check, as separate pages under one tab. They have their own look (champions.css, Apple style, as he chose)
// and their own small bar of pages; the rest of the site is as it was.
//
// The pages only read. Every figure comes from a file the engine wrote, through the site's own GitHub reader
// (js/github.js getJson and getText). Nothing here starts a GitHub job, saves a setting or keeps anything in the browser.
import * as gh from "../github.js";
import { state, switchView } from "../app.js";
import { h, fill, cx } from "./ui.js";
import { when } from "./logic/check.js";
import * as overview from "./views/overview.js";
import * as forward from "./views/forward.js";
import * as agents from "./views/agents.js";
import * as challenge from "./views/challenge.js";
import * as checks from "./views/checks.js";

const FILES = {
  login: "status/forexcom_login.json", cloud: "status/mt5_cloud.json", coverage: "status/data_coverage.json", match: "status/data_match.json",
  agents: "champions/status.json", probe: "champions/probe/forexcom_demo.json", apart: "champions/step2/take_apart.json",
  finished: "champions/step3/finished.json", rounds: "champions/step3/rounds.jsonl", byYear: "champions/step3/by_year.json",
  card: "live_test/card_001.json", score: "live_test/scores/card_001.json", trades: "live_test/scores/card_001_trades.json",
};
const BY_LINE = new Set(["rounds"]);                         // files with one JSON object to a line
const PAGES = [["overview", "Overview", overview], ["forward", "Forward test", forward], ["agents", "Agents", agents], ["challenge", "Challenge", challenge], ["checks", "Connection check", checks]];
const VIEW = Object.fromEntries(PAGES.map(([id, , view]) => [id, view]));

// The Connection check used to be a tab of its own: an old link to it (…/#check) opens it here.
let first = "overview";
if (location.hash === "#check") {
  first = "checks";
  try { history.replaceState(null, "", "#champions"); } catch { /* the first page opens instead */ }
}

export class ChampionsView {
  constructor(root) {
    this.root = root;
    this.cache = new Map();
    this.turn = 0;
    const kept = history.state && history.state.champions;       // the page that was open before a reload
    this.page = VIEW[kept] ? kept : first;
    this.links = PAGES.map(([id, label]) => h("a", { href: "#champions", "data-cx-go": id }, label));
    this.body = h("div", { class: "page" });
    this.readAt = h("p", {});
    this.area = h("div", { class: "root" },
      h("div", { class: "subnav" }, h("div", { class: "subnav-inner" }, h("p", { class: "subnav-title" }, "Champions"), h("nav", { class: "subnav-links", "aria-label": "Champions pages" }, ...this.links))),
      this.body,
      h("footer", { class: "foot" }, h("div", { class: "wrap" }, this.readAt,
        h("p", {}, "Paper only. No order is sent to any account. These pages only read what the engine saved: they start nothing on GitHub and use no GitHub minutes."),
        h("button", { type: "button", class: "link-button", "data-cx-refresh": "yes" }, "Read again"))));
    root.addEventListener("click", (e) => this.clicked(e));
  }

  onUnlock() {}
  onLock() { this.cache.clear(); this.turn++; fill(this.root); document.documentElement.classList.remove("cx-on"); }
  hide() { document.documentElement.classList.remove("cx-on"); }
  show() {
    document.documentElement.classList.add("cx-on");             // the page behind takes the Champions pages' own background
    if (!this.area.isConnected) fill(this.root, this.area);
    this.open(this.page);
  }

  clicked(e) {
    const el = e.target instanceof Element ? e.target.closest("[data-cx-go], [data-cx-view], [data-cx-refresh]") : null;
    if (!el || !this.root.contains(el)) return;
    e.preventDefault();
    if (el.dataset.cxGo && VIEW[el.dataset.cxGo]) this.open(el.dataset.cxGo, { top: true });
    else if (el.dataset.cxView) switchView(el.dataset.cxView);
    else if (el.dataset.cxRefresh) this.open(this.page, { fresh: true });
  }

  async read(keys, fresh) {
    const out = {}, failed = {};
    await Promise.all(keys.map(async (key) => {
      if (!fresh && this.cache.has(key)) { out[key] = this.cache.get(key); return; }
      try {
        if (BY_LINE.has(key)) {
          const text = await gh.getText(state.token, state.owner, FILES[key]);
          try { out[key] = text === null ? null : text.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line)); }
          catch { throw new Error(`${FILES[key]} is not readable as it stands.`); }
        } else {
          out[key] = await gh.getJson(state.token, state.owner, FILES[key]);
        }
        this.cache.set(key, out[key]);
      } catch (error) {
        out[key] = null;
        failed[key] = error;
      }
    }));
    return { out, failed };
  }

  /** Nothing at all could be read, for one reason: say it once, with the one thing to do. */
  nothingRead(failed, keys) {
    const errors = keys.map((k) => failed[k]).filter(Boolean);
    if (errors.length < keys.length) return null;
    const kind = errors[0].kind;
    if (!errors.every((e) => e.kind === kind) || !["token", "forbidden", "network", "rate"].includes(kind)) return null;
    const token = kind === "token" || kind === "forbidden";
    const todo = kind === "network" ? "Check your connection, then read again." : kind === "rate" ? "Wait a few minutes, then read again." : "Put the token right in Settings, then come back.";
    return h("div", { class: "page-head wrap center" }, h("h1", { class: "headline" }, "Nothing could be read."), h("p", { class: "sub" }, errors[0].message),
      h("div", { class: "todo" }, h("p", {}, h("b", {}, "What to do: "), todo),
        token ? h("button", { type: "button", class: "button small", "data-cx-view": "settings" }, "Open Settings") : h("button", { type: "button", class: "button small", "data-cx-refresh": "yes" }, "Read again")));
  }

  async open(page, { fresh = false, top = false } = {}) {
    const view = VIEW[page] || overview, turn = ++this.turn;
    this.page = VIEW[page] ? page : "overview";
    try { history.replaceState({ champions: this.page }, "", "#champions"); } catch { /* a reload then opens the first Champions page */ }
    for (const a of this.links) { if (a.dataset.cxGo === this.page) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }
    if (!state.token || !state.owner) {
      fill(this.body, h("div", { class: "page-head wrap center" }, h("h1", { class: "headline" }, "The site is not connected to GitHub yet."),
        h("div", { class: "todo" }, h("p", {}, h("b", {}, "What to do: "), "Paste your GitHub token in Settings."), h("button", { type: "button", class: "button small", "data-cx-view": "settings" }, "Open Settings"))));
      return;
    }
    if (fresh) this.cache.clear();
    if (!view.needs.every((k) => this.cache.has(k))) fill(this.body, h("div", { class: "page-head wrap center" }, h("p", { class: "sub reading" }, "Reading…")));
    const { out, failed } = await this.read(view.needs, false);
    if (turn !== this.turn || !state.token) return;                // another page was asked for meanwhile, or the site was locked
    const now = Date.now();
    const content = this.nothingRead(failed, view.needs) || view.render({ out, failed, now });
    content.classList.add(cx("enter"));
    fill(this.body, content);
    this.readAt.textContent = `Read from GitHub on ${when(new Date(now).toISOString())}.`;
    if (top) window.scrollTo({ top: 0 });
  }
}
