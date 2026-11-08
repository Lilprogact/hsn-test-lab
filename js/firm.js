// Mode 4: HSN Capital — the building, the firm page and the CEO's office. Every number shown comes from the
// engine's files (firm/firm.json, firm/leaderboard.json, firm/agents/<id>.json, library, minutes, reports, memos).
import * as gh from "./github.js";
import { state, startRun, liveText, trialMode } from "./app.js";
import { ukDateTime } from "./clock.js";
import { h, card, stat, table, badge, field, select, input, money, num, pct, signed, openModal, mdLite } from "./ui.js";
import { Building } from "./building.js";

const LEVELS = { 1: "Analyst", 2: "Associate", 3: "Vice President", 4: "Director", 5: "Managing Director" };

export class FirmView {
  constructor(root) {
    this.root = root;
    this.firm = null; this.live = null; this.board = null;
    this.building = null;
    this.timer = null;
  }
  onUnlock() {}
  show() { this.load(); if (this.timer) clearInterval(this.timer); this.timer = setInterval(() => { if (!this.root.hidden) this.refreshLive(); }, 30000); }

  async load() {
    if (!this.firm) this.root.replaceChildren(h("p", { class: "muted" }, "Loading HSN Capital…"));
    try {
      const [firm, board, live] = await Promise.all([
        gh.getJson(state.token, state.owner, "firm/firm.json"),
        gh.getJson(state.token, state.owner, "firm/leaderboard.json"),
        gh.getJson(state.token, state.owner, "status/firm_live.json", "live").catch(() => null),
      ]);
      this.firm = firm; this.board = board; this.live = live;
      this.render();
    } catch (e) { this.root.replaceChildren(h("p", { class: "error" }, e.message)); }
  }

  async refreshLive() {
    try {
      this.live = await gh.getJson(state.token, state.owner, "status/firm_live.json", "live");
      if (this.building && this.firm) this.building.setData(this.firm, this.live);
      if (this.liveEl) this.liveEl.textContent = this.live ? `${liveText(this.live)} · ${ukDateTime(this.live.updated_at)} UK` : "";
    } catch { /* keep the last state */ }
  }

  render() {
    const f = this.firm;
    if (!f) {
      this.root.replaceChildren(card("HSN Capital", h("p", { class: "muted" }, "The firm has not opened yet: no cycle has run. The first cycle runs on the schedule (every 6 hours) or now:"),
        h("button", { class: "primary", onclick: () => this.runCycle() }, "Run the first cycle now")));
      return;
    }
    const t = trialMode();
    const header = card(h("span", {}, "HSN Capital ", badge(`cycle ${f.cycle}`), " ", f.trial_mode ? badge("TRIAL MODE — working on the TradingView exports, nothing ranked for real", "trial") : badge("ranking on verified data", "good"), f.paused ? badge("PAUSED", "warn") : null),
      h("div", { class: "row between" },
        h("span", { class: "muted" }, `updated ${ukDateTime(f.updated_at)} UK · ${Object.keys(f.agents || {}).length} agents · ${f.library?.ideas ?? 0} ideas in the library (${f.library?.verified ?? 0} verified) · focus: ${f.monthly_focus || "none"}`),
        h("span", { class: "row" }, h("button", { class: "secondary small", onclick: () => this.runCycle() }, "Run a cycle now"), h("label", { class: "chip" }, h("input", { type: "checkbox", checked: state.animations || null, onchange: (e) => { state.animations = e.target.checked; localStorage.setItem("hsn.animations", e.target.checked ? "on" : "off"); if (this.building) this.building.animations = e.target.checked; } }), "animations"))),
      f.trial_mode ? h("p", { class: "warnc" }, t.reason) : null);
    this.liveEl = h("p", { class: "muted" }, this.live ? `${liveText(this.live)} · ${ukDateTime(this.live.updated_at)} UK` : "no cycle running right now");
    const canvas = h("canvas");
    const wrap = h("div", { class: "building-wrap" }, canvas, h("div", { class: "building-legend" }, ...Object.entries(LEVELS).map(([k, v]) => h("span", {}, h("i", { style: `display:inline-block;width:9px;height:9px;background:${["#5aa9ff", "#3fd1c9", "#35d07f", "#f5b942", "#b784ff"][k - 1]};margin-right:4px` }), v)), h("span", {}, "tap a room or an agent")));
    const buildingCard = card("The building (every movement is a real event)", this.liveEl, wrap);
    const page = h("div", { class: "stack" }, header, buildingCard, this.firmPage(), this.ceoOffice());
    this.root.replaceChildren(page);
    requestAnimationFrame(async () => {
      this.building = new Building(canvas, { animations: state.animations, onAgent: (id) => this.openAgent(id), onRoom: (room) => this.openRoom(room) });
      this.building.setData(f, this.live);
      this.building.playEvents(f.recent_events || []);
    });
  }

