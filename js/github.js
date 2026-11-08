// Thin GitHub REST client for hsn-test-lab-engine. The token comes from the vault; nothing is stored here.
// The token needs: Actions read+write (to start runs and read their progress), Contents read-only (to read
// results). Settings and strategies are saved through workflows, so the token can never change code.

const API = "https://api.github.com";
export const ENGINE_REPO = "hsn-test-lab-engine";
export const RUN_WORKFLOW = "run.yml";
export const FIRM_WORKFLOW = "firm-cycle.yml";
export const SETTINGS_WORKFLOW = "save-settings.yml";
export const DATA_WORKFLOW = "data-check.yml";
export const MT5_WORKFLOW = "data-mt5.yml";

export class GitHubError extends Error {
  constructor(message, status, kind) {
    super(message);
    this.status = status;
    this.kind = kind; // token | forbidden | notfound | rate | network | other
  }
}

function classify(status, body) {
  const message = (body && body.message) || `GitHub returned ${status}`;
  if (status === 401) return new GitHubError("Your GitHub token was rejected. It may have expired or been revoked.", status, "token");
  if (status === 403 && /rate limit/i.test(message)) return new GitHubError("GitHub's rate limit was hit. Wait a few minutes and try again.", status, "rate");
  if (status === 403) return new GitHubError("Your token doesn't have permission for that. It needs Actions: read and write, and Contents: read-only on hsn-test-lab-engine.", status, "forbidden");
  if (status === 404) return new GitHubError("Not found. Check that hsn-test-lab-engine exists and the token can see it.", status, "notfound");
  return new GitHubError(message, status, "other");
}

export async function api(token, path, { method = "GET", body, raw = false, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...headers,
    },
    cache: "no-store",
  };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(`${API}${path}`, init);
  } catch {
    throw new GitHubError("Couldn't reach GitHub. Check your connection.", 0, "network");
  }
  const expiry = response.headers.get("github-authentication-token-expiration");
  if (response.status === 204) return { data: null, expiry };
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = raw ? text : null;
    }
  }
  if (!response.ok) throw classify(response.status, data);
  return { data, expiry, status: response.status };
}

export async function whoami(token) {
  const { data, expiry } = await api(token, "/user");
  return { login: data.login, expiry };
}

export async function checkEngineAccess(token, owner) {
  const { data } = await api(token, `/repos/${owner}/${ENGINE_REPO}`);
  return { name: data.full_name, private: data.private, defaultBranch: data.default_branch };
}

export async function dispatch(token, owner, workflow, inputs, ref = "main") {
  await api(token, `/repos/${owner}/${ENGINE_REPO}/actions/workflows/${workflow}/dispatches`, { method: "POST", body: { ref, inputs } });
}

export async function findRun(token, owner, workflow, runName) {
  const { data } = await api(token, `/repos/${owner}/${ENGINE_REPO}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=30`);
  const runs = (data && data.workflow_runs) || [];
  return runs.find((run) => run.name === runName || run.display_title === runName) || null;
}

export async function getRun(token, owner, runId) {
  const { data } = await api(token, `/repos/${owner}/${ENGINE_REPO}/actions/runs/${runId}`);
  return data;
}

export async function runSteps(token, owner, runId) {
  const { data } = await api(token, `/repos/${owner}/${ENGINE_REPO}/actions/runs/${runId}/jobs?per_page=10`);
  const jobs = (data && data.jobs) || [];
  const steps = [];
  for (const job of jobs) for (const step of job.steps || []) steps.push({ job: job.name, ...step });
  return { jobs, steps };
}

export async function listRecentRuns(token, owner, workflow, perPage = 20) {
  const { data } = await api(token, `/repos/${owner}/${ENGINE_REPO}/actions/workflows/${workflow}/runs?per_page=${perPage}`);
  return (data && data.workflow_runs) || [];
}

export async function activeRuns(token, owner) {
  const { data } = await api(token, `/repos/${owner}/${ENGINE_REPO}/actions/runs?per_page=20`);
  return ((data && data.workflow_runs) || []).filter((r) => r.status === "queued" || r.status === "in_progress" || r.status === "waiting");
}

/** Read a JSON file from the engine repo (any branch). Returns null when it doesn't exist. */
export async function getJson(token, owner, path, ref = "main") {
  try {
    const { data } = await api(token, `/repos/${owner}/${ENGINE_REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}&t=${Date.now()}`, { raw: true });
    if (typeof data === "string") return JSON.parse(data);
    return data;
  } catch (error) {
    if (error.kind === "notfound") return null;
    throw error;
  }
}

/** Read a text file (markdown, csv) from the engine repo. */
export async function getText(token, owner, path, ref = "main") {
  try {
    const { data } = await api(token, `/repos/${owner}/${ENGINE_REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}&t=${Date.now()}`, { raw: true });
    return typeof data === "string" ? data : JSON.stringify(data);
  } catch (error) {
    if (error.kind === "notfound") return null;
    throw error;
  }
}

/** Read a gzipped text file (e.g. waves_decisions.jsonl.gz) from the engine repo: the raw bytes, inflated in the
 *  browser (DecompressionStream, Safari 16.4+ / Chrome 80+). Returns null when it doesn't exist. */
export async function getGzipText(token, owner, path, ref = "main") {
  let response;
  try {
    response = await fetch(`${API}/repos/${owner}/${ENGINE_REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}&t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28" }, cache: "no-store" });
  } catch {
    throw new GitHubError("Couldn't reach GitHub. Check your connection.", 0, "network");
  }
  if (response.status === 404) return null;
  if (!response.ok) throw classify(response.status, null);
  if (typeof DecompressionStream === "undefined") throw new GitHubError("This browser can't inflate gzip files; open the file from the Actions run instead.", 0, "other");
  const inflated = response.body.pipeThrough(new DecompressionStream("gzip"));
  return await new Response(inflated).text();
}

/** List a directory in the engine repo. */
export async function listDir(token, owner, path, ref = "main") {
  try {
    const { data } = await api(token, `/repos/${owner}/${ENGINE_REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}&t=${Date.now()}`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.kind === "notfound") return [];
    throw error;
  }
}

/** Download URL for a results file (so a CSV can be opened/downloaded with the token in a fetch, then saved). */
export async function downloadBlob(token, owner, path, ref = "main") {
  const response = await fetch(`${API}/repos/${owner}/${ENGINE_REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}&t=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store",
  });
  if (!response.ok) throw classify(response.status, null);
  return response.blob();
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function phaseFromSteps(run, steps) {
  if (!run) return "queued";
  if (run.status === "queued" || run.status === "waiting" || run.status === "pending") return "queued";
  if (run.status === "completed") return "done";
  const active = steps.find((s) => s.status === "in_progress") || [...steps].reverse().find((s) => s.status === "completed");
  if (!active) return "starting";
  const name = (active.name || "").toLowerCase();
  if (name.startsWith("run the engine") || name.startsWith("run the cycle")) return "running";
  if (/summary|commit|write the strategy|sandbox|record/.test(name)) return "finishing";
  return "starting";
}

export function newRequestId(prefix) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${stamp}-${rnd}`;
}
