// The one-time secret drop against a stand-in GitHub that holds a TEST private key (tests/fixtures/sealedbox.json,
// made with libsodium). What is proven here: every saved value opens to exactly what was typed; no value ever
// appears in a request other than sealed; the one-time key is used, then destroyed without a login header; and
// nothing at all is sent when the key is not accepted. Every value below is made up for the test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import nacl from "../js/vendor/tweetnacl.js";
import { blake2b } from "../js/vendor/blake2b.js";
import { base64ToBytes, bytesToBase64 } from "../js/sealedbox.js";
import { FIELDS, SECRET_NAMES, tidy, hint, review, sendSecrets, DropError, ownerFromHost, resultLine, forexcomPart, loginState, whatNext, INVESTOR_STEPS } from "../js/drop.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/sealedbox.json", import.meta.url), "utf8"));
const hex = (s) => Uint8Array.from(s.match(/../g) || [], (b) => parseInt(b, 16));
const PK = hex(fx.recipient_public_key), SK = hex(fx.recipient_secret_key_TEST_ONLY);

function open(sealedBase64) {
  const sealed = base64ToBytes(sealedBase64);
  const epk = sealed.subarray(0, 32);
  const both = new Uint8Array(64);
  both.set(epk, 0);
  both.set(PK, 32);
  const plain = nacl.box.open(sealed.subarray(32), blake2b(both, undefined, 24), epk, SK);
  return plain ? new TextDecoder().decode(plain) : null;
}

// Made-up values, put together from pieces at run time so that no scanner reading this public file mistakes one for a real token.
const PAT = ["github", "pat", ""].join("_");
const OLD_STYLE = ["ghp", "abcdefghijklmnopqrstuvwxyz0123456789"].join("_");
const KEY = PAT + "TESTONLYonetimekey_" + "Qz7".repeat(22);
const VALUES = {
  FOREXCOM_MT5_LOGIN: "48151623",
  FOREXCOM_MT5_SERVER: "FOREX.com-Test 42",
  FOREXCOM_MT5_PASSWORD: "Inv3stor Pä$$ wörd-€",
  ANTHROPIC_API_KEY: ["sk", "ant", "api03", "TESTONLY", ""].join("-") + "aB3_".repeat(22),
  VPS_FEED_READ_TOKEN: PAT + "TESTONLYfeedtoken_" + "9xY".repeat(22),
};

/** A stand-in for api.github.com. Options bend its behaviour for one test. */
class FakeGitHub {
  constructor(opts = {}) {
    this.opts = opts;
    this.requests = [];
    this.secrets = new Map();
    this.revoked = false;
    this.fetch = this.fetch.bind(this);
  }

  async fetch(url, init = {}) {
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const rec = { url, method: init.method || "GET", headers, body: init.body ?? null, init };
    this.requests.push(rec);
    const o = this.opts;
    if (o.offline) throw new TypeError("network");
    const json = (status, data) => new Response(data === null ? null : JSON.stringify(data), { status });
    if (u.pathname === "/credentials/revoke") {
      if (headers.authorization) return json(403, { message: "must not be authenticated" });
      if (o.revokeFails) return json(500, { message: "oops" });
      const body = JSON.parse(init.body);
      if (body.credentials.includes(KEY) && !o.revokeSlow) this.revoked = true;
      return json(202, null);
    }
    const auth = headers.authorization;
    if (auth !== `Bearer ${KEY}` || this.revoked || o.rejectKey) return json(401, { message: "Bad credentials" });
    if (u.pathname === "/user") return json(200, { login: o.login || "Lilprogact" });
    const base = "/repos/Lilprogact/hsn-test-lab-engine/actions/secrets";
    if (u.pathname === `${base}/public-key`) {
      if (o.noAccess) return json(404, { message: "Not Found" });
      return json(200, { key_id: "568250167242549743", key: o.badPublicKey ? "AAAA" : bytesToBase64(PK) });
    }
    if (u.pathname === base) return json(200, { total_count: this.secrets.size, secrets: [...this.secrets.keys()].filter((n) => n !== o.hideFromList).map((name) => ({ name, updated_at: new Date().toISOString() })) });
    if (u.pathname.startsWith(`${base}/`) && rec.method === "PUT") {
      const name = u.pathname.slice(base.length + 1);
      this.puts = (this.puts || 0) + 1;
      if (o.readOnly) return json(403, { message: "Resource not accessible by personal access token" });
      if (o.failName === name || o.down) return json(500, { message: "server error" });
      if (o.invalidName === name || o.allInvalid) return json(422, { message: "Validation failed" });
      if (o.dropFirstPut && this.puts === 1) throw new TypeError("network");
      const body = JSON.parse(init.body);
      assert.deepEqual(Object.keys(body).sort(), ["encrypted_value", "key_id"]);
      const existed = this.secrets.has(name);
      this.secrets.set(name, body.encrypted_value);
      return json(existed ? 204 : 201, existed ? null : {});
    }
    return json(404, { message: "Not Found" });
  }
}

