// One-time setup: put the Test Lab's five logins into GitHub Actions secrets from this browser, in one go.
//
// What this page does with a value: holds it in a hidden box, seals it in this browser with the engine repository's
// public key (js/sealedbox.js, libraries bundled in js/vendor/), and sends the sealed box to api.github.com. That is
// all. It does not log it, store it, show it, put it in a URL, or send it anywhere else; js/drop.js holds the logic
// and the tests hold it to that. After a Send the boxes are emptied and the page locks: it opens again only with
// the site password, and only to replace a value.
import * as vault from "./vault.js";
import * as gh from "./github.js";
import { state } from "./app.js";
import { ukDateTime } from "./clock.js";
import { h, card, badge } from "./ui.js";
import { FIELDS, SECRET_NAMES, CHECK_WORKFLOW, ENGINE_REPO, FEED_REPO, hint, review, sendSecrets, DropError, ownerFromHost, resultLine } from "./drop.js";

const FLAG = "hsn.setup.v1";               // on this device: names with Saved / Failed, and the time. Never a value.
const IDLE_MS = 60 * 60 * 1000;            // boxes left untouched this long are emptied; after 30 idle minutes the site's own lock already hides them
const POLL_MS = 15000;
const KEY_LINK = "https://github.com/settings/personal-access-tokens/new?name=Test+Lab+one-time+key&description=Used+once+by+the+Test+Lab+setup+page%2C+then+destroyed&expires_in=1&secrets=write";
const FEED_LINK = "https://github.com/settings/personal-access-tokens/new?name=Test+Lab+feed+read-only&description=Lets+the+Test+Lab+engine+read+the+weekly+feed.+Read-only.&expires_in=90&contents=read";
const TOKENS_PAGE = "https://github.com/settings/personal-access-tokens";
const CONSOLE_KEYS = "https://platform.claude.com/settings/keys";

function readFlag() {
  try {
    const raw = localStorage.getItem(FLAG);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}
function writeFlag(data) {
  try { localStorage.setItem(FLAG, JSON.stringify(data)); } catch { /* the lock then lasts until the page is reloaded */ }
}
const rnd = () => "f" + Math.random().toString(36).slice(2, 10);
const link = (href, text) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);

/** A hidden box: secure text entry, nothing remembered or suggested by the browser or a password manager. */
function secretBox(describedBy, keyboard) {
  return h("input", {
    type: "password", id: rnd(), name: rnd(), class: "drop-input", autocomplete: "off", autocapitalize: "none", autocorrect: "off", spellcheck: "false",
    inputmode: keyboard || null, enterkeyhint: "next", "aria-describedby": describedBy, "data-1p-ignore": "", "data-lpignore": "true", "data-bwignore": "true", "data-form-type": "other",
  });
}

