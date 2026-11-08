// Mode 3: live paper testing — reads the paper snapshot the engine imported from the VPS's published feed
// (status/paper_live.json, refreshed by the Data check; docs/VPS_FEED.md) and the daily trades
// from main. Shows each paper strategy's open positions, today's pips and money, equity, the alerts it acted on or
// skipped with the reason, the backtest check, the market clock and the current market type. If alerts or prices
// stop arriving it says "Paper testing paused" with the last times and the reason. Nothing is guessed.
import * as gh from "./github.js";
import { state, startSettingsWorkflow } from "./app.js";
import { ukDateTime } from "./clock.js";
import { h, card, stat, table, badge, field, select, input, money, num, pct, signed } from "./ui.js";
import { lineChart } from "./charts.js";

function firstBook(snap) {
  const books = snap && snap.strategies ? Object.values(snap.strategies) : [];
  return books.length ? books[0] : null;
}

export class PaperView {
  constructor(root) {
    this.root = root;
    this.snapshot = null;
    this.timer = null;
  }
  onUnlock() {}
  currentMarketType() { return this.snapshot?.market_type || null; }
  show() { this.load(); if (this.timer) clearInterval(this.timer); this.timer = setInterval(() => { if (!this.root.hidden) this.load(); }, 60000); }

  async load() {
    this.root.replaceChildren(h("p", { class: "muted" }, "Loading the paper desk…"));
    try {
      const [snap, cfg, backtest, firmPaper] = await Promise.all([
        gh.getJson(state.token, state.owner, "status/paper_live.json"),
        gh.getJson(state.token, state.owner, "paper/config.json"),
        gh.getJson(state.token, state.owner, "paper/backtest_check.json"),
        gh.getJson(state.token, state.owner, "paper/firm_paper_results.json"),
      ]);
      this.snapshot = snap;
      this.render(snap, cfg, backtest, firmPaper);
    } catch (e) { this.root.replaceChildren(h("p", { class: "error" }, e.message)); }
  }

  render(snap, cfg, backtest, firmPaper) {
    const out = [];
    if (!snap) {
      out.push(card("Live paper testing", h("p", {}, badge("PARKED", "warn"), " ", h("span", { class: "muted" }, "Hassan's decision of 8 Nov 2026: backtests and HSN Capital first; nothing of the Test Lab runs on the VPS.")),
        h("p", { class: "help" }, "When it returns it will use virtual books only (no order code), on demo accounts opened just for the Test Lab, reading the indicator alerts the VPS publishes in its weekly feed. HSN Capital's floor 5 (\"20 paper days\") says \"waiting for paper testing\" until then."),
        this.configCard(cfg)));
      this.root.replaceChildren(...out);
      return;
    }
    const ageMin = (Date.now() - Date.parse(snap.updated_at)) / 60000;
    const stale = ageMin > 90;              // the snapshot reaches the site through the feed import, not live
    const paused = snap.paused || stale || snap.alerts_stale;
    const reason = snap.paused ? snap.paused_reason : stale ? `last imported snapshot is ${Math.round(ageMin)} minutes old (the feed import runs with the Data check)` : snap.alerts_stale ? "no alert for more than 6 hours" : "";
    out.push(card("Live paper testing", h("div", { class: "row" },
      paused ? badge("Paper testing paused", "warn") : badge("live", "good"),
      h("span", { class: "muted" }, `snapshot ${ukDateTime(snap.updated_at)} UK · last price ${ukDateTime(snap.last_price_time)} · last alert ${ukDateTime(snap.last_alert_time)}`)),
      paused ? h("p", { class: "warnc" }, `Reason: ${reason}. Nothing is filled or guessed while paused.`) : null,
      h("div", { class: "stats" }, stat("Symbol", snap.symbol), stat("Bid / ask", `${firstBook(snap)?.bid ?? "—"} / ${firstBook(snap)?.ask ?? "—"}`), stat("VPS free memory", snap.free_memory_mb ? `${Math.round(snap.free_memory_mb)} MB` : "—"))));
    for (const [name, s] of Object.entries(snap.strategies || {})) {
      const eqC = h("canvas", { class: "chart" });
      const pnl = s.balance - s.start_balance;
      out.push(card(`Paper: ${name}`, h("div", { class: "stats" },
        stat("Balance", money(s.balance, 2), `started ${money(s.start_balance)}`, pnl >= 0 ? "good" : "bad"), stat("Equity", money(s.equity, 2)),
        stat("Today", `${money(s.today.pnl_gbp, 2)} · ${num(s.today.pips, 1)} pips`, `${s.today.trades} closed`), stat("Open positions", s.open_positions.length), stat("Pending limits", s.pending_limits.length)),
        s.open_positions.length ? table(["Set", "Dir", "Lots", "Entry", "SL", "TP", "Target", "Opened"], s.open_positions.map((p) => ({ Set: p.set_id, Dir: p.direction === 1 ? "LONG" : "SHORT", Lots: p.lots, Entry: p.entry_price, SL: p.sl, TP: p.tp, Target: p.tp_level ? `TP${p.tp_level}` : "entry", Opened: ukDateTime(p.entry_time) })), { numeric: ["Lots", "Entry", "SL", "TP"] }) : h("p", { class: "muted" }, "No open positions."),
        h("h3", {}, "Alerts acted on or skipped (latest first)"),
        table(["When", "Alert", "Action", "Reason"], (s.recent_decisions || []).slice().reverse().map((d) => ({ When: ukDateTime(d.at), Alert: d.alert, Action: d.action, Reason: d.reason }))),
        h("h3", {}, "Equity"), eqC,
        this.backtestCheck(name, backtest)));
      requestAnimationFrame(() => this.drawEquity(eqC, name));
    }
    out.push(this.configCard(cfg));
    if (firmPaper && Object.keys(firmPaper).length) out.push(card("HSN Capital paper desk", table(["Idea", "Days", "Within normal range?"], Object.entries(firmPaper).map(([k, v]) => ({ Idea: k, Days: v.days, "Within normal range?": v.within_normal_range ? "yes" : "no" })))));
    this.root.replaceChildren(...out);
  }

