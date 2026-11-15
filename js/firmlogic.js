// HSN Capital's page logic with no page in it (so it can be tested without a browser): the paces, when the next
// shift is due, whether the firm can be started, the scoreboard, one plain line per real event, and what to do
// when the token cannot read the engine. Nothing here invents a number: every figure is read from the firm's files.

export const MIN_TRADES_FOR_WIN_RANK = 30;

// How often a shift runs. `cron` mirrors the engine's firm-pace-*.yml schedules (UTC).
export const PACES = {
  "6h": { label: "Every 6 hours", words: "every 6 hours", note: "4 shifts a day, all month", cron: { minute: 17, every: 6 } },
  "3h": { label: "Every 3 hours", words: "every 3 hours", note: "8 shorter shifts a day", cron: { minute: 23, every: 3 } },
  "1h": { label: "Every hour", words: "every hour", note: "24 short shifts a day; uses the month's minutes early", cron: { minute: 29, every: 1 } },
  nonstop: { label: "Non-stop", words: "non-stop, each shift starting the next", note: "back to back until the month's minutes are used", cron: null },
};

const hhmmUK = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(d);
const dayMonthUK = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" }).format(d);

// How long a shift may work. GitHub gives a fixed number of machine minutes a month, so the firm paces itself: every
// shift gets an even share of the minutes that are left, between the shortest useful shift and the longest one. This
// is the same sum as the engine's scripts/firm_schedule.py (shift_plan), written the same way so both give the same
// numbers: the page tells you what the engine will do before you press Start. Keep the two the same.
export const SHIFT = { maxSeconds: 1500, minSeconds: 420, overheadMinutes: 3 };
const EVERY_HOURS = { "6h": 6, "3h": 3, "1h": 1 };

/** Shifts still to come this month (UTC) at this pace, counting one starting now. */
export function shiftsLeft(pace, now = new Date()) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const hours = Math.max(0, (end - now.getTime()) / 3600000);
  return Math.max(1, Math.ceil(hours / (EVERY_HOURS[pace] || EVERY_HOURS["6h"])));
}

/** How long a shift starting now may work, and whether the minutes left last the month at this pace. */
export function shiftPlan(pace, minutesUsed, minutesBudget, now = new Date()) {
  const p = PACES[pace] ? pace : "6h";
  const left = Math.max(0, (+minutesBudget || 0) - (+minutesUsed || 0));
  let wanted = null, seconds = SHIFT.maxSeconds;
  if (p !== "nonstop") {
    wanted = shiftsLeft(p, now);
    seconds = Math.floor(Math.min(SHIFT.maxSeconds, Math.max(SHIFT.minSeconds, (left / wanted - SHIFT.overheadMinutes) * 60)));
  }
  const cost = seconds / 60 + SHIFT.overheadMinutes;
  const paidFor = Math.floor(left / cost);
  return { pace: p, seconds, minutesLeft: left, shiftsWanted: wanted, shiftsPaidFor: paidFor, lastsTheMonth: wanted !== null && paidFor >= wanted };
}

/** The plan in one or two plain sentences, for the Start dialog and the CEO's office. */
export function shiftPlanWords(plan, now = new Date()) {
  const mins = Math.round(plan.seconds / 60), n = (v) => Math.round(v).toLocaleString("en-GB");
  if (plan.shiftsPaidFor <= 0) return `This month's GitHub minutes are used up at this limit, so the firm would wait for the new month. Raise the limit to carry on now.`;
  if (plan.pace === "nonstop") {
    const hours = plan.shiftsPaidFor * (plan.seconds / 60 + SHIFT.overheadMinutes) / 60;
    return `Non-stop: about ${n(plan.shiftsPaidFor)} shifts of ${mins} minutes back to back, roughly ${hours >= 10 ? n(hours) : hours.toFixed(1)} hours without a break. `
      + `Then this month's minutes are used up and the firm waits for the new month.`;
  }
  if (plan.lastsTheMonth) {
    return `The firm paces itself: ${n(plan.shiftsWanted)} shift${plan.shiftsWanted === 1 ? "" : "s"} left this month, each working about ${mins} minutes`
      + `${plan.seconds >= SHIFT.maxSeconds ? " (the longest a shift runs)" : ""}, so the minutes last the whole month.`;
  }
  const until = new Date(now.getTime() + plan.shiftsPaidFor * EVERY_HOURS[plan.pace] * 3600000);
  return `At this pace even the shortest useful shift (${mins} minutes of work) uses this month's minutes up after about ${n(plan.shiftsPaidFor)} of the ${n(plan.shiftsWanted)} shifts, `
    + `around ${dayMonthUK(until)}. The firm then waits for the new month. A slower pace or a higher minutes limit lasts longer.`;
}

/** What the plan's minutes figure rests on: how many were counted and when. An old count is said to be old, because
 *  every shift recounts before it starts and then works from the real figure. `when` formats a date for the reader. */
export function minutesNote(minutes, now = new Date(), when = (iso) => iso) {
  const used = minutesUsedThisMonth(minutes, now);
  if (!(used > 0) || !minutes.checked_at) return "";
  const old = now.getTime() - Date.parse(minutes.checked_at) > 36 * 3600000;
  return ` (${Math.round(used).toLocaleString("en-GB")} GitHub minutes already used this month, as counted ${when(minutes.checked_at)} UK`
    + `${old ? ". That count is old: every shift recounts before it starts, so each shift's real share may be smaller" : ""}.)`;
}

/** This month's GitHub minutes as the engine last counted them (status/minutes.json); 0 when that count is from another month. */
export function minutesUsedThisMonth(minutes, now = new Date()) {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return minutes && minutes.month === month ? (+minutes.minutes_used || 0) : 0;
}

/** When the next scheduled shift is due. GitHub starts scheduled runs a few minutes late, so the text says "about". */
export function nextShift(pace, schedule, now = new Date()) {
  if (schedule && schedule.on === false) return { at: null, text: "No shift is scheduled right now (the schedule is switched off on GitHub)." };
  const slowed = !!(schedule && schedule.slowed);
  const p = PACES[slowed ? "6h" : pace] || PACES["6h"];
  if (!p.cron) return { at: null, text: "The next shift starts as soon as this one ends." };
  const at = new Date(now.getTime());
  at.setUTCSeconds(0, 0);
  at.setUTCMinutes(p.cron.minute);
  while (at <= now || at.getUTCHours() % p.cron.every !== 0) at.setUTCHours(at.getUTCHours() + 1);
  const mins = Math.round((at - now) / 60000);
  const wait = mins >= 90 ? `in about ${Math.round(mins / 60)} hours` : mins >= 2 ? `in about ${mins} minutes` : "any minute now";
  return { at, text: `Next shift about ${hhmmUK(at)} UK (${wait})${slowed ? "; slower than the chosen pace because this month's GitHub minutes limit is used up" : ""}.` };
}

