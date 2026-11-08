// Mode 1: Backtest — settings, run, live progress, and the result pages (numbers, splits, luck check, replay).
import * as gh from "./github.js";
import { state, startRun, liveText, trialMode } from "./app.js";
import { h, card, stat, table, badge, field, select, input, chips, money, num, pct, signed, download, mdLite, openModal } from "./ui.js";
import { lineChart, barChart, histogram, heatmapHtml } from "./charts.js";
import { Replay } from "./replay.js";

const TIMEFRAMES = ["1M", "3M", "5M", "15M", "30M", "45M", "1H", "2H", "3H", "4H"];
const STRATEGIES = [["indicator_as_is", "Indicator as is"], ["waves", "Waves rules (draft)"], ["agent2_80pct", "Agent 2's 80% strategy"], ["agent5_agreement_pullback", "Agent 5's agreement + pullback"], ["custom", "Describe my own"]];
const STYLE_LABEL = { tp1: "All out at TP1", tp2: "All out at TP2", tp3: "All out at TP3", split5: "Five-position split (2/2/1)" };

export class BacktestView {
  constructor(root) {
    this.root = root;
    this.form = this.buildForm();
    this.progress = h("div", { class: "card", hidden: true });
    this.results = h("div", { class: "stack" });
    this.root.append(this.form, this.progress, this.results);
  }
  onUnlock() {}
  show() { this.loadCustomStrategies(); }

  buildForm() {
    const f = {};
    f.instrument = select([["XAUUSD", "Gold (XAUUSD)"], ["NAS100", "NAS100"]], "XAUUSD");
    f.strategy = select(STRATEGIES, "indicator_as_is");
    f.custom = select([["", "— pick a saved strategy —"]], "");
    f.timeframes = chips(TIMEFRAMES, ["5M", "15M", "1H", "4H"]);
    f.dateFrom = input("date", ""); f.dateTo = input("date", "");
    f.unseen = input("number", 3, { min: 0, max: 12, step: 1 });
    f.tp1 = input("number", 0.9, { step: 0.1 }); f.tp2 = input("number", 1.7, { step: 0.1 }); f.tp3 = input("number", 2.4, { step: 0.1 });
    f.exits = select([["all", "All, side by side"], ["tp1", STYLE_LABEL.tp1], ["tp2", STYLE_LABEL.tp2], ["tp3", STYLE_LABEL.tp3], ["split5", STYLE_LABEL.split5]], "all");
    f.balance = input("number", 500, { min: 1, step: 1 }); f.credit = input("number", 0, { min: 0, step: 1 });
    f.riskType = select([["stepped", "My stepped cap (£100 per £500 start, +£50 per £500 gained)"], ["fixed", "Fixed £ per set"], ["percent", "% of balance per set"]], "stepped");
    f.riskValue = input("number", 100, { min: 0, step: 1 });
    f.lotSpread = select([["heavy_sl", "Bigger near the stop (as now)"], ["equal", "Equal across the five"]], "heavy_sl");
    f.marketType = select([["All", "All"], ["Trending", "Trending"], ["Sideways", "Sideways"], ["Quiet", "Quiet"], ["Mixed", "Mixed"]], "All");
    f.leverage = input("number", 20, { min: 1, step: 1 });
    f.luck = input("number", 200, { min: 0, max: 500, step: 50 });
    f.cooldown = input("number", 0, { min: 0, step: 5 });
    f.spreadMult = select([["1", "As recorded"], ["1.5", "Raised by 50% (stress)"], ["2", "Doubled (stress)"]], "1");
    f.describe = h("textarea", { placeholder: "Type your rules in plain English. Claude writes them as a strategy module with tests, then shows you its reading of your rules for you to confirm before anything runs." });
    f.describeName = input("text", "", { placeholder: "name for this strategy, e.g. london-pullback" });
    this.f = f;
    const customBox = h("div", { class: "card tight", hidden: true },
      h("h3", {}, "Describe my own strategy"),
      field("Saved strategies", f.custom, "confirmed ones can run"),
      field("New: your rules in plain English", f.describe), field("Name", f.describeName),
      h("div", { class: "row" }, h("button", { class: "secondary", onclick: () => this.describeStrategy() }, "Have Claude write it")),
      h("p", { class: "help" }, "Generated code runs its tests in a sandbox with no secrets and no network. Nothing runs until you confirm Claude's reading of your rules."));
    this.customBox = customBox;
    f.strategy.addEventListener("change", () => { customBox.hidden = f.strategy.value !== "custom"; });
    const run = h("button", { class: "primary", onclick: () => this.run() }, "Run backtest");
    this.runBtn = run;
    const form = h("div", { class: "card form" },
      h("h2", {}, "Backtest", badge("Engine: deterministic Python on real FOREX.com bars")),
      h("div", { class: "group" }, field("Instrument", f.instrument), field("Strategy", f.strategy), field("Exits", f.exits), field("Market type at entry", f.marketType)),
      customBox,
      h("div", { class: "group" }, field("Timeframes (any mix)", f.timeframes)),
      h("div", { class: "group" }, field("From", f.dateFrom, "blank = all data"), field("To", f.dateTo), field("Unseen months", f.unseen, "held back from tuning"), field("Targets TP1 / TP2 / TP3 (R)", h("div", { class: "row" }, f.tp1, f.tp2, f.tp3))),
      h("div", { class: "group" }, field("Starting balance £", f.balance), field("Credit £", f.credit, "counted in the balance"), field("Risk per set", f.riskType), field("Risk value (£ or %)", f.riskValue, "fixed / percent only")),
      h("div", { class: "group" }, field("Lot spread", f.lotSpread), field("Leverage cap", f.leverage, "UK retail 20:1"), field("Luck check runs", f.luck), field("Spread", f.spreadMult)),
      h("details", {}, h("summary", {}, "Experiment (shown next to the unchanged baseline)"), h("div", { class: "group" }, field("Cool-down after a stop-out (minutes, 0 = off)", f.cooldown))),
      h("div", { class: "row between" }, run, h("span", { class: "help" }, "One run at a time · 30-minute limit · 20 runs a day")),
    );
    return form;
  }