  firmPage() {
    const f = this.firm, floors = f.floors || {};
    const pyramid = h("div", { class: "pyramid" }, ...[5, 4, 3, 2, 1].map((k) => {
      const fl = floors[String(k)] || { agents: [] };
      return h("div", { class: "tier", title: `Floor ${k}: ${fl.agents.length} of ${fl.seats}` }, ...fl.agents.map((id) => h("span", { class: "seat", style: `background:${["#5aa9ff", "#3fd1c9", "#35d07f", "#f5b942", "#b784ff"][k - 1]}`, title: f.agents[id]?.name || id, onclick: () => this.openAgent(id) })));
    }));
    const rows = (this.board?.rows || []).slice(0, 25).map((r) => ({ "#": "", Name: r.name, Desk: r.desk, Floor: `${r.floor} ${r.level}`, Group: r.group, "Month Score": num(r.best_month_score, 1), "£": money(r.best_pnl), "Avg R": signed(r.best_avg_r, 3), Pips: num(r.best_pips, 0), Ideas: r.ideas, Mood: r.mood, _id: r.agent_id }));
    rows.forEach((r, i) => (r["#"] = i + 1));
    const lb = table(["#", "Name", "Desk", "Floor", "Group", "Month Score", "£", "Avg R", "Pips", "Ideas", "Mood"], rows, { numeric: ["#", "Month Score", "£", "Avg R", "Pips", "Ideas"] });
    lb.querySelectorAll("tbody tr").forEach((tr, i) => { tr.style.cursor = "pointer"; tr.addEventListener("click", () => this.openAgent(rows[i]._id)); });
    const ideas = (f.ideas_board || []).map((i) => h("div", { class: "item", onclick: () => this.openIdea(i) }, h("span", {}, h("span", { class: "t" }, `${i.id} · ${i.hypothesis}`), h("span", { class: "d" }, ` ${i.agent} (${i.desk}) · £${num(i.summary?.pnl_gbp, 0)} · avg R ${signed(i.summary?.avg_r, 3)} · passed floor ${i.gates?.passed_floor}`))));
    const ev = (f.recent_events || []).filter((e) => ["level_up", "swapped_down", "transfer", "battle", "challenge_failed", "audit_failed", "meeting", "rotation", "retest_failed"].includes(e.kind)).slice(-40).reverse();
    const evList = table(["When (UK)", "Event", "Who", "Detail"], ev.map((e) => ({ "When (UK)": ukDateTime(e.at), Event: e.kind.replace("_", " "), Who: e.group || e.agent || e.challenger || "", Detail: e.kind === "level_up" || e.kind === "swapped_down" ? `floor ${e.from} → ${e.to}${e.skip ? " (skip!)" : ""}` : e.kind === "battle" ? `vs ${e.incumbent} on floor ${e.floor}: ${e.winner} won` : e.kind === "challenge_failed" ? (e.reasons || []).join("; ") : e.kind === "transfer" ? `${e.from_group} → ${e.to_group} (swapped ${e.swapped})` : e.kind === "meeting" ? `strategy ${e.strategy || "—"}${e.ai === false ? " (Engine-only)" : ""}` : e.kind === "audit_failed" ? `fast £${e.fast_pnl} vs audit £${e.audit_pnl}` : "" })));
    const lc = f.last_cycle || {};
    const budget = f.budget || {};
    const byFloor = [1, 2, 3, 4, 5].map((k) => ({ Floor: `${k} ${LEVELS[k]}`, Groups: (floors[String(k)]?.groups || []).length, "With a strategy": (floors[String(k)]?.groups || []).filter((g) => g.strategy).length, "Challenge attempts": f.attempts?.by_floor?.[String(k)] ?? f.attempts?.by_floor?.[k] ?? 0, "Ideas passed here": f.library?.passed_by_floor?.[String(k)] ?? 0 }));
    const docs = (title, names, folder) => h("details", {}, h("summary", {}, `${title} (${names.length})`), h("div", { class: "list" }, ...names.slice().reverse().slice(0, 40).map((n) => h("div", { class: "item", onclick: () => this.openDoc(`${folder}/${n}`) }, h("span", { class: "t" }, n)))));
    return card("Firm page",
      h("div", { class: "grid two" },
        h("div", {}, h("h3", {}, "Staff by floor"), pyramid, h("p", { class: "help" }, `Name check: ${f.name_audit?.generated ?? "—"} invented names, ${f.name_audit?.rejected_by_blocklist ?? 0} rejected for matching a known person.`),
          h("h3", {}, "Ideas tested and passed at each floor"), table(["Floor", "Groups", "With a strategy", "Challenge attempts", "Ideas passed here"], byFloor, { numeric: ["Groups", "With a strategy", "Challenge attempts", "Ideas passed here"] })),
        h("div", {}, h("h3", {}, "Budget meters"), h("div", { class: "stats" },
          stat("API this month (firm)", `$${num(budget.firm_spent_usd, 2)}`, `cap $${num(budget.firm_budget_usd, 0)}`, (budget.firm_spent_usd || 0) >= 0.8 * (budget.firm_budget_usd || 60) ? "warnc" : ""),
          stat("API this month (site)", `$${num(budget.total_spent_usd, 2)}`, `cap $${num(state.config?.monthly_budget_usd, 0)}`),
          stat("Actions minutes", num(state.minutes?.minutes_used, 0), `of ${budget.minutes_budget} firm budget / 2000 free`, (state.minutes?.minutes_used || 0) >= 0.8 * (budget.minutes_budget || 1200) ? "warnc" : ""),
          stat("Last cycle", `${lc.thinking_turns ?? 0} turns`, `${lc.variants_tested ?? 0} variants tested · ${lc.ai_calls ?? 0} AI calls · $${num(lc.ai_cost_usd, 2)}`),
          stat("Challenge attempts", f.attempts?.total ?? 0, "all counted for the random bar"), stat("Data", f.data_coverage?.symbols?.XAUUSD?.months ? `${f.data_coverage.symbols.XAUUSD.months} months gold` : "—", f.data_coverage?.symbols?.XAUUSD?.last_bar?.slice(0, 10) || "")),
          h("h3", {}, "Leaderboard by Month Score"), lb)),
      h("h3", {}, "Ideas Board (proven from floor 3 up, with verified report cards)"), ideas.length ? h("div", { class: "list" }, ...ideas) : h("p", { class: "muted" }, "Nothing has passed floor 3 yet."),
      h("h3", {}, "Level-ups, swaps, transfers, battles, failed challenges"), evList,
      h("div", { class: "grid three" }, docs("Meeting minutes", f.minutes || [], "firm/minutes"), docs("Managers' reports", f.reports || [], "firm/reports"), docs("Head of Trading memos", f.memos || [], "firm/memos")),
      (lc.warnings || []).length ? h("p", { class: "warnc" }, lc.warnings.join(" ")) : null,
      (lc.errors || []).length ? h("p", { class: "bad" }, "Last cycle reported errors: " + lc.errors.map((e) => e.message).join("; ")) : null);
  }

