// Mode 4: HSN Capital. One Start button, then five pages: Company (the building, with every agent in it, moving only
// when something real happened), People, Rules & code (what the agents wrote), Records and the CEO's office.
// Every number shown comes from the engine's files (firm/firm.json, firm/leaderboard.json, firm/agents/<id>.json,
// firm/challenges/*.json, firm/replays/*.json, the library, minutes, reports, memos) or, while a shift runs, from its
// live status file. Nothing here makes a number up: where the Engine has no result yet, the page says so.
import * as gh from "./github.js";
import { state, startRun, liveText } from "./app.js";
import { ukDateTime } from "./clock.js";
import { h, card, stat, table, badge, field, select, input, money, num, pct, signed, openModal, closeModal, mdLite } from "./ui.js";
import { Building, LEVEL_COLORS, BAR_COLORS, isRunning } from "./building.js";
import { PACES, nextShift, readiness, scoreboard, eventLine, tokenHelp, shiftPlan, shiftPlanWords, minutesUsedThisMonth, minutesNote } from "./firmlogic.js";
import { ChallengeReplay } from "./replay.js";

const LEVELS = { 1: "Analyst", 2: "Associate", 3: "Vice President", 4: "Director", 5: "Managing Director" };
const CODE_ROOM = { original: "your indicator as the Engine runs it", original_pine: "your indicator's Pine code", chart_maths: "the chart maths it is built from", waves: "your Waves rules",
  rules_engine: "how the Engine evaluates rules", price_model: "how prices are filled", challenges: "what each challenge checks" };
const MOOD_FACE = { happy: "🙂", proud: "😌", frustrated: "😣", focused: "🧐", neutral: "😐", waiting: "⏳" };
const tick = (ok) => h("span", { class: ok ? "good" : "bad" }, ok ? "✓" : "✗");
/** A number box's value, or `fallback` when it is empty or not a number (so an empty box never saves a zero). */
const boxNumber = (el, fallback) => (el.value.trim() !== "" && Number.isFinite(+el.value) && +el.value >= 0 ? +el.value : fallback);