  async loadCustomStrategies() {
    if (!state.token) return;
    try {
      const dirs = await gh.listDir(state.token, state.owner, "strategies/custom");
      const opts = [["", "— pick a saved strategy —"]];
      for (const d of dirs.filter((x) => x.type === "dir")) {
        const meta = await gh.getJson(state.token, state.owner, `strategies/custom/${d.name}/meta.json`);
        opts.push([`custom/${d.name}`, `${meta?.label || d.name}${meta?.confirmed ? "" : " (not confirmed yet)"}`]);
      }
      const cur = this.f.custom.value;
      this.f.custom.replaceChildren(...opts.map(([v, l]) => h("option", { value: v }, l)));
      this.f.custom.value = cur;
    } catch { /* shown when used */ }
  }

  settings() {
    const f = this.f;
    let strategy = f.strategy.value;
    if (strategy === "custom") strategy = f.custom.value;
    const s = {
      instrument: f.instrument.value, strategy, timeframes: f.timeframes.value(),
      date_from: f.dateFrom.value || null, date_to: f.dateTo.value || null, unseen_months: +f.unseen.value,
      targets: { tp1_r: +f.tp1.value, tp2_r: +f.tp2.value, tp3_r: +f.tp3.value }, exits: f.exits.value,
      start_balance: +f.balance.value, credit: +f.credit.value,
      risk: f.riskType.value === "stepped" ? { type: "stepped" } : { type: f.riskType.value, value: +f.riskValue.value },
      lot_spread: f.lotSpread.value, market_type: f.marketType.value, leverage: +f.leverage.value, luck_runs: +f.luck.value,
      spread_multiplier: +f.spreadMult.value, experiment: +f.cooldown.value > 0 ? { cooldown_minutes: +f.cooldown.value } : null,
    };
    return s;
  }