/** Can the firm be started? It needs price history to test on; the AI key only decides whether agents can think. */
export function readiness(state, setup, firm) {
  const gold = state?.coverage?.symbols?.XAUUSD;
  const hasData = !!(gold && gold.months > 0) || !!(setup?.data?.XAUUSD?.bars > 0);
  if (!hasData) {
    const login = setup?.logins_checked?.forexcom;
    const why = login?.state === "ok" ? "The FOREX.com login works; the price history is still downloading. Start unlocks when it has arrived."
      : login?.reason === "not_read_only" ? `Waiting for the price history: the FOREX.com login works${login.demo ? " and it is a demo account" : ""}, but the saved password is the trading password and the engine only accepts a read-only (investor) one. See Setup.`
        : setup?.secrets?.forexcom_mt5_login ? "Waiting for the price history: the FOREX.com login has to pass its check first (a read-only investor password, or a demo account's own). See Setup."
        : "Waiting for the price history: put the FOREX.com MT5 login in on the Setup page.";
    return { ok: false, why, setup: true };
  }
  const key = !!(setup?.secrets?.anthropic_api_key || setup?.secrets?.claude_oauth_token);
  return { ok: true, why: "", aiReady: key, note: key ? "" : "No Anthropic key is saved, so the agents cannot think yet: shifts would be Engine-only." };
}

/** The numbers above the building, all from firm.json. `stars` tells the building whose desk gets a mark. */
export function scoreboard(firm) {
  const agents = Object.entries(firm?.agents || {}).map(([id, a]) => ({ id, ...a }));
  const inProfit = agents.filter((a) => (a.best_month_score ?? 0) > 0 && a.best_pips != null);
  const byPips = inProfit.slice().sort((a, b) => (b.best_pips ?? -1e9) - (a.best_pips ?? -1e9) || a.id.localeCompare(b.id))[0] || null;
  const byWin = inProfit.filter((a) => (a.best_sets ?? 0) >= MIN_TRADES_FOR_WIN_RANK && a.best_win != null)
    .sort((a, b) => (b.best_win ?? -1) - (a.best_win ?? -1) || (b.best_pips ?? 0) - (a.best_pips ?? 0) || a.id.localeCompare(b.id))[0] || null;
  const events = firm?.recent_events || [];
  const card = (a) => a && { id: a.id, name: a.name, pips: a.best_pips, win: a.best_win, sets: a.best_sets };
  // The firm's records, from every idea ever tested, when the engine publishes them: an agent's own best idea is chosen
  // on money and can move to one with a lower win rate, which made "best win rate" fall after a refresh (14 Nov 2026).
  const rec = firm?.records || {};
  const held = (r) => r && { id: r.agent, name: r.name, pips: r.pips, win: r.win_rate_pct, sets: r.sets, idea: r.idea, record: true };
  return {
    pips: held(rec.top_pips) || card(byPips), win: held(rec.top_win) || card(byWin), minTrades: rec.min_trades || MIN_TRADES_FOR_WIN_RANK,
    stars: { pips: rec.top_pips?.agent || byPips?.id || null, win: rec.top_win?.agent || byWin?.id || null },
    ideas: firm?.library?.ideas ?? 0, verified: firm?.library?.verified ?? 0,
    strategies: (firm?.strategies?.active || []).length, waiting: firm?.strategies?.waiting ?? 0,
    agentsWithCode: agents.filter((a) => a.own_code).length,
    // since the firm started when the engine publishes its totals; the recent events alone only cover the last few shifts
    levelUps: firm?.event_totals?.level_up ?? events.filter((e) => e.kind === "level_up").length, challenges: firm?.attempts?.total ?? 0,
    spent: firm?.budget?.firm_spent_usd ?? 0, budget: firm?.budget?.firm_budget_usd ?? 0, minutesBudget: firm?.budget?.minutes_budget ?? 0,
  };
}

const n0 = (v) => (v === null || v === undefined || Number.isNaN(+v)) ? "—" : Math.round(+v).toLocaleString("en-GB");
const pips = (v) => (v === null || v === undefined) ? "" : `${v > 0 ? "+" : ""}${n0(v)} pips`;

// What an agent can read in the code room, in plain words (the engine's names for them are on the left).
export const CODE_WORDS = { original: "your indicator as the Engine runs it", original_pine: "your indicator's Pine code", chart_maths: "the chart maths it is built from", waves: "your Waves rules",
  rules_engine: "how the Engine evaluates rules", price_model: "how prices are filled", challenges: "what each challenge checks" };

/** A look at the code or a question to the Engine, in plain words: {text, short} from the engine's own label. */
export function lookWords(e) {
  const what = String(e?.what || "");
  if (e?.tool === "read_code") {
    const m = what.match(/^reading (\S+)(?: for '(.*)')?$/), key = m ? m[1] : what.replace(/^reading /, "");
    const name = CODE_WORDS[key] || (/^[SF]\d+/.test(key) ? `its own code ${key}` : key || "the code");
    return { text: `reads ${name}${m && m[2] ? `, looking for "${m[2]}"` : ""}`, short: `reading ${CODE_WORDS[key] ? key.replaceAll("_", " ") : key || "code"}` };
  }
  if (e?.tool === "breakdown") return { text: `asks the Engine for its results ${what || "broken down"}`, short: `asks: ${what || "breakdown"}` };
  if (e?.tool === "compare_exits") return { text: "asks the Engine to compare ways of exiting", short: "asks: exits" };
  if (e?.tool === "library") return { text: "reads the firm's library of tested ideas", short: "the library" };
  if (e?.tool === "growth_check") return { text: `asks the Engine how ${what.replace(/^the growth challenge( for )?/, "") || "one of its ideas"} does in the growth challenge (practice months)`, short: "growth challenge?" };
  if (e?.tool === "next_level") return { text: "checks what the next level needs", short: "next level?" };
  return { text: `looks something up (${what || e?.tool || "research"})`, short: what || "research" };
}

