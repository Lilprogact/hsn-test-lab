// HSN Test Lab — app shell: lock, token, navigation, shared status (clock, trial mode), run dispatch and polling.
import * as vault from "./vault.js";
import * as gh from "./github.js";
import { h, notice, openModal, closeModal } from "./ui.js";
import { MarketHours, renderClockBar } from "./clock.js";
import { BacktestView } from "./backtest.js";
import { MillionView } from "./million.js";
import { PaperView } from "./paper.js";
import { FirmView } from "./firm.js";
import { RunsView } from "./runs.js";
import { SettingsView } from "./settings.js";

export const state = {
  token: null,
  owner: null,
  config: null,          // engine config.json
  calendar: null,        // status/market_calendar.json
  coverage: null,        // status/data_coverage.json
  match: null,           // status/data_match.json
  minutes: null,
  animations: localStorage.getItem("hsn.animations") !== "off",
  hours: { XAUUSD: MarketHours.defaultFor("XAUUSD"), NAS100: MarketHours.defaultFor("NAS100") },
};

const views = {};
let current = "backtest";
let clockTimer = null;

// ── lock flow ──────────────────────────────────────────────────────────────
const lockEl = document.getElementById("lock");
const createForm = document.getElementById("lock-create");
const unlockForm = document.getElementById("lock-unlock");

function showLock() {
  lockEl.hidden = false;
  document.querySelector(".main").style.visibility = "hidden";
  if (!vault.supported()) { document.getElementById("lock-unsupported").hidden = false; return; }
  const st = vault.state();
  createForm.hidden = st !== "no_password";
  unlockForm.hidden = st === "no_password";
  setTimeout(() => (st === "no_password" ? document.getElementById("create-pass-1") : document.getElementById("unlock-pass")).focus(), 50);
}

async function unlocked() {
  lockEl.hidden = true;
  document.querySelector(".main").style.visibility = "visible";
  state.token = await vault.getToken();
  state.owner = vault.tokenMeta().owner;
  for (const v of Object.values(views)) v.onUnlock?.();
  if (!state.token) {
    notice("Paste your GitHub token in Settings to connect to hsn-test-lab-engine. Nothing loads without it.", "warn");
    switchView("settings");
  } else {
    notice("");
    await loadShared();
    switchView(current);
  }
  startClock();
}

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const p1 = document.getElementById("create-pass-1").value, p2 = document.getElementById("create-pass-2").value;
  const err = document.getElementById("create-error");
  if (p1 !== p2) { err.textContent = "The two passwords don't match."; err.hidden = false; return; }
  try { await vault.setPassword(p1); err.hidden = true; await unlocked(); } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});
unlockForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("unlock-error");
  try { await vault.unlock(document.getElementById("unlock-pass").value); err.hidden = true; document.getElementById("unlock-pass").value = ""; await unlocked(); }
  catch (ex) { err.textContent = ex.message; err.hidden = false; }
});
document.getElementById("forgot-password").addEventListener("click", () => {
  if (confirm("Clear this device? Your saved token is deleted and you set a new password. Nothing on GitHub changes.")) { vault.resetDevice(); showLock(); }
});
document.getElementById("lock-now").addEventListener("click", () => vault.lock("manual"));
vault.onLock(() => { state.token = null; stopClock(); showLock(); });
["click", "keydown", "touchstart"].forEach((ev) => document.addEventListener(ev, () => vault.noteActivity(), { passive: true }));
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

// ── navigation ─────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
export function switchView(name) {
  current = name;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `view-${name}`));
  views[name]?.show?.();
  window.scrollTo({ top: 0 });
}

// ── shared status ──────────────────────────────────────────────────────────
export async function loadShared() {
  if (!state.token || !state.owner) return;
  try {
    const [cfg, cal, cov, match, mins] = await Promise.all([
      gh.getJson(state.token, state.owner, "config.json"),
      gh.getJson(state.token, state.owner, "status/market_calendar.json"),
      gh.getJson(state.token, state.owner, "status/data_coverage.json"),
      gh.getJson(state.token, state.owner, "status/data_match.json"),
      gh.getJson(state.token, state.owner, "status/minutes.json"),
    ]);
    state.config = cfg || {};
    state.calendar = cal; state.coverage = cov; state.match = match; state.minutes = mins;
    if (cal && cal.symbols) {
      for (const sym of ["XAUUSD", "NAS100"]) if (cal.symbols[sym]) state.hours[sym] = MarketHours.fromJson(cal.symbols[sym]);
    }
    renderTrialNotice();
    renderClock();
  } catch (error) {
    notice(error.message, error.kind === "token" ? "bad" : "warn");
  }
}

export function trialMode() {
  if (!state.match) return { trial: true, reason: "No TradingView match check has been run yet." };
  if (!state.match.passes) return { trial: true, reason: state.match.reason || "The Python port does not yet match the TradingView exports." };
  if (!state.match.mt5_passes) return { trial: true, reason: "MT5 history has not yet been shown to agree with the TradingView exports (results use the exports)." };
  return { trial: false, reason: "" };
}

