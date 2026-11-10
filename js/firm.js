// Mode 4: HSN Capital — the building, the staff, the firm page and the CEO's office. Every number shown comes from
// the engine's files (firm/firm.json, firm/leaderboard.json, firm/agents/<id>.json, firm/challenges/*.json,
// firm/replays/*.json, the library, minutes, reports, memos). Nothing here makes a number up: where the Engine has
// no result yet, the page says so.
import * as gh from "./github.js";
import { state, startRun, liveText, trialMode } from "./app.js";
import { ukDateTime } from "./clock.js";
import { h, card, stat, table, badge, field, select, input, money, num, pct, signed, openModal, mdLite } from "./ui.js";
import { Building, LEVEL_COLORS, BAR_COLORS, isRunning } from "./building.js";
import { ChallengeReplay } from "./replay.js";

const LEVELS = { 1: "Analyst", 2: "Associate", 3: "Vice President", 4: "Director", 5: "Managing Director" };
const MOOD_FACE = { happy: "🙂", proud: "😌", frustrated: "😣", focused: "🧐", neutral: "😐", waiting: "⏳" };
const tick = (ok) => h("span", { class: ok ? "good" : "bad" }, ok ? "✓" : "✗");

/** One labelled progress bar. `value` is the share of months (0-100) that meet the check. */
function bar(label, pctValue, color, text, faded = false) {
  return h("div", { class: "pbar" }, h("span", { class: "pl" }, label),
    h("span", { class: "pt" }, h("i", { style: `width:${Math.max(0, Math.min(100, pctValue || 0))}%;background:${color};opacity:${faded ? 0.6 : 1}` })),
    h("span", { class: "pv" }, text));
}

function progressBars(p, { compact = false } = {}) {
  if (!p || p.basis === "none" || !p.months) return h("p", { class: "muted small" }, p?.note || "No idea tested yet, so there is nothing to measure.");
  const faded = p.basis !== "challenge";
  const m = p.months;
  return h("div", { class: "pbars" },
    bar("Day Score", p.day?.pct, BAR_COLORS.day, compact ? `${p.day?.months_up}/${m}` : `${p.day?.months_up} of ${m} months in profit · avg ${signed(p.day?.avg, 1)} a day`, faded),
    bar("Pips", p.pips?.pct, BAR_COLORS.pips, compact ? `${p.pips?.months_hit}/${m}` : `${p.pips?.months_hit} of ${m} months at +${num(p.pips?.need, 0)} · avg ${num(p.pips?.avg, 0)} a month`, faded),
    bar("Risk : reward", p.rr?.pct, BAR_COLORS.rr, compact ? `${p.rr?.months_hit}/${m}` : `${p.rr?.months_hit} of ${m} months at ${p.rr?.need} · avg ${num(p.rr?.avg, 2)}`, faded));
}

function story(x, nameOf) {
  const months = (x.months || []).join(", ");
  switch (x.kind) {
    case "seeded": return x.detail;
    case "level_up": return `Moved up from floor ${x.from} to floor ${x.to}${x.skip ? ", skipping a floor" : ""}${x.solo ? ` on its own with idea ${x.idea}, taking a seat in group ${x.group}` : ` with group ${x.group}`}${months ? ` (challenge months ${months})` : ""}.`;
    case "swapped_down": return x.solo ? `Swapped down from floor ${x.from} to floor ${x.to} (into group ${x.group}) when ${nameOf(x.replaced_by)} moved up alone.` : `Group ${x.group} swapped down from floor ${x.from} to floor ${x.to}.`;
    case "challenge_failed": return `${x.solo ? "Its own" : `Group ${x.group}'s`} floor ${x.floor} challenge on ${months}: not passed. ${(x.reasons || []).join("; ")}`;
    case "challenge_passed_no_seat": return x.detail;
    case "battle_lost": return `Group ${x.group} passed its challenge but lost the promotion battle for floor ${x.floor}.`;
    case "transfer": return `Transferred from group ${x.from} to group ${x.to} with idea ${x.idea}.`;
    case "swapped_group": return `Moved from group ${x.from} to group ${x.to} when a transfer took its seat.`;
    case "credited": return `Its rules made it into group ${x.group}'s strategy: ${(x.rules || []).join(", ")}.`;
    case "commendation": return `Commendation: ${x.detail}`;
    case "replaced": return x.detail;
    case "discussion": return `Took part in floor ${x.floor}'s discussion.`;
    default: return x.kind;
  }
}