  ceoOffice() {
    const f = this.firm;
    const people = [...Object.entries(f.managers || {}).map(([k, m]) => [`M${k}`, `${m.name} — ${m.title}`]), ...Object.entries(f.agents || {}).map(([id, a]) => [id, `${a.name} — ${a.level}, ${a.desk}`])];
    const who = select(people, "M5");
    const q = h("textarea", { placeholder: "Ask anything: 'what did you test this week and what did the numbers say?'" });
    const answer = h("div", { class: "summary-text" });
    const ask = h("button", { class: "primary", onclick: async () => {
      answer.textContent = "Asking… (a run on GitHub; usually 1-2 minutes)";
      try {
        const { result } = await startRun("ceo", { action: "ask", who: who.value, question: q.value }, () => {}, { prefix: "ask" });
        const r = result.result || {};
        answer.replaceChildren(h("p", {}, h("b", {}, r.who?.name || who.value), ": ", r.answer || r.error || "(no answer)"), r.unverified_numbers_flagged?.length ? h("p", { class: "warnc" }, `Numbers not found in their file were flagged: ${r.unverified_numbers_flagged.join(", ")}`) : null);
      } catch (e) { answer.textContent = e.message; }
    } }, "Ask");
    const focus = input("text", f.monthly_focus || "", { placeholder: "e.g. sideways gold, NAS100 at the London open" });
    const setFocus = h("button", { class: "secondary", onclick: () => this.ceo("focus", { focus: focus.value }) }, "Set monthly focus");
    const agentSel = select(Object.entries(f.agents || {}).map(([id, a]) => [id, a.name]), Object.keys(f.agents || {})[0]);
    const commend = h("button", { class: "secondary", onclick: () => this.ceo("commend", { agent_id: agentSel.value, note: "commendation from the CEO" }) }, "Commend");
    const memoSel = select((f.memos || []).map((m) => [m.replace(".md", ""), m]), (f.memos || []).slice(-1)[0]?.replace(".md", ""));
    const decision = select([["approve", "Approve"], ["reject", "Reject"], ["question", "Question"]], "approve");
    const note = input("text", "", { placeholder: "note or question" });
    const decide = h("button", { class: "secondary", onclick: () => this.ceo("memo", { week: memoSel.value, decision: decision.value, note: note.value }) }, "Record decision");
    const pause = h("button", { class: f.paused ? "primary" : "danger", onclick: () => this.ceo("pause", { paused: !f.paused }) }, f.paused ? "Resume the firm" : "Pause the firm");
    return card("CEO's office", h("p", { class: "help" }, "Every answer comes from the person's real file (Engine numbers only). A commendation lifts a mood and never skips a check. Nothing goes to the VPS, a demo account or live trading from here."),
      h("div", { class: "grid two" },
        h("div", { class: "stack" }, field("Ask", who), q, h("div", { class: "row" }, ask), answer),
        h("div", { class: "stack" }, field("Monthly focus", focus), h("div", { class: "row" }, setFocus), field("Commendation", agentSel), h("div", { class: "row" }, commend),
          field("Head of Trading memo", memoSel), h("div", { class: "row" }, decision, note, decide), h("div", { class: "row" }, pause))));
  }