/** One real event as one plain line. Returns null for events that are not worth a line of their own. */
export function eventLine(e, nameOf = (id) => id) {
  if (!e || !e.kind) return null;
  const who = e.agent ? nameOf(e.agent) : e.group ? `Group ${e.group}` : e.floor ? `Floor ${e.floor}` : "";
  const win = e.win === null || e.win === undefined ? "" : `, ${Math.round(e.win)}% wins`;
  const out = (text, cls = "") => ({ at: e.at, kind: e.kind, text, cls });
  switch (e.kind) {
    case "tested": {
      if (e.pips === null || e.pips === undefined) return out(`${who}: a test with no trades`, "dim");
      const how = e.by === "engine search" ? ` (the Engine's search: ${e.what || "a small change"})` : e.by === "first test" ? ` (first test of its own code ${e.strategy || ""})`
        : e.by === "records room" ? " (the Records Room's search)" : e.by === "records room meeting" ? ` (the Records Room's meeting had the Engine test ${e.idea || "it"})` : "";
      return out(`${who}: ${pips(e.pips)}${win}${how}`, e.pips > 0 ? "up" : "down");
    }
    case "thinking": return out(`${who} is thinking`, "dim");
    case "looked": return out(`${who} ${lookWords(e).text}`, e.tool === "read_code" ? "code" : "dim");
    case "coded": return out(`${who} handed in ${e.what === "strategy" ? "its own strategy code" : e.what === "team strategy" ? "the team's own strategy code" : "a coded feature"}: ${e.name || ""}`, "code");
    case "meeting_start": return out(e.discussion ? `Floor ${e.floor} sits down for its discussion` : `${who} meets to agree its team rules`, "dim");
    case "meeting": return e.discussion ? out(`Floor ${e.floor}'s discussion ends`, "dim")
      : out(`${who} ${e.team_code ? `adopts its own code ${e.team_code}` : `agrees its strategy ${e.strategy || ""}`}${e.ai === false && !e.team_code ? " (the best tested idea, no AI meeting)" : ""}`, "up");
    case "challenge_start": return out(`${who} takes the floor ${e.floor} challenge on ${(e.months || []).join(", ")}${e.solo ? " on its own" : ""}`, "");
    case "challenge_failed": return out(`${who}: challenge not passed${(e.reasons || []).length ? " — " + e.reasons[0] : ""}`, "down");
    case "audit_start": return out(`Audit desk re-runs ${who}'s challenge`, "dim");
    case "audit_failed": return out(`${who}: the Audit desk disagreed, level-up blocked`, "down");
    case "audit_recheck": return e.ok ? out(`${who}: the Audit desk re-checked its refused pass like for like and agrees. The pass stands`, "up")
      : out(`${who}: the Audit desk re-checked its refused pass like for like and still disagrees`, "down");
    case "level_up": return out(`${who} moves up: floor ${e.from} → ${e.to}${e.skip ? " (skipped a floor!)" : ""}${e.solo ? " on its own" : ""}`, "big");
    case "swapped_down": return out(`${who} moves down: floor ${e.from} → ${e.to}`, "down");
    case "solo_passed_no_seat": return out(`${who} passed its own challenge; waiting for a seat on the floor above`, "up");
    case "battle": return out(`Promotion battle for floor ${e.floor}: ${e.challenger} v ${e.incumbent}, ${e.winner === "candidate" ? e.challenger : e.incumbent} won`, "");
    case "transfer": return out(`${who} transfers from ${e.from_group} to ${e.to_group}`, "");
    case "rotation": return out(`A new Analyst joins: ${e.new_name || ""}`, "");
    case "retest_failed": return out(`${who}: its promoted strategy stopped passing on new data`, "down");
    case "data_update": return out(`New price data arrived: ${e.months ?? "?"} months on file`, "");
    case "room_opened": return out(`The Records Room opens: ${(e.members || []).map(nameOf).join(", ")}`, "big");
    case "room_session": return out(`The Records Room: the Engine tested ${n0(e.tested ?? 0)} strategies for it${e.leader ? `; ${nameOf(e.leader)} leads the growth challenge` : ""}`, "");
    case "room_entry": return out(`${who} enters the growth challenge with ${e.idea} (${e.plan || "a money plan"})`, "");
    case "room_leader": return out(`${who} takes the lead in the growth challenge: ${madeWords(e.made)} on the months nobody has seen`, "big");
    case "room_put_forward": return out(`${who} puts ${e.idea} forward for the growth challenge`, "dim");
    case "room_thinking": return out(`The Records Room, session ${e.session ?? ""}: its six think first, each alone at its own desk`.replace("session :", ":"), "big");
    case "room_brought": return e.idea ? out(`${who} has finished thinking alone and brings ${e.idea} to the room: ${pips(e.pips)}${win}`, e.pips > 0 ? "up" : "down")
      : out(`${who} has finished thinking alone and brings nothing new this time`, "dim");
    case "room_meeting_start": return out("The Records Room meets: the six sit at one table and everyone's work goes on it", "");
    case "room_voice": return out(`${who} at the table (${e.vote === "merge" ? "wants one joint strategy" : "wants the ideas kept apart"}): "${String(e.say || "").trim()}"`, e.vote === "merge" ? "up" : "");
    case "room_voice_missed": return out(`${who} did not speak at the table (the call did not come back)`, "dim");
    case "room_decision": return e.decision === "no_quorum" ? out("The Records Room could not decide: too few of its six spoke", "dim")
      : e.decision === "merge" ? out(`The Records Room votes ${e.merge} to ${e.keep} to make ONE joint strategy`, "big")
        : out(`The Records Room votes ${e.keep} to ${e.merge} to keep its ideas apart`, "big");
    case "room_meeting": return e.decision === undefined ? out(`The Records Room agrees its joint strategy ${e.strategy || ""}`, "up")
      : e.strategy ? out(`The Records Room's meeting ends: its joint strategy is ${e.strategy}${e.pips != null ? ` (${pips(e.pips)}${win})` : ""}`, "up")
        : out(`The Records Room's meeting ends${e.decision === "merge" ? ": it voted for one strategy, but none could be written down this time" : ": its ideas stay apart"}`, "dim");
    case "ceo_reward": return out(`The CEO rewards ${who}: the best in the growth challenge (${madeWords(e.made)} on the months nobody has seen)`, "big");
    case "turn_failed": case "meeting_failed": case "transfer_declined": return null;
    default: return out(String(e.kind).replaceAll("_", " "), "dim");
  }
}

