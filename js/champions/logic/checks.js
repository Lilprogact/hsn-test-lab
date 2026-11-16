// The five checks as lines, each {ok, title, detail, todo, button, unread?}: the FOREX.com login, the gold prices, the
// indicator against TradingView, the five agents' copies and re-runs, and the forward test. `out` holds the files that
// were read and `failed` the ones that could not be (with the reason). A file that could not be read is never guessed.
import { loginLine, pricesLine, goldTo, indicatorLine, agentsLine } from "./check.js";
import { forwardLine } from "./forward.js";

export function storedPrices(out, failed) {
  if (failed.coverage && failed.cloud) return null;
  const gold = goldTo(failed.coverage ? null : out.coverage, failed.cloud ? null : out.cloud);
  return { to: (gold && gold.last) || null, at: (!failed.cloud && out.cloud && out.cloud.at) || (!failed.coverage && out.coverage && out.coverage.checked_at) || null };
}

export function checkLines(out, failed, now, zone) {
  const unread = (key, what) => ({ ok: false, unread: true, title: `${what} could not be read`, detail: failed[key].message, todo: null, button: null });
  const lines = [
    failed.login ? unread("login", "The login check") : loginLine(out.login, now, zone),
    failed.coverage && failed.cloud ? unread("coverage", "The price files") : pricesLine(failed.coverage ? null : out.coverage, failed.cloud ? null : out.cloud, now, zone),
    failed.match ? unread("match", "The TradingView check") : indicatorLine(out.match, zone),
    failed.agents ? unread("agents", "The agents' check file") : agentsLine(out.agents, failed.coverage ? null : out.coverage, zone),
    failed.score ? unread("score", "The forward test's score") : forwardLine(out.score, failed.card ? null : out.card, storedPrices(out, failed), now, zone),
  ];
  const fixes = new Set();                                   // one fix is said once, on the first line it mends
  for (const l of lines) if (!l.ok && l.todo) { l.sameFixAsAbove = fixes.has(l.todo); fixes.add(l.todo); }
  return lines;
}

/** "5 of 5 pass", and the first thing that needs doing when one does not. */
export function checksSummary(lines) {
  const ok = lines.filter((l) => l.ok).length;
  const bad = lines.find((l) => !l.ok);
  return { ok, all: lines.length, allOk: ok === lines.length, text: `${ok} of ${lines.length}`, caption: ok === lines.length ? "checks pass" : ok === 0 && lines.every((l) => l.unread) ? "could be read" : "checks pass",
           first: bad ? bad.title : "Login, prices, indicator, agents and the forward test." };
}