  async ceo(action, payload) {
    try {
      await startRun("ceo", { action, ...payload }, () => {}, { prefix: "ceo" });
      await this.load();
    } catch (e) { alert(e.message); }
  }

  async runCycle() {
    try {
      await gh.dispatch(state.token, state.owner, gh.FIRM_WORKFLOW, { settings: "" });
      alert("Cycle requested. It takes up to 25 minutes; the building shows what each agent is doing as the status file updates.");
      setTimeout(() => this.refreshLive(), 20000);
    } catch (e) { alert(e.message); }
  }

  async openAgent(id) {
    const file = await gh.getJson(state.token, state.owner, `firm/agents/${id}.json`);
    if (!file) { openModal(h("p", { class: "error" }, "No file for that agent yet.")); return; }
    const best = file.best_idea;
    const pm = best?.per_month ? table(["Month", "Sets", "£", "Avg R", "Pips", "Month Score", "DD %"], Object.entries(best.per_month).map(([m, s]) => ({ Month: m, Sets: s.sets, "£": money(s.pnl_gbp), "Avg R": signed(s.avg_r, 3), Pips: num(s.pips, 0), "Month Score": num(s.month_score, 1), "DD %": pct(s.worst_drawdown_pct) })), { numeric: ["Sets", "£", "Avg R", "Pips", "Month Score", "DD %"] }) : null;
    openModal(h("div", { class: "stack" },
      h("h2", {}, `${file.name} `, badge(`${file.level} · floor ${file.floor}`), " ", badge(file.desk), " ", h("span", { class: `mood-${file.mood}` }, file.mood)),
      h("p", { class: "muted" }, `${file.profile} Group ${file.group?.id || "—"}, manager ${file.manager || "—"}. ${file.turns} thinking turns, ${file.ideas_tested} ideas, ${file.commendations} commendation(s).`),
      h("p", {}, file.summary),
      file.trial_mode ? h("p", { class: "warnc" }, "Trial mode: these results come from the TradingView exports, not verified 1-minute history.") : null,
      best ? card(`Best verified idea ${best.id}${best.verified ? " (audited)" : ""}`, h("p", {}, best.hypothesis), h("pre", {}, JSON.stringify(best.rules, null, 1)),
        h("div", { class: "stats" }, stat("£", money(best.summary?.pnl_gbp)), stat("Avg R", signed(best.summary?.avg_r, 3)), stat("Pips", num(best.summary?.pips, 0)), stat("Month Score", num(best.summary?.month_score, 1)), stat("Win %", pct(best.summary?.win_rate_pct)), stat("DD %", pct(best.summary?.worst_drawdown_pct)), stat("Sets", best.summary?.sets ?? 0), stat("Months", (best.months || []).length)),
        pm, best.gates?.passed_floor ? h("p", { class: "good" }, `Passed floor ${best.gates.passed_floor}'s challenge on ${(best.gates.months || []).join(", ")}.`) : null,
        best.audits?.length ? h("p", { class: "muted" }, `Audit desk re-run: ${best.audits.slice(-1)[0].ok ? "agreed" : "DISAGREED"} (fast £${best.audits.slice(-1)[0].fast_pnl_gbp} vs event-driven £${best.audits.slice(-1)[0].audit_pnl_gbp}).`) : null,
        h("p", { class: "help" }, `Every result above links to the real run: data version ${file.data_version}, library entry ${best.id}, months ${(best.months || []).join(", ")}.`)) : h("p", { class: "muted" }, "No ideas tested yet."),
      file.group?.challenges?.length ? h("details", {}, h("summary", {}, `Group challenges (${file.group.challenges.length})`), table(["Cycle", "Floor", "Months", "Passed", "Reasons"], file.group.challenges.slice().reverse().map((c) => ({ Cycle: c.cycle, Floor: c.floor, Months: (c.months || []).join(", "), Passed: c.passed ? "yes" : "no", Reasons: (c.reasons || []).join("; ") })))) : null,
      h("details", {}, h("summary", {}, `Research notes (${file.notes.length})`), ...file.notes.slice().reverse().map((n) => h("div", { class: "item", style: "flex-direction:column;align-items:flex-start;cursor:default" }, h("span", { class: "d" }, `${ukDateTime(n.at)} · ${n.idea || ""}`), h("span", {}, n.hypothesis ? h("b", {}, n.hypothesis) : null), h("span", {}, n.note || ""), n.next ? h("span", { class: "d" }, `next: ${n.next}`) : null, n.unverified_numbers_flagged?.length ? h("span", { class: "warnc" }, `unverified numbers flagged: ${n.unverified_numbers_flagged.join(", ")}`) : null))),
      h("details", {}, h("summary", {}, `History (${file.history.length})`), h("pre", {}, file.history.map((x) => `${x.at || ""} ${x.kind}: ${JSON.stringify(x.detail ?? x)}`).join("\n"))),
      h("details", {}, h("summary", {}, `All ideas (${file.ideas.length})`), table(["Id", "Cycle", "Kind", "Hypothesis", "Sets", "£", "Avg R", "Score"], file.ideas.slice().reverse().map((i) => ({ Id: i.id, Cycle: i.cycle, Kind: i.kind, Hypothesis: i.hypothesis, Sets: i.summary?.sets, "£": money(i.summary?.pnl_gbp), "Avg R": signed(i.summary?.avg_r, 3), Score: num(i.summary?.month_score, 1) })), { numeric: ["Sets", "£", "Avg R", "Score"] })),
    ));
  }