/** The firm's files could not be read: what that means and the exact fix. */
export function tokenHelp(error) {
  const kind = error?.kind;
  if (kind === "forbidden") {
    return { title: "The site's GitHub token can start jobs but is not allowed to read results. One permission is missing: Contents, Read-only.",
      steps: ["Open your GitHub tokens (the link below) and tap the token you made for this site.", "Tap Edit. Under Permissions tap Add permissions, tick Contents and leave it on Read-only. Keep Actions on Read and write.",
        "Tap Update at the bottom, come back here and press Try again. The token itself does not change, so there is nothing to paste."],
      link: "https://github.com/settings/personal-access-tokens" };
  }
  if (kind === "token") {
    return { title: "GitHub rejected the site's token. It has expired or was deleted.",
      steps: ["Make a new token (Settings on this site shows how), paste it in Settings and save."], link: "https://github.com/settings/personal-access-tokens" };
  }
  if (kind === "notfound") {
    return { title: "The site's token cannot see hsn-test-lab-engine.", steps: ["Open the token on GitHub, choose Only select repositories and add hsn-test-lab-engine, then Update."],
      link: "https://github.com/settings/personal-access-tokens" };
  }
  if (kind === "rate") return { title: "GitHub's rate limit was reached. Wait a few minutes and try again.", steps: [], link: null };
  if (kind === "network") return { title: "GitHub could not be reached. Check the connection and try again.", steps: [], link: null };
  return { title: error?.message || "Something went wrong reading the firm's files.", steps: [], link: null };
}

// The 500-pound test (the engine's from_500): what a small account would have become with each record holder's own
// strategy, replayed from random past start dates. Rows for the page; every figure is the engine's.
const gbp = (v) => (v === null || v === undefined || Number.isNaN(+v)) ? "—" : "£" + (+v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function from500View(firm) {
  const f = firm?.from_500, rec = firm?.records || {};
  if (!f || !f.by_idea) return null;
  const rows = [], seen = new Set();
  for (const [key, label] of [["top_pips", "Most pips"], ["top_win", "Highest win rate"], ["top_money", "Most money made"], ["best", "Best overall"]]) {
    const card = rec[key];
    if (!card?.idea) continue;
    if (seen.has(card.idea)) { const row = rows.find((r) => r.idea === card.idea); if (row) row.Record += ` · ${label.toLowerCase()}`; continue; }
    seen.add(card.idea);
    const t = f.by_idea[card.idea];
    const base = { idea: card.idea, agent: card.agent, Record: label, Agent: card.name || card.agent || "—" };
    if (!t || t.error) { rows.push({ ...base, "Middle result": "—", Worst: "—", Best: "—", "Ended in profit": "—",
      "On months no agent has seen": t?.error ? "could not be replayed" : t === undefined ? "a new record: worked out at the next Engine run" : "too few trades to test" }); continue; }
    rows.push({ ...base, "Middle result": gbp(t.middle_end), Worst: gbp(t.worst_end), Best: gbp(t.best_end), "Ended in profit": `${Math.round(t.ended_in_profit_pct)} in 100 starts`,
      "On months no agent has seen": t.unseen ? `${gbp(t.unseen.middle_end)} (worst ${gbp(t.unseen.worst_end)}, ${t.unseen.runs} starts)` : "no full run fits yet" });
  }
  if (!rows.length) return null;
  const risk = rows.length && Object.values(f.by_idea).find((t) => t && t.risk_pct_per_trade != null)?.risk_pct_per_trade;
  return {
    title: `The £${Math.round(f.start_gbp)} test: what £${Math.round(f.start_gbp)} would have become in ${f.weeks} weeks`,
    help: `Each record holder's own strategy, replayed on the real prices from ${f.runs} random past start dates, risking ${risk ?? 1}% of the account on every trade. Most of the history is months the agents practised on, so the last column, on months no agent has ever seen, is the honest one. It is a replay of the past, not a promise.`,
    // found 15 Nov 2026: the engine sizes these trades exactly; FOREX.com's gold contract trades in whole ounces
    sizes: `The trade sizes here are exact, as if any size could be traded. A real account can only trade the broker's sizes (at FOREX.com gold moves in whole ounces), and with £${Math.round(f.start_gbp)} the smallest real trade often risks far more than ${risk ?? 1}% of the account. So read this table as a fair comparison of the strategies, not as what a real £${Math.round(f.start_gbp)} account would have made.`,
    columns: ["Record", "Agent", "Middle result", "Worst", "Best", "Ended in profit", "On months no agent has seen"], rows,
  };
}

// The Audit desk's verdict on an idea, in words (engine: hsnlab/firm/audit.py). What is judged is a re-run sized exactly
// to the risk, as the fast evaluation is; `real_lots` is the same re-run with the broker's real trade sizes, for information.
export function auditWords(audit) {
  if (!audit) return "";
  if (audit.audit_pnl_gbp === undefined || audit.audit_pnl_gbp === null) return `Audit desk: could not re-run it${audit.reason ? ` (${audit.reason})` : ""}.`;
  let s = `Audit desk re-run (separately written code): ${audit.ok ? "agreed" : "DISAGREED"} — fast £${audit.fast_pnl_gbp} v event-driven £${audit.audit_pnl_gbp}, ${audit.fast_sets} v ${audit.audit_sets} sets, ${audit.lookahead_violations} look-ahead violations.`;
  const r = audit.real_lots;
  if (r && r.pnl_gbp !== undefined && r.pnl_gbp !== null) {
    s += ` With the broker's real trade sizes on this account the same re-run made £${r.pnl_gbp} in ${r.sets} sets${r.not_opened_below_minimum ? ` (${r.not_opened_below_minimum} too small to open)` : ""}; that figure is for information and is not judged.`;
  }
  return s;
}

// ── The Records Room (engine: hsnlab/firm/room.py; the growth challenge is hsnlab/firm/growth.py) ───────────────────
// The three agents with the most pips and the three with the highest win rate in one room. Everything shown is the
// engine's own figure from firm.json's `room`; these functions only put it into words and table rows.
const gbp0 = (v) => (v === null || v === undefined || Number.isNaN(+v)) ? "—" : (+v < 0 ? "−£" : "£") + Math.abs(Math.round(+v)).toLocaleString("en-GB");
const one = (v) => (v === null || v === undefined || Number.isNaN(+v)) ? "—" : (+v).toLocaleString("en-GB", { maximumFractionDigits: 1 });
export const madeWords = (v) => (v === null || v === undefined || Number.isNaN(+v)) ? "—" : +v >= 0 ? `made ${gbp0(v)}` : `lost ${gbp0(-v)}`;
const monthName = (m) => { const [y, k] = String(m).split("-"); return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(+k || 1) - 1]} ${y}`; };
const recordLine = (c) => c ? `${n0(c.pips)} pips · ${one(c.win_rate_pct)}% wins · ${n0(c.sets)} trades` : "—";
/** A money plan in a few words, for a table cell. */
export const planShort = (plan) => !plan ? "—" : plan.type === "stepped" ? "your stepped cap" : `${one(plan.value)}% a trade`;

/** What the Audit desk's re-run of a growth-challenge entry found, in words. */
export function roomAuditWords(a) {
  if (!a) return "";
  if (!a.runs) return `Audit desk: could not re-run it${a.reason ? ` (${a.reason})` : ""}.`;
  const part = a.complete === false ? `${a.runs} of its ${a.of} accounts (the months nobody has seen first)` : `all ${a.runs} of its accounts`;
  if (a.ok && a.runs_to_the_penny === a.runs) return `Audit desk: re-ran ${part} through the Simulator, minute by minute with the broker's real sizes. Every one came out the same to the penny.`;
  if (a.ok) return `Audit desk: re-ran ${part} through the Simulator. They agree (${a.runs_to_the_penny} to the penny; the biggest difference in one account is ${gbp0(a.worst_run_difference_gbp)}).`;
  return `Audit desk: re-ran ${part} through the Simulator and does NOT agree with this entry${a.lookahead_violations ? ` (${a.lookahead_violations} trades looked ahead)` : ""}. It cannot be rewarded.`;
}