function renderTrialNotice() {
  const el = document.getElementById("trial-notice");
  const t = trialMode();
  const cov = state.coverage?.symbols?.XAUUSD;
  if (!cov || !cov.months) {
    el.textContent = "No price data in the engine yet. Export FOREXCOM:XAUUSD from TradingView (indicator on, ISO time, UTC) and upload it to hsn-test-lab-engine/data/exports/, or install the VPS data job. Nothing can run until then.";
    el.hidden = false; return;
  }
  if (t.trial) { el.textContent = `TRIAL MODE — results are provisional: ${t.reason}`; el.hidden = false; }
  else el.hidden = true;
}

function renderClock() {
  renderClockBar(document.getElementById("clockbar"), state.hours, views.paper?.currentMarketType?.() || null);
}
function startClock() { stopClock(); renderClock(); clockTimer = setInterval(renderClock, 30000); }
function stopClock() { if (clockTimer) clearInterval(clockTimer); clockTimer = null; }

// ── runs: dispatch + poll ──────────────────────────────────────────────────
/**
 * Start a Run workflow and poll until result.json appears. onProgress(info) is called with
 * {phase, live, run, resultReady}. Returns the result.json.
 */
export async function startRun(mode, settings, onProgress, { prefix = mode } = {}) {
  const requestId = gh.newRequestId(prefix);
  const runName = `Run ${requestId} (${mode})`;
  await gh.dispatch(state.token, state.owner, gh.RUN_WORKFLOW, { request_id: requestId, mode, settings: JSON.stringify(settings) });
  onProgress?.({ phase: "queued", requestId });
  let run = null, tries = 0;
  const started = Date.now();
  while (Date.now() - started < 40 * 60 * 1000) {
    await sleep(run ? 10000 : 5000);
    tries += 1;
    try {
      if (!run) {
        run = await gh.findRun(state.token, state.owner, gh.RUN_WORKFLOW, runName);
        if (!run && tries > 12) throw new gh.GitHubError("The run was requested but GitHub hasn't shown it yet. Check the Actions tab of hsn-test-lab-engine.", 0, "other");
      } else {
        run = await gh.getRun(state.token, state.owner, run.id);
      }
      let live = null;
      try { live = await gh.getJson(state.token, state.owner, "status/live.json", "live"); } catch { live = null; }
      if (live && live.request_id !== requestId) live = null;
      const phase = run ? (run.status === "completed" ? "done" : (live?.stage ? "running" : "starting")) : "queued";
      onProgress?.({ phase, live, run, requestId });
      if (run && run.status === "completed") {
        for (let k = 0; k < 6; k++) {
          const result = await gh.getJson(state.token, state.owner, `results/${requestId}/result.json`);
          if (result) { onProgress?.({ phase: "done", run, requestId, result }); return { requestId, result, run }; }
          await sleep(5000);
        }
        throw new gh.GitHubError(`The run finished (${run.conclusion}) but wrote no result file. See the run log in Actions.`, 0, "other");
      }
    } catch (error) {
      if (error.kind === "rate" || error.kind === "network") { onProgress?.({ phase: "waiting", error: error.message, requestId }); continue; }
      throw error;
    }
  }
  throw new gh.GitHubError("Timed out waiting for the run.", 0, "other");
}

export async function startSettingsWorkflow(payload) {
  const requestId = gh.newRequestId("settings");
  await gh.dispatch(state.token, state.owner, gh.SETTINGS_WORKFLOW, { payload: JSON.stringify(payload), request_id: requestId });
  return requestId;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function liveText(live) {
  if (!live) return "";
  const bits = [live.stage];
  if (live.percent !== undefined) bits.push(`${live.percent}%`);
  if (live.runs_done !== undefined) bits.push(`run ${live.runs_done}/${live.runs_total}`);
  if (live.turns_done !== undefined) bits.push(`${live.turns_done}/${live.turns} agents thought`);
  if (live.elapsed_s !== undefined) bits.push(`${Math.round(live.elapsed_s / 60)} min`);
  return bits.join(" · ");
}

// ── boot ────────────────────────────────────────────────────────────────────
views.backtest = new BacktestView(document.getElementById("view-backtest"));
views.million = new MillionView(document.getElementById("view-million"));
views.paper = new PaperView(document.getElementById("view-paper"));
views.firm = new FirmView(document.getElementById("view-firm"));
views.runs = new RunsView(document.getElementById("view-runs"), (rid, mode) => { switchView(mode === "million" ? "million" : "backtest"); views[mode === "million" ? "million" : "backtest"].openResult?.(rid); });
views.settings = new SettingsView(document.getElementById("view-settings"), { onTokenSaved: async () => { state.token = await vault.getToken(); state.owner = vault.tokenMeta().owner; notice(""); await loadShared(); } });

(async () => {
  if (await vault.resumeSession()) await unlocked(); else showLock();
})();
