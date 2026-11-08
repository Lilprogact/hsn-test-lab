// Mode 2: the Million Challenge simulator — the plan played forward from every start date in the history.
import * as gh from "./github.js";
import { state, startRun, liveText } from "./app.js";
import { h, card, stat, table, badge, field, select, input, chips, money, num, pct, signed, mdLite } from "./ui.js";
import { lineChart, barChart, histogram } from "./charts.js";

const TIMEFRAMES = ["1M", "3M", "5M", "15M", "30M", "45M", "1H", "2H", "3H", "4H"];

export class MillionView {
  constructor(root) {
    this.root = root;
    this.form = this.buildForm();
    this.progress = h("div", { class: "card", hidden: true });
    this.results = h("div", { class: "stack" });
    this.root.append(this.form, this.progress, this.results);
  }
  onUnlock() {}
  show() { this.updateDaily(); }

  buildForm() {
    const f = {};
    f.balance = input("number", 500, { min: 1 }); f.credit = input("number", 0, { min: 0 }); f.days = input("number", 30, { min: 1, max: 250 });
    f.strategy = select([["indicator_as_is", "Indicator as is"], ["waves", "Waves rules (draft)"]], "indicator_as_is");
    f.exit = select([["split5", "Five-position split (2/2/1)"], ["tp1", "All out at TP1"], ["tp2", "All out at TP2"], ["tp3", "All out at TP3"]], "split5");
    f.timeframes = chips(TIMEFRAMES, ["5M", "15M", "1H", "4H"]);
    f.risk = input("number", 20, { min: 0.1, max: 100, step: 0.5 });
    f.target = input("number", "", { step: 0.01, placeholder: "from the formula" });
    f.handling = select([["close_all", "Close everything, stop until tomorrow"], ["bank_and_run", "Bank the target, leave runners at breakeven (one to TP2, one to TP3)"]], "close_all");
    f.loss = input("number", "", { step: 1, placeholder: "off" });
    f.stop = input("number", 0.5, { step: 0.05, min: 0, max: 1 });
    f.maxStarts = input("number", 400, { min: 10, max: 2000 });
    f.luck = input("number", 200, { min: 0, max: 500, step: 50 });
    f.unseen = input("number", 3, { min: 0, max: 12 });
    this.f = f;
    this.dailyEl = h("p", { class: "help" });
    [f.balance, f.days].forEach((x) => x.addEventListener("input", () => this.updateDaily()));
    this.runBtn = h("button", { class: "primary", onclick: () => this.run() }, "Run the challenge from every start date");
    return h("div", { class: "card form" },
      h("h2", {}, "Million Challenge simulator", badge("the sheet, exactly as written, on real history")),
      h("div", { class: "group" }, field("Starting balance £", f.balance), field("Credit £", f.credit), field("Trading days", f.days), field("Strategy", f.strategy), field("Exit style", f.exit)),
      h("div", { class: "group" }, field("Timeframes", f.timeframes)),
      h("div", { class: "group" }, field("Risk % per set", f.risk), field("Daily target % (blank = formula)", f.target), field("When the target is hit", f.handling), field("Daily loss limit % (blank = off)", f.loss)),
      h("div", { class: "group" }, field("Stop line (fraction of start)", f.stop, "pause, then stop once flat"), field("Max start dates", f.maxStarts, "every day up to this many"), field("Luck check runs", f.luck), field("Unseen months", f.unseen)),
      this.dailyEl,
      h("div", { class: "row between" }, this.runBtn, h("span", { class: "help" }, "Daily growth needed = (1,000,000 ÷ start)^(1 ÷ days) − 1")));
  }

  updateDaily() {
    const s = +this.f.balance.value || 0, d = +this.f.days.value || 0;
    if (s > 0 && d > 0) {
      const g = Math.pow(1e6 / s, 1 / d) - 1;
      this.dailyEl.textContent = `Daily growth needed: ${(g * 100).toFixed(2)}% a day from £${s} over ${d} days (day one target £${(s * g).toFixed(2)}).`;
    }
  }

  settings() {
    const f = this.f;
    return {
      start_balance: +f.balance.value, credit: +f.credit.value, days: +f.days.value, strategy: f.strategy.value, exit_style: f.exit.value,
      timeframes: f.timeframes.value(), risk_pct: +f.risk.value, daily_target_pct: f.target.value ? +f.target.value : null,
      target_handling: f.handling.value, daily_loss_limit_pct: f.loss.value ? +f.loss.value : null, stop_line_fraction: +f.stop.value,
      max_start_dates: +f.maxStarts.value, luck_runs: +f.luck.value, unseen_months: +f.unseen.value,
    };
  }

  async run() {
    this.runBtn.disabled = true;
    this.showProgress({ phase: "queued" });
    try {
      const { requestId, result } = await startRun("million", this.settings(), (p) => this.showProgress(p));
      await this.renderResult(requestId, result);
    } catch (e) { this.progress.replaceChildren(h("p", { class: "error" }, e.message)); }
    finally { this.runBtn.disabled = false; }
  }

  showProgress(p) {
    this.progress.hidden = false;
    const pctv = p.live?.percent ?? (p.phase === "queued" ? 2 : 5);
    this.progress.replaceChildren(h("h2", {}, "Running", badge(p.requestId || "")), h("div", { class: "progress" }, h("div", { style: `width:${pctv}%` })),
      h("p", { class: "muted" }, p.phase === "queued" ? "Queued on GitHub…" : liveText(p.live) || p.phase));
  }