  async run() {
    const s = this.settings();
    if (!s.strategy) { alert("Pick a saved strategy or describe a new one first."); return; }
    if (!s.timeframes.length) { alert("Pick at least one timeframe."); return; }
    this.runBtn.disabled = true;
    this.showProgress({ phase: "queued" });
    try {
      const { requestId, result } = await startRun("backtest", s, (p) => this.showProgress(p));
      await this.renderResult(requestId, result);
    } catch (error) {
      this.progress.replaceChildren(h("p", { class: "error" }, error.message));
    } finally {
      this.runBtn.disabled = false;
    }
  }

  showProgress(p) {
    this.progress.hidden = false;
    const pctv = p.live?.percent ?? (p.phase === "done" ? 100 : p.phase === "queued" ? 2 : 5);
    const bar = h("div", { class: "progress" }, h("div", { style: `width:${pctv}%` }));
    const txt = p.phase === "queued" ? "Queued on GitHub…" : p.phase === "starting" ? "Runner starting (installing the engine)…" : p.phase === "waiting" ? `Waiting: ${p.error}` : liveText(p.live) || p.phase;
    this.progress.replaceChildren(h("h2", {}, "Running", badge(p.requestId || "", "")), bar, h("p", { class: "muted" }, txt),
      h("p", { class: "help" }, "The bar follows the engine's own status file (pushed every 30 s). No fake progress."));
  }

  async openResult(requestId) {
    const result = await gh.getJson(state.token, state.owner, `results/${requestId}/result.json`);
    if (!result) { this.results.replaceChildren(h("p", { class: "error" }, "No result file for that run.")); return; }
    if (result.mode === "codegen") { this.renderCodegen(result); return; }
    await this.renderResult(requestId, result);
  }

  async renderResult(requestId, r) {
    this.progress.hidden = true;
    const out = this.results;
    out.replaceChildren();
    const head = card(h("span", {}, "Result ", h("span", { class: "mono dim" }, requestId)),
      h("div", { class: "row" }, badge(r.status, r.status === "done" ? "good" : "bad"), r.trial_mode ? badge("TRIAL MODE", "trial") : null,
        badge(`${r.settings?.instrument} · ${(r.settings?.timeframes || []).join(" ")}`), badge(r.settings?.strategy || ""), r.settings?.strategy === "waves" ? badge("DRAFT rules", "warn") : null,
        h("button", { class: "secondary small", onclick: () => this.downloadCsv(requestId) }, "Trades CSV")));
    out.append(head);
    if (r.errors?.length) {
      out.append(card("Failed", ...r.errors.map((e) => h("pre", {}, `${e.type}: ${e.message}`))));
    }
    if (r.warnings?.length) out.append(card("Assumptions and warnings", h("ul", {}, ...r.warnings.map((w) => h("li", {}, w)))));
    if (r.status !== "done") return;
    // summary (AI, from result.json only)
    const summary = await gh.getText(state.token, state.owner, `results/${requestId}/summary.md`);
    if (summary) out.append(card("In plain English", h("div", { class: "summary-text", html: mdLite(summary) })));
    // data used
    const d = r.data || {};
    out.append(card("Data used", h("div", { class: "stats" },
      stat("Symbol", d.symbol || "—"), stat("1-minute bars", num(d.bars_1m, 0)), stat("From", (d.first_bar || "").slice(0, 10)), stat("To", (d.last_bar || "").slice(0, 10)),
      stat("Source", (d.sources || []).join(", ") || "—"), stat("Hours", d.hours_source || "—"), stat("GBP/USD", d.gbpusd || "—"), stat("Contract", d.contract_spec ? `${d.contract_spec.contract_size} × (${d.contract_spec.source})` : "—")),
      h("details", {}, h("summary", {}, `${(d.files || []).length} data files`), h("pre", {}, (d.files || []).map((f) => `${f.file || f.month}  ${f.source}  ${f.first_bar}→${f.last_bar}  ${f.bars} bars`).join("\n"))),
      (d.closures || []).length ? h("details", {}, h("summary", {}, `${d.closures.length} holidays / early closes detected from the data`), h("pre", {}, d.closures.map((c) => `${c.date_ny} ${c.kind}: ${c.detail}`).join("\n"))) : null));
    // ranking across exit styles
    if (r.ranking?.length) {
      out.append(card("Ranking (money and average R on the unseen months, only among those that beat random)",
        table(["Exit style", "Unseen £", "Unseen avg R", "All £", "All avg R", "Beat random?"],
          r.ranking.map((x) => ({ "Exit style": STYLE_LABEL[x.exit_style] || x.exit_style, "Unseen £": money(x.unseen_pnl_gbp), "Unseen avg R": signed(x.unseen_avg_r, 3), "All £": money(x.all_pnl_gbp), "All avg R": signed(x.all_avg_r, 3), "Beat random?": x.beats_random === null ? "—" : x.beats_random ? "yes" : "no" })),
          { numeric: ["Unseen £", "Unseen avg R", "All £", "All avg R"] })));
    }
    const styles = Object.keys(r.by_exit_style || {});
    for (const style of styles) {
      out.append(this.styleBlock(style, r.by_exit_style[style], r, r.experiment_by_exit_style?.[style]));
    }
    // replay + trade viewer
    const replayCard = card("Replay (real trades on real candles)", h("p", { class: "help" }, "Loading candles…"));
    out.append(replayCard);
    this.loadReplay(requestId, r, replayCard).catch((e) => replayCard.append(h("p", { class: "error" }, e.message)));
  }

