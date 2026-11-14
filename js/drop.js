// One-time secret drop: the logic, with no page in it (js/setup.js draws the page; tests/drop.test.js runs this file
// against a stand-in GitHub that holds a test private key).
//
// The rules this file keeps, all of them checked by the tests:
//   * A value is only ever held in memory, sealed for GitHub in this browser, and sent - sealed - to api.github.com.
//   * It is never logged, never stored, never put in a message, a URL or an error, never sent to any other address.
//   * The one-time key (a GitHub token that may write this one repository's secrets) is used for this one Send and
//     then destroyed through GitHub's own revocation address. It is never stored either.
//   * Nothing is sent at all until GitHub has accepted the key, the repository's public key has been read, and this
//     browser has reproduced a known sealed box byte for byte (the self-test).
import { sealTextForGitHub, selfTest, base64ToBytes, PUBLIC_KEY_BYTES } from "./sealedbox.js";

export const API = "https://api.github.com";
export const ENGINE_REPO = "hsn-test-lab-engine";
export const FEED_REPO = "hsn-vps-feed";
export const CHECK_WORKFLOW = "secrets-check.yml";
const TIMEOUT_MS = 25000;

/** The five boxes, in the order they are shown and sent. `tidy` says how pasted text is cleaned (never changed otherwise). */
export const FIELDS = [
  { name: "FOREXCOM_MT5_LOGIN", label: "FOREX.com MT5 login", what: "The account number: digits only.", tidy: "nospace", keyboard: "numeric" },
  { name: "FOREXCOM_MT5_SERVER", label: "FOREX.com MT5 server", what: "The server name, exactly as MetaTrader or FOREX.com's email shows it.", tidy: "ends" },
  { name: "FOREXCOM_MT5_PASSWORD", label: "FOREX.com MT5 password", what: "The investor (read-only) password. For a demo account its normal password is accepted too, because you allowed that on 14 Nov 2026. For a real account: only the investor one.", tidy: "ends" },
  { name: "ANTHROPIC_API_KEY", label: "Anthropic API key", what: "From the Claude Console, API keys. It starts with sk-ant-.", tidy: "nospace" },
  { name: "VPS_FEED_READ_TOKEN", label: "VPS feed read-only token", what: "Optional. A GitHub token that can only read hsn-vps-feed (Contents: Read-only). Leave empty until that repository exists.", tidy: "nospace" },
];
export const SECRET_NAMES = FIELDS.map((f) => f.name);

const EDGE = /^[\s ​‌‍⁠﻿]+|[\s ​‌‍⁠﻿]+$/g;
const ANYWHERE = /[\s ​‌‍⁠﻿]+/g;

/** Clean what was typed or pasted: spaces and invisible characters at the ends always go; inside, only where they
 *  can never belong (an account number, a key, a token). A password or a server name keeps its inside as given. */
export function tidy(value, how = "ends") {
  const text = String(value ?? "");
  return how === "nospace" ? text.replace(ANYWHERE, "") : text.replace(EDGE, "");
}

const count = (n, word, plural = `${word}s`) => `${n} ${n === 1 ? word : plural}`;