const noPause = async () => {};
const send = (gh, over = {}) => sendSecrets({ key: KEY, values: { ...VALUES }, expectedOwner: "lilprogact", fetchImpl: gh.fetch, pause: noPause, ...over });

function b64(text) { return bytesToBase64(new TextEncoder().encode(text)); }

/** Every way a value could show up in what was sent: as text, URL-encoded, or plain base64. */
function leaks(gh, value) {
  const hay = gh.requests.map((r) => `${r.url}\n${JSON.stringify(r.headers)}\n${r.body ?? ""}`).join("\n");
  return hay.includes(value) || hay.includes(encodeURIComponent(value)) || hay.includes(b64(value)) || hay.includes(JSON.stringify(value).slice(1, -1));
}

test("all five are saved, and what GitHub holds opens to exactly what was typed", async () => {
  const gh = new FakeGitHub();
  const phases = [];
  const out = await send(gh, { onProgress: (p) => phases.push(p.phase + (p.name ? ":" + p.name : "")) });
  assert.equal(out.owner, "Lilprogact");
  assert.equal(out.saved, 5);
  for (const name of SECRET_NAMES) {
    assert.deepEqual(out.results[name], { state: "saved", why: "" });
    assert.equal(open(gh.secrets.get(name)), VALUES[name], `${name} opens to the typed value`);
  }
  assert.equal(out.key, "destroyed");
  assert.deepEqual(phases, ["checking", "saving:FOREXCOM_MT5_LOGIN", "committed", "saving:FOREXCOM_MT5_SERVER", "saving:FOREXCOM_MT5_PASSWORD",
    "saving:ANTHROPIC_API_KEY", "saving:VPS_FEED_READ_TOKEN", "confirming", "destroying"]);
});

test("no value ever leaves the browser other than sealed", async () => {
  const gh = new FakeGitHub();
  await send(gh);
  for (const [name, value] of Object.entries(VALUES)) assert.equal(leaks(gh, value), false, `${name} must not appear in any request`);
  const puts = gh.requests.filter((r) => r.method === "PUT");
  assert.equal(puts.length, 5);
  for (const r of puts) {
    const body = JSON.parse(r.body);
    const name = r.url.split("/").pop();
    assert.equal(base64ToBytes(body.encrypted_value).length, new TextEncoder().encode(VALUES[name]).length + 48);
  }
});

test("every request goes to api.github.com only, with no cookies, no cache and no redirects", async () => {
  const gh = new FakeGitHub();
  await send(gh);
  for (const r of gh.requests) {
    assert.ok(r.url.startsWith("https://api.github.com/"), r.url);
    assert.equal(r.init.credentials, "omit");
    assert.equal(r.init.cache, "no-store");
    assert.equal(r.init.redirect, "error");
    assert.equal(r.init.referrerPolicy, "no-referrer");
    assert.ok(Object.keys(r.headers).every((k) => ["accept", "authorization", "content-type"].includes(k)), `only headers GitHub lets a browser send: ${Object.keys(r.headers)}`);
    assert.ok(!r.url.includes("?") || r.url.endsWith("?per_page=100"), "nothing but the page size in a query string");
  }
});