  async openResult(requestId) {
    const r = await gh.getJson(state.token, state.owner, `results/${requestId}/result.json`);
    if (r) await this.renderResult(requestId, r);
  }

  async renderResult(requestId, r) {
    this.progress.hidden = true;
    const out = this.results;
    out.replaceChildren(card(h("span", {}, "Result ", h("span", { class: "mono dim" }, requestId)), h("div", { class: "row" }, badge(r.status, r.status === "done" ? "good" : "bad"), r.warnings?.some((w) => w.startsWith("TRIAL")) ? badge("TRIAL MODE", "trial") : null)));
    if (r.errors?.length) out.append(card("Failed", ...r.errors.map((e) => h("pre", {}, `${e.type}: ${e.message}`))));
    if (r.warnings?.length) out.append(card("Assumptions and warnings", h("ul", {}, ...r.warnings.map((w) => h("li", {}, w)))));
    if (r.status !== "done") return;
    const summary = await gh.getText(state.token, state.owner, `results/${requestId}/summary.md`);
    const s = r.summary, p = r.plan;
    out.append(card("Verdict", h("p", { class: s.pct_reached_million > 0 ? "good" : "warnc" }, r.verdict), summary ? h("div", { class: "summary-text", html: mdLite(summary) }) : null));
    out.append(card("The plan", h("div", { class: "stats" },
      stat("Daily growth needed", pct(p.daily_growth_needed_pct, 2), p.formula), stat("Risk per set", pct(p.risk_pct_per_set, 1)), stat("Target handling", p.target_handling === "bank_and_run" ? "bank + runners" : "close all"),
      stat("Daily loss limit", p.daily_loss_limit_pct ? pct(p.daily_loss_limit_pct) : "off"), stat("Stop line", money(p.stop_line_gbp)))));
    out.append(card("From every start date", h("div", { class: "stats" },
      stat("Runs", s.runs, `every ${s.start_dates_step_days} day(s)`), stat("Reached £1M", pct(s.pct_reached_million), "", s.pct_reached_million > 0 ? "good" : "bad"),
      stat("Median final balance", money(s.median_final_balance)), stat("Mean final balance", money(s.mean_final_balance)),
      stat("Hit the stop line", pct(s.pct_hit_stop_line), "", "bad"), stat("Blown (≤2% left)", pct(s.pct_blown)), stat("Finished above start", pct(s.pct_finished_above_start)),
      stat("Best run", money(s.best_run.final_balance), `start ${s.best_run.start}`), stat("Worst run", money(s.worst_run.final_balance), `start ${s.worst_run.start}`),
      stat("Training months", `${pct(s.training.pct_reached_million)} reached`, `median ${money(s.training.median_final_balance)} · ${s.training.runs} runs`),
      stat("Unseen months", `${pct(s.unseen.pct_reached_million)} reached`, `median ${money(s.unseen.median_final_balance)} · ${s.unseen.runs} runs`)),
      h("p", { class: "help" }, `What usually stops it: stop line ${pct(r.what_stops_it["stop line"])}, blown ${pct(r.what_stops_it.blown)}, ran out of days ${pct(r.what_stops_it["ran out of days"])}.`)));
    const distC = h("canvas", { class: "chart" }), runsC = h("canvas", { class: "chart" });
    out.append(card("Final balance by start date", runsC, h("h3", {}, "Distribution of final balances (percentiles)"), table(["5%", "25%", "50%", "75%", "95%"], [Object.fromEntries(Object.entries(s.final_balance_percentiles).map(([k, v]) => [k + "%", money(v)]))])));
    // day table for the typical run
    const dt = r.typical_run_day_table || [];
    out.append(card(`Day by day: the most typical run (start ${s.typical_run.start})`,
      table(["Day", "Start £", "Target £", "Risk £", "Lots", "Cap?", "Pips needed", "Pips made/lot", "P&L £", "End £", "Sets", "Result", "Plan"],
        dt.map((d) => ({ Day: d.day, "Start £": money(d.start_balance), "Target £": money(d.target_gbp), "Risk £": money(d.risk_gbp), Lots: d.lots, "Cap?": d.cap_hit ? "capped" : "", "Pips needed": d.pips_needed ?? "—", "Pips made/lot": num(d.pips_made_per_lot, 1), "P&L £": money(d.pnl), "End £": money(d.end_balance), Sets: d.sets, Result: d.result, Plan: d.ahead_or_behind })),
        { numeric: ["Start £", "Target £", "Risk £", "Lots", "Pips needed", "Pips made/lot", "P&L £", "End £", "Sets"] }),
      h("p", { class: "help" }, "Lots = risk £ ÷ (pips to the stop × £ per pip per lot), £ per pip per lot = $10 ÷ GBP/USD of that day; capped by the leverage setting. Pips needed = target ÷ (lots × £ per pip per lot).")));
    const lk = r.luck_check;
    if (lk && lk.runs) {
      const hc = h("canvas", { class: "chart" });
      out.append(card("Luck check with this money plan", h("p", { class: lk.beats_random_median ? "good" : "bad" }, lk.verdict), hc, h("p", { class: "help" }, lk.note)));
      requestAnimationFrame(() => histogram(hc, lk.random_pnl_histogram, lk.real_pnl_gbp_static_levels));
    }
    requestAnimationFrame(() => {
      barChart(runsC, (r.runs || []).map((x) => ({ label: x.start.slice(2), value: x.final_balance - r.settings.start_balance, color: x.reached_million ? "#35d07f" : x.stopped_at_stop_line ? "#ff5c5c" : "#5aa9ff" })), { unit: "" });
    });
  }
}