/** A short note under a box. It never contains the value: only its length and whether its shape looks right. */
export function hint(name, raw) {
  const field = FIELDS.find((f) => f.name === name);
  const v = tidy(raw, name === "ONE_TIME_KEY" ? "nospace" : field?.tidy);
  if (!v) return { level: "empty", text: "" };
  const n = count(v.length, "character");
  switch (name) {
    case "FOREXCOM_MT5_LOGIN":
      return /^\d+$/.test(v) ? { level: "ok", text: count(v.length, "digit") } : { level: "bad", text: "An MT5 login is a number only. This has other characters in it." };
    case "FOREXCOM_MT5_SERVER":
      if (/@|:\/\//.test(v)) return { level: "warn", text: `${n}. This looks like an email or web address, not a server name.` };
      if (/^\d+$/.test(v)) return { level: "warn", text: `${n}. This is only digits: is it the login rather than the server name?` };
      return { level: "ok", text: n };
    case "FOREXCOM_MT5_PASSWORD":
      return v.length < 5 ? { level: "warn", text: `${n}. That is very short for a password.` } : { level: "ok", text: n };
    case "ANTHROPIC_API_KEY":
      if (v.startsWith("sk-ant-oat")) return { level: "warn", text: `${n}. This looks like a Claude subscription token, not an API key from the Claude Console.` };
      if (!v.startsWith("sk-ant-")) return { level: "warn", text: `${n}. An Anthropic API key starts with sk-ant-. This does not.` };
      return v.length < 40 ? { level: "warn", text: `${n}. That is short for an Anthropic key: was it cut off?` } : { level: "ok", text: `Looks like an Anthropic key · ${n}` };
    case "VPS_FEED_READ_TOKEN":
      if (v.startsWith("github_pat_")) return v.length < 60 ? { level: "warn", text: `${n}. That is short for a GitHub token: was it cut off?` } : { level: "ok", text: `Looks like a GitHub token · ${n}` };
      if (/^gh[pousr]_/.test(v)) return { level: "warn", text: `${n}. This is an old-style GitHub token. A fine-grained one (github_pat_…) limited to hsn-vps-feed is safer.` };
      return { level: "warn", text: `${n}. A GitHub token starts with github_pat_. This does not.` };
    case "ONE_TIME_KEY":
      if (v.startsWith("github_pat_")) return v.length < 60 ? { level: "warn", text: `${n}. That is short for a GitHub token: was it cut off?` } : { level: "ok", text: `Looks like a GitHub token · ${n}` };
      if (/^gh[pousr]_/.test(v)) return { level: "bad", text: "This is an old-style GitHub token that reaches all your repositories. Make the fine-grained one instead (it starts with github_pat_)." };
      return { level: "bad", text: "A GitHub fine-grained token starts with github_pat_. This does not." };
    default:
      return { level: "ok", text: n };
  }
}

/**
 * What stands in the way of a Send. `stop` = cannot be sent; `check` = can be sent after a second tap.
 * values: {NAME: raw text}; key: raw text of the one-time key; siteToken: the site's own saved token (or null).
 */
export function review({ values, key, siteToken = null, firstTime = true }) {
  const stop = [], check = [];
  const clean = {};
  for (const f of FIELDS) clean[f.name] = tidy(values?.[f.name], f.tidy);
  const k = tidy(key, "nospace");
  const filled = FIELDS.filter((f) => clean[f.name]);
  if (!filled.length) stop.push("Fill in at least one box.");
  for (const f of filled) {
    const h = hint(f.name, clean[f.name]);
    if (h.level === "bad") stop.push(`${f.name}: ${h.text}`);
    else if (h.level === "warn") check.push(`${f.name}: ${h.text}`);
  }
  if (!k) stop.push("Paste the one-time key in the last box.");
  else {
    const h = hint("ONE_TIME_KEY", k);
    if (h.level === "bad") stop.push(`One-time key: ${h.text}`);
    else if (h.level === "warn") check.push(`One-time key: ${h.text}`);
    if (siteToken && k === siteToken) stop.push("The one-time key box holds the site's own token (the one saved in Settings). Make a separate one-time key: this page destroys the key it is given.");
    if (clean.VPS_FEED_READ_TOKEN && k === clean.VPS_FEED_READ_TOKEN) stop.push("The one-time key and the feed token are the same token. They must be two different ones: the one-time key is destroyed after sending.");
  }
  if (siteToken && clean.VPS_FEED_READ_TOKEN && clean.VPS_FEED_READ_TOKEN === siteToken) stop.push("VPS_FEED_READ_TOKEN holds the site's own token, not the feed token.");
  const fx = ["FOREXCOM_MT5_LOGIN", "FOREXCOM_MT5_SERVER", "FOREXCOM_MT5_PASSWORD"];
  if (clean.FOREXCOM_MT5_PASSWORD && (clean.FOREXCOM_MT5_PASSWORD === clean.FOREXCOM_MT5_LOGIN || clean.FOREXCOM_MT5_PASSWORD === clean.FOREXCOM_MT5_SERVER)) check.push("The FOREX.com password box holds the same text as the login or the server box.");
  if (clean.ANTHROPIC_API_KEY && clean.ANTHROPIC_API_KEY === clean.VPS_FEED_READ_TOKEN) check.push("The Anthropic key box and the feed token box hold the same text.");
  const empty = FIELDS.filter((f) => !clean[f.name]).map((f) => f.name);
  const fxFilled = fx.filter((n) => clean[n]).length;
  if (firstTime && filled.length && empty.length) check.push(`${count(empty.length, "box", "boxes")} left empty (${empty.join(", ")}): ${empty.length === 1 ? "it" : "they"} will not be saved now.`);
  if (firstTime && fxFilled > 0 && fxFilled < 3) check.push("The FOREX.com login needs all three of its boxes to work.");
  return { stop, check, names: filled.map((f) => f.name), clean, key: k };
}

/** A problem that stopped the Send before anything was saved. `code` is a short word; the message is plain English. */
export class DropError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function call(fetchImpl, path, { token = null, method = "GET", body } = {}) {
  // Only headers GitHub's documented cross-origin list allows from a browser (Authorization, Content-Type; Accept is
  // always allowed). No API-version header: GitHub then uses its default version, which is the one this was written for.
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  // no cookies, no cache, no referrer, and a credential never follows a redirect to another address
  const init = { method, headers, cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", mode: "cors" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  // a request that hangs is given up after 25 seconds and counted as "no answer", so the page never sits waiting for ever
  const stop = typeof AbortController === "function" ? new AbortController() : null;
  const timer = stop ? setTimeout(() => stop.abort(), TIMEOUT_MS) : null;
  if (stop) init.signal = stop.signal;
  try {
    let response;
    try {
      response = await fetchImpl(`${API}${path}`, init);
    } catch {
      return { status: 0, data: null };
    }
    let data = null;
    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The owner a GitHub Pages address belongs to (lilprogact.github.io -> "lilprogact"), or null anywhere else. */
export function ownerFromHost(hostname) {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(String(hostname || ""));
  return m ? m[1] : null;
}

function failure(status) {
  if (status === 0) return "no answer from GitHub (connection)";
  if (status === 401) return "GitHub stopped accepting the key part-way";
  if (status === 403 || status === 404) return "GitHub refused it (permission)";
  if (status === 422) return "GitHub refused it as not valid (422)";
  if (status === 429) return "GitHub asked to slow down (429)";
  return `GitHub answered ${status}`;
}

/**
 * Seal each given value in this browser and save it as an Actions secret of the engine repository.
 *
 * @param key           the one-time key (already tidied)
 * @param values        {NAME: value} for the boxes to send (already tidied; empty ones are left alone)
 * @param expectedOwner the GitHub account the site belongs to (from its address or its saved token), or null
 * @param onProgress    called with {phase, name?} - "checking", "saving" + name, "committed" (the first value has been
 *                      saved: the point of no return, empty the boxes now), "confirming", "destroying"
 * @returns {owner, results: {NAME: {state: "saved"|"failed"|"left", why}}, key: "destroyed"|"accepted"|"not_destroyed", startedAt, finishedAt}
 * @throws DropError when nothing was saved (bad key, no permission, no connection, GitHub fault, failed self-test);
 *         the key is then left alone and the caller keeps the boxes
 */
export async function sendSecrets({ key, values, expectedOwner = null, fetchImpl = globalThis.fetch.bind(globalThis), onProgress = () => {}, pause = wait }) {
  const names = SECRET_NAMES.filter((n) => values[n]);
  if (!key) throw new DropError("no_key", "Paste the one-time key first.");
  if (!names.length) throw new DropError("nothing", "Fill in at least one box.");
  const startedAt = new Date().toISOString();
  onProgress({ phase: "checking" });

  const who = await call(fetchImpl, "/user", { token: key });
  if (who.status === 0) throw new DropError("no_connection", "Could not reach GitHub. Nothing was sent. Check the connection and tap Send again.");
  if (who.status === 401) throw new DropError("key_rejected", "GitHub did not accept the one-time key. It may have been cut short when pasted, or it has expired or already been destroyed. Nothing was sent.");
  if (who.status !== 200 || !who.data || !who.data.login) throw new DropError("key_check_failed", `GitHub answered the key check with ${who.status}. Nothing was sent. Tap Send again in a minute.`);
  const owner = String(who.data.login);
  if (expectedOwner && owner.toLowerCase() !== String(expectedOwner).toLowerCase()) {
    throw new DropError("wrong_account", `The one-time key belongs to the GitHub account "${owner}", but this site belongs to "${expectedOwner}". Nothing was sent.`);
  }

  const base = `/repos/${encodeURIComponent(owner)}/${ENGINE_REPO}/actions/secrets`;
  const pk = await call(fetchImpl, `${base}/public-key`, { token: key });
  if (pk.status === 0) throw new DropError("no_connection", "Could not reach GitHub. Nothing was sent. Check the connection and tap Send again.");
  if (pk.status === 401) throw new DropError("key_rejected", "GitHub did not accept the one-time key. Nothing was sent.");
  if (pk.status === 403 || pk.status === 404) {
    throw new DropError("no_access", `GitHub accepted the key, but the key cannot reach the secrets of ${ENGINE_REPO}. Nothing was sent. On GitHub the key needs: Repository access = Only select repositories → ${ENGINE_REPO}, and Permissions → Secrets = Read and write.`);
  }
  let publicKeyOk = false;
  try {
    publicKeyOk = pk.status === 200 && typeof pk.data?.key_id === "string" && pk.data.key_id.length > 0 && base64ToBytes(pk.data.key).length === PUBLIC_KEY_BYTES;
  } catch {
    publicKeyOk = false;
  }
  if (!publicKeyOk) throw new DropError("bad_public_key", `GitHub did not give a usable public key for ${ENGINE_REPO} (answer ${pk.status}). Nothing was sent. Tap Send again in a minute.`);
  if (!selfTest()) throw new DropError("self_test", "This browser did not pass the encryption self-test, so nothing was sent. Update Safari (or use Chrome) and try again.");

  const results = {};
  for (const n of SECRET_NAMES) results[n] = { state: "left", why: "" };
  // The point of no return is the first value GitHub actually saves: the page is told ("committed") and empties the
  // boxes. Until then a refusal of the key, a dropped connection or a GitHub fault stops the Send with nothing saved,
  // the key untouched and the boxes kept, so one tap sends again.
  let saved = 0;
  const done = [];
  for (const name of names) {
    onProgress({ phase: "saving", name });
    let status = -1;
    for (let attempt = 0; attempt < 2; attempt++) {
      let sealed;
      try {
        sealed = sealTextForGitHub(values[name], pk.data.key);       // a fresh one-use key every time, also on the retry
      } catch {
        status = -1;
        break;
      }
      const put = await call(fetchImpl, `${base}/${name}`, { token: key, method: "PUT", body: { encrypted_value: sealed, key_id: pk.data.key_id } });
      status = put.status;
      if (status === 201 || status === 204) break;
      if (!(status === 0 || status >= 500)) break;                    // only a dropped connection or a GitHub hiccup is worth one more try
      await pause(1500);
    }
    const ok = status === 201 || status === 204;
    if (!ok && saved === 0) {
      if (status === 403 || status === 404) {
        throw new DropError("read_only_key", "GitHub accepted the key and it can see the secrets, but it is not allowed to save them. Nothing was saved. On GitHub, open the key, set Secrets to Read and write (not Read-only), save it, then tap Send again.");
      }
      if (status === 401) throw new DropError("key_rejected", "GitHub stopped accepting the one-time key. Nothing was saved.");
      if (status === 0 || status >= 500) {
        throw new DropError("no_answer", `GitHub did not answer while saving (${status === 0 ? "connection" : `its own error ${status}`}). Nothing was saved and your boxes are kept. Tap Send again in a minute.`);
      }
    }
    done.push(name);
    if (ok) {
      saved += 1;
      results[name] = { state: "saved", why: "" };
      if (saved === 1) onProgress({ phase: "committed" });
    } else {
      results[name] = { state: "failed", why: status === -1 ? "this browser could not seal it" : failure(status) };
    }
    if (saved > 0) for (const n of done) values[n] = "";             // the page's copy of the text is dropped once the Send is under way
  }
  if (saved === 0) {
    const why = [...new Set(names.map((n) => results[n].why))].join("; ");
    throw new DropError("nothing_saved", `GitHub did not save any of the values (${why}). Nothing was saved and your boxes are kept. The one-time key was not destroyed.`);
  }

  // Ask GitHub what it now holds (names and times only; GitHub never gives a value back).
  onProgress({ phase: "confirming" });
  const list = await call(fetchImpl, `${base}?per_page=100`, { token: key });
  if (list.status === 200 && Array.isArray(list.data?.secrets)) {
    const have = new Set(list.data.secrets.map((s) => s && s.name));
    for (const name of names) {
      if (results[name].state === "saved" && !have.has(name)) results[name] = { state: "failed", why: "GitHub said saved, but its list does not show it" };
    }
  }

  // Destroy the one-time key. GitHub's revocation address must be called WITHOUT a login, with the key in the body.
  onProgress({ phase: "destroying" });
  let keyState = "not_destroyed";
  const revoke = await call(fetchImpl, "/credentials/revoke", { method: "POST", body: { credentials: [key] } });
  if (revoke.status === 202) {
    keyState = "accepted";
    for (let i = 0; i < 6; i++) {
      await pause(i === 0 ? 1500 : 3000);
      const again = await call(fetchImpl, "/user", { token: key });
      if (again.status === 401) { keyState = "destroyed"; break; }
    }
  }
  return { owner, results, saved, key: keyState, startedAt, finishedAt: new Date().toISOString() };
}

// ── the check that follows (the engine's Secrets check workflow) ─────────────────────────────────────────────
const WORDS = { ok: "works", failed: "does NOT work", missing: "not saved yet", checking: "being checked", unknown: "could not be checked", not_checked: "not checked yet" };
const trimDot = (s) => String(s || "").replace(/\.\s*$/, "");

/** The FOREX.com part for this request: the Windows job's own file once it belongs to this request, else what the
 *  quick job recorded (missing / being checked). Mirrors scripts/secrets_check.py in the engine. */
export function forexcomPart(doc, login) {
  const rid = doc?.request_id || "";
  const fresh = !!login?.checked_at && ((rid && login.request_id === rid) || String(login.checked_at) >= String(doc?.updated_at || "9"));
  if (fresh) return { state: loginState(login), reason: login.reason, detail: login.detail, checked_at: login.checked_at };
  return doc?.forexcom || {};
}

/** How to make the read-only (investor) password, and how to put it in. Shown where the engine has refused a
 *  password that could trade. The MetaTrader steps are MetaQuotes' own, for the iPhone / iPad app. */
export const INVESTOR_STEPS = [
  "In the MetaTrader 5 app, in this FOREX.com account: tap Settings, tap the account at the top, then tap that same account again in the list.",
  "Tap Change Password. It asks which password to change: choose the investor password, not the master one. (Changing the master one only changes your main password, which can still trade.)",
  "Current: the password you log in with now. New and Confirm: a different password that you make up, at least 8 characters with a capital letter, a small letter, a number and a symbol (like # or !). Tap Change at the top right and wait for the message that it changed. Your normal password stays as it is.",
  "Back on this page, under Replace a value: type the site password and tap Open.",
  "Fill in only FOREXCOM_MT5_PASSWORD, with the NEW investor password, not the one you log in with. Make a new one-time key, paste it in the last box and tap Send. The check then starts by itself.",
];

/**
 * What the owner should do, or expect, after a check. `parts` is resultLine().parts. Returns null when there is
 * nothing to add to the one line, or {kind, title, items}:
 *   investor      the login works but its password could trade: the steps to replace it with the investor password
 *   downloading   the FOREX.com login works: the price history is on its way (and what, if anything, is still missing)
 */
export function whatNext(parts = {}) {
  const fx = parts.forexcom || {}, ai = parts.anthropic || {}, feed = parts.feed || {};
  if (fx.state === "failed" && fx.reason === "not_read_only") {
    return { kind: "investor", title: "The login itself works. The saved password is the one that can trade; the Test Lab only takes the one that can look. To swap it (about five minutes):", items: INVESTOR_STEPS,
      after: "If you opened this demo account inside the MetaTrader 5 app, the screen that gave you the Login and the Password also had a line called Investor. That Investor line is the password for this box, and nothing needs changing in the app." };
  }
  if (fx.state !== "ok") return null;
  const items = [];
  if (ai.state !== "ok") items.push("HSN Capital also needs the Anthropic key to work before it can start.");
  if (feed.state !== "ok") items.push("The feed is optional: it only adds the VPS's recorded alerts and research. Backtests and HSN Capital work without it.");
  const all = !items.length;
  return { kind: "downloading", title: `${all ? "All three work" : "The FOREX.com login works"}. The engine is now downloading the FOREX.com price history (it can take up to an hour the first time; Settings shows it arrive). When it has arrived, the Start button on the HSN Capital page unlocks.`, items };
}

const MACHINE_REASONS = ["machine_failed", "terminal_not_ready", "check_crashed", "could_not_connect"];

/** ok / failed / unknown. A machine that could not start MetaTrader says nothing about the login itself. */
export function loginState(login) {
  if (login?.state === "ok") return "ok";
  return MACHINE_REASONS.includes(login?.reason) ? "unknown" : "failed";
}

/**
 * The one-line result. doc = status/secrets_check.json, login = status/forexcom_login.json (either may be null).
 * requestId = the check this page started (null = just show the latest). Returns {line, done, parts}.
 */
export function resultLine(doc, login, { requestId = null, startedAt = null, now = Date.now() } = {}) {
  const waitedMin = startedAt ? (now - Date.parse(startedAt)) / 60000 : 0;
  if (!doc || (requestId && doc.request_id !== requestId)) {
    const late = requestId && waitedMin > 6;
    return { line: late ? "The check has not answered yet. GitHub may be slow to start it: look under Actions in hsn-test-lab-engine, or tap Check the logins again." : "Waiting for GitHub to start the check…", done: !!late, parts: {} };
  }
  const fx = { ...forexcomPart(doc, login) };
  if (fx.state === "checking" && waitedMin > 30) {
    fx.state = "unknown";
    fx.detail = "the Windows machine has not answered after 30 minutes: look under Actions in hsn-test-lab-engine";
  }
  const parts = { forexcom: fx, anthropic: doc.anthropic || {}, feed: doc.feed || {} };
  // a demo account's own password (allowed by the owner for a demo) is never called read-only
  const demoOwn = parts.forexcom.state === "ok" && parts.forexcom.reason === "ok_demo_trading_password";
  const bits = [[demoOwn ? "FOREX.com demo login" : "FOREX.com read-only login", parts.forexcom], ["Anthropic key", parts.anthropic], ["Feed access", parts.feed]].map(([label, p]) => {
    const state = p.state || "not_checked";
    let text = `${label}: ${WORDS[state] || state}`;
    if (p === parts.forexcom && demoOwn) text += " (a demo account with its normal password, which you allowed for a demo; it is not read-only)";
    if (state === "checking") text += " (about 8 minutes)";
    else if (state !== "ok" && p.detail && p.reason !== "missing") text += ` (${trimDot(p.detail)})`;
    else if (state === "ok" && p.warning) text += ` (but ${trimDot(p.warning)})`;
    return text;
  });
  return { line: bits.join(" · "), done: parts.forexcom.state !== "checking", parts };
}