test("the one-time key is only ever a login header to GitHub, then destroyed without a login header", async () => {
  const gh = new FakeGitHub();
  await send(gh);
  const revoke = gh.requests.filter((r) => r.url.endsWith("/credentials/revoke"));
  assert.equal(revoke.length, 1);
  assert.equal(revoke[0].method, "POST");
  assert.equal(revoke[0].headers.authorization, undefined, "the revocation address must be called without a login");
  assert.deepEqual(JSON.parse(revoke[0].body), { credentials: [KEY] });
  for (const r of gh.requests) {
    if (r === revoke[0]) continue;
    assert.ok(!r.url.includes(KEY) && !(r.body ?? "").includes(KEY), "the key is never in a URL or a body, except the revocation body");
  }
  assert.equal(gh.revoked, true);
  const after = gh.requests.slice(gh.requests.indexOf(revoke[0]) + 1);
  assert.ok(after.length >= 1 && after.every((r) => r.url.endsWith("/user")), "after destroying it, the page only asks whether the key still works");
});

test("a key GitHub does not accept: nothing is sent, nothing is destroyed", async () => {
  const gh = new FakeGitHub({ rejectKey: true });
  const values = { ...VALUES };
  await assert.rejects(send(gh, { values }), (e) => e instanceof DropError && e.code === "key_rejected");
  assert.deepEqual(gh.requests.map((r) => new URL(r.url).pathname), ["/user"]);
  assert.deepEqual(values, VALUES, "the caller's values are untouched, so the boxes can be kept");
});

test("a key that cannot reach the engine's secrets, or belongs to another account: nothing is sent", async () => {
  let gh = new FakeGitHub({ noAccess: true });
  await assert.rejects(send(gh), (e) => e.code === "no_access" && /Only select repositories/.test(e.message) && /Read and write/.test(e.message));
  assert.ok(gh.requests.every((r) => r.method === "GET"));
  gh = new FakeGitHub({ login: "someone-else" });
  await assert.rejects(send(gh), (e) => e.code === "wrong_account");
  assert.equal(gh.requests.length, 1);
  gh = new FakeGitHub({ badPublicKey: true });
  await assert.rejects(send(gh), (e) => e.code === "bad_public_key");
  assert.ok(gh.requests.every((r) => r.method === "GET"));
  gh = new FakeGitHub({ offline: true });
  await assert.rejects(send(gh), (e) => e.code === "no_connection");
});

test("a read-only key: the first save is refused, nothing was saved, the key is not destroyed", async () => {
  const gh = new FakeGitHub({ readOnly: true });
  const values = { ...VALUES };
  const phases = [];
  await assert.rejects(send(gh, { values, onProgress: (p) => phases.push(p.phase) }), (e) => e.code === "read_only_key" && /Read and write/.test(e.message));
  assert.equal(gh.secrets.size, 0);
  assert.equal(gh.requests.filter((r) => r.method === "PUT").length, 1, "it stops at the first refusal");
  assert.equal(gh.requests.filter((r) => r.url.endsWith("/credentials/revoke")).length, 0);
  assert.ok(!phases.includes("committed"), "the page is never told to empty the boxes");
  assert.deepEqual(values, VALUES);
});

test("one value fails: it says Failed for that one, the rest are Saved, the key is still destroyed", async () => {
  const gh = new FakeGitHub({ failName: "ANTHROPIC_API_KEY" });
  const out = await send(gh);
  assert.equal(out.results.ANTHROPIC_API_KEY.state, "failed");
  assert.match(out.results.ANTHROPIC_API_KEY.why, /500/);
  assert.equal(out.saved, 4);
  assert.equal(gh.requests.filter((r) => r.url.endsWith("/ANTHROPIC_API_KEY")).length, 2, "one retry after a server error");
  assert.equal(out.key, "destroyed");
  assert.equal(leaks(gh, VALUES.ANTHROPIC_API_KEY), false);
});