/** One entry of the growth challenge, for the page that opens when it is tapped. */
export function roomEntryView(entry) {
  if (!entry || !entry.tradable) return null;
  const un = entry.unseen, pr = entry.practice, bu = entry.build_up || {}, long = bu.longest || null;
  const starts = (entry.starts || []).map((s) => String(s));
  const byStart = un ? starts.map((s) => { const x = un.by_start?.[s] || {}; return {
    "Starts with": gbp0(+s), "Middle month": x.could_not_trade === un.months ? "cannot trade" : gbp0(x.middle), Worst: gbp0(x.worst), Best: gbp0(x.best),
    "No trade possible": `${x.could_not_trade ?? 0} of ${un.months} months`, "Stopped at half": `${x.hit_stop_line ?? 0} of ${un.months} months` }; }) : [];
  const months = Object.entries(entry.by_month || {}).map(([m, x]) => ({ Month: monthName(m),
    Kind: x.role === "practice" ? "practised on" : x.role === "unseen" ? "nobody has seen" : x.role === "incomplete" ? "not finished (not judged)" : "—",
    [`${gbp0(entry.in)} became`]: gbp0(x.total), Result: madeWords(x.total - entry.in), Trades: x.sets, "Accounts stopped": x.stopped || 0 }));
  const lengths = Object.entries(bu.after_months || {}).map(([n, x]) => ({ "Left to run for": `${n} month${+n === 1 ? "" : "s"}`, "Middle result": gbp0(x.middle), Worst: gbp0(x.worst), Best: gbp0(x.best), "Start months tried": x.runs }));
  let longLine = "", curve = [];
  if (long) {
    curve = long.months.map((m, i) => ({ label: monthName(m).replace(" 20", " "), value: long.money_at_month_end[i] }));
    const big = long.first_month_over || {};
    longLine = `Started in ${monthName(long.from)} and never stopped: ${gbp0(entry.in)} became ${gbp0(long.end)} by ${long.last_month_incomplete ? "the last price on file in " : "the end of "}${monthName(long.to)}. `
      + (long.biggest_month ? `Its biggest month was ${monthName(long.biggest_month.month)}: ${madeWords(long.biggest_month.made)}. ` : "")
      + (big.month ? `The first month it made ${gbp0(big.gbp)} or more was ${monthName(big.month)}, month ${big.months_in} of the run.` : `No month of the run made ${gbp0(big.gbp ?? 50000)} or more.`)
      + (long.hit_stop_line ? ` ${long.hit_stop_line} of the ${starts.length} accounts hit the stop line on the way.` : "");
  }
  return {
    title: `${entry.idea} with ${entry.plan_words}`,
    words: entry.in_words || [],
    result: entry.summary ? `As the Engine tests every idea (the standard £10,000 account at 1%, practice months): ${recordLine(entry.summary)}, £${n0(entry.summary.pnl_gbp)}.` : "",
    unseen: un ? `On the ${un.months} months nobody has seen: ${gbp0(un.in_all)} in (${gbp0(un.in)} afresh each month), ${gbp0(un.out_all)} out: ${madeWords(un.made)}. Middle month ${gbp0(un.middle)}, worst ${gbp0(un.worst)}, best ${gbp0(un.best)}; in profit ${un.in_profit} of ${un.months}; ${un.hit_stop_line} of ${un.accounts} accounts hit the stop line.` : "No complete month that nobody has seen is on file yet.",
    practice: pr ? `On the ${pr.months} months they practised on: ${gbp0(pr.in_all)} in, ${gbp0(pr.out_all)} out: ${madeWords(pr.made)}. Middle month ${gbp0(pr.middle)}, worst ${gbp0(pr.worst)}, best ${gbp0(pr.best)}.` : "",
    byStartColumns: ["Starts with", "Middle month", "Worst", "Best", "No trade possible", "Stopped at half"], byStart,
    monthColumns: ["Month", "Kind", `${gbp0(entry.in)} became`, "Result", "Trades", "Accounts stopped"], months,
    lengthColumns: ["Left to run for", "Middle result", "Worst", "Best", "Start months tried"], lengths,
    longLine, curve,
    longHelp: "Left to run is for information: every long run passes through months the agents practised on, so their strategies are fitted to part of it. It is a replay of the past with the broker's real sizes, not a promise.",
    audit: roomAuditWords(entry.audit),
  };
}