  styleBlock(style, b, r, exp) {
    const a = b.all || {}, tr = b.training || {}, un = b.unseen || {};
    const wrap = h("div", { class: "stack" });
    wrap.append(card(`${STYLE_LABEL[style] || style}`,
      h("div", { class: "stats" },
        stat("Money", money(a.pnl_gbp), `${a.sets || 0} sets · final ${money(b.final_balance)}`, (a.pnl_gbp || 0) >= 0 ? "good" : "bad"),
        stat("Average R", signed(a.avg_r, 3), "after spread"), stat("Pips per lot", num(a.pips_per_lot_total, 0), "lot-weighted, summed over sets"),
        stat("Win rate", pct(a.win_rate_pct), "last, not first"), stat("Profit factor", num(a.profit_factor, 2)), stat("Reward : risk", num(a.reward_to_risk, 2), "avg win ÷ avg loss"),
        stat("Worst drawdown", `${money(a.worst_drawdown_gbp)} / ${num(a.worst_drawdown_r, 1)}R`, `${pct(b.stats?.max_drawdown_pct)} of equity`), stat("Longest losing streak", a.longest_losing_streak ?? "—"),
        stat("Training months", money(tr.pnl_gbp), `${tr.sets || 0} sets · avg R ${signed(tr.avg_r, 3)}`),
        stat("Unseen months", money(un.pnl_gbp), `${un.sets || 0} sets · avg R ${signed(un.avg_r, 3)} · ${(r.unseen_months || []).join(", ") || "none"}`, (un.pnl_gbp || 0) >= 0 ? "good" : "bad"),
        stat("Leverage cap hits", a.cap_hits ?? 0, "sets cut down"), stat("Gap fills", `${b.stats?.gap_stops || 0} stops / ${b.stats?.gap_targets || 0} targets`, `cost ${num(b.stats?.gap_cost_pips, 0)} pips`),
        stat("Same-minute stop+target", b.stats?.ambiguous_bars || 0, "counted as the stop"), stat("Closed by indicator", b.stats?.closed_by_indicator || 0, "flattened at market on its CLOSED"), stat("Closed by opposite signal", b.stats?.closed_by_opposite_signal || 0)),
      b.rejections ? h("p", { class: "help" }, `Skipped signals: ${b.rejections} — ${Object.entries(b.rejection_reasons || {}).slice(0, 4).map(([k, v]) => `${k} (${v})`).join("; ")}`) : null,
    ));
    // target reach
    if (b.target_reach?.all) {
      const t = b.target_reach.all, tt = b.target_reach_with_trailing_stop || {};
      wrap.append(card("Where the signals got to (before the stop)", h("div", { class: "stats" },
        stat("Signals", t.signals), stat("Reached TP1", pct(t.tp1_pct), `${pct(tt.tp1_pct)} with the trailing stop`), stat("Reached TP2", pct(t.tp2_pct), `${pct(tt.tp2_pct)} trailing`),
        stat("Reached TP3", pct(t.tp3_pct), `${pct(tt.tp3_pct)} trailing`), stat("Stopped first", pct(t.stopped_first_pct))),
        table(["Timeframe", "Signals", "TP1 %", "TP2 %", "TP3 %", "Stopped first %"], Object.entries(b.target_reach).filter(([k]) => k !== "all").map(([k, v]) => ({ Timeframe: k, Signals: v.signals, "TP1 %": pct(v.tp1_pct), "TP2 %": pct(v.tp2_pct), "TP3 %": pct(v.tp3_pct), "Stopped first %": pct(v.stopped_first_pct) })), { numeric: ["Signals", "TP1 %", "TP2 %", "TP3 %", "Stopped first %"] })));
    }
    // charts
    const eqC = h("canvas", { class: "chart" }), ddC = h("canvas", { class: "chart" }), mtC = h("canvas", { class: "chart" }), sessC = h("canvas", { class: "chart" }), monC = h("canvas", { class: "chart" });
    wrap.append(card("Equity and drawdown", h("div", { class: "grid two" }, h("div", {}, h("h3", {}, "Equity £"), eqC), h("div", {}, h("h3", {}, "Drawdown £"), ddC))));
    const splitCard = card("Splits", h("div", { class: "grid two" },
      h("div", {}, h("h3", {}, "By market type at entry (£)"), mtC), h("div", {}, h("h3", {}, "By session, UK time (£)"), sessC)),
      h("h3", {}, "By month: £ (bars)"), monC,
      this.splitTable("By market type (own timeframe)", b.by_market_type), this.splitTable("By 1H market type", b.by_market_type_1h), this.splitTable("Quiet vs not", b.by_quiet),
      this.splitTable("15M / 1H / 4H agreement at entry", b.by_htf_agreement), this.splitTable("By session (UK)", b.by_session), this.splitTable("By timeframe", b.by_timeframe),
      this.splitTable("By trigger (plan)", b.by_plan), this.splitTable("By direction", b.by_direction), this.splitTable("By year", b.by_year),
      h("h3", {}, "Session heatmap (UK weekday × hour, £ and number of sets)"), h("div", { html: heatmapHtml(b.session_heatmap || []) }));
    wrap.append(splitCard);
    // sideways
    const sb = b.sideways_bleed || {}, st = b.sideways_stress_test || {};
    wrap.append(card("Sideways and flat markets", h("div", { class: "stats" },
      stat("Same-direction entries after a stop", sb.same_direction_entries_after_stop ?? "—", "no cool-down in the indicator"), stat("Stop-outs per day", `${num(sb.stop_outs_per_day_mean, 2)} avg / ${sb.stop_outs_per_day_max ?? "—"} max`, `${sb.days_with_3_or_more_stops ?? 0} days with 3+`),
      stat("Breakeven exits", sb.breakeven_exits ?? 0)),
      h("h3", {}, "Stress test: flattest 10% of weeks vs all other weeks"),
      h("div", { class: "grid two" }, this.miniStats("Flattest weeks", st.flattest), this.miniStats("Other weeks", st.other_weeks)),
      h("p", { class: "help" }, `Flattest weeks (range ÷ ATR ≤ ${num(st.cutoff_range_over_atr, 2)}): ${(st.flattest_10pct_weeks || []).join(", ") || "—"}`)));
    // luck
    const lk = b.luck_check;
    if (lk && lk.runs) {
      const hc = h("canvas", { class: "chart" });
      wrap.append(card("Luck check: the same exits and money rules on random entries", h("p", { class: lk.beats_random_median ? "good" : "bad" }, lk.verdict),
        h("div", { class: "stats" }, stat("Random runs", lk.runs, `${lk.trades_per_run} trades each`), stat("You (static levels)", money(lk.real_pnl_gbp_static_levels), `avg R ${signed(lk.real_avg_r_static_levels, 3)}`),
          stat("You (full, trailing)", money(lk.real_pnl_gbp_full), `avg R ${signed(lk.real_avg_r_full, 3)}`), stat("Random median", money(lk.random_pnl_median), `best ${money(lk.random_pnl_best)}`),
          stat("Rank by money", `${lk.random_runs_at_least_as_good_by_money} of ${lk.runs} as good`, `p = ${lk.p_value_money}`), stat("Rank by avg R", `${lk.random_runs_at_least_as_good_by_r} of ${lk.runs}`, `p = ${lk.p_value_r}`)),
        hc, h("p", { class: "help" }, lk.note)));
      requestAnimationFrame(() => histogram(hc, lk.random_pnl_histogram, lk.real_pnl_gbp_static_levels));
    } else if (lk) wrap.append(card("Luck check", h("p", { class: "muted" }, lk.note || "not run")));
    // experiment next to baseline
    if (exp) {
      wrap.append(card(`Experiment: ${r.experiment?.label || "labelled experiment"} (next to the unchanged baseline)`,
        h("div", { class: "grid two" }, this.miniStats("Baseline (unchanged)", a), this.miniStats("Experiment", exp.all)),
        h("div", { class: "grid two" }, this.miniStats("Baseline, unseen months", un), this.miniStats("Experiment, unseen months", exp.unseen))));
    }
    requestAnimationFrame(() => {
      const eq = (b.equity || []).map((e) => e.equity), bal = (b.equity || []).map((e) => e.balance);
      lineChart(eqC, [{ name: "equity", values: eq, color: "#35d07f" }, { name: "balance", values: bal, color: "#5aa9ff", width: 1 }], { labels: (b.equity || []).map((e) => e.time.slice(5, 10)) });
      let peak = -Infinity; const dd = eq.map((v) => { peak = Math.max(peak, v); return v - peak; });
      lineChart(ddC, [{ values: dd, color: "#ff5c5c", fill: "rgba(255,92,92,.15)" }], { zeroLine: true });
      barChart(mtC, Object.entries(b.by_market_type || {}).map(([k, v]) => ({ label: `${k} (${v.sets})`, value: v.pnl_gbp })));
      barChart(sessC, Object.entries(b.by_session || {}).map(([k, v]) => ({ label: `${k} (${v.sets})`, value: v.pnl_gbp })));
      barChart(monC, (b.by_month || []).map((m) => ({ label: m.month, value: m.pnl_gbp })));
    });
    return wrap;
  }

