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
        : setup?.secrets?.forexcom_mt5_login ? "Waiting for the price history: the FOREX.com login has to pass its check first (it must be the read-only investor password). See Setup."
        : "Waiting for the price history: put the FOREX.com MT5 read-only login in on the Setup page.";
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
  return {
    pips: card(byPips), win: card(byWin), minTrades: MIN_TRADES_FOR_WIN_RANK,
    stars: { pips: byPips?.id || null, win: byWin?.id || null },
    ideas: firm?.library?.ideas ?? 0, verified: firm?.library?.verified ?? 0,
    strategies: (firm?.strategies?.active || []).length, waiting: firm?.strategies?.waiting ?? 0,
    agentsWithCode: agents.filter((a) => a.own_code).length,
    levelUps: events.filter((e) => e.kind === "level_up").length, challenges: firm?.attempts?.total ?? 0,
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
      const how = e.by === "engine search" ? ` (the Engine's search: ${e.what || "a small change"})` : e.by === "first test" ? ` (first test of its own code ${e.strategy || ""})` : "";
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
    case "level_up": return out(`${who} moves up: floor ${e.from} → ${e.to}${e.skip ? " (skipped a floor!)" : ""}${e.solo ? " on its own" : ""}`, "big");
    case "swapped_down": return out(`${who} moves down: floor ${e.from} → ${e.to}`, "down");
    case "solo_passed_no_seat": return out(`${who} passed its own challenge; waiting for a seat on the floor above`, "up");
    case "battle": return out(`Promotion battle for floor ${e.floor}: ${e.challenger} v ${e.incumbent}, ${e.winner === "candidate" ? e.challenger : e.incumbent} won`, "");
    case "transfer": return out(`${who} transfers from ${e.from_group} to ${e.to_group}`, "");
    case "rotation": return out(`A new Analyst joins: ${e.new_name || ""}`, "");
    case "retest_failed": return out(`${who}: its promoted strategy stopped passing on new data`, "down");
    case "data_update": return out(`New price data arrived: ${e.months ?? "?"} months on file`, "");
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