/** The Records Room as the page shows it, or null when the engine has published no room. */
export function roomView(firm) {
  const r = firm?.room;
  const ids = r?.order?.length ? r.order : Object.keys(r?.members || {});
  if (!r || !ids.length) return null;
  const rules = r.rules || {}, nameOf = (id) => r.members[id]?.name || firm?.agents?.[id]?.name || id;
  const keep = Math.round((rules.keep_pips_share ?? 0.8) * 100), high = rules.high_win_pct ?? 70;
  const member = (id) => {
    const m = r.members[id], rec = m.record || {}, mi = m.mission || {}, best = mi.best;
    let progress, improved = !!best;
    if (m.side === "pips") progress = best ? `Win rate ${one(rec.win_rate_pct)}% → ${one(best.win_rate_pct)}%, keeping ${n0(best.pips)} of its ${n0(rec.pips)} pips (${best.idea}, ${n0(best.sets)} trades)` : `Nothing yet beats its record's win rate while keeping ${n0(mi.keep?.pips_at_least)} pips or more.`;
    else progress = best ? `Pips ${n0(rec.pips)} → ${n0(best.pips)} at ${one(best.win_rate_pct)}% wins (${best.idea}, ${n0(best.sets)} trades)` : `Nothing yet beats its record's pips while winning ${high}% or more.`;
    const by = best && best.by && best.by !== id ? `First tested by ${best.by_name || nameOf(best.by)}; it counts here because it is one change away from this record.` : "";
    return { id, name: m.name || id, side: m.side, where: [m.level, m.floor ? `floor ${m.floor}` : "", m.group ? `group ${m.group}` : ""].filter(Boolean).join(", "),
      recordIdea: rec.idea, record: recordLine(rec), words: rec.in_words || [], progress, firstBy: by, improved, tried: mi.tried ?? 0 };
  };
  // the room's last meeting, and what each member brought to it and said there (its own words, as recorded)
  const mt = (r.meetings || []).filter((x) => x && x.voices).slice(-1)[0] || null;
  const VOTE = { merge: "wants one joint strategy", keep_separate: "wants the ideas kept apart" };
  const seat = (id) => {
    const m = r.members[id], lt = m.last_turn || null, b = mt?.brought?.[id] || null, v = mt?.voices?.[id] || null;
    const fresh = !!(lt && mt && (mt.think != null ? lt.think === mt.think : true));
    return { id, name: m.name || id, side: m.side, sideWords: m.side === "pips" ? "most pips" : "highest win rate",
      brought: b ? { idea: b.idea, line: recordLine(b), hypothesis: b.hypothesis || "" } : null,
      alone: !lt ? "Has not had a turn of its own in the room yet." : !lt.ok ? "Its own turn did not come back, so it brought nothing new."
        : b ? "" : lt.idea ? "" : "Thought alone, but what it settled on was not a new strategy.",
      note: fresh && lt.ok ? String(lt.note || "") : "", lookups: fresh ? (lt.calls ?? null) : null, looked: fresh ? (lt.looked || []) : [],
      spoke: !!v, vote: v?.vote || null, voteWords: v ? VOTE[v.vote] || v.vote : "did not speak", say: v?.say || "",
      take: (v?.take_from || []).map((x) => `${nameOf(x.agent)}: ${x.what}`), next: v?.next || "", unverified: v?.unverified || [],
      proposal: v?.proposal_idea || null };
  };
  const meeting = mt ? (() => {
    const votes = mt.votes || {}, one = mt.decision === "merge", none = mt.decision === "no_quorum";
    const props = (mt.ideas || []).filter((x) => x.by !== "room").map((x) => ({ idea: x.idea, by: nameOf(x.by), line: x.result ? recordLine(x.result) : "" }));
    return { at: mt.at, cycle: mt.cycle, session: mt.think ?? null, decision: mt.decision, minutes: mt.minutes || null, cost: mt.cost_usd ?? null,
      votesLine: `${votes.merge ?? 0} wanted one joint strategy, ${votes.keep_separate ?? 0} wanted to keep the ideas apart${votes.silent ? `, ${votes.silent} did not speak` : ""}.`,
      outcome: none ? "Too few spoke for the room to decide anything." : one ? (mt.idea ? "More wanted one than not, so the room made ONE joint strategy." : "More wanted one than not, but the joint strategy could not be written down this time.")
        : "The room did not want one strategy this time, so its ideas stay apart. Nobody has to merge.",
      one, joint: mt.idea ? { idea: mt.idea, line: mt.result ? recordLine(mt.result) : "", why: mt.why || "", plan: mt.plan ? planShort(mt.plan) : "the Engine's own grid of plans",
        credit: Object.entries(mt.credit_notes || {}).map(([id, what]) => `${nameOf(id)}: ${(what || []).join(", ")}`) } : null,
      jointError: one && !mt.idea ? (mt.joint_error || "") : "", proposals: props, learned: mt.learned || [], corrections: (mt.corrections || []).filter((x) => String(x || "").trim()), seats: ids.map(seat),
      recordNote: mt.record_note || "" };
  })() : null;
  const lt = r.last_think || null;
  const think = lt ? { session: lt.session, at: lt.at, seconds: lt.seconds, cost: lt.cost_usd, calls: lt.ai_calls, allowance: lt.allowance_usd, model: lt.model, effort: lt.effort,
    thought: Object.values(lt.members || {}).filter((x) => x.came_back).length, of: Object.keys(lt.members || {}).length, replay: lt.replay || null,
    engine: lt.engine || null, warnings: lt.warnings || [], errors: lt.errors || [],
    line: `Session ${lt.session}: ${Object.values(lt.members || {}).filter((x) => x.came_back).length} of ${Object.keys(lt.members || {}).length} thought alone, then `
      + (lt.meeting ? (lt.meeting.decision === "merge" ? `the room voted ${lt.meeting.votes?.merge ?? 0} to ${lt.meeting.votes?.keep_separate ?? 0} to make one joint strategy${lt.meeting.idea ? ` (${lt.meeting.idea})` : ""}`
        : lt.meeting.decision === "keep_separate" ? `the room voted ${lt.meeting.votes?.keep_separate ?? 0} to ${lt.meeting.votes?.merge ?? 0} to keep its ideas apart` : "too few spoke for the room to decide")
        : "the room did not meet")
      + `. It took ${Math.max(1, Math.round((lt.seconds || 0) / 60))} minutes and $${(+lt.cost_usd || 0).toFixed(2)} of AI (${lt.ai_calls ?? 0} calls${lt.model ? `, ${lt.model}` : ""}${lt.effort ? `, ${lt.effort} effort` : ""}).` } : null;
  const side = (key, title, job) => ({ key, title, job, members: ids.filter((id) => r.members[id]?.side === key).map(member) });
  const then = Object.fromEntries((r.frontier_at_open || []).map((f) => [f.win_at_least, f]));
  const frontier = (r.frontier || []).map((f) => { const was = then[f.win_at_least]; const up = f.pips != null && was?.pips != null && f.pips > was.pips + 1e-9; return {
    "Win rate": `${f.win_at_least}% or more`, "Most pips when the room opened": was?.pips != null ? n0(was.pips) : "—", "Most pips now": f.pips != null ? n0(f.pips) + (up ? ` ▲ ${n0(f.pips - was.pips)}` : "") : "—",
    "Held by": f.idea ? `${f.by_name || nameOf(f.by)} · ${f.idea} · ${one(f.win_rate_pct)}%` : "nobody yet", up }; });
  const un = r.months?.unseen || [], pr = r.months?.practice || [];
  const starts = (rules.starts || [100, 200, 300, 400, 500]), allIn = gbp0(starts.reduce((a, b) => a + b, 0));
  const rows = (r.standings || []).map((s) => { const e = r.members[s.agent]?.entry || {}; const u = e.unseen, p = e.practice, long = e.build_up?.longest; return {
    "#": s.rank, id: s.agent, Who: s.name, tradable: !!s.tradable, leader: r.leader?.agent === s.agent,
    Entry: s.tradable ? `${s.idea} · ${planShort(e.plan)}` : "no entry yet",
    "Unseen months": s.tradable && u ? madeWords(u.made) : (e.why || "—"),
    "In profit": s.tradable && u ? `${u.in_profit} of ${u.months}` : "—",
    "Practice months": s.tradable && p ? madeWords(p.made) : "—",
    "Left to run": s.tradable && long ? gbp0(long.end) : "—" }; });
  const lead = r.leader;
  const t = r.together;
  const rewards = (r.rewards || []).slice().reverse().map((x) => ({ at: x.at, agent: x.agent,
    line: `${x.name} was rewarded for ${x.idea} with ${x.plan_words}: ${madeWords(x.made_unseen)} on the ${x.unseen_months} months nobody had seen (shift ${x.cycle}).${x.note ? ` "${x.note}"` : ""}` }));
  return {
    open: !!r.open, name: r.name || "The Records Room", ids, names: ids.map(nameOf),
    intro: "The three agents with the most pips and the three with the highest win rate, in one room. Each thinks alone first; then they meet, see each other's work and make it into one strategy only if most of them want to. Their job is one strategy with BIG PIPS AND A HIGH WIN RATE, and the growth challenge below. They keep their seats and floors: the room is extra work. Each one's record is pinned, so nobody forgets what made it; the Engine's search for the room starts from those records and the mixes are made from them.",
    sessions: r.sessions || 0, openedCycle: r.opened_cycle, openedAt: r.opened_at, last: r.last_session || null, closedAt: r.closed_at || null,
    sides: [side("pips", "In the room for the most pips", `Their job: raise the win rate and keep the pips (at least ${keep}% of the record's).`),
      side("win", "In the room for the highest win rate", `Their job: raise the pips and keep the win rate (${high}% or more).`)],
    frontierColumns: ["Win rate", "Most pips when the room opened", "Most pips now", "Held by"], frontier,
    frontierHelp: `The most pips any strategy of the six has made at each win rate (Engine results on the practice months, ${rules.min_trades ?? 30} trades or more, in profit). The room is getting somewhere when the right-hand numbers go up.`,
    challenge: {
      rules: [`One account of each size, ${starts.map((s) => gbp0(s)).join(", ")} (${gbp0(starts.reduce((a, b) => a + b, 0))} in all), starts in a month and trades one strategy with a money plan. Every month of the history is played.`,
        `The sizes are the broker's real ones: at FOREX.com gold trades in whole ounces, and at ${rules.leverage ?? 20}:1 everything open at once has to fit the account. So £100 cannot open a gold trade at all, and an exit that splits a trade into five positions needs five ounces.`,
        `A trade may risk at most ${rules.max_risk_pct ?? 20}% of the balance (your stepped cap starts there). An account that falls below half its start opens nothing more.`,
        `The ranking is the money made on the ${un.length} months nobody in the firm has seen${un.length ? ` (${un.map(monthName).join(", ")})` : ""}: ${allIn} afresh each month, so ${gbp0(starts.reduce((a, b) => a + b, 0) * un.length)} goes in over them. Each agent's entry is chosen by the Engine on the ${pr.length} practice months only, so nothing is picked on the months it is ranked on.`],
      columns: ["#", "Who", "Entry", "Unseen months", "In profit", "Practice months", "Left to run"], rows,
      leader: lead ? { id: lead.agent, name: lead.name, canReward: !!lead.can_be_rewarded && !!r.open,
        line: `${lead.name} leads: ${lead.idea} with ${lead.plan_words} ${madeWords(lead.made_unseen)} on the months nobody has seen.`,
        audit: roomAuditWords(r.members[lead.agent]?.entry?.audit) } : null,
      note: lead ? "" : (r.leader_note || "No standings yet: the room has not had an Engine session."),
    },
    together: t && t.tradable ? { idea: t.idea, entry: t,
      line: `Together: ${t.what || "the room's joint strategy"} (${t.idea}, ${t.plan_words}). On the months nobody has seen: ${gbp0(t.unseen?.in_all)} in, ${gbp0(t.unseen?.out_all)} out: ${madeWords(t.unseen?.made)}. On practice months: ${madeWords(t.practice?.made)}.`,
      credit: (t.credit || []).map(nameOf),
      beats: rows.filter((x) => x.tradable).every((x) => (t.unseen?.made ?? -Infinity) > (r.members[x.id]?.entry?.unseen?.made ?? -Infinity)) } : null,
    mixes: (r.mixes || []).length,
    learned: r.learned || [], meetings: (r.meetings || []).slice().reverse(), rewards,
    thinks: r.thinks || 0, think, meeting, seats: meeting ? meeting.seats : ids.map(seat),
  };
}