  miniStats(title, s) {
    s = s || {};
    return h("div", { class: "card tight" }, h("h3", {}, title), h("div", { class: "stats" }, stat("Sets", s.sets ?? 0), stat("£", money(s.pnl_gbp), "", (s.pnl_gbp || 0) >= 0 ? "good" : "bad"), stat("Avg R", signed(s.avg_r, 3)), stat("Win", pct(s.win_rate_pct)), stat("PF", num(s.profit_factor, 2)), stat("DD £", money(s.worst_drawdown_gbp))));
  }

  splitTable(title, split) {
    if (!split || !Object.keys(split).length) return null;
    const rows = Object.entries(split).map(([k, v]) => ({ Group: k, Sets: v.sets, "£": money(v.pnl_gbp), "Avg R": signed(v.avg_r, 3), "Win %": pct(v.win_rate_pct), PF: num(v.profit_factor, 2), "Pips/lot": num(v.pips_per_lot_total, 0), "DD £": money(v.worst_drawdown_gbp) }));
    return h("details", {}, h("summary", {}, title), table(["Group", "Sets", "£", "Avg R", "Win %", "PF", "Pips/lot", "DD £"], rows, { numeric: ["Sets", "£", "Avg R", "Win %", "PF", "Pips/lot", "DD £"] }));
  }

