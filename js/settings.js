// Settings: the GitHub token (encrypted on this device), password, budgets and limits, HSN Capital's size and
// budgets, Actions minutes and AI costs, data coverage and the match check, the animations switch.
import * as vault from "./vault.js";
import * as gh from "./github.js";
import { state, startSettingsWorkflow, loadShared, switchView } from "./app.js";
import { ukDateTime } from "./clock.js";
import { h, card, stat, table, badge, field, select, input, num, pct, money } from "./ui.js";
import { exportView, matchView, TV_STEPS } from "./dataview.js";

function permissionWords(can) {
  const missing = [can.contents === false ? "Contents (Read-only), which lets the site read results" : null, can.actions === false ? "Actions (Read and write), which lets the site start runs" : null].filter(Boolean);
  return `The token is saved, but it is missing ${missing.join(" and ")}. On GitHub: github.com/settings/personal-access-tokens → tap this token → Edit → Permissions → Add permissions → tick it → Update. The token itself stays the same, so there is nothing to paste again.`;
}

export class SettingsView {
  constructor(root, { onTokenSaved }) { this.root = root; this.onTokenSaved = onTokenSaved; }
  onUnlock() {}
  async show() { this.render(); }

  render() {
    const meta = vault.tokenMeta();
    const token = input("password", "", { placeholder: "github_pat_… (fine-grained, hsn-test-lab-engine only)", autocomplete: "off" });
    const saveTok = h("button", { class: "primary", onclick: async () => {
      const t = token.value.trim();
      if (!t) return;
      try {
        const who = await gh.whoami(t);
        await gh.checkEngineAccess(t, who.login);
        const can = await gh.checkPermissions(t, who.login);
        await vault.setToken(t, { expiresAt: who.expiry || null, owner: who.login });
        token.value = "";
        await this.onTokenSaved();
        this.render();
        if (can.contents === false || can.actions === false) alert(permissionWords(can));
      } catch (e) { alert(e.message); }
    } }, "Save token");
    const forget = h("button", { class: "danger", onclick: () => { if (confirm("Forget the token on this device?")) { vault.forgetToken(); state.token = null; this.render(); } } }, "Forget token");
    const expiry = meta.expiresAt ? new Date(meta.expiresAt) : null;
    const daysLeft = expiry ? Math.round((expiry - Date.now()) / 86400000) : null;
    const tokenCard = card("GitHub token",
      h("p", { class: "help" }, "A fine-grained token for hsn-test-lab-engine only: Actions read and write (to start runs and read progress), Contents read-only (to read results), 90-day expiry. It is encrypted with your password and never leaves this device except to call api.github.com."),
      vault.hasToken() ? h("p", {}, badge(`connected as ${meta.owner || "?"}`, "good"), " ", expiry ? badge(`expires ${ukDateTime(meta.expiresAt)}${daysLeft !== null && daysLeft <= 10 ? " — renew soon!" : ""}`, daysLeft !== null && daysLeft <= 10 ? "warn" : "") : badge("expiry: shown on GitHub, not here", ""), " ", (this.permEl = h("span", {}))) : h("p", { class: "warnc" }, "No token saved on this device."),
      h("div", { class: "row" }, token, saveTok, vault.hasToken() ? forget : null),
      h("details", {}, h("summary", {}, "How to make the token"), h("ol", {}, h("li", {}, "GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token."), h("li", {}, "Repository access: Only select repositories → hsn-test-lab-engine."), h("li", {}, "Permissions → Repository: Actions = Read and write; Contents = Read-only; Metadata = Read-only (automatic)."), h("li", {}, "Expiration: 90 days. Generate, copy, paste here."))));
    const pw1 = input("password", "", { placeholder: "current" }), pw2 = input("password", "", { placeholder: "new (6+ characters)" });
    const pwCard = card("Password", h("div", { class: "row" }, pw1, pw2, h("button", { class: "secondary", onclick: async () => { try { await vault.changePassword(pw1.value, pw2.value); alert("Password changed."); pw1.value = pw2.value = ""; } catch (e) { alert(e.message); } } }, "Change password")),
      h("p", { class: "help" }, "This is a static site on GitHub Pages: there is no server-side login. The password protects the token on this device; the token is what unlocks the data."));

    const cfg = state.config || {};
    const budget = input("number", cfg.monthly_budget_usd ?? 90, { min: 0, step: 5 });
    const runsDay = input("number", cfg.max_runs_per_day ?? 20, { min: 1, step: 1 });
    const gbp = input("number", cfg.gbpusd_fixed ?? "", { step: 0.0001, placeholder: "blank = require GBPUSD data" });
    const spreadG = input("number", cfg.default_spread?.XAUUSD ?? 0.25, { step: 0.01 });
    const spreadN = input("number", cfg.default_spread?.NAS100 ?? 1.5, { step: 0.1 });
    const leverage = input("number", cfg.leverage ?? 20, { step: 1 });
    const model = select([["claude-sonnet-5-5", "Claude Sonnet 5.5"], ["claude-opus-5-5", "Claude Opus 5.5"], ["claude-fable-5-1", "Claude Fable 5.1"]], cfg.summary_model || "claude-sonnet-5-5");
    const nas = input("text", cfg.nas100_symbol || "FOREXCOM:NSXUSD (to confirm)");
    const firm = cfg.firm || {};
    const agents = input("number", firm.agents ?? 100, { min: 5, max: 200, step: 5 });
    const fmodel = select([["claude-sonnet-5-5", "Claude Sonnet 5.5 (default)"], ["claude-haiku-5-5", "Claude Haiku 5.5 (more turns per $)"], ["claude-opus-5-5", "Claude Opus 5.5"]], firm.model || "claude-sonnet-5-5");
    const fmin = input("number", firm.monthly_minutes_budget ?? 1200, { min: 0, step: 50 });
    const fapi = input("number", firm.monthly_api_budget_usd ?? 60, { min: 0, step: 5 });
    const vault_m = input("number", firm.vault_months ?? 2, { min: 1, max: 6 });
    const saveCfg = h("button", { class: "primary", onclick: async () => {
      const payload = { monthly_budget_usd: +budget.value, max_runs_per_day: +runsDay.value, gbpusd_fixed: gbp.value ? +gbp.value : null,
        default_spread: { XAUUSD: +spreadG.value, NAS100: +spreadN.value }, leverage: +leverage.value, summary_model: model.value, nas100_symbol: nas.value,
        firm: { agents: +agents.value, model: fmodel.value, monthly_minutes_budget: +fmin.value, monthly_api_budget_usd: +fapi.value, vault_months: +vault_m.value } };
      try { await startSettingsWorkflow(payload); alert("Saved through the settings workflow (takes about a minute to land)."); setTimeout(() => loadShared(), 70000); } catch (e) { alert(e.message); }
    } }, "Save settings");
    const limitsCard = card("Budgets and limits", h("div", { class: "group form" },
      field("Monthly API budget for this site ($)", budget, "Car Finder has its own $100"), field("Your runs per day", runsDay), field("Summary / codegen model", model), field("Leverage cap", leverage),
      field("Fixed GBP/USD (labelled assumption)", gbp), field("Default spread gold ($)", spreadG, "used only where no spread is recorded"), field("Default spread NAS100 (pts)", spreadN), field("FOREX.com Nasdaq symbol", nas)),
      h("h3", {}, "HSN Capital"), h("div", { class: "group form" }, field("Agents", agents), field("Model (same for every agent)", fmodel), field("Actions minutes budget / month", fmin), field("API budget / month ($)", fapi), field("Vault months (locked for floor 4)", vault_m)),
      h("div", { class: "row" }, saveCfg, h("span", { class: "help" }, "Budgets apply from the firm's next shift. How often a shift runs, and Start / Pause, are on the HSN Capital page.")));

    const mins = state.minutes || {};
    const usageCard = card("Minutes and AI costs this month", h("div", { class: "stats" },
      stat("Actions minutes", num(mins.minutes_used, 0), `of 2,000 free · checked ${ukDateTime(mins.checked_at)}`, (mins.minutes_used || 0) >= 1600 ? "warnc" : ""),
      stat("Firm minutes budget", num(firm.monthly_minutes_budget ?? 1200, 0))), this.usageTable(), h("p", { class: "help" }, "AI usage is the cost Claude Code reports for every run; new AI steps are blocked at 100% of the budget. Backtests that need no AI keep working."));

    const cov = state.coverage?.symbols || {};
    const covRows = Object.entries(cov).map(([s, c]) => ({ Symbol: s, Kind: c.kind || "—", Months: c.months || 0, Bars: num(c.bars, 0), From: (c.first_bar || "").slice(0, 10), To: (c.last_bar || "").slice(0, 10), Sources: (c.sources || []).join(", "), "Gaps > 1 min": c.gaps_over_1_minute ?? "—" }));
    const m = state.match;
    const dataCard = card("Data", table(["Symbol", "Kind", "Months", "Bars", "From", "To", "Sources", "Gaps > 1 min"], covRows, { numeric: ["Months", "Bars", "Gaps > 1 min"] }),
      h("h3", {}, "TradingView check"), this.matchBox(m),
      h("div", { class: "row" },
        h("button", { class: "secondary", onclick: async () => { try { await gh.dispatch(state.token, state.owner, gh.DATA_WORKFLOW, {}); alert("Data check requested. The result appears here when it finishes (about 5 minutes)."); } catch (e) { alert(e.message); } } }, "Run the data check now")),
      h("p", { class: "help" }, "This holds the Lab against TradingView in three ways: the Lab's copy of your indicator against TradingView's own values, the Lab's FOREX.com prices against TradingView's candles, and the Buy and Sell marks on the Lab's prices against the marks on your chart. The site says TRIAL MODE until the indicator is proven the same and the prices have been accepted."));

    const anim = h("label", { class: "chip" }, h("input", { type: "checkbox", checked: state.animations || null, onchange: (e) => { state.animations = e.target.checked; localStorage.setItem("hsn.animations", e.target.checked ? "on" : "off"); } }), "Animations on");
    const misc = card("Display", anim, h("p", { class: "help" }, "Turn animations off on a slow connection; the building and replay then draw still frames."),
      h("p", { class: "help" }, "This site stores nothing but your encrypted token and these display choices. Clearing the site data in the browser removes them."));
    this.mt5El = h("div", {}, h("p", { class: "muted" }, "Loading…"));
    const mt5Card = card("FOREX.com history from MT5 in the cloud (no VPS needed)", this.mt5El,
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: async () => {
          if (!confirm("Start the price download now? A Windows machine at GitHub installs MetaTrader 5, logs in with the FOREX.com values saved from the One-time setup page, brings the 1-minute history up to date and runs the Data check. A weekly top-up takes about 15 minutes; the first download can take up to an hour. Windows minutes count double against the GitHub allowance.")) return;
          try { await gh.dispatch(state.token, state.owner, gh.MT5_WORKFLOW, {}); alert("Export requested. Watch it under Runs or in the Actions tab; this card updates when it finishes."); } catch (e) { alert(e.message); }
        } }, "Export FOREX.com history now")),
      h("details", {}, h("summary", {}, "How to set it up (once)"), h("ol", {},
        h("li", {}, "Use a FOREX.com MT5 account with its READ-ONLY investor password. The engine checks the login and refuses one that could place a trade, with one exception you allowed on 14 Nov 2026: a demo account's normal password. FOREX.com emails the account number and the server name; an investor password is set in MetaTrader 5."),
        h("li", {}, "Put the three values in on the One-time setup page (FOREXCOM_MT5_LOGIN, FOREXCOM_MT5_SERVER, FOREXCOM_MT5_PASSWORD). They are sealed in this browser and saved straight into GitHub's secrets; the engine then checks the login and starts the first export by itself."),
        h("li", {}, "The first download goes back about thirteen months of 1-minute bars, or to where FOREX.com's own history starts, newest month first, and then runs the Data check. Going further back is one setting on the engine's side. After that it runs every Monday at 01:17 UTC and only adds new bars. Export FOREX.com history now starts one by hand."),
        h("li", {}, "If a symbol is not on the server under its usual name, the engine uses the one name there that is a known name for it (the Nasdaq is often named differently). If there are several it does not guess: the report lists them."))));
    this.feedEl = h("div", {}, h("p", { class: "muted" }, "Loading…"));
    const feedCard = card("VPS feed (read-only, weekly release)", this.feedEl,
      h("p", { class: "help" }, "The VPS publishes one GitHub Release a week on Lilprogact/hsn-vps-feed (prices, indicator lines, signals, results + a manifest with checksums). The Data check reads the latest release with a read-only token (VPS_FEED_READ_TOKEN in the engine's secrets), verifies every checksum, imports the alerts and the research, and only catalogues the Vantage prices — never a results source. Nothing can write back."));
    this.setupEl = h("div", {}, h("p", { class: "muted" }, "Loading…"));
    const setupCard = card("Start-up checklist", this.setupEl,
      h("div", { class: "row" }, h("button", { class: "secondary small", onclick: async () => { try { await gh.dispatch(state.token, state.owner, gh.SETUP_WORKFLOW, {}); alert("Checking… reload this page in about a minute."); } catch (e) { alert(e.message); } } }, "Re-check now"),
        h("button", { class: "secondary small", onclick: () => switchView("setup") }, "Put the logins in: One-time setup")),
      h("p", { class: "help" }, "Only yes / no per secret is ever recorded, never a value. The logins themselves go in on the One-time setup page: sealed in this browser and sent straight to GitHub's secrets."));
    this.root.replaceChildren(setupCard, tokenCard, pwCard, limitsCard, usageCard, dataCard, mt5Card, feedCard, misc);
    this.loadUsage();
    this.loadPermissions();
    this.loadMt5();
    this.loadFeed();
    this.loadSetup();
  }

  /** Does the saved token really have both permissions? (A token without Contents can start jobs but read nothing.) */
  async loadPermissions() {
    if (!state.token || !this.permEl) return;
    try {
      const can = await gh.checkPermissions(state.token, state.owner);
      const bad = can.contents === false || can.actions === false;
      this.permEl.replaceChildren(badge(bad ? "a permission is missing" : "both permissions in place", bad ? "bad" : "good"));
      if (bad) this.permEl.after(h("p", { class: "warnc" }, permissionWords(can)));
    } catch { /* the page's own messages cover a token that does not work at all */ }
  }

  async loadSetup() {
    if (!state.token) return;
    try {
      const s = await gh.getJson(state.token, state.owner, "status/setup.json");
      if (!s) { this.setupEl.replaceChildren(h("p", { class: "muted" }, "No check yet — press Re-check now.")); return; }
      const sec = s.secrets || {}, d = s.data || {}, f = s.firm || {};
      const ok = (v) => badge(v ? "yes" : "no", v ? "good" : "bad");
      const gold = d.XAUUSD || {};
      const rows = [
        ["Site token saved on this device", ok(vault.hasToken()), "Settings → GitHub token"],
        ["FOREX.com MT5 login secrets (3)", ok(sec.forexcom_mt5_login), "One-time setup: FOREXCOM_MT5_LOGIN / _SERVER / _PASSWORD (the investor password, or a demo account's own)"],
        ["Gold 1-minute history in the engine", gold.bars ? badge(`${num(gold.bars, 0)} bars · ${(gold.first_bar || "").slice(0, 10)} → ${(gold.last_bar || "").slice(0, 10)}${gold.kind === "tv" ? " · TRIAL (exports)" : ""}`, "good") : badge("none", "bad"), "Settings → Export FOREX.com history now"],
        ["NAS100 history", (d.NAS100 || {}).bars ? badge(`${num(d.NAS100.bars, 0)} bars`, "good") : badge("none", "warn"), "needs the right FOREX.com symbol name"],
        ["GBP/USD history (for the £ maths)", (d.GBPUSD || {}).bars ? badge(`${num(d.GBPUSD.bars, 0)} bars`, "good") : badge("none — fixed rate used if set", "warn"), ""],
        ["TradingView exports + match check", s.tv_exports ? badge(`${s.tv_exports} files · match ${s.match_check?.passes ? "passes" : "not yet"}`, s.match_check?.passes ? "good" : "warn") : badge("no exports", "warn"), "proves the port = your indicator"],
        ["Anthropic API key (agents think)", ok(sec.anthropic_api_key || sec.claude_oauth_token), "One-time setup: ANTHROPIC_API_KEY"],
        ["VPS feed read-only token", ok(sec.vps_feed_read_token), "One-time setup: VPS_FEED_READ_TOKEN (alerts, research)"],
        ["HSN Capital", f.exists ? badge(`${f.agents} agents · shift ${f.cycle} · ${f.paused ? "not started / paused" : "working"}`, f.paused ? "warn" : "good") : badge("not opened", "warn"), "HSN Capital → Start the company"],
        ["Runs finished", badge(`${s.runs?.done ?? 0} (Waves: ${s.runs?.waves_done ?? 0})`, ""), "run one Backtest → Waves rules for the agents' benchmark"],
      ];
      this.setupEl.replaceChildren(h("p", { class: "muted" }, `checked ${ukDateTime(s.checked_at)}`),
        table(["What", "State", "Where"], rows.map(([w, st, where]) => ({ What: w, State: st, Where: where }))));
    } catch (e) { this.setupEl.replaceChildren(h("p", { class: "error" }, e.message)); }
  }

  async loadFeed() {
    if (!state.token) return;
    try {
      const f = await gh.getJson(state.token, state.owner, "status/vps_feed.json");
      if (!f) { this.feedEl.replaceChildren(h("p", { class: "muted" }, "Not read yet: put VPS_FEED_READ_TOKEN (Contents read-only on hsn-vps-feed) in on the One-time setup page; the engine then reads the latest release.")); return; }
      if (f.error) { this.feedEl.replaceChildren(h("p", { class: "warnc" }, `${f.error} (checked ${ukDateTime(f.imported_at)})`)); return; }
      const rel = f.release || {};
      const rows = (f.assets || []).map((a) => ({ File: a.name, Kind: a.kind, Size: `${num((a.bytes || 0) / 1048576, 1)} MB`, Checksum: a.checksum || "—", "Date range": a.date_from ? `${a.date_from} → ${a.date_to || "?"}` : "—", Extracted: a.extracted ? `${num(a.extracted.files, 0)} files` : "—" }));
      this.feedEl.replaceChildren(
        h("p", {}, badge(`release ${rel.tag || "?"} · ${ukDateTime(rel.published_at)}`, "good"), " ", badge(`imported ${ukDateTime(f.imported_at)}`), " ",
          f.imported?.alerts_files ? badge(`${f.imported.alerts_files} alert files`) : null, " ", f.imported?.research_files ? badge(`${f.imported.research_files} research files`) : null),
        table(["File", "Kind", "Size", "Checksum", "Date range", "Extracted"], rows),
        f.catalogue?.prices ? h("p", { class: "muted" }, `Vantage prices in the feed: ${num(f.catalogue.prices.bars, 0)} bars, ${(f.catalogue.prices.first_bar || "").slice(0, 10)} → ${(f.catalogue.prices.last_bar || "").slice(0, 10)} (comparison material only, not imported).`) : null,
        (f.left_out || []).length ? h("details", {}, h("summary", {}, `${f.left_out.length} things left out`), h("ul", {}, ...f.left_out.map((x) => h("li", {}, x)))) : null,
        (f.warnings || []).length ? h("p", { class: "warnc" }, f.warnings.join(" · ")) : null);
    } catch (e) { this.feedEl.replaceChildren(h("p", { class: "error" }, e.message)); }
  }

  async loadMt5() {
    if (!state.token) return;
    try {
      const m = await gh.getJson(state.token, state.owner, "status/mt5_cloud.json");
      const v = exportView(m);
      if (v.kind === "never") { this.mt5El.replaceChildren(h("p", { class: "muted" }, "Never run. Put the three FOREX.com values in on the One-time setup page; the first export then starts by itself.")); return; }
      if (v.kind === "stopped") { this.mt5El.replaceChildren(h("p", { class: "error" }, `The download stopped rather than save something it could not stand behind: ${v.text}`), h("p", { class: "muted" }, `checked ${ukDateTime(v.at)}`)); return; }
      if (v.kind === "status") { this.mt5El.replaceChildren(h("p", { class: "warnc" }, v.text), h("p", { class: "muted" }, `checked ${ukDateTime(v.at)}`)); return; }
      if (v.kind === "probe") { this.mt5El.replaceChildren(h("p", {}, badge(m.terminal_started ? "MetaTrader 5 installs and starts on the cloud runner" : "MetaTrader 5 did not start on the cloud runner", m.terminal_started ? "good" : "bad"), " ", badge(m.api_attached ? "Python API attached" : "Python API not attached (no login yet)", m.api_attached ? "good" : "warn")), h("p", { class: "help" }, m.note || "")); return; }
      const rows = v.rows.map((r) => ({ ...r, "Bars read": r["Bars read"] === undefined ? "" : num(r["Bars read"], 0), Months: r.Months === undefined ? "" : num(r.Months, 0) }));
      this.mt5El.replaceChildren(
        h("p", {}, badge(`last download ${ukDateTime(v.at)}`, "good"), " ", badge(v.terminal), " ", v.login ? badge(v.login.text, v.login.kind) : null),
        h("p", { class: "help" }, v.clock),
        ...v.notes.map((n) => h("p", { class: "warnc" }, n)),
        table(["Symbol", "Bars read", "Months", "From", "To", "Note"], rows, { numeric: ["Bars read", "Months"] }),
        h("p", { class: "help" }, `Months is how many months of 1-minute bars are stored for that symbol; From and To are its first and last stored bar (UTC).${v.askedBackTo ? ` The download was asked to reach back to ${v.askedBackTo}.` : ""} A month is only stored when every hour MetaTrader's own hourly bars show for it is there.`));
    } catch (e) { this.mt5El.replaceChildren(h("p", { class: "error" }, e.message)); }
  }

  /** The TradingView check in plain words: what was compared and what came out, or how to make the files. */
  matchBox(m) {
    const v = matchView(m);
    const when = v.at ? h("span", { class: "muted" }, ` · checked ${ukDateTime(v.at)}`) : null;
    if (v.kind !== "report") {
      return h("div", {}, h("p", {}, badge("waiting for your TradingView files", "warn"), when), h("p", {}, v.headline),
        h("p", { class: "help" }, "TradingView gives chart data only to a signed-in account that downloads it, so this needs five minutes from you. Best done while the market is shut."),
        h("ol", { class: "steps" }, v.steps.map((s) => h("li", {}, s))));
    }
    return h("div", {}, h("p", {}, v.badges.flatMap((b) => [badge(b.text, b.kind), " "]), when), h("p", {}, v.headline),
      v.files.map((f) => h("div", { class: `tv-file${f.problem ? " problem" : ""}` }, h("strong", {}, f.title), h("div", { class: "muted small" }, f.name),
        h("ul", {}, f.lines.map((l) => h("li", {}, l))))),
      h("details", {}, h("summary", {}, "How to add more files"), h("ol", { class: "steps" }, TV_STEPS.map((s) => h("li", {}, s)))));
  }

  usageTable() { this.usageEl = h("div"); return this.usageEl; }

  async loadUsage() {
    if (!state.token) return;
    try {
      const month = new Date().toISOString().slice(0, 7);
      const u = await gh.getJson(state.token, state.owner, `usage/${month}.json`);
      if (!u) { this.usageEl.replaceChildren(h("p", { class: "muted" }, "No AI usage recorded this month.")); return; }
      const cap = state.config?.monthly_budget_usd ?? 90;
      const total = u.total_cost_usd || 0;
      this.usageEl.replaceChildren(h("div", { class: "stats" }, stat("AI spent", `$${num(total, 2)}`, `of $${cap} (${pct(100 * total / cap, 0)})`, total >= 0.8 * cap ? "warnc" : ""), ...Object.entries(u.by_kind || {}).map(([k, v]) => stat(k, `$${num(v, 2)}`))),
        h("details", {}, h("summary", {}, `${(u.runs || []).length} AI calls`), table(["When", "Kind", "What", "Cost $"], (u.runs || []).slice().reverse().slice(0, 60).map((r) => ({ When: ukDateTime(r.at), Kind: r.kind, What: r.what || r.request_id || "", "Cost $": num(r.cost_usd, 3) })), { numeric: ["Cost $"] })));
    } catch (e) { this.usageEl.replaceChildren(h("p", { class: "error" }, e.message)); }
  }
}
