// Connection check: what each line of the page says. No page code in here, so the tests can hold it to its word.
// Nothing is worked out or estimated: every fact is read from a file the engine wrote (status/…) or from the Champions
// check file (champions/status.json, written by a real run of the Engine). A line is a tick only when its file says so.
import { trialReason } from "./dataview.js";

/** The price download runs every Monday. Older than this many days and it has missed a week. */
export const STALE_DAYS = 8;
const DAY_MS = 86400000;

const time = (iso) => { const t = Date.parse(iso || ""); return Number.isNaN(t) ? null : t; };
const count = (n) => Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const sentence = (s) => { const t = String(s || "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".") : ""; };
const list = (names) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * A moment in GMT and in the reader's own time: "16 Nov 2026, 08:01 GMT (10:01 your time)". When the reader's day is
 * a different one, the day is said too: "16 Nov 2026, 23:30 GMT (01:30 on 17 Nov, your time)".
 * `zone` is the reader's time zone (left out: the device's own).
 */
export function when(iso, zone) {
  const t = time(iso);
  if (t === null) return "an unknown time";
  const d = new Date(t);
  const part = (opts, tz) => new Intl.DateTimeFormat("en-GB", { ...opts, ...(tz ? { timeZone: tz } : {}) }).format(d);
  const day = { day: "numeric", month: "short" };
  const clock = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  const gmtDay = part(day, "UTC"), ownDay = part(day, zone);
  const own = ownDay === gmtDay ? `${part(clock, zone)} your time` : `${part(clock, zone)} on ${ownDay}, your time`;
  return `${part({ ...day, year: "numeric" }, "UTC")}, ${part(clock, "UTC")} GMT (${own})`;
}

/** Whole days between a moment and now (0 when it is in the future or unknown). */
export function daysOld(iso, now) {
  const t = time(iso);
  return t === null ? null : Math.max(0, Math.floor((now - t) / DAY_MS));
}

// The login check's reasons that mean GitHub's machine failed, not the login: the fix is to run the check again.
const MACHINE = new Set(["machine_failed", "terminal_not_ready", "could_not_connect"]);
const RUN_AGAIN = "Open Settings and tap Export FOREX.com history now.";

/**
 * 1. Does the FOREX.com login work, and when did it last?   (status/forexcom_login.json)
 * Every line: {ok, title, detail, todo, button}. `button` is the page to open ("setup" | "settings" | null).
 */
export function loginLine(login, now, zone) {
  if (!login) {
    return { ok: false, title: "Your FOREX.com login has not been checked yet", detail: "No login check is on record.",
             todo: "Put your FOREX.com demo login in once.", button: "setup" };
  }
  const at = when(login.checked_at, zone);
  if (login.state === "ok" && login.connected && login.forexcom) {
    const age = daysOld(login.checked_at, now);
    const kind = login.demo ? "It is a FOREX.com demo account." : login.read_only ? "It is a read-only login." : "";
    if (age !== null && age > STALE_DAYS) {
      return { ok: false, title: `Your FOREX.com login has not been checked for ${age} days`, detail: `It last worked on ${at}. ${kind}`.trim(),
               todo: RUN_AGAIN, button: "settings" };
    }
    return { ok: true, title: "Your FOREX.com login works", detail: `It last logged in on ${at}. ${kind}`.trim(), todo: null, button: null };
  }
  if (MACHINE.has(login.reason)) {
    return { ok: false, title: "The last login check could not run", detail: `${sentence(login.detail)} Tried on ${at}.`.trim(), todo: RUN_AGAIN, button: "settings" };
  }
  return { ok: false, title: "Your FOREX.com login is not working", detail: `${sentence(login.detail) || "The login check failed."} Checked on ${at}.`,
           todo: "Put the login in again.", button: "setup" };
}

/** Gold's newest stored minute: from the coverage file (what is stored), else from the last download's own report. */
export function goldTo(coverage, cloud) {
  const stored = coverage?.symbols?.XAUUSD;
  if (stored?.last_bar) return { first: stored.first_bar || null, last: stored.last_bar };
  const row = (cloud?.symbols || []).find((s) => s.symbol === "XAUUSD");
  return row?.last_bar ? { first: row.first_bar || null, last: row.last_bar } : null;
}

/** 2. Are gold prices up to date, and to which minute?   (status/data_coverage.json, status/mt5_cloud.json) */
export function pricesLine(coverage, cloud, now, zone) {
  const gold = goldTo(coverage, cloud);
  if (!gold) {
    return { ok: false, title: "There are no gold prices stored yet", detail: sentence(cloud?.status || cloud?.problem) || "No price download is on record.",
             todo: "Put your FOREX.com demo login in once. The prices then download by themselves.", button: "setup" };
  }
  const age = daysOld(gold.last, now);
  const to = `Stored up to ${when(gold.last, zone)}.`;
  if (age !== null && age > STALE_DAYS) {
    return { ok: false, title: `Gold prices are ${age} days behind`, detail: `${to} The weekly download has not run.`, todo: RUN_AGAIN, button: "settings" };
  }
  return { ok: true, title: "Gold prices are up to date", detail: `${to} They are FOREX.com's own, and a new download runs every Monday.`, todo: null, button: null };
}

/** 3. Does the indicator match TradingView?   (status/data_match.json, judged exactly as the rest of the site judges it) */
export function indicatorLine(match, zone) {
  const t = trialReason(match);
  if (!t.trial) {
    const files = (match.exports || []).length;
    return { ok: true, title: "Your indicator matches TradingView", detail: `Checked on ${when(match.checked_at, zone)}, against ${files} of your TradingView chart file${files === 1 ? "" : "s"}.`,
             todo: null, button: null };
  }
  return { ok: false, title: "Your indicator is not proven to match TradingView", detail: sentence(t.reason),
           todo: "Download your gold chart from TradingView again and give the files to Claude. Settings has the steps.", button: "settings" };
}

/** The months whose stored price file is not the one the re-run read (bars or bytes differ), as "XAUUSD 2026-04". */
export function changedPriceFiles(status, coverage) {
  const out = [];
  for (const [sym, months] of Object.entries(status?.price_files_of_the_judged_months || {})) {
    const now = new Map((coverage?.symbols?.[sym]?.files || []).map((f) => [f.month, f]));
    if (!now.size) continue;                                   // nothing to compare with: said separately, not guessed
    for (const [month, was] of Object.entries(months)) {
      const f = now.get(month);
      if (!f || f.bars !== was.bars || f.bytes !== was.bytes) out.push(`${sym} ${month}`);
    }
  }
  return out;
}

const figures = (s) => (s ? `${count(Math.round(s.pips))} pips, ${Number(s.win_rate_pct).toFixed(1)}% wins, ${count(s.sets)} trades` : "no figures");

/**
 * 4. Are the five agents copied, and does each one's record re-run to the same numbers?   (champions/status.json)
 * Also returns `rows` (one per champion) and `study` (the ones copied for study only).
 */
export function agentsLine(status, coverage, zone) {
  if (!status) {
    return { ok: false, title: "The five agents are not copied yet", detail: "No check file is on record.", todo: "Tell Claude in the Champions chat: copy the five agents.",
             button: null, rows: [], study: [] };
  }
  const all = status.agents || [];
  const champs = all.filter((a) => a.role === "champion");
  const why = (a) => (!a.copied ? "its copy is not complete" : a.same ? "" : (a.not_same_because || [])[0] || "it did not re-run to the same numbers");
  const rows = champs.map((a) => ({ name: a.name, record: a.record, knownFor: a.known_for || "", copied: !!a.copied, same: !!a.same, ok: !!a.copied && !!a.same, why: why(a),
                                    figures: figures(a.rerun?.practice?.now), stored: figures(a.rerun?.practice?.stored) }));
  const study = all.filter((a) => a.role !== "champion").map((a) => ({ name: a.name, record: a.record, ok: !!a.copied && !!a.same, why: why(a) }));
  const notCopied = rows.filter((r) => !r.copied).map((r) => r.name);
  const notSame = rows.filter((r) => r.copied && !r.same).map((r) => r.name);
  const changed = changedPriceFiles(status, coverage);
  const ran = `Re-run on ${when(status.written_at, zone)}, on prices up to ${when(status.prices_to, zone)}.`;
  const ask = "Tell Claude in the Champions chat: re-run the five agents.";
  const base = { button: null, rows, study };
  if (rows.length !== 5) return { ...base, ok: false, title: `The check file holds ${rows.length} champions, not five`, detail: ran, todo: ask };
  if (notCopied.length) return { ...base, ok: false, title: `${list(notCopied)} ${notCopied.length === 1 ? "is" : "are"} not fully copied`, detail: ran, todo: "Tell Claude in the Champions chat: check the copies." };
  if (notSame.length) return { ...base, ok: false, title: `${list(notSame)} did not re-run to the same numbers`, detail: `${sentence(rows.find((r) => r.copied && !r.same).why)} ${ran}`, todo: ask };
  if (!status.champions_ok) return { ...base, ok: false, title: "The last re-run did not pass", detail: `${sentence(status.summary)} ${ran}`.trim(), todo: ask };
  if (changed.length) {
    return { ...base, ok: false, title: "The prices these records are judged on have changed since the last re-run",
             detail: `${changed.length === 1 ? "1 stored price file differs" : `${changed.length} stored price files differ`} (${changed.slice(0, 3).join(", ")}${changed.length > 3 ? ", …" : ""}). ${ran}`, todo: ask };
  }
  const checked = coverage?.symbols?.XAUUSD?.files?.length ? " The price files of the judged months are the same ones today." : "";
  const audit = status.with_the_audit_desks_rerun ? " The minute-by-minute re-run agrees too." : "";
  return { ...base, ok: true, title: "The five agents are copied, and each record re-runs to the same numbers", detail: `${ran}${audit}${checked}`, todo: null };
}

/**
 * The one sentence at the top. `lines` are the four lines; a line that could not be read is {ok: false, unread: true}.
 * It counts things to DO: two crosses with the same fix (the login and the prices both waiting for the weekly
 * download) are one thing.
 */
export function verdict(lines) {
  const bad = lines.filter((l) => !l.ok);
  if (!bad.length) return { ok: true, text: "Everything is connected." };
  if (bad.every((l) => l.unread)) return { ok: false, text: "The checks could not be read." };
  const fixes = new Set(bad.map((l, i) => l.todo || `line ${i}`)).size;
  return { ok: false, text: fixes === 1 ? "One thing needs you." : `${fixes} things need you.` };
}

/**
 * What the FOREX.com demo account itself reports (champions/probe/forexcom_demo.json), as plain sentences, or null
 * when there is no such file. Facts only: the file never holds an account number, a name or a balance.
 */
export function demoFacts(probe, zone) {
  if (!probe) return null;
  const at = when(probe.at, zone);
  if (!probe.ok) return { ok: false, at, lines: [sentence(probe.why) || "The demo account could not be read."] };
  const lines = [];
  const acc = probe.account || {};
  const month = (day) => { const t = time(`${day}T00:00:00Z`); return t === null ? String(day || "").slice(0, 7) : new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(t)); };
  if (acc.leverage) lines.push(`The account says leverage 1:${count(acc.leverage)}. ${acc.hedging === true ? "It is a hedging account: a buy and a sell can be open together." : acc.hedging === false ? "It is not a hedging account." : ""}`.trim());
  const m = probe.symbols?.XAUUSD?.margin_for_smallest_trade;
  if (m) {
    lines.push(`For gold, MetaTrader works out ${Number(m.margin).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${m.in} of margin for the smallest trade (${m.lots === 1 ? "1 ounce" : `${m.lots} lots`} at ${Number(m.price).toLocaleString("en-GB", { maximumFractionDigits: 2 })})${m.market_value_over_margin ? `: that is 1:${count(Math.round(m.market_value_over_margin))}` : ""}.`);
  }
  const hist = probe.history?.XAUUSD;
  if (hist?.served === false) lines.push("MetaTrader gave no gold history in the time allowed, so how far back it goes is not known yet.");
  else if (hist) {
    const days = hist.days || [];
    const dense = hist.one_minute_bars_back_to;
    const older = days.filter((d) => dense && d.day < dense && d.kind !== "1-minute").map((d) => d.day).sort();      // days looked at beyond the real 1-minute bars
    const outOfTime = hist.stopped === "out of time";
    if (dense && older.length) lines.push(`Real 1-minute gold bars go back to ${month(dense)} at least, and stop somewhere before that: ${month(older[older.length - 1])} has thinner bars only.`);
    else if (dense) lines.push(`Real 1-minute gold bars go back to ${month(dense)} at least.${outOfTime ? " The look back ran out of time there, so they may go further." : ""}`);
    else if (days.length) lines.push("No real 1-minute gold bars were found on the days looked at.");
    if (hist.any_bars_back_to && hist.any_bars_back_to !== dense) lines.push(`Thinner gold bars go back to ${month(hist.any_bars_back_to)}${outOfTime ? " at least (the look back ran out of time there)" : ""}.`);
  }
  return { ok: true, at, lines };
}