  async loadReplay(requestId, r, cardEl) {
    const replay = await gh.getJson(state.token, state.owner, `results/${requestId}/replay.json`);
    if (!replay) { cardEl.append(h("p", { class: "muted" }, "No replay file.")); return; }
    const tfs = (r.settings?.timeframes || ["5M"]);
    const sel = select(tfs, tfs[0]);
    const host = h("div");
    const load = async () => {
      host.replaceChildren(h("p", { class: "help" }, "Loading candles…"));
      const data = await gh.getJson(state.token, state.owner, `results/${requestId}/candles_${sel.value}.json`);
      if (!data) { host.replaceChildren(h("p", { class: "muted" }, "No candles for that timeframe.")); return; }
      const tfm = sel.value;
      const trades = replay.trades.filter((t) => `${t.tf}` === String(tfMinutes(tfm)) || tfs.length === 1 || true);
      new Replay(host, data, trades.map((t) => ({ ...t, dir: t.dir })), { window: 150, equity: replay.equity || [] });
    };
    sel.addEventListener("change", load);
    cardEl.replaceChildren(h("h2", {}, "Replay (real trades on real candles)", h("span", { class: "row" }, h("span", { class: "help" }, "candles"), sel)), h("p", { class: "help" }, `Exit style shown: ${STYLE_LABEL[replay.exit_style] || replay.exit_style}. Entries, stops, targets and exits are the engine's real fills.`), host);
    await load();
  }