export class FirmView {
  constructor(root) {
    this.root = root;
    this.firm = null; this.live = null; this.board = null; this.building = null; this.timer = null;
    this.filter = { floor: "all", sort: "floor", text: "" };
  }
  onUnlock() {}
  show() { this.load().then(() => this.schedule()); }
  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => { if (!this.root.hidden && document.visibilityState !== "hidden") await this.refreshLive(); this.schedule(); }, isRunning(this.live) ? 15000 : 45000);
  }

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
      const was = isRunning(this.live);
      this.live = await gh.getJson(state.token, state.owner, "status/firm_live.json", "live");
      if (was && !isRunning(this.live)) { await this.load(); return; }          // the cycle has just finished: read its results
      this.building?.applyLive(this.live);
      this.paintLive();
    } catch { /* keep the last state */ }
  }

  paintLive() {
    if (!this.liveEl) return;
    const l = this.live, f = this.firm;
    if (isRunning(l)) {
      const c = l.counters || {};
      this.liveEl.replaceChildren(badge("LIVE", "good"), ` ${liveText(l)} · ${c.ideas_tested ?? 0} ideas tested, ${num(c.trades_tested, 0)} trades through the Engine, ${c.research_calls ?? 0} research lookups, ${c.challenges ?? 0} challenges (${c.challenges_passed ?? 0} passed)`
        + (c.best ? ` · best so far ${c.best.name}: Month Score ${num(c.best.month_score, 1)}, ${num(c.best.pips, 0)} pips, ${money(c.best.pnl_gbp)}` : "") + ` · ${ukDateTime(l.updated_at)} UK`);
    } else if (f?.paused) this.liveEl.textContent = f.cycle ? `The firm is paused. Everyone is at their desks; nothing moves until it is resumed (CEO's office, below).` : `The firm has not started yet (it opens paused). All ${Object.keys(f.agents || {}).length} agents are at their desks; movement begins with the first cycle after you press Resume in the CEO's office.`;
    else this.liveEl.textContent = `No cycle is running right now. Last cycle ${f?.cycle ?? 0} finished ${f?.last_cycle?.finished_at ? ukDateTime(f.last_cycle.finished_at) + " UK" : "—"}. Replay it below, or wait for the next one.`;
  }

  render() {
    const f = this.firm;
    this.building?.destroy(); this.building = null;
    if (!f) {
      this.root.replaceChildren(card("HSN Capital", h("p", { class: "muted" }, "The firm has not opened yet: no cycle has run. The first cycle runs on the schedule (every 6 hours) or now:"),
        h("button", { class: "primary", onclick: () => this.runCycle() }, "Run the first cycle now")));
      return;
    }
    const t = trialMode();
    const n = Object.keys(f.agents || {}).length;
    const header = card(h("span", {}, "HSN Capital ", badge(`cycle ${f.cycle}`), " ", f.trial_mode ? badge("TRIAL MODE — nothing ranked for real", "trial") : badge("ranking on verified data", "good"), " ", f.paused ? badge("PAUSED", "warn") : null),
      h("div", { class: "row between" },
        h("span", { class: "muted" }, `updated ${ukDateTime(f.updated_at)} UK · ${n} agents · ${f.library?.ideas ?? 0} ideas in the library (${f.library?.verified ?? 0} verified) · focus: ${f.monthly_focus || "none"}`),
        h("span", { class: "row" }, h("button", { class: "secondary small", onclick: () => this.runCycle() }, "Run a cycle now"),
          h("label", { class: "chip" }, h("input", { type: "checkbox", checked: state.animations || null, onchange: (e) => { state.animations = e.target.checked; localStorage.setItem("hsn.animations", e.target.checked ? "on" : "off"); if (this.building) { this.building.animations = e.target.checked; if (!e.target.checked) this.building.stopReplay(true); this.building.snapAll(); this.building.draw(); } this.paintReplay(); } }), "animations"))),
      f.trial_mode ? h("p", { class: "warnc" }, t.reason) : null);

    this.liveEl = h("p", { class: "muted live-line" });
    const canvas = h("canvas", { "aria-label": "The HSN Capital building with every agent at a desk" });
    const legend = h("div", { class: "building-legend" },
      ...Object.entries(LEVELS).map(([k, v]) => h("span", {}, h("i", { style: `background:${LEVEL_COLORS[k]}` }), `${k} ${v}`)),
      h("span", { class: "sep" }, "bars under each name:"), h("span", {}, h("i", { style: `background:${BAR_COLORS.day}` }), "Day Score"), h("span", {}, h("i", { style: `background:${BAR_COLORS.pips}` }), "pips"),
      h("span", {}, h("i", { style: `background:${BAR_COLORS.rr}` }), "risk to reward"), h("span", { class: "sep" }, "bright = its challenge on unseen months, faded = practice · tap an agent or a room"));
    this.replayBox = h("div", { class: "toolbar replay-bar" });
    const buildingCard = card("The building (all " + n + " agents; every movement is a real event)", this.liveEl, this.replayBox, h("div", { class: "building-wrap" }, canvas), legend);
    this.staffBox = h("div", {});
    const page = h("div", { class: "stack" }, header, buildingCard, card("Staff: level and progress to the next level", this.staffBox), this.firmPage(), this.brainsCard(), this.ceoOffice());
    this.root.replaceChildren(page);
    this.paintLive(); this.paintStaff(); this.paintReplay();
    requestAnimationFrame(() => {
      this.building = new Building(canvas, { animations: state.animations, onAgent: (id) => this.openAgent(id), onRoom: (room) => this.openRoom(room) });
      this.building.setData(f, this.live);
      this.building.applyLive(this.live);
      window.hsnBuilding = this.building;                 // handy for checks from the console; holds no secrets
    });
  }

  // ── replay of a finished cycle (exactly its real events) ────────────────────────────────────────────────────────
  paintReplay(note = "") {
    if (!this.replayBox) return;
    const f = this.firm, names = (f.replays || []).slice().reverse();
    if (!names.length) { this.replayBox.replaceChildren(h("span", { class: "muted small" }, f.cycle ? "This cycle has no replay file (it ran before replays were recorded)." : "Nothing to replay yet: the firm has not run a cycle.")); return; }
    const playing = this.building?.mode === "replay";
    const pick = select(names.map((x) => [x, `cycle ${parseInt(x.replace(/\D/g, ""), 10)}`]), this.replayPick || names[0], { class: "small", "aria-label": "Cycle to replay" });
    pick.addEventListener("change", () => (this.replayPick = pick.value));
    const speed = select([[1, "1×"], [2, "2×"], [4, "4×"], [8, "8×"], [16, "16×"]], this.replaySpeed || 4, { class: "small", "aria-label": "Replay speed" });
    speed.addEventListener("change", () => { this.replaySpeed = +speed.value; if (this.building) this.building.speed = +speed.value; });
    this.replayNote = h("span", { class: "muted small" }, note || (state.animations ? "plays that cycle's real events in order" : "turn animations on to replay"));
    this.replayBox.replaceChildren(
      playing ? h("button", { class: "secondary small", onclick: () => { this.building.stopReplay(); this.paintReplay(); } }, "■ Stop")
        : h("button", { class: "primary small", disabled: state.animations ? null : true, onclick: () => this.startReplay(pick.value, +speed.value) }, "▶ Replay"),
      pick, h("span", { class: "muted small" }, "speed"), speed, this.replayNote);
  }

  async startReplay(name, speed) {
    try {
      this.replayNote.textContent = "Loading that cycle's events…";
      const rep = await gh.getJson(state.token, state.owner, `firm/replays/${name}`);
      if (!rep) { this.replayNote.textContent = "That replay file is no longer in the engine repo."; return; }
      this.building.playReplay(rep, { speed, onProgress: (i, n, e) => { if (this.replayNote) this.replayNote.textContent = `event ${i} of ${n} · ${this.eventText(e)}`; }, onEnd: () => this.paintReplay(`cycle ${rep.cycle}: replay finished`) });
      this.paintReplay(); this.replayNote.textContent = `cycle ${rep.cycle}: ${rep.events.length} events`;
    } catch (e) { this.replayNote.textContent = e.message; }
  }

  nameOf(id) { return this.firm?.agents?.[id]?.name || id || ""; }
  eventText(e) {
    const who = e.agent ? this.nameOf(e.agent) : e.group || (e.floor ? `floor ${e.floor}` : "");
    const t = { tested: `${who}: Engine result, Month Score ${num(e.month_score, 1)}`, thinking: `${who} is thinking`, coded: `${who} handed in code (${e.name})`,
      meeting_start: e.discussion ? `floor ${e.floor} discussion starts` : `group ${e.group} meets`, meeting: e.discussion ? `floor ${e.floor} discussion ends` : `group ${e.group} agrees ${e.strategy || "nothing"}`,
      challenge_start: `${who}: floor ${e.floor} challenge on ${Array.isArray(e.months) ? e.months.join(", ") : ""}`, challenge_failed: `${who}: challenge not passed`, audit_start: `${who}: Audit desk re-run`,
      audit_failed: `${who}: audit disagreed, level-up blocked`, level_up: `${who}: floor ${e.from} → ${e.to}${e.skip ? " (skipped a floor)" : ""}`, swapped_down: `${who}: swapped down ${e.from} → ${e.to}`,
      transfer: `${who}: transfer ${e.from_group} → ${e.to_group}`, battle: `promotion battle for floor ${e.floor}: ${e.challenger} v ${e.incumbent}, ${e.winner} won`, solo_passed_no_seat: `${who} passed its own challenge; no seat above yet`,
      rotation: `new Analyst ${e.new_name}`, data_update: "new price data" };
    return t[e.kind] || e.kind.replaceAll("_", " ");
  }

  // ── staff: every agent, its level and its bars ──────────────────────────────────────────────────────────────────
  paintStaff() {
    const f = this.firm, fl = this.filter;
    const chips = h("div", { class: "checks" }, ...[["all", "All"], ...[5, 4, 3, 2, 1].map((k) => [String(k), `Floor ${k}`])].map(([v, l]) =>
      h("button", { class: `chip ${fl.floor === v ? "on" : ""}`, type: "button", onclick: () => { fl.floor = v; this.paintStaff(); } }, l)));
    const sort = select([["floor", "by floor"], ["progress", "by progress"], ["score", "by Month Score"], ["name", "by name"]], fl.sort, { class: "small", "aria-label": "Sort" });
    sort.addEventListener("change", () => { fl.sort = sort.value; this.paintStaff(); });
    const search = input("text", fl.text, { placeholder: "find a name or a desk", class: "small", "aria-label": "Find" });
    search.addEventListener("input", () => { fl.text = search.value; clearTimeout(this.searchT); this.searchT = setTimeout(() => { this.paintStaff(); const el = this.staffBox.querySelector("input[type=text]"); el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); }, 250); });
    let rows = Object.entries(f.agents || {}).map(([id, a]) => ({ id, ...a }));
    if (fl.floor !== "all") rows = rows.filter((a) => String(a.floor) === fl.floor);
    if (fl.text.trim()) { const q = fl.text.trim().toLowerCase(); rows = rows.filter((a) => `${a.name} ${a.desk} ${a.group}`.toLowerCase().includes(q)); }
    const by = { floor: (a, b) => b.floor - a.floor || String(a.group).localeCompare(String(b.group)) || a.id.localeCompare(b.id), progress: (a, b) => (b.progress?.pct || 0) - (a.progress?.pct || 0) || a.id.localeCompare(b.id),
      score: (a, b) => (b.best_month_score ?? -1e9) - (a.best_month_score ?? -1e9), name: (a, b) => a.name.localeCompare(b.name) };
    rows.sort(by[fl.sort]);
    const tiles = rows.map((a) => {
      const p = a.progress || {};
      return h("button", { class: "agent-tile", type: "button", "data-agent": a.id, onclick: () => this.openAgent(a.id) },
        h("span", { class: "at-head" }, h("span", { class: "lvl", style: `background:${LEVEL_COLORS[a.level_n || a.floor]}` }, String(a.level_n || a.floor)), h("span", { class: "at-name" }, a.name), h("span", { class: `at-mood mood-${a.mood}`, title: a.mood }, MOOD_FACE[a.mood] || "")),
        h("span", { class: "at-sub" }, `${a.level} · ${a.desk} · ${a.group}`),
        progressBars(p, { compact: true }),
        h("span", { class: "at-foot" }, p.basis && p.basis !== "none" ? `${p.pct}% of ${p.to === "presenting to the CEO" ? "floor 5's" : "the " + p.to} checks · ${p.basis === "challenge" ? "its challenge" : "practice"}` : "no result yet"));
    });
    this.staffBox.replaceChildren(h("div", { class: "row between staff-tools" }, chips, h("span", { class: "row" }, search, sort)),
      h("p", { class: "help" }, "Each bar is the share of that agent's months that meet one of the next level's monthly checks: in profit (Day Score), at the pip target, at the reward-to-risk. Bright bars are from its real challenge on months it had never been tested on; faded bars are practice on its training months."),
      rows.length ? h("div", { class: "staff-grid" }, ...tiles) : h("p", { class: "muted" }, "Nobody matches that."));
  }

  firmPage() {
    const f = this.firm, floors = f.floors || {};
    const rows = (this.board?.rows || []).slice(0, 25).map((r) => ({ "#": "", Name: r.name, Desk: r.desk, Floor: `${r.floor} ${r.level}`, Group: r.group, "Month Score": num(r.best_month_score, 1), "£": money(r.best_pnl), "Avg R": signed(r.best_avg_r, 3), Pips: num(r.best_pips, 0), "To next": r.progress_pct != null ? `${r.progress_pct}%` : "—", Ideas: r.ideas, Mood: r.mood, _id: r.agent_id }));
    rows.forEach((r, i) => (r["#"] = i + 1));
    const lb = table(["#", "Name", "Desk", "Floor", "Group", "Month Score", "£", "Avg R", "Pips", "To next", "Ideas", "Mood"], rows, { numeric: ["#", "Month Score", "£", "Avg R", "Pips", "To next", "Ideas"] });
    lb.querySelectorAll("tbody tr").forEach((tr, i) => { tr.style.cursor = "pointer"; tr.addEventListener("click", () => this.openAgent(rows[i]._id)); });
    const ideas = (f.ideas_board || []).map((i) => h("div", { class: "item", onclick: () => this.openIdea(i) }, h("span", {}, h("span", { class: "t" }, `${i.id} · ${i.hypothesis}`), h("span", { class: "d" }, ` ${i.agent} (${i.desk}) · £${num(i.summary?.pnl_gbp, 0)} · avg R ${signed(i.summary?.avg_r, 3)} · passed floor ${i.gates?.passed_floor}`))));
    const ev = (f.recent_events || []).filter((e) => ["level_up", "swapped_down", "transfer", "battle", "challenge_failed", "audit_failed", "meeting", "rotation", "retest_failed", "solo_passed_no_seat"].includes(e.kind)).slice(-50).reverse();
    const evList = table(["When (UK)", "Event", "Who", "Detail"], ev.map((e) => ({ "When (UK)": ukDateTime(e.at), Event: e.kind.replaceAll("_", " "), Who: e.agent ? this.nameOf(e.agent) : e.group || e.challenger || (e.floor ? `floor ${e.floor}` : ""),
      Detail: e.kind === "level_up" || e.kind === "swapped_down" ? `floor ${e.from} → ${e.to}${e.skip ? " (skip!)" : ""}${e.solo ? " · on its own" : ""}` : e.kind === "battle" ? `vs ${e.incumbent} on floor ${e.floor}: ${e.winner} won` : e.kind === "challenge_failed" ? (e.reasons || []).join("; ") : e.kind === "transfer" ? `${e.from_group} → ${e.to_group} (swapped ${this.nameOf(e.swapped)})` : e.kind === "meeting" ? (e.discussion ? "floor discussion" : `strategy ${e.strategy || "—"}${e.ai === false ? " (Engine-only)" : ""}`) : e.kind === "audit_failed" ? `fast £${e.fast_pnl} vs audit £${e.audit_pnl}` : e.kind === "solo_passed_no_seat" ? "passed its own challenge; no group above improves with its idea yet" : "" })));
    const lc = f.last_cycle || {}, budget = f.budget || {};
    const byFloor = [5, 4, 3, 2, 1].map((k) => ({ Floor: `${k} ${LEVELS[k]}`, Agents: (floors[String(k)]?.agents || []).length, Groups: (floors[String(k)]?.groups || []).length, "With a strategy": (floors[String(k)]?.groups || []).filter((g) => g.strategy).length,
      "Challenge attempts": f.attempts?.by_floor?.[String(k)] ?? f.attempts?.by_floor?.[k] ?? 0, "Ideas passed here": f.library?.passed_by_floor?.[String(k)] ?? 0, "To move up": floors[String(k)]?.challenge?.text || "" }));
    const pyramid = h("div", { class: "pyramid", "aria-label": "Staff by floor" }, ...[5, 4, 3, 2, 1].map((k) => h("div", { class: "tier" }, h("span", { class: "tier-l" }, `${k} ${LEVELS[k]}`),
      h("span", { class: "tier-seats" }, ...(floors[String(k)]?.agents || []).map((id) => h("button", { class: "seat", type: "button", style: `background:${LEVEL_COLORS[k]}`, title: f.agents[id]?.name || id, "aria-label": f.agents[id]?.name || id, onclick: () => this.openAgent(id) }))))));
    const docs = (title, names, folder) => h("details", {}, h("summary", {}, `${title} (${names.length})`), h("div", { class: "list" }, ...names.slice().reverse().slice(0, 40).map((x) => h("div", { class: "item", onclick: () => this.openDoc(`${folder}/${x}`) }, h("span", { class: "t" }, x)))));
    return card("Firm page",
      h("h3", {}, "Staff by floor"), pyramid,
      h("h3", {}, "Floors: who is where, and the challenge to move up"), table(["Floor", "Agents", "Groups", "With a strategy", "Challenge attempts", "Ideas passed here", "To move up"], byFloor, { numeric: ["Agents", "Groups", "With a strategy", "Challenge attempts", "Ideas passed here"] }),
      h("p", { class: "help" }, `Name check: ${f.name_audit?.generated ?? "—"} invented names, ${f.name_audit?.rejected_by_blocklist ?? 0} rejected for matching a known person. Months: ${(lc.months?.practice || []).length} practice, ${(lc.months?.exam || []).length} exam (challenges only), ${(lc.months?.vault || []).length} in the vault.`),
      h("h3", {}, "Budget meters"), h("div", { class: "stats" },
        stat("API this month (firm)", `$${num(budget.firm_spent_usd, 2)}`, `cap $${num(budget.firm_budget_usd, 0)}`, (budget.firm_spent_usd || 0) >= 0.8 * (budget.firm_budget_usd || 60) ? "warnc" : ""),
        stat("API this month (site)", `$${num(budget.total_spent_usd, 2)}`, `cap $${num(state.config?.monthly_budget_usd, 0)}`),
        stat("Actions minutes", num(state.minutes?.minutes_used, 0), `of ${budget.minutes_budget} firm budget / 2000 free`, (state.minutes?.minutes_used || 0) >= 0.8 * (budget.minutes_budget || 1200) ? "warnc" : ""),
        stat("Last cycle", `${lc.thinking_turns ?? 0} turns`, `${lc.variants_tested ?? 0} variants · ${lc.ai_calls ?? 0} AI calls · $${num(lc.ai_cost_usd, 2)}${lc.budget?.cost_per_turn_usd ? ` · $${lc.budget.cost_per_turn_usd} a turn${lc.budget.cost_per_turn_measured ? " (measured)" : " (estimate)"}` : ""}`),
        stat("Challenge attempts", f.attempts?.total ?? 0, "all counted for the random bar"), stat("Data", f.data_coverage?.symbols?.XAUUSD?.months ? `${f.data_coverage.symbols.XAUUSD.months} months gold` : "—", f.data_coverage?.symbols?.XAUUSD?.last_bar?.slice(0, 10) || "")),
      h("p", { class: "muted small" }, "Paper desk: parked (your decision of 8 Nov 2026). Floor 5's challenge needs 20 trading days of live paper testing, so nobody can pass floor 5 until it returns."),
      h("h3", {}, "Leaderboard by Month Score"), lb,
      h("h3", {}, "Ideas Board (proven from floor 3 up, with verified report cards)"), ideas.length ? h("div", { class: "list" }, ...ideas) : h("p", { class: "muted" }, "Nothing has passed floor 3 yet."),
      h("h3", {}, "Level-ups, swaps, transfers, battles, failed challenges"), ev.length ? evList : h("p", { class: "muted" }, "None yet."),
      h("div", { class: "grid three" }, docs("Meeting minutes", f.minutes || [], "firm/minutes"), docs("Floor discussions", (f.discussions || []), "firm/discussions"), docs("Managers' reports", f.reports || [], "firm/reports"), docs("Head of Trading memos", f.memos || [], "firm/memos")),
      (lc.warnings || []).length ? h("p", { class: "warnc" }, lc.warnings.join(" ")) : null,
      (lc.errors || []).length ? h("p", { class: "bad" }, "Last cycle reported errors: " + lc.errors.map((e) => e.message || e.type).join("; ")) : null);
  }

  /** How the agents think: research and code, with the real counts from the last cycle. */
  brainsCard() {
    const f = this.firm, lc = f.last_cycle || {}, live = lc.live || {}, feats = f.features || {}, mode = f.settings?.research || "live";
    const list = (feats.active || []).map((x) => h("div", { class: "item", onclick: () => this.openAgent(x.agent_id) }, h("span", {}, h("span", { class: "t" }, `${x.id} · ${x.name}`), h("span", { class: "d" }, ` ${x.timeframe}M bars · by ${x.agent_name} · a value for ${num(x.usable, 0)} signals`))));
    return card("How the agents think: research and code",
      h("p", { class: "help" }, "Claude proposes; the Engine decides. Each turn starts from the Engine's research pack (the desk's baseline split by session, hour, market type, higher-timeframe agreement, plan…, on training months only). "
        + (mode === "live" ? "While it thinks, an agent can also question the Engine (breakdowns, exit comparisons, a test of a rule set, the library, its next level): those lookups are its only tools — no shell, no files, no network. " : mode === "pack" ? "Agents ask the Engine questions that are answered before their next turn. " : "")
        + (f.settings?.agent_code === false ? "" : "An agent can also hand in a small function over closed bars (a coded feature). It is never run where the API key is: a separate job with no secrets and no network runs it, proves it does not look ahead, and only then can rules filter on it.")),
      h("div", { class: "stats" },
        stat("Research lookups (last cycle)", live.research_calls ?? 0, mode === "live" ? "live tools" : mode),
        stat("Ideas tested (last cycle)", live.ideas_tested ?? 0, `${num(live.trades_tested, 0)} trades through the Engine`),
        stat("Challenges (last cycle)", live.challenges ?? 0, `${live.challenges_passed ?? 0} passed`),
        stat("Coded features in use", (feats.active || []).length, `${feats.waiting ?? 0} waiting for the sandbox · ${feats.rejected ?? 0} rejected so far`)),
      list.length ? h("div", { class: "list" }, ...list) : h("p", { class: "muted" }, "No coded feature has passed the sandbox yet."));
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
    const openFile = h("button", { class: "primary", onclick: () => this.openAgent(agentSel.value) }, "Open their file");
    const memoSel = select((f.memos || []).map((m) => [m.replace(".md", ""), m]), (f.memos || []).slice(-1)[0]?.replace(".md", ""));
    const decision = select([["approve", "Approve"], ["reject", "Reject"], ["question", "Question"]], "approve");
    const note = input("text", "", { placeholder: "note or question" });
    const decide = h("button", { class: "secondary", onclick: () => this.ceo("memo", { week: memoSel.value, decision: decision.value, note: note.value }) }, "Record decision");
    const pause = h("button", { class: f.paused ? "primary" : "danger", onclick: () => this.ceo("pause", { paused: !f.paused }) }, f.paused ? "Resume the firm" : "Pause the firm");
    this.ceoNote = h("p", { class: "muted small" }, f.paused ? "Resume switches the 6-hourly schedule back on and starts a cycle straight away. While paused the schedule is off and spends no minutes." : "Pause switches the 6-hourly schedule off, so a paused firm spends no minutes.");
    return (this.ceoCard = card("CEO's office", h("p", { class: "help" }, "Every answer comes from the person's real file (Engine numbers only). A commendation lifts a mood and never skips a check. Nothing goes to the VPS, a demo account or live trading from here."),
      h("div", { class: "grid two" },
        h("div", { class: "stack" }, field("Ask", who), q, h("div", { class: "row" }, ask), answer),
        h("div", { class: "stack" }, field("Monthly focus", focus), h("div", { class: "row" }, setFocus), field("Any agent's file, or a commendation", agentSel), h("div", { class: "row" }, openFile, commend),
          field("Head of Trading memo", memoSel), h("div", { class: "row" }, decision, note, decide), h("div", { class: "row" }, pause), this.ceoNote))));
  }

  async ceo(action, payload) {
    try {
      if (this.ceoNote) this.ceoNote.textContent = "Sending… (a run on GitHub; usually about a minute)";
      const { result } = await startRun("ceo", { action, ...payload }, () => {}, { prefix: "ceo" });
      await this.load();
      const sch = result?.firm_schedule;
      if (this.ceoNote && sch) this.ceoNote.textContent = sch.ok ? `Done. The firm's schedule is ${sch.on ? "on" : "off"}.` : `The firm's schedule could not be switched: ${sch.note || "see the run on GitHub"}`;
    } catch (e) { if (this.ceoNote) { this.ceoNote.textContent = e.message; this.ceoNote.className = "bad"; } }
  }

  async runCycle() {
    if (this.firm?.paused) { alert("The firm is paused, so a cycle would do nothing. Press Resume in the CEO's office first (it starts a cycle for you)."); return; }
    try {
      await gh.dispatch(state.token, state.owner, gh.FIRM_WORKFLOW, { settings: "" });
      alert("Cycle requested. It takes up to 25 minutes; the building shows what each agent is doing as the status file updates.");
      setTimeout(() => this.refreshLive(), 20000);
    } catch (e) { alert(e.message); }
  }

  // ── an agent's file ─────────────────────────────────────────────────────────────────────────────────────────────
  async openAgent(id) {
    openModal(h("p", { class: "muted" }, `Opening ${this.nameOf(id)}'s file…`));
    let file;
    try { file = await gh.getJson(state.token, state.owner, `firm/agents/${id}.json`); } catch (e) { openModal(h("p", { class: "error" }, e.message)); return; }
    if (!file) { openModal(h("p", { class: "error" }, "No file for that agent yet.")); return; }
    const p = file.progress || {}, best = file.best_idea, g = file.group, lvl = file.level_n || file.floor, repo = `https://github.com/${state.owner}/${gh.ENGINE_REPO}/blob/main/`;
    const link = (path, text) => h("a", { href: repo + path, target: "_blank", rel: "noopener noreferrer" }, text || path);
    const watch = (path) => path ? h("button", { class: "secondary small", onclick: () => this.openChallenge(path, () => this.openAgent(id)) }, "▶ Watch") : "—";
    const months = p.months_detail || {};
    const checks = Object.keys(months).length ? table(["Month", "Sets", "In profit", "£", "Pips", "need", "Pips ✓", "R:R", "R:R ✓", "DD %", "DD ✓", "Month Score"], Object.entries(months).map(([m, v]) => ({
      Month: m, Sets: v.sets ?? 0, "In profit": tick(v.ok.money), "£": money(v.pnl_gbp), Pips: num(v.pips, 0), need: num(v.pips_needed, 0), "Pips ✓": tick(v.ok.pips), "R:R": num(v.reward_to_risk, 2), "R:R ✓": tick(v.ok.reward_to_risk),
      "DD %": pct(v.worst_drawdown_pct), "DD ✓": tick(v.ok.drawdown), "Month Score": num(v.month_score, 1) })), { numeric: ["Sets", "£", "Pips", "need", "R:R", "DD %", "Month Score"] }) : null;
    const pm = best?.per_month ? table(["Month", "Sets", "£", "Avg R", "Pips", "Month Score", "DD %"], Object.entries(best.per_month).map(([m, s]) => ({ Month: m, Sets: s.sets, "£": money(s.pnl_gbp), "Avg R": signed(s.avg_r, 3), Pips: num(s.pips, 0), "Month Score": num(s.month_score, 1), "DD %": pct(s.worst_drawdown_pct) })), { numeric: ["Sets", "£", "Avg R", "Pips", "Month Score", "DD %"] }) : null;
    const chRows = (list, who) => list.slice().reverse().map((c) => ({ Cycle: c.cycle, Who: who, Floor: c.floor, Months: (c.months || []).join(", "), Result: h("span", { class: c.passed ? "good" : "bad" }, c.passed ? (c.moved === false ? "passed · waiting for a seat" : "passed") : "not passed"),
      "Month Score": num(c.month_score, 1), Why: (c.reasons || []).join("; ") || (c.passed ? "all monthly checks met" : ""), Replay: watch(c.replay) }));
    const challenges = [...chRows(file.solo_challenges || [], "own strategy"), ...chRows(g?.challenges || [], `group ${g?.id}`)];
    const luck = best?.luck_check;
    const audit = best?.audits?.length ? best.audits[best.audits.length - 1] : null;
    const career = (file.how_it_got_here || []).slice().reverse();
    openModal(h("div", { class: "stack agent-file" },
      h("div", { class: "af-head" }, h("span", { class: "lvl big", style: `background:${LEVEL_COLORS[lvl]}` }, String(lvl)),
        h("div", {}, h("h2", {}, file.name, " ", h("span", { class: `mood-${file.mood}` }, `${MOOD_FACE[file.mood] || ""} ${file.mood}`)),
          h("p", { class: "muted" }, `Level ${lvl}: ${file.level} · floor ${file.floor} · ${file.desk} desk · group ${file.group_id || "—"} · manager ${file.manager || "—"}`))),
      h("p", { class: "muted" }, `${file.profile} ${file.turns} thinking turns, ${file.ideas_tested} ideas tested, ${file.research_calls ?? 0} research lookups, ${file.commendations} commendation(s).`),
      h("p", {}, file.summary),
      file.trial_mode ? h("p", { class: "warnc" }, "Trial mode: these results are provisional. The price data has not passed the match check yet, so nothing here is ranked for real.") : null,

      card(`Progress to the next level: ${p.to || "—"}`, h("p", { class: "help" }, file.challenge?.text, file.challenge?.extras?.length ? ` Then: ${file.challenge.extras.join("; ")}.` : ""),
        p.basis && p.basis !== "none" ? h("div", { class: "overall" }, h("div", { class: "progress big" }, h("div", { style: `width:${p.pct}%` })), h("b", {}, `${p.checks_met} of ${p.checks} monthly checks met (${p.pct}%)`)) : null,
        progressBars(p), p.basis && p.basis !== "none" ? h("p", { class: "muted small" }, `Worst drawdown ${pct(p.dd?.worst)} against a limit of ${p.dd?.limit}% (${p.dd?.months_ok} of ${p.months} months inside it). ${p.note}`) : null, checks),

      card("How it got here", career.length ? h("ol", { class: "timeline" }, ...career.map((x) => h("li", { class: `tl-${x.kind}` }, h("span", { class: "d" }, `cycle ${x.cycle}${x.at ? " · " + ukDateTime(x.at) + " UK" : ""}`), h("span", {}, story(x, (i) => this.nameOf(i)))))) : h("p", { class: "muted" }, "Nothing on its record yet: no challenge taken, no move."),
        challenges.length ? h("div", {}, h("h3", {}, "Every challenge, with its result"), table(["Cycle", "Who", "Floor", "Months", "Result", "Month Score", "Why", "Replay"], challenges, { numeric: ["Month Score"] })) : h("p", { class: "muted small" }, "No challenge attempt yet (its own or its group's).")),

      best ? card(`Its rules: best idea ${best.id}${best.verified ? " (verified by the Audit desk)" : ""}`, h("p", {}, h("b", {}, best.hypothesis)),
        h("ul", { class: "rules" }, ...(best.in_words || []).map((x) => h("li", {}, x))), h("details", {}, h("summary", {}, "The exact rule set the Engine runs"), h("pre", {}, JSON.stringify(best.rules, null, 1)))) : card("Its rules", h("p", { class: "muted" }, "No idea tested yet.")),

      best ? card(`Its real results (Engine, ${(best.months || []).length} training months, standard £10,000 account at 1%)`,
        h("div", { class: "stats" }, stat("Month Score", num(best.summary?.month_score, 1), "sum of Day Scores"), stat("Pips", num(best.summary?.pips, 0)), stat("£", money(best.summary?.pnl_gbp)), stat("Avg R", signed(best.summary?.avg_r, 3)), stat("Risk : reward", num(best.summary?.reward_to_risk, 2)), stat("Win %", pct(best.summary?.win_rate_pct)), stat("Worst DD", pct(best.summary?.worst_drawdown_pct)), stat("Sets", best.summary?.sets ?? 0, `${best.summary?.days_traded ?? 0} days traded`)),
        pm,
        best.gates?.passed_floor ? h("p", { class: "good" }, `Passed floor ${best.gates.passed_floor}'s challenge on ${(best.gates.months || []).join(", ")}. `, best.gates.replay ? watch(best.gates.replay) : null) : null,
        luck?.runs ? h("p", { class: "muted" }, `Luck check: against ${luck.runs} random strategies with the same number of trades, distances and times of day, the best random made £${num(luck.best_pnl, 0)} and this made £${num(luck.candidate_pnl_static, 0)}: ${luck.beats_best ? "it beat every one" : "it did NOT beat the best random"}.`) : h("p", { class: "muted small" }, "Luck check: run when an idea passes a challenge."),
        file.house ? h("p", { class: file.house.beats_as_is ? "good" : "muted" }, `House benchmark, the indicator as is on the same ${file.house.months} months: ${file.house.as_is.sets} sets, avg R ${signed(file.house.as_is.avg_r, 3)}, Month Score ${num(file.house.as_is.month_score, 1)}. This idea ${file.house.beats_as_is ? "beats it" : "does not beat it yet"}.`
          + (file.house.waves?.sets ? ` Your Waves code (by average R): ${signed(file.house.waves.avg_r, 3)} — ${file.house.beats_waves_avg_r ? "beaten" : "not beaten"}.` : ` Your Waves code: ${file.house.waves?.note || "no run yet"}.`)) : null,
        audit ? h("p", { class: "muted" }, `Audit desk re-run (separately written code): ${audit.ok ? "agreed" : "DISAGREED"} — fast £${audit.fast_pnl_gbp} v event-driven £${audit.audit_pnl_gbp}, ${audit.fast_sets} v ${audit.audit_sets} sets, ${audit.lookahead_violations} look-ahead violations.`) : null) : null,

      g ? card(`Its group: ${g.id} (floor ${g.floor})`, h("div", { class: "row" }, ...g.members.map((m) => { const mid = m.id || m; return h("button", { class: `chip ${mid === id ? "on" : ""}`, type: "button", onclick: () => this.openAgent(mid) }, m.name || this.nameOf(mid)); })),
        g.strategy_idea ? h("div", {}, h("p", {}, h("b", {}, `Group strategy ${g.strategy_idea.id}: `), g.strategy_idea.hypothesis), h("ul", { class: "rules" }, ...(g.strategy_idea.in_words || []).map((x) => h("li", {}, x)))) : h("p", { class: "muted" }, "No group strategy agreed yet (it takes at least 3 members with tested ideas)."),
        Object.keys(g.credits || {}).length ? h("p", { class: "muted small" }, "Credited: " + Object.entries(g.credits).map(([k, v]) => `${this.nameOf(k)} (${(v || []).join(", ")})`).join("; ")) : null,
        h("p", { class: "muted small" }, "Group progress to the next level:"), progressBars(g.progress),
        (g.minutes || []).length ? h("div", { class: "row" }, ...g.minutes.slice(-4).map((m) => h("button", { class: "secondary small", onclick: () => this.openDoc(m, () => this.openAgent(id)) }, m.split("/").pop().replace(".md", "")))) : null) : null,

      h("details", { open: (file.notes || []).length ? true : null }, h("summary", {}, `Research notes (${(file.notes || []).length})`), ...(file.notes || []).slice().reverse().map((x) => h("div", { class: "note" },
        h("span", { class: "d" }, `${ukDateTime(x.at)} UK${x.idea ? " · " + x.idea : ""}`), x.hypothesis ? h("b", {}, x.hypothesis) : null, x.evidence ? h("span", { class: "muted" }, `Evidence: ${x.evidence}`) : null, h("span", {}, x.note || ""),
        x.result?.sets != null ? h("span", { class: "muted" }, `Engine: ${x.result.sets} sets, £${num(x.result.pnl_gbp, 0)}, ${num(x.result.pips, 0)} pips, avg R ${signed(x.result.avg_r, 3)}, Month Score ${num(x.result.month_score, 1)}`) : null,
        x.research?.length ? h("span", { class: "muted" }, `Research this turn: ${x.research.map((r) => r.what).join(" → ")}`) : null,
        x.research_asked?.length ? h("span", { class: "muted" }, `Asked the Engine for next turn: ${x.research_asked.map((r) => `${r.kind}${r.by ? " by " + r.by : ""}`).join(", ")}`) : null,
        x.code ? h("span", { class: x.code.queued ? "muted" : "warnc" }, x.code.queued ? `Handed in code: ${x.code.name} (${x.code.timeframe}M) — sent to the sandbox` : `Code not accepted: ${(x.code.problems || []).join("; ")}`) : null,
        x.next ? h("span", { class: "d" }, `next: ${x.next}`) : null, x.unverified_numbers_flagged?.length ? h("span", { class: "warnc" }, `numbers not found in the Engine's output were flagged: ${x.unverified_numbers_flagged.join(", ")}`) : null))),

      (file.code?.features?.length || file.code?.rejected?.length) ? h("details", {}, h("summary", {}, `Code it wrote (${file.code.features.length} in use, ${file.code.rejected.length} rejected)`),
        ...file.code.features.map((x) => h("div", { class: "note" }, h("b", {}, `${x.id} · ${x.name} · ${x.timeframe}M bars · ${x.status}`), h("span", {}, x.description || ""), h("span", { class: "muted" }, `Sandbox: no look-ahead (${x.lookahead_test?.cuts ?? "?"} cut tests), a value for ${num(x.usable, 0)} signals. Median ${x.quantiles?.p50}, 10th-90th percentile ${x.quantiles?.p10} to ${x.quantiles?.p90}.`), h("pre", {}, x.source || ""))),
        ...file.code.rejected.map((x) => h("div", { class: "note" }, h("b", { class: "bad" }, `${x.name} · rejected by the sandbox`), h("span", {}, (x.problems || []).join("; ")), h("pre", {}, x.source || "")))) : null,

      h("details", {}, h("summary", {}, `All its ideas (${(file.ideas || []).length})`), table(["Id", "Cycle", "Kind", "Hypothesis", "Sets", "£", "Avg R", "Score"], (file.ideas || []).slice().reverse().map((i) => ({ Id: i.id + (i.verified ? " ✓" : ""), Cycle: i.cycle, Kind: i.kind, Hypothesis: i.hypothesis, Sets: i.summary?.sets, "£": money(i.summary?.pnl_gbp), "Avg R": signed(i.summary?.avg_r, 3), Score: num(i.summary?.month_score, 1) })), { numeric: ["Sets", "£", "Avg R", "Score"] })),

      h("p", { class: "help" }, `Where every number comes from: data version ${file.data_version || "—"}; `, link(file.where_it_lives?.file, "this file"), ", ", link(file.where_it_lives?.library, "the library (every idea ever tested)"), ", ", link(file.where_it_lives?.notes, "its research notes"),
        (file.where_it_lives?.replays || []).length ? ", challenge records: " : "", ...(file.where_it_lives?.replays || []).slice(-4).flatMap((r, i) => [i ? ", " : "", link(r, r.split("/").pop())]), ". Open in GitHub (private repo)."),
    ));
  }

  async openChallenge(path, back = null) {
    openModal(h("p", { class: "muted" }, "Loading the challenge record…"));
    let rec;
    try { rec = await gh.getJson(state.token, state.owner, path); } catch (e) { openModal(h("p", { class: "error" }, e.message)); return; }
    if (!rec) { openModal(h("p", { class: "error" }, "That challenge record is not in the engine repo.")); return; }
    const box = h("div", {});
    const who = rec.solo ? this.nameOf(rec.agent_id) : `Group ${rec.group_id}`;
    const rows = Object.entries(rec.per_month || {}).map(([m, v]) => ({ Month: m, Sets: v.values?.sets ?? 0, "In profit": tick(v.money), "£": money(v.values?.pnl_gbp), Pips: num(v.values?.pips, 0), need: num(v.values?.pips_needed, 0), "Pips ✓": tick(v.pips), "R:R": num(v.values?.reward_to_risk, 2), "R:R ✓": tick(v.reward_to_risk), "DD %": pct(v.values?.worst_drawdown_pct), "DD ✓": tick(v.drawdown), Passed: tick(v.passed) }));
    openModal(h("div", { class: "stack" },
      back ? h("button", { class: "link", onclick: back }, "← back") : null,
      h("h2", {}, `${who}: floor ${rec.floor} challenge, cycle ${rec.cycle} `, badge(rec.passed ? "passed" : "not passed", rec.passed ? "good" : "bad")),
      h("p", { class: "muted" }, `${rec.instrument || ""} · months ${(rec.months || []).join(", ")} (never tested on before) · strategy ${rec.idea_id}${rec.hypothesis ? ": " + rec.hypothesis : ""}`),
      rec.trial_mode ? h("p", { class: "warnc" }, "Trial mode: provisional (the price data had not passed the match check).") : null,
      h("h3", {}, "The challenge months, day by day, on the real daily candles"), box,
      table(["Month", "Sets", "In profit", "£", "Pips", "need", "Pips ✓", "R:R", "R:R ✓", "DD %", "DD ✓", "Passed"], rows, { numeric: ["Sets", "£", "Pips", "need", "R:R", "DD %"] }),
      (rec.reasons || []).length ? h("p", { class: "bad" }, rec.reasons.join("; ")) : null,
      rec.random_bar ? h("p", { class: "muted" }, `Random bar: the best of ${rec.random_bar.runs} random strategies made £${rec.random_bar.best_pnl}; this made £${rec.random_bar.candidate_pnl_static} (${rec.random_bar.beats_best ? "beaten" : "not beaten"}).`) : null,
      rec.rolling_windows ? h("p", { class: "muted" }, `Rolling 3-month windows: profitable in ${rec.rolling_windows.profitable} of ${rec.rolling_windows.windows}.`) : null,
      rec.spread_stress ? h("p", { class: "muted" }, `With the spread raised: ${Object.entries(rec.spread_stress).map(([m, v]) => `${m} £${v.pnl_gbp}`).join(", ")}.`) : null));
    new ChallengeReplay(box, rec);
  }

  async openRoom(room) {
    if (room.kind === "ceo") { this.ceoCard?.scrollIntoView({ behavior: "smooth" }); return; }
    if (room.kind === "audit") {
      const ev = (this.firm.recent_events || []).filter((e) => e.kind === "audit_start" || e.kind === "audit_failed").slice(-20).reverse();
      openModal(h("div", { class: "stack" }, h("h2", {}, "Audit desk"), h("p", {}, "Re-runs every level-up from scratch through the event-driven simulator (a separately written code path, a different random seed), checks for look-ahead, and re-tests promoted strategies as new data arrives. A disagreement blocks the level-up and is recorded on the idea."),
        ev.length ? table(["When (UK)", "Who", "Floor", "Outcome"], ev.map((e) => ({ "When (UK)": ukDateTime(e.at), Who: e.agent ? this.nameOf(e.agent) : e.group, Floor: e.floor, Outcome: e.kind === "audit_failed" ? `disagreed: fast £${e.fast_pnl} v audit £${e.audit_pnl}` : "re-run started" }))) : h("p", { class: "muted" }, "No audits yet.")));
      return;
    }
    if (room.kind === "discussion") {
      const names = (this.firm.discussions || []).filter((x) => x.includes(`floor${room.floor}`)).reverse();
      let latest = null;
      try { latest = await gh.getJson(state.token, state.owner, `firm/discussions/floor${room.floor}.json`); } catch { /* none yet */ }
      openModal(h("div", { class: "stack" }, h("h2", {}, `Floor ${room.floor} discussion room`), h("p", {}, `Chaired by ${this.firm.managers?.[String(room.floor)]?.name || "the floor manager"}. Everyone on the floor talks ideas through using only their report cards; any number quoted is checked against the Engine and unverified claims are flagged. The takeaways go into every agent's next prompt on this floor.`),
        latest?.takeaways?.length ? h("div", {}, h("h3", {}, `Latest takeaways (cycle ${latest.cycle})`), h("ul", { class: "rules" }, ...latest.takeaways.map((x) => h("li", {}, x)))) : h("p", { class: "muted" }, "No discussion has been held on this floor yet."),
        names.length ? h("div", { class: "list" }, ...names.map((x) => h("div", { class: "item", onclick: () => this.openDoc(`firm/discussions/${x}`) }, h("span", { class: "t" }, x)))) : null));
      return;
    }
    const g = room.group?.data;
    if (!g) { openModal(h("p", { class: "muted" }, "Empty room.")); return; }
    openModal(h("p", { class: "muted" }, `Opening group ${g.id}…`));
    let gf = null;
    try { gf = (await gh.getJson(state.token, state.owner, `firm/agents/${g.members[0]}.json`))?.group; } catch { /* fall back to the summary */ }
    const box = h("div", {});
    const members = g.members.map((id) => { const a = this.firm.agents[id] || {}; return h("button", { class: "agent-tile", type: "button", onclick: () => this.openAgent(id) }, h("span", { class: "at-head" }, h("span", { class: "lvl", style: `background:${LEVEL_COLORS[a.level_n || a.floor]}` }, String(a.level_n || a.floor)), h("span", { class: "at-name" }, a.name || id), h("span", { class: `at-mood mood-${a.mood}` }, MOOD_FACE[a.mood] || "")), h("span", { class: "at-sub" }, a.desk || ""), progressBars(a.progress, { compact: true })); });
    const ch = (gf?.challenges || []).slice().reverse();
    openModal(h("div", { class: "stack" },
      h("h2", {}, `Group ${g.id} · floor ${room.floor} ${LEVELS[room.floor]}`),
      h("div", { class: "staff-grid" }, ...members),
      gf?.strategy_idea ? card(`Group strategy ${gf.strategy_idea.id}`, h("p", {}, h("b", {}, gf.strategy_idea.hypothesis)), h("ul", { class: "rules" }, ...(gf.strategy_idea.in_words || []).map((x) => h("li", {}, x))),
        h("p", { class: "muted" }, `Engine on training months: ${gf.strategy_idea.summary?.sets ?? 0} sets, ${money(gf.strategy_idea.summary?.pnl_gbp)}, ${num(gf.strategy_idea.summary?.pips, 0)} pips, avg R ${signed(gf.strategy_idea.summary?.avg_r, 3)}, Month Score ${num(gf.strategy_idea.summary?.month_score, 1)}.`))
        : h("p", { class: "muted" }, g.strategy ? `Group strategy ${g.strategy} · Month Score ${num(g.month_score, 1)}.` : "No group strategy agreed yet (it takes at least 3 members with tested ideas)."),
      card(`Challenge progress: to ${g.progress?.to || "the next level"}`, h("p", { class: "help" }, this.firm.floors?.[String(room.floor)]?.challenge?.text || ""), progressBars(g.progress), g.progress?.note ? h("p", { class: "muted small" }, g.progress.note) : null),
      g.screen ? h("div", {}, h("h3", {}, `On the room's screen: its latest challenge (floor ${g.screen.floor}, cycle ${g.screen.cycle}) — ${g.screen.passed ? "passed" : "not passed"}`), box) : h("p", { class: "muted" }, `${g.challenges} challenge attempt(s) so far.`),
      ch.length ? table(["Cycle", "Floor", "Months", "Result", "Why", "Replay"], ch.map((c) => ({ Cycle: c.cycle, Floor: c.floor, Months: (c.months || []).join(", "), Result: h("span", { class: c.passed ? "good" : "bad" }, c.passed ? "passed" : "not passed"), Why: (c.reasons || []).join("; "),
        Replay: c.replay ? h("button", { class: "secondary small", onclick: () => this.openChallenge(c.replay, () => this.openRoom(room)) }, "▶ Watch") : "—" }))) : null));
    if (g.screen?.replay) { try { const rec = await gh.getJson(state.token, state.owner, g.screen.replay); if (rec && box.isConnected) new ChallengeReplay(box, rec); } catch { /* the table above still shows the result */ } }
  }

  async openIdea(i) {
    openModal(h("div", { class: "stack" }, h("h2", {}, `${i.id} — ${i.agent}`), h("p", {}, i.hypothesis), h("pre", {}, JSON.stringify(i.rules, null, 1)),
      h("div", { class: "stats" }, stat("£", money(i.summary?.pnl_gbp)), stat("Avg R", signed(i.summary?.avg_r, 3)), stat("Pips", num(i.summary?.pips, 0)), stat("Month Score", num(i.summary?.month_score, 1)), stat("Passed floor", i.gates?.passed_floor ?? "—"))));
  }

  async openDoc(path, back = null) {
    const txt = await gh.getText(state.token, state.owner, path);
    openModal(h("div", { class: "stack" }, back ? h("button", { class: "link", onclick: back }, "← back") : null, h("div", { class: "summary-text", html: mdLite(txt || "(empty)") })));
  }
}