test("GitHub down before anything is saved: the Send stops, the key is kept, the boxes can be kept", async () => {
  const gh = new FakeGitHub({ down: true });
  const values = { ...VALUES };
  const phases = [];
  await assert.rejects(send(gh, { values, onProgress: (p) => phases.push(p.phase) }), (e) => e.code === "no_answer" && /boxes are kept/.test(e.message));
  assert.equal(gh.secrets.size, 0);
  assert.equal(gh.requests.filter((r) => r.method === "PUT").length, 2, "one retry, then it stops: it does not walk through every value");
  assert.equal(gh.requests.filter((r) => r.url.endsWith("/credentials/revoke")).length, 0, "the key is not destroyed when nothing was saved");
  assert.ok(!phases.includes("committed"));
  assert.deepEqual(values, VALUES);
});

test("the point of no return is the first value GitHub really saves", async () => {
  let gh = new FakeGitHub({ invalidName: "FOREXCOM_MT5_LOGIN" });
  const phases = [];
  const values = { ...VALUES };
  const out = await send(gh, { values, onProgress: (p) => phases.push(p.phase + (p.name ? ":" + p.name : "")) });
  assert.equal(out.results.FOREXCOM_MT5_LOGIN.state, "failed");
  assert.match(out.results.FOREXCOM_MT5_LOGIN.why, /422/);
  assert.equal(out.saved, 4);
  assert.deepEqual(phases.slice(0, 4), ["checking", "saving:FOREXCOM_MT5_LOGIN", "saving:FOREXCOM_MT5_SERVER", "committed"]);
  assert.ok(Object.values(values).every((v) => v === ""), "once under way, the page's copies are dropped");
  assert.equal(out.key, "destroyed");

  gh = new FakeGitHub({ allInvalid: true });
  await assert.rejects(send(gh), (e) => e.code === "nothing_saved" && /not destroyed/.test(e.message));
  assert.equal(gh.requests.filter((r) => r.url.endsWith("/credentials/revoke")).length, 0);
  assert.equal(gh.requests.filter((r) => r.method === "PUT").length, 5);
});

test("a dropped connection on a save is retried once, sealed afresh", async () => {
  const gh = new FakeGitHub({ dropFirstPut: true });
  const out = await send(gh);
  assert.equal(out.saved, 5);
  assert.equal(open(gh.secrets.get("FOREXCOM_MT5_LOGIN")), VALUES.FOREXCOM_MT5_LOGIN);
  const tries = gh.requests.filter((r) => r.url.endsWith("/FOREXCOM_MT5_LOGIN"));
  assert.equal(tries.length, 2);
  assert.notEqual(JSON.parse(tries[0].body).encrypted_value, JSON.parse(tries[1].body).encrypted_value);
});

test("Saved is only said when GitHub's own list shows the name", async () => {
  const gh = new FakeGitHub({ hideFromList: "VPS_FEED_READ_TOKEN" });
  const out = await send(gh);
  assert.equal(out.results.VPS_FEED_READ_TOKEN.state, "failed");
  assert.match(out.results.VPS_FEED_READ_TOKEN.why, /list/);
  assert.equal(out.results.FOREXCOM_MT5_LOGIN.state, "saved");
});

test("only the filled boxes are sent; the others are left exactly as they are", async () => {
  const gh = new FakeGitHub();
  gh.secrets.set("FOREXCOM_MT5_LOGIN", "an-older-sealed-value");
  const out = await send(gh, { values: { ANTHROPIC_API_KEY: VALUES.ANTHROPIC_API_KEY, FOREXCOM_MT5_LOGIN: "" } });
  assert.equal(out.saved, 1);
  assert.equal(out.results.FOREXCOM_MT5_LOGIN.state, "left");
  assert.equal(gh.secrets.get("FOREXCOM_MT5_LOGIN"), "an-older-sealed-value");
  assert.equal(gh.requests.filter((r) => r.method === "PUT").length, 1);
  await assert.rejects(send(new FakeGitHub(), { values: {} }), (e) => e.code === "nothing");
  await assert.rejects(send(new FakeGitHub(), { key: "" }), (e) => e.code === "no_key");
});