  backtestCheck(name, backtest) {
    const b = backtest && backtest[name];
    if (!b) return h("p", { class: "help" }, "Backtest check: not available yet (needs a finished backtest of this strategy and a week of paper trades; the engine's data-check writes paper/backtest_check.json).");
    const bad = b.this_week_rank_pct !== undefined && b.this_week_rank_pct <= 5;
    return h("p", { class: bad ? "bad" : "muted" }, `Backtest check: this week ${signed(b.this_week_pnl_gbp, 2)} £ sits at the ${b.this_week_rank_pct}th percentile of ${b.backtest_weeks} backtest weeks${bad ? " — worse than 95% of them; worth investigating" : " — within the normal range"}.`);
  }

  async drawEquity(canvas, name) {
    try {
      const files = await gh.listDir(state.token, state.owner, "paper/trades");
      const recent = files.filter((f) => f.name.endsWith(".jsonl")).slice(-10);
      const rows = [];
      for (const f of recent) {
        const txt = await gh.getText(state.token, state.owner, `paper/trades/${f.name}`);
        for (const line of (txt || "").split("\n")) if (line.trim()) { const t = JSON.parse(line); if (t.strategy === name) rows.push(t); }
      }
      rows.sort((a, b) => a.exit_time.localeCompare(b.exit_time));
      let bal = this.snapshot.strategies[name].start_balance;
      const vals = rows.map((t) => (bal += t.pnl_gbp));
      lineChart(canvas, [{ values: vals.length ? vals : [bal], color: "#35d07f" }], { labels: rows.map((t) => t.exit_time.slice(5, 10)) });
    } catch { /* chart is optional */ }
  }

  configCard(cfg) {
    const strategies = (cfg?.strategies) || [];
    const list = h("div", { class: "list" }, ...strategies.map((s, i) => h("div", { class: "item" }, h("span", {}, h("span", { class: "t" }, s.name), h("span", { class: "d" }, ` ${s.strategy} · ${JSON.stringify(s.params || {})} · start £${s.start_balance} · risk ${JSON.stringify(s.risk)}`)),
      h("button", { class: "secondary small", onclick: () => { strategies.splice(i, 1); this.saveConfig({ ...cfg, strategies }); } }, "remove"))));
    const name = input("text", "", { placeholder: "name" });
    const strat = select([["indicator_as_is", "Indicator as is"]], "indicator_as_is");
    const style = select([["split5", "split 2/2/1"], ["tp1", "TP1"], ["tp2", "TP2"], ["tp3", "TP3"]], "split5");
    const bal = input("number", 500, { min: 1 });
    const risk = select([["stepped", "stepped cap"], ["fixed100", "fixed £100"], ["percent20", "20% per set"], ["million", "Million plan (20%)"]], "stepped");
    const add = h("button", { class: "secondary small", onclick: () => {
      if (strategies.length >= 5) { alert("Up to 5 paper strategies at once."); return; }
      const r = risk.value === "stepped" ? { type: "stepped" } : risk.value === "fixed100" ? { type: "fixed", value: 100 } : { type: "percent", value: 20 };
      strategies.push({ name: name.value || `${strat.value}-${style.value}`, strategy: strat.value, params: { exit_style: style.value }, start_balance: +bal.value, risk: r });
      this.saveConfig({ ...(cfg || {}), symbol: cfg?.symbol || "XAUUSD", leverage: cfg?.leverage || 20, strategies });
    } }, "Add");
    return card("Paper strategies (up to 5, each with its own balance and money plan)", list.childElementCount ? list : h("p", { class: "muted" }, "None configured: the service runs its default (indicator as is, split 2/2/1, £500, stepped cap)."),
      h("div", { class: "group form" }, field("Name", name), field("Strategy", strat), field("Exit", style), field("Start £", bal), field("Money plan", risk)), h("div", { class: "row" }, add, h("span", { class: "help" }, "Saved through a workflow; the VPS service picks it up on its next restart.")),
      h("p", { class: "help" }, "The Waves rules are not a choice here: they are Hassan's own bot code, and his three Waves bots on their demo accounts already are their live paper test. In the test lab they run through the Backtest page (his real code, replayed on FOREX.com bars)."));
  }

  async saveConfig(cfg) {
    try { await startSettingsWorkflow({ paper: cfg }); alert("Saved. The paper service reads paper/config.json when it restarts (the watchdog restarts it within 5 minutes if you stop it)."); setTimeout(() => this.load(), 8000); }
    catch (e) { alert(e.message); }
  }
}