export class SetupView {
  constructor(root) {
    this.root = root;
    this.mode = null;            // "form" | "locked"
    this.replace = false;        // the form was reopened with the password, to replace a value
    this.busy = false;
    this.inputs = {};
    this.keyInput = null;
    this.lastTouched = 0;
    this.idleTimer = null;
    this.pollTimer = null;
    this.remote = { doc: null, login: null, setup: null };
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.checkIdle(); });
    // leaving the page for good destroys its memory anyway; if the browser instead keeps the page for the Back button, empty the boxes first
    window.addEventListener("pagehide", (e) => { if (e.persisted) this.wipe(); });
  }

  // ── life cycle ────────────────────────────────────────────────────────────
  onUnlock() {}
  /** The site locked. Tapping Lock empties the boxes. When the site locks by itself after 30 idle minutes (he is in
   *  another tab fetching a value), the boxes are kept, out of sight and out of reach behind the password, until
   *  they have gone 60 minutes without typing. */
  onLock(reason) {
    this.stopPolling();
    if (reason === "idle") return;
    this.wipe();
    if (this.replace) { this.replace = false; this.mode = "locked"; }
  }
  hide() { this.stopPolling(); }

  async show() {
    if (this.busy) return;
    const flag = readFlag();
    if (!this.mode) this.mode = flag ? "locked" : "form";
    if (this.mode === "locked" || !this.inputs.FOREXCOM_MT5_LOGIN) this.render();
    await this.loadRemote();
    // set up before on another device? then this one starts locked too (unless boxes are already being filled here)
    if (this.mode === "form" && !this.replace && !this.hasText() && this.anyPresent()) { this.mode = "locked"; this.render(); }
    else if (this.mode === "locked") this.renderLocked();
    this.resumePolling();
  }

  hasText() {
    return Object.values(this.inputs).some((i) => i.value) || !!this.keyInput?.value;
  }

  anyPresent() {
    const present = this.present();
    return !!present && SECRET_NAMES.some((n) => present[n]);
  }

  /** {NAME: true/false} from the engine's own yes / no report, or null when it cannot be read (no site token yet). */
  present() {
    const fromCheck = this.remote.doc?.present, fromSetup = this.remote.setup?.secrets?.names;
    if (fromCheck && fromSetup) return String(this.remote.doc.updated_at || "") >= String(this.remote.setup.checked_at || "") ? fromCheck : fromSetup;
    return fromCheck || fromSetup || null;
  }

  async loadRemote() {
    if (!state.token || !state.owner) return;
    try {
      const [doc, login, setup] = await Promise.all([
        gh.getJson(state.token, state.owner, "status/secrets_check.json"),
        gh.getJson(state.token, state.owner, "status/forexcom_login.json"),
        gh.getJson(state.token, state.owner, "status/setup.json"),
      ]);
      this.remote = { doc, login, setup };
    } catch { /* shown as "not known" */ }
  }

  // ── emptying the boxes ────────────────────────────────────────────────────
  wipe() {
    for (const i of Object.values(this.inputs)) { i.value = ""; i.dispatchEvent(new Event("input")); }
    if (this.keyInput) { this.keyInput.value = ""; this.keyInput.dispatchEvent(new Event("input")); }
    this.confirmed = null;
    clearTimeout(this.idleTimer);
  }

  touched() {
    this.lastTouched = Date.now();
    this.confirmed = null;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.checkIdle(), IDLE_MS + 1000);
  }

  checkIdle() {
    if (this.busy || !this.hasText() || Date.now() - this.lastTouched < IDLE_MS) return;
    this.wipe();
    if (this.replace) { this.replace = false; this.mode = "locked"; this.render(); return; }
    this.say("warn", "The boxes were emptied after 60 minutes without typing. Nothing was sent.");
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  render() {
    this.inputs = {};
    this.keyInput = null;
    if (this.mode === "locked") { this.root.replaceChildren(h("div", { class: "drop" }, this.lockedEl = h("div"))); this.renderLocked(); return; }
    this.renderForm();
  }

  say(kind, title, items = []) {
    if (!this.msg) return;
    if (!title) { this.msg.hidden = true; this.msg.replaceChildren(); return; }
    this.msg.className = `notice drop-msg ${kind}`;
    const parts = [h("strong", {}, title)];
    if (items.length) parts.push(h("ul", {}, ...items.map((t) => h("li", {}, t))));
    this.msg.replaceChildren(...parts);
    this.msg.hidden = false;
    this.msg.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  renderForm() {
    const rows = FIELDS.map((f) => {
      const noteId = rnd();
      const input = secretBox(noteId, f.keyboard);
      const note = h("span", { class: "drop-hint", id: noteId });
      input.addEventListener("input", () => {
        const hn = hint(f.name, input.value);
        note.textContent = hn.text;
        note.className = `drop-hint ${hn.level}`;
        if (input.value) this.touched();
        this.updateSend();
      });
      this.inputs[f.name] = input;
      return h("div", { class: "drop-row" },
        h("label", { for: input.id }, h("span", { class: "drop-name mono" }, f.name), h("span", { class: "drop-what" }, f.what)),
        input, note, this.whereToFind(f.name));
    });

    const keyNote = h("span", { class: "drop-hint", id: rnd() });
    this.keyInput = secretBox(keyNote.id);
    this.keyInput.addEventListener("input", () => {
      const hn = hint("ONE_TIME_KEY", this.keyInput.value);
      keyNote.textContent = hn.text;
      keyNote.className = `drop-hint ${hn.level}`;
      if (this.keyInput.value) this.touched();
      this.updateSend();
    });
    // Enter moves to the next box (there is no form to submit, so the browser has nothing to offer to remember)
    const order = [...FIELDS.map((f) => this.inputs[f.name]), this.keyInput];
    order.forEach((el, i) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); (order[i + 1] || this.sendBtn).focus(); } }));

    this.sendBtn = h("button", { type: "button", class: "primary drop-send", onclick: () => this.onSend() }, "Send");
    this.msg = h("div", { class: "notice drop-msg", role: "alert", hidden: true });
    this.progressEl = h("div", { class: "drop-progress", "aria-live": "polite" });
    const clearBtn = h("button", { type: "button", class: "secondary", onclick: () => { this.wipe(); this.say("", ""); } }, "Empty every box");
    const lockBtn = this.replace ? h("button", { type: "button", class: "secondary", onclick: () => { this.wipe(); this.replace = false; this.mode = "locked"; this.render(); } }, "Lock again without sending") : null;

    const intro = this.replace
      ? card("Replace a value", h("p", {}, "Fill in only the boxes you want to replace. An empty box leaves that secret exactly as it is in GitHub. You need a new one-time key; the old one was destroyed."))
      : card("One-time setup", h("p", {}, "Put the Test Lab's five logins into GitHub in one go. Each value is sealed inside this browser with the engine's public key and sent straight to GitHub's secrets. After that nobody can read it back: not this site, not Claude, not even GitHub's own pages."),
          h("details", {}, h("summary", {}, "How it stays private"), h("ul", {},
            h("li", {}, "The sealing is done here, by code that is part of this site. No outside script is loaded."),
            h("li", {}, "The sealed values go to api.github.com and nowhere else. This site can talk to no other address."),
            h("li", {}, "Nothing you type is saved on this device or shown again. The boxes are emptied as soon as the first value has gone through, when you tap Lock, when the page is reloaded, and after 60 minutes without typing."),
            h("li", {}, "The boxes stay hidden, with the browser's autofill and suggestions switched off. If Safari offers to save a password, tap Not Now."),
            h("li", {}, "Send also wipes your clipboard where the browser allows it, so the last thing you copied is not left lying there."))));

    const keyCard = card("Last box: the one-time key",
      h("p", {}, "GitHub only lets a key that you made save secrets. This key is used for this one Send and then destroyed by the page. GitHub will email you that a token was revoked: that is this page cleaning up, not a problem."),
      h("div", { class: "drop-row" },
        h("label", { for: this.keyInput.id }, h("span", { class: "drop-name" }, "One-time key"), h("span", { class: "drop-what" }, "A GitHub token starting with github_pat_. Not the site token from Settings.")),
        this.keyInput, keyNote),
      h("details", { open: !this.replace || null }, h("summary", {}, "How to make it (about a minute)"), h("ol", {},
        h("li", {}, link(KEY_LINK, "Open GitHub's new-token page"), ". The name, a 1-day expiry and the one permission are already filled in. GitHub may ask for your password first."),
        h("li", {}, "Under Repository access tick ", h("strong", {}, "Only select repositories"), " and choose ", h("strong", {}, ENGINE_REPO), " (only that one)."),
        h("li", {}, "Under Permissions check it shows ", h("strong", {}, "Secrets"), " set to ", h("strong", {}, "Read and write"), ", and nothing else. (Metadata: Read-only appears by itself. If Secrets is not listed: Add permissions → Secrets, then set its access to Read and write.)"),
        h("li", {}, "Tap ", h("strong", {}, "Generate token"), " (and again if GitHub asks you to confirm), copy the token, come back to this tab and paste it in the box above."))));

    this.root.replaceChildren(h("div", { class: "drop" }, intro,
      card(this.replace ? "The values to replace" : "The five logins", ...rows),
      keyCard,
      card(null, this.msg, h("div", { class: "row drop-actions" }, this.sendBtn, clearBtn, lockBtn), this.progressEl,
        h("p", { class: "help" }, "Send checks the key first. If GitHub does not accept the key, nothing is sent and your boxes are kept so you can fix the key and tap Send again."))));
    this.updateSend();
  }

  whereToFind(name) {
    const d = (summary, ...body) => h("details", { class: "drop-where" }, h("summary", {}, summary), ...body);
    if (name === "FOREXCOM_MT5_LOGIN") return d("Where do I find it?", h("p", {}, "FOREX.com emails the MetaTrader 5 account number when the account is opened. MetaTrader 5 also shows it next to the account's name."));
    if (name === "FOREXCOM_MT5_SERVER") return d("Where do I find it?", h("p", {}, "It is in the same FOREX.com email as the login, and MetaTrader 5 shows it beside the account number. Copy it exactly, with its capitals, dashes and any number at the end."));
    if (name === "FOREXCOM_MT5_PASSWORD") return d("Which password is this?", h("p", {}, "The investor password lets a program look but never trade. In MetaTrader 5 it is set under the account's Change password, by choosing the investor (read only) password. The engine checks it: if this box holds a password that could place a trade, the engine refuses to use it and tells you."));
    if (name === "ANTHROPIC_API_KEY") return d("Where do I get it?", h("ol", {},
      h("li", {}, "Open ", link(CONSOLE_KEYS, "the Claude Console, API keys"), " and tap Create key."),
      h("li", {}, "Choose a workspace for it (Default is fine). A key made without a workspace does not work here."),
      h("li", {}, "Expiration: choose Never, or the company stops on the day the key runs out."),
      h("li", {}, "Copy the key (it is shown once) and paste it here. The account also needs credit under Billing.")));
    if (name === "VPS_FEED_READ_TOKEN") return d("Don't have it yet?",
      h("p", {}, "This one is optional. It only works once the feed repository, ", h("strong", {}, FEED_REPO), ", exists on your GitHub and the VPS has published to it. If GitHub does not list that repository when you make the token, it has not been created yet: leave this box empty and add the token later with Replace a value."),
      h("ol", {},
      h("li", {}, link(FEED_LINK, "Open GitHub's new-token page"), " (name, 90 days and Contents: Read-only are already filled in)."),
      h("li", {}, "Under Repository access tick Only select repositories and choose ", h("strong", {}, FEED_REPO), " (only that one)."),
      h("li", {}, "Under Permissions it should show Contents set to Read-only, and nothing else. (If Contents is not listed: Add permissions → Contents, access Read-only.)"),
      h("li", {}, "Generate token, copy it, paste it here. This is a different token from the one-time key below.")));
    return null;
  }

  updateSend() {
    if (!this.sendBtn) return;
    const n = FIELDS.filter((f) => this.inputs[f.name]?.value.trim()).length;
    this.sendBtn.textContent = n ? `Send ${n} value${n === 1 ? "" : "s"} to GitHub` : "Send";
    this.sendBtn.disabled = this.busy;
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  async onSend() {
    if (this.busy) return;
    const values = {};
    for (const f of FIELDS) values[f.name] = this.inputs[f.name].value;
    const r = review({ values, key: this.keyInput.value, siteToken: state.token, firstTime: !this.replace });
    if (r.stop.length) { this.say("bad", "Not sent yet:", r.stop); return; }
    const fingerprint = r.check.join("|");
    if (r.check.length && this.confirmed !== fingerprint) {
      this.confirmed = fingerprint;
      this.say("warn", "Please check these first. If they are right, tap Send again:", r.check);
      return;
    }
    this.busy = true;
    this.updateSend();
    this.say("", "");
    // still inside the tap: overwrite the clipboard so the last copied value is not left there (best effort)
    try { navigator.clipboard?.writeText(" ")?.catch(() => {}); } catch { /* not allowed here: nothing to do */ }
    const send = {};
    for (const n of r.names) send[n] = r.clean[n];
    const lines = {};
    this.progressEl.replaceChildren(h("p", { class: "muted" }, "Checking the one-time key with GitHub…"));
    let out = null;
    try {
      out = await sendSecrets({
        key: r.key, values: send, expectedOwner: ownerFromHost(location.hostname) || state.owner || null,
        onProgress: (p) => {
          if (p.phase === "committed") { this.wipe(); return; }                 // the point of no return: the boxes are emptied
          if (p.phase === "saving") {
            if (!Object.keys(lines).length) this.progressEl.replaceChildren();
            lines[p.name] = h("p", { class: "muted" }, `${p.name}: sealing and sending…`);
            this.progressEl.append(lines[p.name]);
          } else if (p.phase === "confirming") this.progressEl.append(h("p", { class: "muted" }, "Asking GitHub what it now holds…"));
          else if (p.phase === "destroying") this.progressEl.append(h("p", { class: "muted" }, "Destroying the one-time key…"));
        },
      });
    } catch (error) {
      this.busy = false;
      this.updateSend();
      this.progressEl.replaceChildren();
      if (error instanceof DropError) { this.say("bad", error.message); return; }   // nothing was saved; the boxes are kept
      this.wipe();
      this.say("bad", "Something unexpected went wrong inside the page, so it stopped and emptied the boxes. Some values may already have been saved: Settings → Start-up checklist → Re-check now shows which names GitHub holds. To send again you need a new one-time key; delete the old one on GitHub if it is still listed.");
      return;
    }
    this.wipe();
    this.busy = false;
    const results = {};
    for (const n of SECRET_NAMES) results[n] = out.results[n].state;
    const flag = { at: out.finishedAt, results, why: Object.fromEntries(SECRET_NAMES.filter((n) => out.results[n].why).map((n) => [n, out.results[n].why])), key: out.key };
    writeFlag(flag);
    this.replace = false;
    this.mode = "locked";
    this.render();
    window.scrollTo({ top: 0 });
    if (out.saved > 0) await this.startCheck(r.names.filter((n) => out.results[n].state === "saved"));
  }

  // ── locked: names with Saved / Failed, the check's one line, and the door back in ──────────────────────────
  renderLocked() {
    if (this.mode !== "locked" || !this.lockedEl) return;
    const flag = readFlag();
    this.rowsBody = h("tbody");
    this.renderRows();
    const keyLine = !flag ? null
      : flag.key === "destroyed" ? h("p", { class: "good" }, "The one-time key has been destroyed: GitHub confirms it no longer works. GitHub will email you that a token was revoked; that is this.")
      : flag.key === "accepted" ? h("p", { class: "warnc" }, "GitHub accepted the request to destroy the one-time key (it will email you that a token was revoked). It can take a minute to take effect.")
      : h("p", { class: "warnc" }, "The one-time key could not be destroyed from here. Delete it yourself: ", link(TOKENS_PAGE, "GitHub → Fine-grained tokens"), " → Test Lab one-time key → Delete. It expires by itself within a day.");
    const failed = flag && SECRET_NAMES.some((n) => flag.results?.[n] === "failed");

    const pass = h("input", { type: "password", id: rnd(), autocomplete: "current-password", class: "drop-input", enterkeyhint: "go" });
    const passErr = h("p", { class: "error", hidden: true });
    const open = async () => {
      passErr.hidden = true;
      const ok = await vault.checkPassword(pass.value);
      pass.value = "";
      if (!ok) { passErr.textContent = "That password doesn't match."; passErr.hidden = false; return; }
      this.replace = true;
      this.mode = "form";
      this.stopPolling();
      this.render();
      window.scrollTo({ top: 0 });
    };
    pass.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); open(); } });

    this.lineEl = h("p", { class: "drop-line" });
    this.lineMeta = h("p", { class: "muted small" });
    this.nextEl = h("div");
    this.checkBtn = h("button", { type: "button", class: "secondary", onclick: () => this.startCheck([]) }, "Check the logins now");

    this.lockedEl.replaceChildren(
      card("One-time setup", h("p", {}, badge("LOCKED", "good"), flag ? ` Sent ${ukDateTime(flag.at)}. Every box was emptied.` : " The logins were set up from another device."),
        h("div", { class: "table-wrap" }, h("table", { class: "drop-table" }, h("thead", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "This device's last Send"), h("th", {}, "Engine's report"))), this.rowsBody)),
        keyLine,
        failed ? h("p", { class: "warnc" }, "A value that failed was not saved. Open the page below with your password and send just that one again (with a new one-time key).") : null,
        h("p", { class: "help" }, "Only names are kept here, never a value. GitHub itself never shows a secret again either.")),
      card("Do they work?", this.lineEl, this.lineMeta, this.nextEl, h("div", { class: "row" }, this.checkBtn),
        h("p", { class: "help" }, "The engine tries each login: the Anthropic key and the feed token take under a minute; the FOREX.com login needs a Windows machine at GitHub to install MetaTrader 5 and log in read-only, about 8 minutes. Only yes or no and one sentence are recorded.")),
      card("Replace a value", h("p", {}, "The page opens again only with the site password, and only to replace a value."),
        h("div", { class: "row" }, h("label", { class: "field drop-pass", for: pass.id }, h("span", {}, "Site password"), pass), h("button", { type: "button", class: "secondary", onclick: open }, "Open")), passErr));
    this.renderLine();
  }

  /** The names with Saved / Failed, and whether the engine reports each one as present. Never a value. */
  renderRows() {
    if (!this.rowsBody) return;
    const flag = readFlag();
    const present = this.present();
    const word = { saved: ["Saved", "good"], failed: ["Failed", "bad"], left: ["Left as it was", ""] };
    this.rowsBody.replaceChildren(...SECRET_NAMES.map((n) => {
      const [text, kind] = word[flag?.results?.[n]] || ["Not sent from this device", ""];
      return h("tr", {}, h("td", { class: "mono" }, n), h("td", {}, badge(text, kind), flag?.why?.[n] ? h("span", { class: "muted small" }, ` ${flag.why[n]}`) : null),
        h("td", {}, present ? badge(present[n] ? "in GitHub" : "not in GitHub", present[n] ? "good" : "warn") : h("span", { class: "dim" }, "—")));
    }));
  }

  renderLine() {
    if (!this.lineEl) return;
    const flag = readFlag();
    const pending = flag?.request && !flag.requestDone ? flag : null;
    if (this.checkBtn) this.checkBtn.disabled = !!pending;            // one check at a time: a second tap would only queue another
    if (!state.token || !state.owner) {
      this.lineEl.textContent = "To check the logins from here, save the site token under Settings first. Then come back and tap Check the logins now.";
      this.lineMeta.textContent = "";
      return;
    }
    const { doc, login } = this.remote;
    if (!doc && !pending) { this.lineEl.textContent = "Not checked yet."; this.lineMeta.textContent = ""; return; }
    const r = resultLine(doc, login, pending ? { requestId: pending.request, startedAt: pending.requestedAt } : {});
    this.lineEl.textContent = r.line;
    this.lineMeta.textContent = doc && (!pending || doc.request_id === pending.request) ? `Checked ${ukDateTime(doc.updated_at)}${login?.checked_at ? ` · FOREX.com ${ukDateTime(login.checked_at)}` : ""}` : "";
    const p = r.parts || {};
    const allOk = p.forexcom?.state === "ok" && p.anthropic?.state === "ok" && p.feed?.state === "ok";
    this.nextEl.replaceChildren(allOk ? h("p", { class: "good" }, "All three work. The engine is now downloading the FOREX.com price history (10 to 50 minutes the first time; Settings shows it arrive). When you want the company to start: HSN Capital → CEO's office → Resume.") : "");
    if (pending && r.done) { writeFlag({ ...flag, requestDone: true }); this.stopPolling(); if (this.checkBtn) this.checkBtn.disabled = false; }
  }

  async startCheck(names) {
    if (!state.token || !state.owner) { this.renderLine(); return; }
    const flag = readFlag() || { at: new Date().toISOString(), results: {} };
    const requestId = gh.newRequestId("setup");
    try {
      await gh.dispatch(state.token, state.owner, CHECK_WORKFLOW, { request_id: requestId, names: names.join(",") });
    } catch (error) {
      if (this.lineEl) { this.lineEl.textContent = `Could not start the check: ${error.message}`; this.lineMeta.textContent = ""; }
      return;
    }
    writeFlag({ ...flag, request: requestId, requestedAt: new Date().toISOString(), requestDone: false });
    this.renderLine();
    this.resumePolling();
  }

  resumePolling() {
    this.stopPolling();
    const flag = readFlag();
    if (this.mode !== "locked" || !flag?.request || flag.requestDone || !state.token) return;
    if (Date.now() - Date.parse(flag.requestedAt) > 45 * 60 * 1000) { writeFlag({ ...flag, requestDone: true }); this.renderLine(); return; }
    this.pollTimer = setTimeout(async () => {
      await this.loadRemote();
      this.renderRows();          // only the answers are redrawn: a password being typed below is left alone
      this.renderLine();
      this.resumePolling();
    }, POLL_MS);
  }

  stopPolling() {
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }
}