  async openRoom(room) {
    if (room.kind === "ceo") { window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); return; }
    if (room.kind === "audit") { openModal(h("div", {}, h("h2", {}, "Audit desk"), h("p", {}, "Re-runs every level-up through the event-driven simulator (a separately written code path, different random seed), checks for look-ahead, and re-tests promoted strategies as new data arrives. Disagreements block the level-up and are recorded on the idea."))); return; }
    if (room.kind === "discussion") { openModal(h("div", {}, h("h2", {}, `Floor ${room.floor} discussion room`), h("p", {}, `Chaired by ${this.firm.managers?.[String(room.floor)]?.name || "the floor manager"}. Minutes of group meetings are listed on the firm page; any number quoted is checked against the Engine and unverified claims are flagged.`))); return; }
    const g = room.group;
    if (!g) { openModal(h("p", { class: "muted" }, "Empty room.")); return; }
    const files = (await gh.listDir(state.token, state.owner, "firm/challenges")).filter((f) => f.name.includes(`-${g.id}-`)).slice(-1);
    let replay = null;
    if (files.length) replay = await gh.getJson(state.token, state.owner, `firm/challenges/${files[0].name}`);
    const members = g.members.map((id) => h("span", { class: "chip", onclick: () => this.openAgent(id) }, this.firm.agents[id]?.name || id));
    const dayRows = [];
    if (replay) for (const [m, v] of Object.entries(replay.per_month || {})) for (const d of v.day_scores || []) dayRows.push({ Month: m, Day: d.day, "Net R": signed(d.net_r, 2), Pips: num(d.pips, 0), "£": money(d.pnl_gbp), Trades: d.trades, "Day Score": num(d.day_score, 1), Limit: d.broke_risk_limit ? "broke" : "" });
    openModal(h("div", { class: "stack" },
      h("h2", {}, `Group ${g.id} · floor ${room.floor}`), h("div", { class: "row" }, ...members),
      h("p", {}, g.strategy ? `Group strategy ${g.strategy} · Month Score ${num(g.month_score, 1)} · ${g.challenges} challenge attempt(s).` : "No group strategy agreed yet (needs at least 3 members with verified ideas)."),
      g.last_challenge ? h("p", { class: g.last_challenge.passed ? "good" : "bad" }, `Last challenge (floor ${g.last_challenge.floor}, months ${(g.last_challenge.months || []).join(", ")}): ${g.last_challenge.passed ? "passed" : "failed — " + (g.last_challenge.reasons || []).join("; ")}`) : null,
      replay ? h("div", {}, h("h3", {}, "Challenge replay: real Day Scores, day by day"), table(["Month", "Day", "Net R", "Pips", "£", "Trades", "Day Score", "Limit"], dayRows, { numeric: ["Net R", "Pips", "£", "Trades", "Day Score"] }),
        replay.random_bar ? h("p", { class: "muted" }, `Random bar: best of ${replay.random_bar.runs} random strategies £${replay.random_bar.best_pnl} vs candidate £${replay.random_bar.candidate_pnl_static} (${replay.random_bar.beats_best ? "beaten" : "not beaten"}).`) : null) : null,
    ));
  }

  async openIdea(i) {
    openModal(h("div", { class: "stack" }, h("h2", {}, `${i.id} — ${i.agent}`), h("p", {}, i.hypothesis), h("pre", {}, JSON.stringify(i.rules, null, 1)),
      h("div", { class: "stats" }, stat("£", money(i.summary?.pnl_gbp)), stat("Avg R", signed(i.summary?.avg_r, 3)), stat("Pips", num(i.summary?.pips, 0)), stat("Month Score", num(i.summary?.month_score, 1)), stat("Passed floor", i.gates?.passed_floor ?? "—"))));
  }

  async openDoc(path) {
    const txt = await gh.getText(state.token, state.owner, path);
    openModal(h("div", { class: "summary-text", html: mdLite(txt || "(empty)") }));
  }
}