/** One live line under the pace and the minutes limit: what the engine will do with them (the same sum it uses). */
function planLine(pace, mins, fallbackMins) {
  const el = h("p", { class: "help plan-line", role: "status" });
  const paint = () => {
    const now = new Date(), used = minutesUsedThisMonth(state.minutes, now);
    el.textContent = shiftPlanWords(shiftPlan(pace.value, used, boxNumber(mins, fallbackMins), now), now) + minutesNote(state.minutes, now, ukDateTime);
  };
  pace.addEventListener("change", paint); mins.addEventListener("input", paint); paint();
  return el;
}

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
    bar("Risk : reward", p.rr?.pct, BAR_COLORS.rr, compact ? `${p.rr?.months_hit}/${m}` : `${p.rr?.months_hit} of ${m} months at ${p.rr?.need} · avg ${num(p.rr?.avg, 2)}`, faded),
    p.win && p.win.need != null ? bar("Win rate", p.win.pct, BAR_COLORS.win, compact ? `${p.win.months_hit}/${m}` : `${p.win.months_hit} of ${m} months at ${p.win.need}%+ · avg ${p.win.avg == null ? "—" : num(p.win.avg, 1) + "%"}${p.win.gate ? "" : " · target, not a pass mark"}`, faded) : null);
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
    this.setup = null; this.schedule = null; this.page = "company"; this.busy = "";
    this.filter = { floor: "all", sort: "floor", text: "" };
    this.loop = localStorage.getItem("hsn.replayloop") !== "off";
  }
  onUnlock() {}
  onLock() { this.stopLoop(); }
  hide() { this.stopLoop(); }
  show() { this.load().then(() => this.schedulePoll()); }
  schedulePoll() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => { if (!this.root.hidden && document.visibilityState !== "hidden") await this.refreshLive(); this.schedulePoll(); }, isRunning(this.live) ? 15000 : 45000);
  }

  async load() {
    if (!this.firm) this.root.replaceChildren(h("p", { class: "muted" }, "Loading HSN Capital…"));
    try {
      const get = (path, ref) => gh.getJson(state.token, state.owner, path, ref);
      const [firm, board, live, setup, schedule] = await Promise.all([
        get("firm/firm.json"), get("firm/leaderboard.json"), get("status/firm_live.json", "live").catch(() => null),
        get("status/setup.json").catch(() => null), get("status/firm_schedule.json").catch(() => null),
      ]);
      this.firm = firm; this.board = board; this.live = live; this.setup = setup; this.schedule = schedule;
      this.render();
    } catch (e) { this.renderProblem(e); }
  }

  /** The firm's files could not be read. Say what is wrong and exactly how to put it right. */
  renderProblem(e) {
    const help = tokenHelp(e);
    this.root.replaceChildren(card("HSN Capital cannot be shown yet", h("p", { class: "error" }, help.title),
      help.steps.length ? h("ol", { class: "steps" }, ...help.steps.map((x) => h("li", {}, x))) : null,
      help.link ? h("p", {}, h("a", { href: help.link, target: "_blank", rel: "noopener noreferrer" }, "Open your GitHub tokens")) : null,
      h("div", { class: "row" }, h("button", { class: "primary", onclick: () => this.load() }, "Try again"))));
  }

  async refreshLive() {
    try {
      const was = isRunning(this.live);
      this.live = await gh.getJson(state.token, state.owner, "status/firm_live.json", "live");
      const now = isRunning(this.live);
      if (was && !now) { await this.load(); return; }          // the shift has just finished: read its results
      if (now && this.building?.mode === "replay") this.building.stopReplay(true);      // a real shift takes over from the replay
      this.building?.applyLive(this.live);
      this.paintControl(); this.paintTicker();
    } catch { /* keep the last state */ }
  }

  // ── the Start strip: one button, and a plain line saying what the firm is doing right now ──────────────────────────
  paintControl() {
    if (!this.controlEl) return;
    const f = this.firm, l = this.live, running = isRunning(l), ready = readiness(state, this.setup, f);
    const c = l?.counters || {};
    let button, line, sub = null;
    if (this.busy) {
      button = h("button", { class: "start-btn", disabled: true }, this.busy);
      line = "Sent to GitHub. This takes about a minute; you can stay on this page.";
    } else if (f.paused) {
      button = h("button", { class: "start-btn go", disabled: ready.ok ? null : true, onclick: () => this.startDialog() }, f.cycle ? "▶ Start again" : "▶ Start the company");
      line = !ready.ok ? ready.why : f.cycle ? `Paused after shift ${f.cycle}. Everything it learned is saved; Start carries on from there.`
        : `Ready. All ${Object.keys(f.agents || {}).length} agents are at their desks; nothing moves until you press Start.`;
      if (!ready.ok && ready.setup) sub = h("button", { class: "secondary small", onclick: () => { location.hash = "#setup"; location.reload(); } }, "Open Setup");
    } else {
      button = h("button", { class: "start-btn stop", onclick: () => this.pause() }, "⏸ Pause");
      if (running) {
        line = h("span", {}, badge("LIVE", "good"), ` shift ${l.cycle} · ${liveText(l)} · ${num(c.ideas_tested ?? 0, 0)} ideas tested`
          + (c.engine_search ? ` (${num(c.engine_search, 0)} by the Engine's own search)` : "") + ` · ${num(c.trades_tested ?? 0, 0)} trades through the Engine`
          + (c.code_read ? ` · ${c.code_read} looks at the code` : "") + (c.code_handed_in ? ` · ${c.code_handed_in} pieces of code handed in` : "")
          + ` · ${c.challenges ?? 0} challenges (${c.challenges_passed ?? 0} passed)`);
        sub = h("div", {}, h("div", { class: "progress shift-bar", role: "progressbar", "aria-valuenow": Math.round(l.percent || 0), "aria-valuemin": 0, "aria-valuemax": 100 }, h("div", { style: `width:${Math.max(2, Math.min(100, l.percent || 0))}%` })),
          h("span", { class: "muted small" }, c.saved_at ? `Progress saved ${ukDateTime(c.saved_at)} UK (${c.saves} saves this shift)` : "Progress is saved every few minutes while it works."));
      } else {
        const nxt = nextShift(f.settings?.pace, this.schedule, new Date());
        line = `Working in shifts, ${PACES[f.settings?.pace]?.words || PACES["6h"].words}. Shift ${f.cycle || 0} ${f.last_cycle?.finished_at ? "finished " + ukDateTime(f.last_cycle.finished_at) + " UK" : "has not finished yet"}. `
          + (nxt.text || "") + (this.building?.mode === "replay" ? " Below: a replay of that shift's real events." : "");
        sub = h("button", { class: "secondary small", onclick: () => this.runCycle() }, "Run a shift now");
      }
    }
    this.controlEl.replaceChildren(button, h("div", { class: "control-text" }, h("p", { class: "control-line" }, line), sub));
  }

  startDialog() {
    const f = this.firm, cfg = f.settings || {};
    const pace = select(Object.entries(PACES).map(([k, v]) => [k, `${v.label} — ${v.note}`]), cfg.pace || "6h");
    const api = input("number", cfg.monthly_api_budget_usd ?? 60, { min: 0, step: 5, inputmode: "decimal" });
    const mins = input("number", cfg.monthly_minutes_budget ?? 1200, { min: 0, step: 50, inputmode: "numeric" });
    const model = select([["claude-sonnet-5-5", "Claude Sonnet 5.5 (default)"], ["claude-haiku-5-5", "Claude Haiku 5.5 (more thinking turns per $)"], ["claude-opus-5-5", "Claude Opus 5.5"]], cfg.model || "claude-sonnet-5-5");
    const go = h("button", { class: "primary", onclick: async () => {
      closeModal();
      await this.act("Starting…", { action: "pause", paused: false, pace: pace.value, monthly_api_budget_usd: boxNumber(api, cfg.monthly_api_budget_usd ?? 60), monthly_minutes_budget: boxNumber(mins, cfg.monthly_minutes_budget ?? 1200), model: model.value },
        (res) => res?.firm_schedule?.ok === false ? "Started, but its shifts could not be scheduled: " + (res.firm_schedule.note || "see the run on GitHub") : "Started. The first shift is starting now; the building comes alive within a couple of minutes.");
    } }, "Start the company");
    openModal(h("div", { class: "stack" }, h("h2", {}, f.cycle ? "Start HSN Capital again" : "Start HSN Capital"),
      h("p", {}, "The firm works in shifts on GitHub's machines. In a shift the agents read the research and the code, write their own rules and their own strategy code, the Engine tests everything on the real price history, teams meet, and challenges are taken on months nobody has tested on."),
      field("How often a shift runs", pace),
      h("div", { class: "grid two" }, field("AI budget a month ($)", api, "for the agents' thinking"), field("GitHub minutes a month", mins, "2,000 are free")),
      planLine(pace, mins, cfg.monthly_minutes_budget ?? 1200),
      h("p", { class: "help" }, "When the AI budget is used up the Engine carries on testing without AI: between the agents' thinking turns it tries small changes around each agent's best idea, so every shift does real work. At the minutes limit the firm stops until the new month (GitHub's free plan gives 2,000 minutes a month). Between shifts the building replays the last shift."),
      field("Model for every agent", model),
      h("p", { class: "help" }, "Pause stops it at any time and costs nothing while paused. Progress is saved to the engine repository every few minutes during a shift and again at its end. Nothing here can place a trade or reach the VPS: the agents only ever work on stored price history."),
      h("div", { class: "row" }, go, h("button", { class: "secondary", onclick: () => closeModal() }, "Not now"))));
  }

  pause() {
    if (!confirm("Pause HSN Capital? No more shifts start until you press Start. A shift that is running now finishes first. Nothing is lost.")) return;
    this.act("Pausing…", { action: "pause", paused: true }, () => "Paused. No shifts are scheduled and a paused firm uses no GitHub minutes.");
  }

  /** One CEO action through the Run workflow, with the strip saying what is happening. */
  async act(label, payload, done) {
    this.busy = label; this.note = ""; this.paintControl();
    try {
      const { result } = await startRun("ceo", payload, () => {}, { prefix: "ceo" });
      this.busy = "";
      await this.load();
      this.say(done(result), result?.firm_schedule?.ok === false ? "warnc" : "good");
      setTimeout(() => this.refreshLive(), 30000);
    } catch (e) { this.busy = ""; this.paintControl(); this.say(e.message, "bad"); }
  }

  say(text, cls = "muted") { if (this.sayEl) { this.sayEl.textContent = text || ""; this.sayEl.className = `control-note ${cls}`; this.sayEl.hidden = !text; } }

  render() {
    const f = this.firm;
    this.stopLoop();
    this.building?.destroy(); this.building = null;
    if (!f) {
      this.root.replaceChildren(card("HSN Capital", h("p", { class: "muted" }, "The firm's files are not in the engine repository yet. They are created by the first shift."),
        h("button", { class: "primary", onclick: () => this.runCycle(true) }, "Run the first shift now")));
      return;
    }
    const n = Object.keys(f.agents || {}).length;
    this.controlEl = h("div", { class: "firm-control" });
    this.sayEl = h("p", { class: "control-note", hidden: true });
    const head = card(h("span", {}, "HSN Capital ", badge(`shift ${f.cycle}`), " ", f.trial_mode ? badge("TRIAL MODE — nothing ranked for real", "trial") : badge("ranking on verified data", "good"), " ", f.paused ? badge("PAUSED", "warn") : badge("working", "good")),
      this.controlEl, this.sayEl);

    const pages = [["company", "Company", `The building with all ${n} agents. Tap an agent or a room.`], ["people", "People", "Every agent's level and progress to the next one."],
      ["code", "Rules & code", "The rules and the strategy code the agents and teams wrote themselves."], ["records", "Records", "Floors, budgets, the leaderboard, challenges, minutes and reports."],
      ["ceo", "CEO's office", "Ask anyone a question, set the focus, change how the firm works."]];
    const nav = h("div", { class: "subtabs", role: "tablist" }, ...pages.map(([k, label]) => h("button", { type: "button", class: `subtab ${this.page === k ? "is-active" : ""}`, role: "tab", "data-page": k, onclick: () => this.go(k) }, label)));
    this.pageHelp = h("p", { class: "help page-help" }, pages.find((x) => x[0] === this.page)[2]);
    this.pagesMeta = pages;

    // Company
    this.scoreEl = h("div", { class: "stats scoreboard" });
    const canvas = h("canvas", { "aria-label": "The HSN Capital building with every agent at a desk" });
    const legend = h("div", { class: "building-legend" },
      ...Object.entries(LEVELS).map(([k, v]) => h("span", {}, h("i", { style: `background:${LEVEL_COLORS[k]}` }), `${k} ${v}`)),
      h("span", { class: "sep" }, "bars under each name:"), h("span", {}, h("i", { style: `background:${BAR_COLORS.day}` }), "months in profit"), h("span", {}, h("i", { style: `background:${BAR_COLORS.pips}` }), "pips"),
      h("span", {}, h("i", { style: `background:${BAR_COLORS.rr}` }), "risk to reward"), h("span", {}, h("i", { style: `background:${BAR_COLORS.win}` }), "win rate"),
      h("span", { class: "sep" }, "★ most pips · ◎ best win rate · bright bars = its challenge on unseen months, faded = practice"));
    this.replayBox = h("div", { class: "toolbar replay-bar" });
    this.tickerEl = h("div", { class: "ticker", "aria-live": "off" });
    const company = h("div", { class: "stack", "data-panel": "company" }, this.scoreEl,
      card(`The building: all ${n} agents (every movement is a real event)`, h("div", { class: "building-wrap" }, canvas), legend, this.replayBox),
      card("What just happened", h("p", { class: "help" }, "The latest real events, newest first. Each test is the Engine's result on real price history; nothing here is written by the AI."), this.tickerEl));
    // the other pages are built when first opened (they are long)
    this.panels = { company, people: null, code: null, records: null, ceo: null };
    this.panelBox = h("div", {}, company);
    this.root.replaceChildren(h("div", { class: "stack" }, head, nav, this.pageHelp, this.panelBox));
    this.paintControl(); this.paintScore(); this.paintTicker(); this.paintReplay();
    if (this.page !== "company") this.go(this.page);
    requestAnimationFrame(() => {
      this.building = new Building(canvas, { animations: state.animations, onAgent: (id) => this.openAgent(id), onRoom: (room) => this.openRoom(room) });
      this.building.setStars(scoreboard(f).stars);
      this.building.setData(f, this.live);
      this.building.applyLive(this.live);
      window.hsnBuilding = this.building;                 // handy for checks from the console; holds no secrets
      this.startLoop();
    });
  }

  go(page) {
    this.page = page;
    this.root.querySelectorAll(".subtab").forEach((b) => b.classList.toggle("is-active", b.dataset.page === page));
    if (this.pageHelp) this.pageHelp.textContent = (this.pagesMeta || []).find((x) => x[0] === page)?.[2] || "";
    if (!this.panels[page]) {
      if (page === "people") { this.staffBox = h("div", {}); this.panels.people = card("Staff: level and progress to the next level", this.staffBox); this.paintStaff(); }
      if (page === "code") this.panels.code = this.codePage();
      if (page === "records") this.panels.records = h("div", { class: "stack" }, this.firmPage(), this.brainsCard());
      if (page === "ceo") this.panels.ceo = this.ceoOffice();
    }
    this.panelBox.replaceChildren(this.panels[page]);
    if (page === "company") { this.building?._resize?.(); this.startLoop(); } else this.stopLoop(false);
  }

  paintScore() {
    if (!this.scoreEl) return;
    this.scoreEl.hidden = !(this.firm.cycle > 0 || isRunning(this.live));        // nothing to score before the first shift
    const sb = scoreboard(this.firm), c = isRunning(this.live) ? (this.live.counters || {}) : {};
    const who = (x, text) => x ? h("button", { class: "link", type: "button", onclick: () => this.openAgent(x.id) }, text) : "—";
    this.scoreEl.replaceChildren(
      stat("★ Most pips", sb.pips ? `${sb.pips.pips > 0 ? "+" : ""}${num(sb.pips.pips, 0)}` : "—", who(sb.pips, sb.pips ? `${sb.pips.name} · ${sb.pips.sets} trades` : ""), sb.pips ? "good" : ""),
      stat("◎ Best win rate", sb.win ? pct(sb.win.win, 1) : "—", sb.win ? who(sb.win, `${sb.win.name} · ${sb.win.sets} trades`) : `needs ${sb.minTrades}+ trades in profit`, sb.win ? "good" : ""),
      stat("Ideas tested", num(sb.ideas, 0), c.ideas_tested ? `+${num(c.ideas_tested, 0)} this shift` : `${num(sb.verified, 0)} verified by the Audit desk`),
      stat("Own strategy code", sb.strategies, `${sb.waiting} waiting for the sandbox · ${sb.agentsWithCode} agents trade their own code`),
      stat("Moved up", sb.levelUps, `${sb.challenges} challenges taken so far`),
      stat("AI this month", `$${(+sb.spent || 0).toFixed(2)}`, `of $${num(sb.budget, 0)} · ${num(minutesUsedThisMonth(state.minutes), 0)} of ${num(sb.minutesBudget, 0)} GitHub minutes`));
  }

  paintTicker() {
    if (!this.tickerEl) return;
    const running = isRunning(this.live);
    const events = (running ? (this.live.events || []) : (this.firm.recent_events || [])).slice(-60).reverse();
    const rows = events.map((e) => eventLine(e, (id) => this.nameOf(id))).filter(Boolean).slice(0, 40);
    this.tickerEl.replaceChildren(...(rows.length ? rows.map((r) => h("div", { class: `tick ${r.cls}` }, h("span", { class: "tick-t" }, ukDateTime(r.at).slice(-5)), h("span", { class: "tick-x" }, r.text)))
      : [h("p", { class: "muted" }, this.firm.cycle ? "Nothing in the last shift's record." : "Nothing has happened yet: the firm has not run a shift.")]));
  }

  // ── replay of a finished shift (exactly its real events). Between shifts it plays on a loop, so the building is never
  //    a still picture - and it always says that it is a replay.
  paintReplay(note = "") {
    if (!this.replayBox) return;
    const f = this.firm, names = (f.replays || []).slice().reverse();
    if (!names.length) { this.replayBox.replaceChildren(h("span", { class: "muted small" }, f.cycle ? "This shift has no replay file." : "Nothing to replay yet: the firm has not run a shift.")); return; }
    const playing = this.building?.mode === "replay";
    const pick = select(names.map((x) => [x, `shift ${parseInt(x.replace(/\D/g, ""), 10)}`]), this.replayPick || names[0], { class: "small", "aria-label": "Shift to replay" });
    pick.addEventListener("change", () => { this.replayPick = pick.value; if (this.building?.mode === "replay") { this.building.stopReplay(true); this.startReplay(pick.value); } });
    const speed = select([[1, "1×"], [2, "2×"], [4, "4×"], [8, "8×"], [16, "16×"]], this.replaySpeed || 4, { class: "small", "aria-label": "Replay speed" });
    speed.addEventListener("change", () => { this.replaySpeed = +speed.value; if (this.building) this.building.speed = +speed.value; });
    this.replayNote = h("span", { class: "muted small" }, note || (isRunning(this.live) ? "a shift is running: the building is live" : !state.animations ? "animations are off (the picture is still)" : playing ? "" : "replay is off"));
    const loop = h("label", { class: "chip" }, h("input", { type: "checkbox", checked: this.loop || null, onchange: (e) => { this.loop = e.target.checked; localStorage.setItem("hsn.replayloop", this.loop ? "on" : "off"); if (this.loop) this.startLoop(); else { this.stopLoop(); this.paintReplay(); } } }), "replay the last shift between shifts");
    const anim = h("label", { class: "chip" }, h("input", { type: "checkbox", checked: state.animations || null, onchange: (e) => { state.animations = e.target.checked; localStorage.setItem("hsn.animations", e.target.checked ? "on" : "off"); if (this.building) { this.building.animations = e.target.checked; if (!e.target.checked) this.building.stopReplay(true); this.building.snapAll(); this.building.draw(); } if (e.target.checked) this.startLoop(); this.paintReplay(); } }), "movement");
    this.replayBox.replaceChildren(this.replayNote, h("details", { class: "replay-more" }, h("summary", {}, "Replay options"), h("div", { class: "row" }, loop, anim, pick, h("span", { class: "muted small" }, "speed"), speed)));
  }

  startLoop() {
    clearTimeout(this.loopT);
    if (!this.loop || !state.animations || this.page !== "company" || !this.building || this.building.mode === "replay" || isRunning(this.live) || this.root.hidden) return;
    const names = (this.firm?.replays || []).slice().reverse();
    if (!names.length) return;
    this.loopT = setTimeout(() => this.startReplay(this.replayPick || names[0]), 1200);
  }
  stopLoop(stopNow = true) { clearTimeout(this.loopT); if (stopNow && this.building?.mode === "replay") this.building.stopReplay(true); }

  async startReplay(name) {
    try {
      if (!this.building || isRunning(this.live)) return;
      this.replayCache = this.replayCache || {};
      const rep = this.replayCache[name] || (this.replayCache[name] = await gh.getJson(state.token, state.owner, `firm/replays/${name}`));
      if (!rep || !this.building || this.building.mode === "replay" || isRunning(this.live) || this.page !== "company") return;
      this.building.playReplay(rep, { speed: this.replaySpeed || 4,
        onProgress: (i, n, e) => { if (this.replayNote) this.replayNote.textContent = `Replay of shift ${rep.cycle} (real events, ${ukDateTime(rep.finished_at)} UK) · ${i} of ${n} · ${this.eventText(e)}`; },
        onEnd: () => { this.paintReplay(`Replay of shift ${rep.cycle} finished.`); this.paintControl(); if (this.loop) { clearTimeout(this.loopT); this.loopT = setTimeout(() => this.startLoop(), 9000); } } });
      this.paintReplay(`Replay of shift ${rep.cycle}: ${rep.events.length} real events`); this.paintControl();
    } catch (e) { if (this.replayNote) this.replayNote.textContent = e.message; }
  }

  nameOf(id) { return this.firm?.agents?.[id]?.name || id || ""; }
  eventText(e) { return eventLine(e, (id) => this.nameOf(id))?.text || String(e.kind || "").replaceAll("_", " "); }

  // ── staff: every agent, its level and its bars ──────────────────────────────────────────────────────────────────
  paintStaff() {
    const f = this.firm, fl = this.filter;
    const chips = h("div", { class: "checks" }, ...[["all", "All"], ...[5, 4, 3, 2, 1].map((k) => [String(k), `Floor ${k}`])].map(([v, l]) =>
      h("button", { class: `chip ${fl.floor === v ? "on" : ""}`, type: "button", onclick: () => { fl.floor = v; this.paintStaff(); } }, l)));
    const sort = select([["floor", "by floor"], ["pips", "by pips"], ["win", "by win rate"], ["progress", "by progress"], ["score", "by Month Score"], ["name", "by name"]], fl.sort, { class: "small", "aria-label": "Sort" });
    sort.addEventListener("change", () => { fl.sort = sort.value; this.paintStaff(); });
    const search = input("text", fl.text, { placeholder: "find a name or a desk", class: "small", "aria-label": "Find" });
    search.addEventListener("input", () => { fl.text = search.value; clearTimeout(this.searchT); this.searchT = setTimeout(() => { this.paintStaff(); const el = this.staffBox.querySelector("input[type=text]"); el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); }, 250); });
    let rows = Object.entries(f.agents || {}).map(([id, a]) => ({ id, ...a }));
    if (fl.floor !== "all") rows = rows.filter((a) => String(a.floor) === fl.floor);
    if (fl.text.trim()) { const q = fl.text.trim().toLowerCase(); rows = rows.filter((a) => `${a.name} ${a.desk} ${a.group}`.toLowerCase().includes(q)); }
    const by = { floor: (a, b) => b.floor - a.floor || String(a.group).localeCompare(String(b.group)) || a.id.localeCompare(b.id), progress: (a, b) => (b.progress?.pct || 0) - (a.progress?.pct || 0) || a.id.localeCompare(b.id),
      score: (a, b) => (b.best_month_score ?? -1e9) - (a.best_month_score ?? -1e9), name: (a, b) => a.name.localeCompare(b.name),
      pips: (a, b) => (b.best_pips ?? -1e9) - (a.best_pips ?? -1e9) || a.id.localeCompare(b.id), win: (a, b) => (b.best_win ?? -1) - (a.best_win ?? -1) || a.id.localeCompare(b.id) };
    rows.sort(by[fl.sort]);
    const tiles = rows.map((a) => {
      const p = a.progress || {};
      return h("button", { class: "agent-tile", type: "button", "data-agent": a.id, onclick: () => this.openAgent(a.id) },
        h("span", { class: "at-head" }, h("span", { class: "lvl", style: `background:${LEVEL_COLORS[a.level_n || a.floor]}` }, String(a.level_n || a.floor)), h("span", { class: "at-name" }, a.name), h("span", { class: `at-mood mood-${a.mood}`, title: a.mood }, MOOD_FACE[a.mood] || "")),
        h("span", { class: "at-sub" }, `${a.level} · ${a.desk} · ${a.group}`),
        h("span", { class: "at-sub" }, a.best_pips != null ? `best: ${a.best_pips > 0 ? "+" : ""}${num(a.best_pips, 0)} pips · ${a.best_win == null ? "—" : num(a.best_win, 0) + "%"} wins${a.own_code ? " · own code" : ""}` : "no idea tested yet"),
        progressBars(p, { compact: true }),
        h("span", { class: "at-foot" }, p.basis && p.basis !== "none" ? `${p.pct}% of ${p.to === "presenting to the CEO" ? "floor 5's" : "the " + p.to} checks · ${p.basis === "challenge" ? "its challenge" : "practice"}` : "no result yet"));
    });
    this.staffBox.replaceChildren(h("div", { class: "row between staff-tools" }, chips, h("span", { class: "row" }, search, sort)),
      h("p", { class: "help" }, "Each bar is the share of that agent's months that meet one of the next level's monthly checks: in profit (Day Score), at the pip target, at the reward-to-risk, and at the floor's win-rate target. Bright bars are from its real challenge on months it had never been tested on; faded bars are practice on its training months."),
      rows.length ? h("div", { class: "staff-grid" }, ...tiles) : h("p", { class: "muted" }, "Nobody matches that."));
  }

  firmPage() {
    const f = this.firm, floors = f.floors || {};
    const rows = (this.board?.rows || []).slice(0, 25).map((r) => ({ "#": "", Name: r.name + (r.own_code ? " · own code" : ""), Floor: `${r.floor} ${r.level}`, Group: r.group, Pips: num(r.best_pips, 0), "Win %": r.best_win == null ? "—" : num(r.best_win, 1), Trades: r.best_sets ?? "—", "£": money(r.best_pnl), "Avg R": signed(r.best_avg_r, 3), "Month Score": num(r.best_month_score, 1), "To next": r.progress_pct != null ? `${r.progress_pct}%` : "—", Ideas: r.ideas, _id: r.agent_id }));
    rows.forEach((r, i) => (r["#"] = i + 1));
    const lb = table(["#", "Name", "Floor", "Group", "Pips", "Win %", "Trades", "£", "Avg R", "Month Score", "To next", "Ideas"], rows, { numeric: ["#", "Pips", "Win %", "Trades", "£", "Avg R", "Month Score", "To next", "Ideas"] });
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
        stat("GitHub minutes this month", num(minutesUsedThisMonth(state.minutes), 0), `of the firm's limit of ${num(budget.minutes_budget, 0)} (2,000 are free)${state.minutes?.checked_at ? " · counted " + ukDateTime(state.minutes.checked_at) + " UK" : ""}`, minutesUsedThisMonth(state.minutes) >= 0.8 * (budget.minutes_budget || 1200) ? "warnc" : ""),
        lc.max_seconds && lc.seconds != null ? stat("Last shift's time", `${num(lc.seconds / 60, 0)} min`, `it was given ${num(lc.max_seconds / 60, 0)} minutes to work (an even share of the minutes left this month)`) : null,
        stat("Last shift", `${lc.thinking_turns ?? 0} turns`, `${lc.variants_tested ?? 0} variants · ${lc.ai_calls ?? 0} AI calls · $${num(lc.ai_cost_usd, 2)}${lc.budget?.cost_per_turn_usd ? ` · $${lc.budget.cost_per_turn_usd} a turn${lc.budget.cost_per_turn_measured ? " (measured)" : " (estimate)"}` : ""}`),
        stat("Challenge attempts", f.attempts?.total ?? 0, "all counted for the random bar"), stat("Data", f.data_coverage?.symbols?.XAUUSD?.months ? `${f.data_coverage.symbols.XAUUSD.months} months gold` : "—", f.data_coverage?.symbols?.XAUUSD?.last_bar?.slice(0, 10) || "")),
      h("p", { class: "muted small" }, "Paper desk: parked (your decision of 8 Nov 2026). Floor 5's challenge needs 20 trading days of live paper testing, so nobody can pass floor 5 until it returns."),
      h("h3", {}, "Leaderboard (ranked by Month Score, which is money first; pips and win rate beside it)"), lb,
      h("h3", {}, "Ideas Board (proven from floor 3 up, with verified report cards)"), ideas.length ? h("div", { class: "list" }, ...ideas) : h("p", { class: "muted" }, "Nothing has passed floor 3 yet."),
      h("h3", {}, "Level-ups, swaps, transfers, battles, failed challenges"), ev.length ? evList : h("p", { class: "muted" }, "None yet."),
      h("div", { class: "grid three" }, docs("Meeting minutes", f.minutes || [], "firm/minutes"), docs("Floor discussions", (f.discussions || []), "firm/discussions"), docs("Managers' reports", f.reports || [], "firm/reports"), docs("Head of Trading memos", f.memos || [], "firm/memos")),
      (lc.warnings || []).length ? h("p", { class: "warnc" }, lc.warnings.join(" ")) : null,
      (lc.errors || []).length ? h("p", { class: "bad" }, "The last shift reported errors: " + lc.errors.map((e) => e.message || e.type).join("; ")) : null);
  }

  /** How the agents think: research and code, with the real counts from the last shift. */
  brainsCard() {
    const f = this.firm, lc = f.last_cycle || {}, live = lc.live || {}, feats = f.features || {}, mode = f.settings?.research || "live";
    const list = (feats.active || []).map((x) => h("div", { class: "item", onclick: () => this.openAgent(x.agent_id) }, h("span", {}, h("span", { class: "t" }, `${x.id} · ${x.name}`), h("span", { class: "d" }, ` ${x.timeframe}M bars · by ${x.agent_name} · a value for ${num(x.usable, 0)} signals`))));
    return card("How the agents think: research and code",
      h("p", { class: "help" }, "Claude proposes; the Engine decides. Each turn starts from the Engine's research pack (the desk's baseline split by session, hour, market type, higher-timeframe agreement, plan…, on training months only). "
        + (mode === "live" ? "While it thinks, an agent can also question the Engine (breakdowns, exit comparisons, a test of a rule set, the library, its next level): those lookups are its only tools — no shell, no files, no network. " : mode === "pack" ? "Agents ask the Engine questions that are answered before their next turn. " : "")
        + (f.settings?.agent_code === false ? "" : "An agent can also hand in a small function over closed bars (a coded feature). It is never run where the API key is: a separate job with no secrets and no network runs it, proves it does not look ahead, and only then can rules filter on it.")),
      h("div", { class: "stats" },
        stat("Research lookups (last shift)", live.research_calls ?? 0, mode === "live" ? "live tools" : mode),
        stat("Ideas tested (last shift)", live.ideas_tested ?? 0, `${num(live.trades_tested, 0)} trades through the Engine`),
        stat("Challenges (last shift)", live.challenges ?? 0, `${live.challenges_passed ?? 0} passed`),
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
    const cfg = f.settings || {};
    const pace = select(Object.entries(PACES).map(([k, v]) => [k, `${v.label} — ${v.note}`]), cfg.pace || "6h");
    const apiBudget = input("number", cfg.monthly_api_budget_usd ?? 60, { min: 0, step: 5, inputmode: "decimal" });
    const minsBudget = input("number", cfg.monthly_minutes_budget ?? 1200, { min: 0, step: 50, inputmode: "numeric" });
    const gate = h("input", { type: "checkbox", checked: cfg.win_rate_gate ? true : null });
    const search = h("input", { type: "checkbox", checked: (cfg.engine_search_per_cycle ?? 150) > 0 ? true : null });
    const ownCode = h("input", { type: "checkbox", checked: cfg.agent_strategies === false ? null : true });
    const saveHow = h("button", { class: "secondary", onclick: () => this.act("Saving…", { action: "resize", pace: pace.value, monthly_api_budget_usd: boxNumber(apiBudget, cfg.monthly_api_budget_usd ?? 60), monthly_minutes_budget: boxNumber(minsBudget, cfg.monthly_minutes_budget ?? 1200),
      win_rate_gate: gate.checked, engine_search_per_cycle: search.checked ? Math.max(1, cfg.engine_search_per_cycle || 150) : 0, agent_strategies: ownCode.checked },
      () => "Saved. It applies from the next shift.") }, "Save how the firm works");
    const targets = [1, 2, 3, 4, 5].map((k) => `${k}: ${f.floors?.[String(k)]?.challenge?.target?.win_pct ?? "—"}%`).join(" · ");
    this.ceoNote = h("p", { class: "muted small" }, "Start and Pause are at the top of the page.");
    return (this.ceoCard = card("CEO's office", h("p", { class: "help" }, "Every answer comes from the person's real file (Engine numbers only). A commendation lifts a mood and never skips a check. Nothing goes to the VPS, a demo account or live trading from here."),
      h("div", { class: "grid two" },
        h("div", { class: "stack" }, field("Ask", who), q, h("div", { class: "row" }, ask), answer),
        h("div", { class: "stack" }, field("Monthly focus", focus), h("div", { class: "row" }, setFocus), field("Any agent's file, or a commendation", agentSel), h("div", { class: "row" }, openFile, commend),
          field("Head of Trading memo", memoSel), h("div", { class: "row" }, decision, note, decide), this.ceoNote)),
      h("h3", {}, "How the firm works"),
      h("div", { class: "stack" }, field("How often a shift runs", pace),
        h("div", { class: "grid two" }, field("AI budget a month ($)", apiBudget, "for the agents' thinking"), field("GitHub minutes a month", minsBudget, "2,000 are free")),
        planLine(pace, minsBudget, cfg.monthly_minutes_budget ?? 1200),
        h("p", { class: "help" }, "When the AI budget is used up the Engine carries on testing without AI. At the minutes limit the firm stops until the new month (GitHub's free plan gives 2,000 minutes a month)."),
        f.last_cycle?.max_seconds && f.last_cycle?.seconds != null ? h("p", { class: "muted small" }, `The last shift (shift ${f.cycle}) was given ${num(f.last_cycle.max_seconds / 60, 0)} minutes to work and took ${num(f.last_cycle.seconds / 60, 0)}.`) : null,
        h("label", { class: "chip wide" }, ownCode, "Agents may write their own strategy code (it only ever runs in the sandbox: no secrets, no network, look-ahead proof)"),
        h("label", { class: "chip wide" }, search, "The Engine keeps testing small changes around each agent's best idea between its thinking turns"),
        h("label", { class: "chip wide" }, gate, `Make the win rate a pass mark for moving up (now: shown and ranked on only). Targets by floor — ${targets}`),
        h("p", { class: "help" }, "Money always comes first: a month that loses money fails whatever its win rate. With the pass mark on, a month must also reach the floor's win-rate target."),
        h("div", { class: "row" }, saveHow))));
  }

  async ceo(action, payload) {
    try {
      if (this.ceoNote) this.ceoNote.textContent = "Sending… (a run on GitHub; usually about a minute)";
      await startRun("ceo", { action, ...payload }, () => {}, { prefix: "ceo" });
      await this.load();
      this.say("Done.", "good");
    } catch (e) { if (this.ceoNote) { this.ceoNote.textContent = e.message; this.ceoNote.className = "bad"; } }
  }

  async runCycle(first = false) {
    if (this.firm?.paused && !first) { this.say("The firm is paused, so a shift would do nothing. Press Start first.", "warnc"); return; }
    try {
      await gh.dispatch(state.token, state.owner, gh.FIRM_WORKFLOW, { settings: "" });
      this.say("A shift has been asked for. It starts within a minute or two and the building goes live.", "good");
      setTimeout(() => this.refreshLive(), 45000);
    } catch (e) { this.say(e.message, "bad"); }
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
    const chRows = (list, who) => list.slice().reverse().map((c) => ({ Shift: c.cycle, Who: who, Floor: c.floor, Months: (c.months || []).join(", "), Result: h("span", { class: c.passed ? "good" : "bad" }, c.passed ? (c.moved === false ? "passed · waiting for a seat" : "passed") : "not passed"),
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

      card("How it got here", career.length ? h("ol", { class: "timeline" }, ...career.map((x) => h("li", { class: `tl-${x.kind}` }, h("span", { class: "d" }, `shift ${x.cycle}${x.at ? " · " + ukDateTime(x.at) + " UK" : ""}`), h("span", {}, story(x, (i) => this.nameOf(i)))))) : h("p", { class: "muted" }, "Nothing on its record yet: no challenge taken, no move."),
        challenges.length ? h("div", {}, h("h3", {}, "Every challenge, with its result"), table(["Shift", "Who", "Floor", "Months", "Result", "Month Score", "Why", "Replay"], challenges, { numeric: ["Month Score"] })) : h("p", { class: "muted small" }, "No challenge attempt yet (its own or its group's).")),

      best ? card(`Its own rules: best idea ${best.id}${best.verified ? " (verified by the Audit desk)" : ""}${best.rules?.strategy ? " · trades its own code " + best.rules.strategy : ""}`, h("p", {}, h("b", {}, best.hypothesis)),
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
        (g.team_rules || []).length ? h("div", {}, h("p", {}, h("b", {}, "The team's own rules (agreed in its meeting):")), h("ul", { class: "rules" }, ...g.team_rules.map((x) => h("li", {}, x)))) : null,
        (g.team_code || []).length ? h("details", {}, h("summary", {}, `Team strategy code (${g.team_code.length})`), ...g.team_code.map((x) => this.strategyNote(x))) : null,
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

      (file.code?.strategies?.length || file.code?.strategies_rejected?.length) ? h("details", { open: true }, h("summary", {}, `Strategy code it wrote (${(file.code.strategies || []).filter((x) => x.status === "active").length} in use, ${(file.code.strategies_rejected || []).length} rejected)`),
        ...(file.code.strategies || []).map((x) => this.strategyNote(x)),
        ...(file.code.strategies_rejected || []).map((x) => h("div", { class: "note" }, h("b", { class: "bad" }, `${x.name} · rejected by the sandbox`), h("span", {}, (x.problems || []).join("; ")), h("pre", {}, x.source || "")))) : null,

      (file.code?.features?.length || file.code?.rejected?.length) ? h("details", {}, h("summary", {}, `Coded features it wrote (${file.code.features.length} in use, ${file.code.rejected.length} rejected)`),
        ...file.code.features.map((x) => h("div", { class: "note" }, h("b", {}, `${x.id} · ${x.name} · ${x.timeframe}M bars · ${x.status}`), h("span", {}, x.description || ""), h("span", { class: "muted" }, `Sandbox: no look-ahead (${x.lookahead_test?.cuts ?? "?"} cut tests), a value for ${num(x.usable, 0)} signals. Median ${x.quantiles?.p50}, 10th-90th percentile ${x.quantiles?.p10} to ${x.quantiles?.p90}.`), h("pre", {}, x.source || ""))),
        ...file.code.rejected.map((x) => h("div", { class: "note" }, h("b", { class: "bad" }, `${x.name} · rejected by the sandbox`), h("span", {}, (x.problems || []).join("; ")), h("pre", {}, x.source || "")))) : null,

      h("details", {}, h("summary", {}, `All its ideas (${(file.ideas || []).length})`), table(["Id", "Shift", "Kind", "Hypothesis", "Sets", "£", "Avg R", "Score"], (file.ideas || []).slice().reverse().map((i) => ({ Id: i.id + (i.verified ? " ✓" : ""), Shift: i.cycle, Kind: i.kind, Hypothesis: i.hypothesis, Sets: i.summary?.sets, "£": money(i.summary?.pnl_gbp), "Avg R": signed(i.summary?.avg_r, 3), Score: num(i.summary?.month_score, 1) })), { numeric: ["Sets", "£", "Avg R", "Score"] })),

      h("p", { class: "help" }, `Where every number comes from: data version ${file.data_version || "—"}; `, link(file.where_it_lives?.file, "this file"), ", ", link(file.where_it_lives?.library, "the library (every idea ever tested)"), ", ", link(file.where_it_lives?.notes, "its research notes"),
        (file.where_it_lives?.replays || []).length ? ", challenge records: " : "", ...(file.where_it_lives?.replays || []).slice(-4).flatMap((r, i) => [i ? ", " : "", link(r, r.split("/").pop())]), ". Open in GitHub (private repo)."),
    ));
  }

  // ── rules and code the agents wrote ─────────────────────────────────────────────────────────────────────────────
  strategyNote(x) {
    const b = x.best;
    return h("div", { class: "note" }, h("b", {}, `${x.id} · ${x.name} · ${x.timeframe}M ${x.instrument || ""} · ${x.status}`), h("span", {}, x.description || ""),
      h("span", { class: "muted" }, `Its code gives ${num(x.entries, 0)} signals over the whole price history (${num(x.longs, 0)} long, ${num(x.shorts, 0)} short), ${num(x.own_exits, 0)} closed by its own exit · targets ${(x.targets || []).join(" / ")} R · `
        + `sandbox: no look-ahead (${x.lookahead_test?.cuts ?? "?"} cut tests)${x.uses_original ? " · built on the original with changed inputs" : ""}`),
      b ? h("span", { class: (b.pnl_gbp || 0) > 0 ? "good" : "muted" }, `Best tested result so far, on the practice months (${b.idea}): ${b.pips > 0 ? "+" : ""}${num(b.pips, 0)} pips, ${b.win_rate_pct == null ? "—" : num(b.win_rate_pct, 1) + "%"} wins, ${num(b.sets, 0)} trades, ${money(b.pnl_gbp)}, avg R ${signed(b.avg_r, 3)}`) : h("span", { class: "muted" }, "Not tested yet: the Engine tests it at the start of the next shift."),
      (x.problems || []).length ? h("span", { class: "bad" }, (x.problems || []).join("; ")) : null,
      x.source ? h("pre", {}, x.source) : null);
  }

  async openStrategy(x) {
    openModal(h("p", { class: "muted" }, `Opening ${x.id}…`));
    try {
      const owner = String(x.owner_id || "");
      const member = owner.startsWith("G") ? this.firm.floors && Object.values(this.firm.floors).flatMap((fl) => fl.groups || []).find((g) => g.id === owner)?.members?.[0] : owner;
      const file = member ? await gh.getJson(state.token, state.owner, `firm/agents/${member}.json`) : null;
      const full = (owner.startsWith("G") ? file?.group?.team_code : file?.code?.strategies)?.find((s2) => s2.id === x.id) || x;
      openModal(h("div", { class: "stack" }, h("h2", {}, `${x.id}: ${x.name}`), h("p", { class: "muted" }, owner.startsWith("G") ? `Team code: written by group ${owner} in its meeting, shift ${x.cycle ?? "?"}.` : `Written by ${x.owner_name || owner}${x.group_id ? " (group " + x.group_id + ")" : ""}, shift ${x.cycle ?? "?"}.`),
        this.strategyNote(full), owner.startsWith("A") ? h("div", { class: "row" }, h("button", { class: "secondary", onclick: () => this.openAgent(owner) }, `Open ${x.owner_name || owner}'s file`)) : null));
    } catch (e) { openModal(h("p", { class: "error" }, e.message)); }
  }

  codePage() {
    const f = this.firm, st = f.strategies || { active: [], waiting: 0, rejected: 0 }, feats = f.features || {};
    const cards = (st.active || []).slice().sort((a, b) => (b.best?.pips ?? -1e9) - (a.best?.pips ?? -1e9));
    const rows = cards.map((x) => ({ Id: x.id, Name: x.name, By: x.owner_name || x.owner_id, Chart: `${x.timeframe}M`, Signals: num(x.entries, 0), Trades: x.best ? num(x.best.sets, 0) : "—", Pips: x.best ? num(x.best.pips, 0) : "—",
      "Win %": x.best?.win_rate_pct == null ? "—" : num(x.best.win_rate_pct, 1), "£": x.best ? money(x.best.pnl_gbp) : "—", "From the original": x.uses_original ? "yes" : "", _x: x }));
    const tbl = table(["Id", "Name", "By", "Chart", "Signals", "Trades", "Pips", "Win %", "£", "From the original"], rows, { numeric: ["Signals", "Trades", "Pips", "Win %", "£"] });
    tbl.querySelectorAll("tbody tr").forEach((tr, i) => { tr.style.cursor = "pointer"; tr.addEventListener("click", () => this.openStrategy(rows[i]._x)); });
    const groups = Object.values(f.floors || {}).flatMap((fl) => (fl.groups || []).map((g) => ({ ...g, floorLevel: fl.level }))).filter((g) => (g.team_rules || []).length || g.strategy);
    const teams = groups.map((g) => h("div", { class: "note" }, h("b", {}, `Group ${g.id} · ${g.floorLevel}${g.own_code ? " · trades its own code" : ""}`),
      h("span", { class: "muted" }, g.strategy ? `strategy ${g.strategy}${g.month_score != null ? " · Month Score " + num(g.month_score, 1) : ""}` : "no group strategy yet"),
      (g.team_rules || []).length ? h("ul", { class: "rules" }, ...g.team_rules.map((x) => h("li", {}, x))) : h("span", { class: "muted" }, "No rules written down yet (they are written in the group's meeting)."),
      h("div", { class: "row" }, h("button", { class: "secondary small", onclick: () => this.openRoom({ kind: "group", floor: Object.entries(f.floors).find(([, fl]) => (fl.groups || []).some((x) => x.id === g.id))?.[0] | 0, group: { data: g } }) }, "Open the group"))));
    const flist = (feats.active || []).map((x) => h("div", { class: "item", onclick: () => this.openAgent(x.agent_id) }, h("span", {}, h("span", { class: "t" }, `${x.id} · ${x.name}`), h("span", { class: "d" }, ` ${x.timeframe}M bars · by ${x.agent_name} · a value for ${num(x.usable, 0)} signals`))));
    return h("div", { class: "stack" },
      card("How the agents make their own rules and code",
        h("p", {}, "Every agent writes its own rules: which signals to trade, when, and how to exit. An agent can also write its own strategy code, its own entries and exits, either starting from the original indicator (it can read the code and run it again with changed inputs) or entirely its own. Teams agree their own rules in their meeting and can hand in team code."),
        h("p", { class: "help" }, `What they can read: ${(f.code_room || []).map((k) => CODE_ROOM[k] || k).join("; ") || "the original indicator, your Waves rules and the Engine's rule code"}. What happens to code they write: it is never run where the API key is. A separate job with no secrets and no network runs it and proves it does not look ahead; only then does the Engine test it, with the same price model, challenges and Audit desk as everything else.`),
        h("div", { class: "stats" }, stat("Strategy code in use", cards.length, `${st.waiting ?? 0} waiting for the sandbox`), stat("Rejected by the sandbox", st.rejected ?? 0, "look-ahead, too few trades, bad stops…"),
          stat("Coded features in use", (feats.active || []).length, `${feats.waiting ?? 0} waiting · ${feats.rejected ?? 0} rejected`), stat("Teams with written rules", groups.filter((g) => (g.team_rules || []).length).length, `of ${Object.values(f.floors || {}).reduce((n, fl) => n + (fl.groups || []).length, 0)} groups`))),
      card("Strategy code written by agents and teams (tap one to read it)", cards.length ? h("p", { class: "help" }, "Signals: how many trades the code itself opens over the whole price history. Trades, pips, win % and £: its best tested result so far, on the practice months.") : null, cards.length ? tbl : h("p", { class: "muted" }, f.cycle ? "No strategy code has passed the sandbox yet." : "Nothing yet: the firm has not run a shift.")),
      card("The teams' own rules", teams.length ? h("div", {}, ...teams) : h("p", { class: "muted" }, "No team has met yet. A team meets once at least three of its five members have a tested idea.")),
      card("Coded features (a number per bar that rules can filter on)", flist.length ? h("div", { class: "list" }, ...flist) : h("p", { class: "muted" }, "No coded feature has passed the sandbox yet.")));
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
      h("h2", {}, `${who}: floor ${rec.floor} challenge, shift ${rec.cycle} `, badge(rec.passed ? "passed" : "not passed", rec.passed ? "good" : "bad")),
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
        latest?.takeaways?.length ? h("div", {}, h("h3", {}, `Latest takeaways (shift ${latest.cycle})`), h("ul", { class: "rules" }, ...latest.takeaways.map((x) => h("li", {}, x)))) : h("p", { class: "muted" }, "No discussion has been held on this floor yet."),
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
      g.screen ? h("div", {}, h("h3", {}, `On the room's screen: its latest challenge (floor ${g.screen.floor}, shift ${g.screen.cycle}) — ${g.screen.passed ? "passed" : "not passed"}`), box) : h("p", { class: "muted" }, `${g.challenges} challenge attempt(s) so far.`),
      ch.length ? table(["Shift", "Floor", "Months", "Result", "Why", "Replay"], ch.map((c) => ({ Shift: c.cycle, Floor: c.floor, Months: (c.months || []).join(", "), Result: h("span", { class: c.passed ? "good" : "bad" }, c.passed ? "passed" : "not passed"), Why: (c.reasons || []).join("; "),
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