// What a session of the room costs, as the engine sets it (hsnlab/firm/cycle.py: ROOM_TURN, ROOM_VOICE_USD, ROOM_JOINT_USD):
// every call has a ceiling, so a whole session can never cost more than `maxUsd`; `typicalUsd` is said only until a
// real session has been run, after which the page quotes what the last one really cost.
export const ROOM_SESSION = { typicalUsd: 2.5, maxUsd: 6.1, minUsd: 1.0, githubMinutes: 8 };

/** Before a session of the room is started: what it will cost, in the firm's own figures. `ok` is false when the
 *  month's AI money left is less than the engine needs to start one (it would refuse). */
export function roomSessionCost(firm, minutesUsed = null) {
  const b = firm?.budget || {}, left = Math.max(0, (+b.firm_budget_usd || 0) - (+b.firm_spent_usd || 0)), last = firm?.room?.last_think;
  const usual = last && +last.cost_usd > 0 ? `The last one cost $${(+last.cost_usd).toFixed(2)}` : `About $${ROOM_SESSION.typicalUsd.toFixed(2)}`;
  const mins = last && +last.seconds > 0 ? Math.ceil(last.seconds / 60) + 2 : ROOM_SESSION.githubMinutes;      // the session itself, and the machine's setting up and saving
  return { ok: left >= ROOM_SESSION.minUsd, left, minutes: mins,
    line: `${usual} of AI (every call has a ceiling, so never more than $${Math.min(ROOM_SESSION.maxUsd, left).toFixed(2)}; $${left.toFixed(2)} of this month's $${n0(b.firm_budget_usd)} is left) `
      + `and about ${mins} GitHub minutes${minutesUsed === null ? "" : ` (${n0(minutesUsed)} of the free 2,000 are used this month)`}.`,
    why: left >= ROOM_SESSION.minUsd ? "" : `$${left.toFixed(2)} is left of this month's AI budget, and a session needs at least $${ROOM_SESSION.minUsd.toFixed(2)}. Raise the AI budget in the CEO's office first.` };
}