test("when the key cannot be destroyed from here, the page is told so", async () => {
  let out = await send(new FakeGitHub({ revokeFails: true }));
  assert.equal(out.key, "not_destroyed");
  assert.equal(out.saved, 5);
  out = await send(new FakeGitHub({ revokeSlow: true }));
  assert.equal(out.key, "accepted");
});

test("a request that hangs is given up, not waited on for ever", async () => {
  const gh = new FakeGitHub();
  const seen = [];
  const hanging = (url, init) => { seen.push(init.signal); return new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))); };
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms >= 20000 ? 5 : ms, ...a);   // the 25-second limit, shortened for the test
  try {
    await assert.rejects(sendSecrets({ key: KEY, values: { ...VALUES }, fetchImpl: hanging, pause: noPause }), (e) => e.code === "no_connection");
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.equal(seen.length, 1);
  assert.equal(seen[0].aborted, true);
  assert.equal(gh.requests.length, 0);
});

test("a browser that fails the encryption self-test sends nothing", async () => {
  const real = nacl.box;
  const gh = new FakeGitHub();
  try {
    nacl.box = (m, n, p, s) => { const out = real(m, n, p, s); out[3] ^= 1; return out; };
    await assert.rejects(send(gh), (e) => e.code === "self_test");
  } finally {
    nacl.box = real;
  }
  assert.ok(gh.requests.every((r) => r.method === "GET"));
});

test("tidy: ends are always cleaned; the inside only where a space can never belong", () => {
  assert.equal(tidy("  FOREX.com-Test 42 \n"), "FOREX.com-Test 42");
  assert.equal(tidy("​ pass word  ", "ends"), "pass word");
  assert.equal(tidy(" sk-ant-abc\n def \t", "nospace"), "sk-ant-abcdef");
  assert.equal(tidy(null), "");
  assert.deepEqual(FIELDS.map((f) => f.tidy), ["nospace", "ends", "ends", "nospace", "nospace"]);
});

test("a hint never contains the value, only its length and shape", () => {
  for (const [name, value] of [...Object.entries(VALUES), ["ONE_TIME_KEY", KEY], ["FOREXCOM_MT5_LOGIN", "12ab"], ["ANTHROPIC_API_KEY", "wrong-thing-entirely-0123456789"],
    ["VPS_FEED_READ_TOKEN", OLD_STYLE], ["ONE_TIME_KEY", OLD_STYLE], ["FOREXCOM_MT5_SERVER", "name@example.com"]]) {
    const hn = hint(name, value);
    assert.ok(!hn.text.includes(value), name);
    for (let i = 0; i + 6 <= value.length; i++) assert.ok(!hn.text.includes(value.slice(i, i + 6)) || /github_pat_|sk-ant-/.test(value.slice(i, i + 6 + 6)), `${name}: no 6-character piece of the value`);
  }
  assert.equal(hint("FOREXCOM_MT5_LOGIN", "48151623").text, "8 digits");
  assert.equal(hint("FOREXCOM_MT5_LOGIN", "4815 1623").level, "ok");
  assert.equal(hint("FOREXCOM_MT5_LOGIN", "12ab").level, "bad");
  assert.equal(hint("ANTHROPIC_API_KEY", VALUES.ANTHROPIC_API_KEY).level, "ok");
  assert.equal(hint("ANTHROPIC_API_KEY", "sk-ant-oat01-" + "x".repeat(60)).level, "warn");
  assert.equal(hint("ONE_TIME_KEY", "ghp_" + "x".repeat(36)).level, "bad");
  assert.equal(hint("ONE_TIME_KEY", KEY).level, "ok");
  assert.equal(hint("FOREXCOM_MT5_PASSWORD", "").level, "empty");
});