  async downloadCsv(requestId) {
    try {
      const blob = await gh.downloadBlob(state.token, state.owner, `results/${requestId}/trades.csv`);
      download(`${requestId}-trades.csv`, blob);
    } catch (e) { alert(e.message); }
  }

  async describeStrategy() {
    const description = this.f.describe.value.trim();
    if (description.length < 20) { alert("Describe the rules in a bit more detail first."); return; }
    this.showProgress({ phase: "queued" });
    try {
      const { result } = await startRun("codegen", { description, name: this.f.describeName.value.trim() }, (p) => this.showProgress(p), { prefix: "codegen" });
      this.renderCodegen(result);
      this.loadCustomStrategies();
    } catch (e) { this.progress.replaceChildren(h("p", { class: "error" }, e.message)); }
  }

  renderCodegen(result) {
    this.progress.hidden = true;
    const name = result.strategy;
    const box = card(`Claude's reading of your rules — ${name}`,
      result.error ? h("p", { class: "error" }, result.error) : null,
      h("div", { class: "summary-text", html: mdLite(result.reading || "(no reading written)") }),
      h("p", { class: "help" }, "The generated tests run in a sandbox (no secrets, no network). Confirm only if this reading matches what you meant; otherwise correct it and Claude rewrites the module."),
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: () => this.confirmStrategy(name, true, "") }, "This is what I meant — confirm"),
        h("button", { class: "secondary", onclick: () => { const c = prompt("What did Claude get wrong?"); if (c) this.correctStrategy(name, c); } }, "Correct it")));
    this.results.replaceChildren(box);
  }

  async confirmStrategy(name, confirmed, correction) {
    this.showProgress({ phase: "queued" });
    try {
      const { result } = await startRun("confirm", { name, confirmed, correction }, (p) => this.showProgress(p), { prefix: "confirm" });
      this.progress.hidden = true;
      this.results.replaceChildren(card("Strategy confirmed", h("p", {}, `${name} is saved and can be run here and in live paper testing.`)));
      this.loadCustomStrategies();
    } catch (e) { this.progress.replaceChildren(h("p", { class: "error" }, e.message)); }
  }

  async correctStrategy(name, correction) {
    this.showProgress({ phase: "queued" });
    try {
      await startRun("confirm", { name, confirmed: false, correction }, (p) => this.showProgress(p), { prefix: "confirm" });
      const desc = this.f.describe.value.trim();
      const { result } = await startRun("codegen", { description: desc || correction, name: name.split("/").pop() }, (p) => this.showProgress(p), { prefix: "codegen" });
      this.renderCodegen(result);
    } catch (e) { this.progress.replaceChildren(h("p", { class: "error" }, e.message)); }
  }
}

function tfMinutes(label) {
  const m = { "1M": 1, "3M": 3, "5M": 5, "15M": 15, "30M": 30, "45M": 45, "1H": 60, "2H": 120, "3H": 180, "4H": 240 };
  return m[label] || 5;
}