const PHASES = { opening: "Opening the books: loading the price history", thinking: "Alone: each of the six is thinking on its own", meeting: "Together: the six are at one table",
  engine: "The Engine is testing and judging the growth challenge", done: "Finished" };

/** What a room member is doing right now, in plain words, from the live status file's own label for it. */
function doingWords(m) {
  const d = String(m?.detail || "");
  switch (m?.state) {
    case "waiting": return "about to start";
    case "thinking": return d && d !== "reading the research pack" ? `thinking (${d})` : "thinking: reading the Engine's research";
    case "researching": return /^by /.test(d) ? `asks the Engine for its results ${d}` : d === "exits" ? "asks the Engine to compare exits" : /^reading /.test(d) ? d.replace(/^reading (\S+)/, (x, k) => `reads ${CODE_WORDS[k] || k}`)
      : /^the growth challenge/.test(d) ? `asks the Engine about ${d}` : d === "testing a rule set" ? "has the Engine test a rule set" : d ? `asks the Engine: ${d}` : "asks the Engine a question";
    case "testing": return "the Engine is testing its idea";
    case "in_meeting": return "at the room's table";
    case "brought": return `finished alone: brings ${m.idea}${m.pips != null ? ` (${n0(m.pips)} pips, ${one(m.win)}% wins, ${n0(m.sets)} trades)` : ""}`;
    case "nothing_new": return "finished alone: no new strategy this time";
    case "failed": return "its own turn did not come back";
    default: return m?.state ? String(m.state).replaceAll("_", " ") : "";
  }
}

/**
 * A session of the Records Room as it runs, from the live status file (status/firm_live.json on the live branch): which
 * of its three parts it is in, what each of the six is doing or has brought, and who has said what at the table.
 * Null when the live file is not a session of the room. `running` is false once it has finished or the file is stale.
 */
export function roomLiveView(live, firm, now = Date.now()) {
  const lr = live?.room, r = firm?.room;
  if (!lr || !r) return null;
  const ids = r.order?.length ? r.order : Object.keys(r.members || {});
  const fresh = now - Date.parse(live.updated_at) < 6 * 60 * 1000;
  const running = !!(live.mode === "firm" && live.stage && live.stage !== "Cycle finished" && fresh);
  const order = ["thinking", "meeting", "engine"], at = lr.phase === "done" ? 3 : lr.phase === "opening" ? -1 : order.indexOf(lr.phase);
  const votes = lr.votes || null;
  return { running, session: lr.session, phase: lr.phase, phaseWords: PHASES[lr.phase] || String(lr.phase || ""), stage: live.stage || "", percent: live.percent ?? 0,
    minutes: Math.round((live.elapsed_s || 0) / 60), updatedAt: live.updated_at,
    steps: [["thinking", "1 · Alone", "each thinks on its own"], ["meeting", "2 · Together", "they meet and see each other's work"], ["engine", "3 · The Engine", "tests and judges"]]
      .map(([key, label, words], i) => ({ key, label, words, state: i < at ? "done" : i === at ? "now" : "todo" })),
    members: ids.map((id) => { const m = lr.members?.[id] || {}, v = lr.voices?.[id] || null; return { id, name: r.members[id]?.name || firm?.agents?.[id]?.name || id, side: r.members[id]?.side,
      state: m.state || "waiting", busy: ["thinking", "researching", "testing"].includes(m.state), done: ["brought", "nothing_new", "failed"].includes(m.state), doing: doingWords(m),
      vote: v?.vote || null, say: v?.say || "" }; }),
    finished: ids.filter((id) => ["brought", "nothing_new", "failed"].includes(lr.members?.[id]?.state)).length, of: ids.length,
    spoke: Object.keys(lr.voices || {}).length,
    votesLine: votes ? (votes.decision === "merge" ? `The vote: ${votes.merge} to ${votes.keep_separate} for ONE joint strategy.` : votes.decision === "keep_separate" ? `The vote: ${votes.keep_separate} to ${votes.merge} to keep the ideas apart.` : "Too few spoke for the room to decide.") : "" };
}