test("review: what stops a Send and what only asks for a second tap", () => {
  const ok = review({ values: VALUES, key: KEY, siteToken: "github_pat_site" });
  assert.deepEqual(ok.stop, []);
  assert.deepEqual(ok.check, []);
  assert.deepEqual(ok.names, SECRET_NAMES);
  assert.equal(ok.clean.FOREXCOM_MT5_PASSWORD, VALUES.FOREXCOM_MT5_PASSWORD);

  assert.match(review({ values: {}, key: KEY }).stop.join(" "), /at least one box/);
  assert.match(review({ values: VALUES, key: "" }).stop.join(" "), /one-time key/);
  assert.match(review({ values: VALUES, key: KEY, siteToken: KEY }).stop.join(" "), /site's own token/);
  assert.match(review({ values: { ...VALUES, VPS_FEED_READ_TOKEN: KEY }, key: KEY }).stop.join(" "), /same token/);
  assert.match(review({ values: { ...VALUES, VPS_FEED_READ_TOKEN: "github_pat_site" + "x".repeat(60) }, key: KEY, siteToken: "github_pat_site" + "x".repeat(60) }).stop.join(" "), /not the feed token/);
  assert.match(review({ values: { ...VALUES, FOREXCOM_MT5_LOGIN: "abc123" }, key: KEY }).stop.join(" "), /number only/);
  assert.match(review({ values: VALUES, key: "ghp_" + "x".repeat(36) }).stop.join(" "), /fine-grained/);

  const odd = review({ values: { ...VALUES, ANTHROPIC_API_KEY: "not-a-key-at-all-0123456789" }, key: KEY });
  assert.deepEqual(odd.stop, []);
  assert.match(odd.check.join(" "), /starts with sk-ant-/);
  assert.ok(!odd.check.join(" ").includes("not-a-key-at-all"));

  const partial = review({ values: { FOREXCOM_MT5_LOGIN: "48151623", ANTHROPIC_API_KEY: VALUES.ANTHROPIC_API_KEY }, key: KEY, firstTime: true });
  assert.deepEqual(partial.stop, []);
  assert.match(partial.check.join(" "), /3 boxes left empty/);
  assert.match(partial.check.join(" "), /all three/);
  const replace = review({ values: { ANTHROPIC_API_KEY: VALUES.ANTHROPIC_API_KEY }, key: KEY, firstTime: false });
  assert.deepEqual([replace.stop, replace.check], [[], []], "replacing one value needs no second tap");
  assert.deepEqual(replace.names, ["ANTHROPIC_API_KEY"]);

  const spaced = review({ values: { ...VALUES, ANTHROPIC_API_KEY: `  ${VALUES.ANTHROPIC_API_KEY}\n` }, key: ` ${KEY} ` });
  assert.equal(spaced.clean.ANTHROPIC_API_KEY, VALUES.ANTHROPIC_API_KEY);
  assert.equal(spaced.key, KEY);
});

test("the owner comes from the site's own address", () => {
  assert.equal(ownerFromHost("lilprogact.github.io"), "lilprogact");
  assert.equal(ownerFromHost("localhost"), null);
  assert.equal(ownerFromHost("evil.github.io.example.com"), null);
});

test("the one-line result, as the engine's files fill in", () => {
  const started = "2026-11-13T15:30:00Z";
  const at = (min) => Date.parse(started) + min * 60000;
  assert.match(resultLine(null, null, { requestId: "r1", startedAt: started, now: at(1) }).line, /Waiting for GitHub/);
  assert.equal(resultLine({ request_id: "other" }, null, { requestId: "r1", startedAt: started, now: at(1) }).done, false);
  assert.equal(resultLine(null, null, { requestId: "r1", startedAt: started, now: at(7) }).done, true);

  const doc = { request_id: "r1", updated_at: "2026-11-13T15:30:40Z", anthropic: { state: "ok" }, feed: { state: "ok", reason: "ok_no_release", warning: "no weekly release has been published there yet" },
    forexcom: { state: "checking" } };
  let r = resultLine(doc, { checked_at: "2026-11-10T01:17:00Z", request_id: "", state: "ok" }, { requestId: "r1", startedAt: started, now: at(2) });
  assert.equal(r.line, "FOREX.com read-only login: being checked (about 8 minutes) · Anthropic key: works · Feed access: works (but no weekly release has been published there yet)");
  assert.equal(r.done, false);

  r = resultLine(doc, { checked_at: "2026-11-13T15:38:00Z", request_id: "r1", state: "ok", detail: "fine." }, { requestId: "r1", startedAt: started, now: at(9) });
  assert.ok(r.line.startsWith("FOREX.com read-only login: works · Anthropic key: works"));
  assert.equal(r.done, true);

  r = resultLine(doc, { checked_at: "2026-11-13T15:38:00Z", request_id: "r1", state: "failed", reason: "not_read_only", detail: "The login works, but it could place trades." }, { requestId: "r1", startedAt: started, now: at(9) });
  assert.ok(r.line.startsWith("FOREX.com read-only login: does NOT work (The login works, but it could place trades) ·"));

  r = resultLine(doc, { checked_at: "2026-11-13T15:38:00Z", request_id: "r1", state: "failed", reason: "machine_failed", detail: "GitHub's Windows machine could not start MetaTrader 5." }, { requestId: "r1", startedAt: started, now: at(9) });
  assert.ok(r.line.startsWith("FOREX.com read-only login: could not be checked (GitHub's Windows machine could not start MetaTrader 5) ·"), "a machine problem is not called a wrong login");
  assert.deepEqual(["terminal_not_ready", "check_crashed", "could_not_connect", "login_refused", "not_read_only", "not_forexcom", "no_connection"].map((reason) => loginState({ state: "failed", reason })),
    ["unknown", "unknown", "unknown", "failed", "failed", "failed", "failed"]);

  r = resultLine(doc, null, { requestId: "r1", startedAt: started, now: at(31) });
  assert.match(r.line, /could not be checked \(the Windows machine has not answered after 30 minutes/);
  assert.equal(r.done, true);

  const none = { request_id: "", updated_at: "2026-11-13T12:00:00Z", anthropic: { state: "missing", reason: "missing", detail: "ANTHROPIC_API_KEY is not saved yet." }, feed: { state: "failed", reason: "token_rejected", detail: "GitHub did not accept the token." },
    forexcom: { state: "missing", reason: "incomplete", detail: "Not all three FOREX.com values are saved yet: missing FOREXCOM_MT5_PASSWORD." } };
  assert.equal(resultLine(none, null).line, "FOREX.com read-only login: not saved yet (Not all three FOREX.com values are saved yet: missing FOREXCOM_MT5_PASSWORD) · Anthropic key: not saved yet · Feed access: does NOT work (GitHub did not accept the token)");
  assert.equal(forexcomPart(doc, { checked_at: "2026-11-16T01:20:00Z", request_id: "", state: "ok" }).state, "ok", "a later weekly check replaces the answer");
});

test("after a check: the steps for the investor password, or that the download is on its way", () => {
  const started = "2026-11-14T10:00:00Z";
  const doc = { request_id: "r1", updated_at: "2026-11-14T10:00:40Z", anthropic: { state: "ok" }, feed: { state: "failed", reason: "no_contents_permission", detail: "the token cannot read the feed." }, forexcom: { state: "checking" } };
  const parts = (login) => resultLine(doc, login, { requestId: "r1", startedAt: started, now: Date.parse(started) + 9 * 60000 }).parts;

  // the login works but its password could trade: the exact steps, in order, and no talk of a download
  let next = whatNext(parts({ checked_at: "2026-11-14T10:08:00Z", request_id: "r1", state: "failed", reason: "not_read_only", demo: true, detail: "The login works, but it is the trading password of a demo account." }));
  assert.equal(next.kind, "investor");
  assert.match(next.title, /^The login itself works\./);
  assert.deepEqual(next.items, INVESTOR_STEPS);
  assert.match(next.after, /a line called Investor\. That Investor line is the password for this box/);
  assert.match(INVESTOR_STEPS[1], /choose the investor password, not the master one/);
  assert.match(INVESTOR_STEPS[4], /only FOREXCOM_MT5_PASSWORD, with the NEW investor password, not the one you log in with/);
  assert.ok(INVESTOR_STEPS.every((s) => !/trading password in|send .* to Claude/i.test(s)));

  // the login passes: the download is on its way even though the optional feed token does not work
  next = whatNext(parts({ checked_at: "2026-11-14T10:08:00Z", request_id: "r1", state: "ok" }));
  assert.equal(next.kind, "downloading");
  assert.match(next.title, /^The FOREX\.com login works\. The engine is now downloading the FOREX\.com price history/);
  assert.deepEqual(next.items, ["The feed is optional: it only adds the VPS's recorded alerts and research. Backtests and HSN Capital work without it."]);
  next = whatNext({ forexcom: { state: "ok" }, anthropic: { state: "ok" }, feed: { state: "ok" } });
  assert.match(next.title, /^All three work\./);
  assert.deepEqual(next.items, []);
  next = whatNext({ forexcom: { state: "ok" }, anthropic: { state: "failed" }, feed: { state: "ok" } });
  assert.deepEqual(next.items, ["HSN Capital also needs the Anthropic key to work before it can start."]);

  // anything else adds nothing to the one line: still checking, a wrong login, a machine that could not start MetaTrader
  assert.equal(whatNext(parts(null)), null);
  assert.equal(whatNext(parts({ checked_at: "2026-11-14T10:08:00Z", request_id: "r1", state: "failed", reason: "login_refused", detail: "FOREX.com refused the login." })), null);
  assert.equal(whatNext(parts({ checked_at: "2026-11-14T10:08:00Z", request_id: "r1", state: "failed", reason: "machine_failed", detail: "GitHub's Windows machine could not start MetaTrader 5." })), null);
  assert.equal(whatNext(), null);
});

test("the page's own code: no logging, no storage of values, no outside address", () => {
  const drop = readFileSync(new URL("../js/drop.js", import.meta.url), "utf8");
  const setup = readFileSync(new URL("../js/setup.js", import.meta.url), "utf8");
  const sealed = readFileSync(new URL("../js/sealedbox.js", import.meta.url), "utf8");
  const code = (text) => text.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n");
  for (const [name, text] of [["drop.js", drop], ["setup.js", setup], ["sealedbox.js", sealed]]) {
    assert.doesNotMatch(code(text), /console\.|sessionStorage|indexedDB|document\.cookie|innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function|sendBeacon|XMLHttpRequest|WebSocket|EventSource|postMessage|window\.open|\.src\s*=/, name);
  }
  assert.doesNotMatch(code(drop), /localStorage/, "the logic stores nothing at all");
  assert.equal((code(setup).match(/localStorage\.setItem/g) || []).length, 1, "the page writes one thing to this device: the lock flag");
  assert.match(setup, /localStorage\.setItem\(FLAG, JSON\.stringify\(data\)\)/);
  assert.equal((code(drop).match(/fetchImpl\(/g) || []).length, 1, "one place talks to the network");
  assert.match(drop, /fetchImpl\(`\$\{API\}\$\{path\}`, init\)/);
  assert.match(drop, /export const API = "https:\/\/api\.github\.com";/);
  const addresses = [...(drop + setup + sealed).matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => new URL(m[0]).host);
  assert.deepEqual([...new Set(addresses)].sort(), ["api.github.com", "github.com", "platform.claude.com"], "links to GitHub and the Claude Console; calls to api.github.com only");
  assert.match(setup, /type: "password"/);
  assert.match(setup, /autocomplete: "off"/);
  assert.doesNotMatch(code(setup), /h\("form"/, "no form element: nothing for the browser to offer to remember");
});

test("the site's safety header lets it talk to api.github.com and nothing else, and loads only its own scripts", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  const rules = Object.fromEntries(csp.split(";").map((r) => r.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(" ")]));
  assert.equal(rules["default-src"], "'none'");
  assert.equal(rules["script-src"], "'self'");
  assert.equal(rules["connect-src"], "https://api.github.com");
  assert.equal(rules["form-action"], "'none'");
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [' type="module" src="js/app.js"']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "no inline event handlers");
  for (const file of ["github.js", "drop.js"]) {
    const text = readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8");
    const sent = [...text.matchAll(/["']?(X-[A-Za-z-]+)["']?\s*:/g)].map((m) => m[1]);
    assert.deepEqual(sent, [], `${file} sends no extra request header that GitHub's cross-origin rules might refuse`);
  }
  assert.match(html, /data-view="setup"/);
  assert.match(html, /id="view-setup"/);
});
