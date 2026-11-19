// Smart Money Concepts (champions/smc/study.json in the engine): the taught rules, Hassan's indicator used as a
// filter, and three published rules, each tried as taught and the other way round on FOREX.com gold and Nasdaq.
// Words and figures only. Every count, every average and every mark are the engine's own; the page picks rows out
// and decides nothing.
import { inR } from "./edge.js";

const count = (n) => Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n) => WORDS[n] || count(n);
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : "");
const SYMBOLS = [["XAUUSD", "Gold"], ["NAS100", "Nasdaq"]];
const TAUGHT = new Set(["T", "FV", "OB", "LG", "HS"]);
const sign = (v) => (num(v) === null || Number(v) === 0 ? "" : Number(v) > 0 ? "up" : "down");
const cell = (v, places = 2) => ({ text: num(v) === null ? "" : inR(v, places), sign: sign(v) });
const all = (study) => (study && Array.isArray(study.candidates) ? study.candidates : []);
const judged = (c) => !!(c.mark && c.mark.judged);
const made = (c) => judged(c) && Number(c.mark.total_r) > 0;
const pick = (study, symbol, key) => all(study).find((c) => c.id === `${symbol}:${key}`) || null;

/** The ideas the tile's first table shows, in its order: [candidate key, words]. */
export const IDEAS = [
  ["sweep-back-5", "Liquidity sweep, traded back (as taught)"],
  ["sweep-on-5", "Liquidity sweep, traded on (reversed)"],
  ["gap-5", "Fair value gap entry"],
  ["block-5", "Order block entry"],
  ["his-grab-back", "Your indicator's liquidity grab"],
  ["his-marks", "Your Buy and Sell as day trades, target at twice the risk"],
  ["his-marks-run", "Your Buy and Sell as day trades, no target"],
];

/** The study in two sentences: {title, detail, luck, earned}, or null when there is no study on file. */
export function smcHeadline(study) {
  const cands = all(study);
  if (!cands.length) return null;
  const earned = (study.sits_the_exam || []).length, could = cands.filter(judged).length, profit = cands.filter(made).length;
  const rules = Object.values(study.rules || {}).reduce((a, list) => a + (list || []).length, 0);
  const best = cands.filter(judged).reduce((a, c) => Math.max(a, Number(c.mark.t)), -Infinity);
  const lk = study.luck_at_the_gate || {};
  const title = earned === 0
    ? `None of the ${count(cands.length)} ways to trade these ideas made money beyond luck.`
    : `${earned === 1 ? "One" : `${word(earned)[0].toUpperCase()}${word(earned).slice(1)}`} of the ${count(cands.length)} ways to trade these ideas earned the exam.`;
  const detail = `${count(rules)} fixed rules, ${count(study.trades)} trades on the 42 study months, each also taken the other way round, all judged by the Engine after the real spread. `
    + `${count(could)} of the ${count(cands.length)} had enough trades to be judged; ${profit === 0 ? "none" : word(profit)} made any money at all`
    + `${Number.isFinite(best) ? `, and the strongest reached ${best.toFixed(2)} on a mark that asks for 2` : ""}.`;
  const luck = num(lk.average) === null ? "" : `To earn the exam a way had to make money, in at least 5 of the 6 stretches, and be clearly more than luck. `
    + `With a coin choosing each day's direction, ${Number(lk.average).toFixed(2)} earn it on average.`;
  return { title, detail, luck, earned };
}

/** Gold beside Nasdaq, row by row: [{what, gold, nasdaq}]. */
export function smcTotals(study) {
  const cands = all(study);
  const of = (symbol) => {
    const mine = cands.filter((c) => c.symbol === symbol);
    const trades = (study.every_rule || []).filter((r) => r.symbol === symbol).reduce((a, r) => a + Number(r.trades || 0), 0);
    return { rules: ((study.rules || {})[symbol] || []).length, trades, judged: mine.filter(judged).length, profit: mine.filter(made).length, earned: mine.filter((c) => c.mark && c.mark.passes).length };
  };
  const g = of("XAUUSD"), n = of("NAS100");
  return [["Rules tested", "rules"], ["Trades the Engine judged", "trades"], ["Ways with enough trades", "judged"], ["In profit after the spread", "profit"], ["Clearly more than luck", "earned"]]
    .map(([what, k]) => ({ what, gold: count(g[k]), nasdaq: count(n[k]) }));
}

/** What each idea made a trade after the spread: [{idea, gold: {text, sign}, nasdaq: {text, sign}}]. */
export function smcIdeas(study) {
  return IDEAS.map(([key, idea]) => {
    const g = pick(study, "XAUUSD", key), n = pick(study, "NAS100", key);
    return { idea, gold: cell(g && g.mark.average_r), nasdaq: cell(n && n.mark.average_r) };
  }).filter((r) => r.gold.text || r.nasdaq.text);
}

/** What the spread took: one sentence from the judged ways of the taught families, or "" with none. */
export function smcSpread(study) {
  const range = (symbol) => {
    const costs = all(study).filter((c) => c.symbol === symbol && TAUGHT.has(c.family) && judged(c) && num(c.spread_cost_r) !== null).map((c) => Number(c.spread_cost_r));
    return costs.length ? [Math.min(...costs), Math.max(...costs)] : null;
  };
  const g = range("XAUUSD"), n = range("NAS100");
  if (!g && !n) return "";
  const pct = (r) => `${Math.round(100 * r[0])}% to ${Math.round(100 * r[1])}%`;
  const parts = [g ? `${pct(g)} of what a trade risks on gold` : "", n ? `${pct(n)} on Nasdaq` : ""].filter(Boolean).join(" and ");
  return `Why they lose: the spread. These trades use tight stops, so the spread takes ${parts} before the trade starts. Which way round a pattern is traded hardly matters next to that.`;
}

/** His 1-hour trend line used as a direction filter: one sentence an instrument. */
export function smcTrend(study) {
  return SYMBOLS.map(([symbol, name]) => {
    const h = ((study && study.his_trend_line) || []).find((x) => x.id === `${symbol}:H:his_1h`);
    if (!h || !h.mark) return null;
    const m = h.mark;
    return `${name}: trading with your 1-hour trend line instead of against it was worth ${inR(m.average_r, 3)} a trade over ${count(m.trades)} entries, in ${m.stretches_in_profit} of 6 stretches. `
      + `${m.passes ? "That is clearly more than luck." : "Not more than luck."}`;
  }).filter(Boolean);
}

const PUBLISHED = [
  ["NAS100", "opening-range-5", "Nasdaq: the opening 5 minutes", "Trade the direction of the first 5-minute candle after 09:30 New York; out at 16:00."],
  ["NAS100", "last-half-hour", "Nasdaq: the last half hour", "At 15:30 New York trade the direction of the day so far; out at 16:00."],
  ["XAUUSD", "asian-hours", "Gold: Asian hours", "Buy at 19:00 New York; out at 02:00."],
];

/** The three published rules: [{rule, how, chip: {kind, text}, text}]. */
export function smcPublished(study) {
  return PUBLISHED.map(([symbol, key, rule, how]) => {
    const c = pick(study, symbol, key);
    if (!c || !c.mark) return null;
    const m = c.mark, other = c.the_other_way_round || {};
    const up = Number(m.total_r) > 0;
    const chip = m.passes ? { kind: "ok", text: "Earned the exam" } : up ? { kind: "", text: "Too small to tell" } : { kind: "no", text: "Not there" };
    const text = `${inR(m.average_r, 3)} a trade after the spread over ${count(m.trades)} trades (the spread cost ${Number(c.spread_cost_r).toFixed(3)} R of it), in profit in ${m.stretches_in_profit} of 6 stretches. `
      + `${num(other.average_r) === null ? "" : `The same trades the other way round: ${inR(other.average_r, 3)}.`}`;
    return { rule, how, chip, text: text.trim() };
  }).filter(Boolean);
}

/** Every way of one instrument, plain or with his trend: rows for a table. */
export function smcCandidates(study, symbol, withTrend) {
  return all(study).filter((c) => c.symbol === symbol && !!c.with_his_trend === !!withTrend).map((c) => {
    const m = c.mark || {};
    const chart = /^(his-|opening-|last-|asian-)/.test(c.key || "") ? "" : `, ${c.tf}-minute`;
    return { name: `${c.name}${chart}`, exit: c.exit === "run" ? "No target" : "Twice the risk", trades: count(m.trades), average: cell(m.average_r, 3),
      cost: num(c.spread_cost_r) === null ? "" : `${Number(c.spread_cost_r).toFixed(3)} R`, stretches: `${m.stretches_in_profit} of 6`,
      verdict: !m.judged ? "Too few trades" : m.passes ? "Earned the exam" : "No" };
  });
}

/** Every rule on its own, described only: rows for a table. */
export function smcRules(study) {
  return ((study && study.every_rule) || []).map((r) => ({
    rule: `${r.symbol === "XAUUSD" ? "Gold" : "Nasdaq"} ${r.rule}`, trades: count(r.trades), taught: cell(r["as_taught:tp2"], 3), mirror: cell(r["mirrored:tp2"], 3),
    taughtRun: cell(r["as_taught:tp3"], 3), mirrorRun: cell(r["mirrored:tp3"], 3), stop: `${Number(r.middle_stop_pips)} pips`, spread: `${Math.round(100 * Number(r.middle_spread_share_of_stop))}%`,
    least: num(r.smallest_position_risks_gbp) === null ? "" : `£${Number(r.smallest_position_risks_gbp).toFixed(2)}` }));
}

/** What the smallest position would risk on these day trades, in one sentence ("" when the file has no figure). */
export function smcSmallest(study) {
  const least = ((study && study.every_rule) || []).filter((r) => !["AH", "CX"].includes(r.family) && num(r.smallest_position_risks_gbp) !== null).map((r) => Number(r.smallest_position_risks_gbp));
  if (!least.length) return "";
  return `On scaling up: there is nothing here to scale. The size of a trade cannot turn a rule that loses after costs into one that wins. `
    + `These day trades could be sized on £100 to £500 (FOREX.com's smallest position would risk £${Math.min(...least).toFixed(2)} to £${Math.max(...least).toFixed(2)} on a rule's middle stop); they have no edge to size.`;
}

const ROUND_TWO = { "NA-FAR": "Out beyond the far edge", "NA-IN": "Out when back inside", "NA-AVG": "Out when back inside or across the day's average" };

/** Round 2 (champions/smc/trend/study.json and, if it was sat, exam.json): the published intraday trend rule.
 *  {title, chip, detail, summary: [{way, gold, nasdaq}], rows: [{who, way, trades, average, other, stretches, verdict}], exam}, or null with no study on file. */
export function smcRoundTwo(study, exam) {
  const cands = all(study);
  if (!cands.length) return null;
  const earned = cands.filter((c) => c.mark && c.mark.passes), could = cands.filter(judged), lk = study.luck || {};
  const sat = exam && Array.isArray(exam.candidates) ? exam.candidates : null;
  const passed = sat ? sat.filter((c) => c.mark && c.mark.passes) : [];
  const title = !earned.length ? `None of the ${count(cands.length)} ways to trade it made money beyond luck.`
    : !sat ? `${earned.length === 1 ? "One" : cap(word(earned.length))} of the ${count(cands.length)} ways earned the exam. The exam has not been sat.`
      : passed.length ? `${passed.length === 1 ? "One way" : `${cap(word(passed.length))} ways`} passed the exam on months never read.`
        : `${earned.length === 1 ? "One way" : `${cap(word(earned.length))} ways`} earned the exam, and ${earned.length === 1 ? "it" : "none"} ${earned.length === 1 ? "did not pass" : "passed"} it.`;
  const chip = passed.length ? { kind: "ok", text: "Passed the exam" } : earned.length && !sat ? { kind: "unread", text: "Exam to sit" } : { kind: "no", text: earned.length ? "Did not hold" : "Not more than luck" };
  const best = could.reduce((a, c) => Math.max(a, Number(c.mark.t)), -Infinity);
  const detail = `Buy when price is above its usual range for that time of day, sell when below, looked at on the hour and the half hour; one trade a day, out by 16:00 New York. `
    + `${count(study.trades)} trades on the 42 study months, each also taken the other way round. ${Number.isFinite(best) ? `The strongest way reached ${best.toFixed(2)} on a mark that asks for 2. ` : ""}`
    + `${num(lk.average) === null ? "" : `With a coin choosing each day's direction, ${Number(lk.average).toFixed(2)} earn the exam on average.`}`;
  const row = (c, stretches) => ({ who: `${c.symbol === "XAUUSD" ? "Gold" : "Nasdaq"}${c.with_his_trend ? ", with your trend line" : ""}`, way: ROUND_TWO[c.key] || c.name, trades: count(c.mark.trades),
    average: cell(c.mark.average_r, 3), other: cell((c.the_other_way_round || {}).average_r, 3), stretches: `${c.mark.stretches_in_profit} of ${stretches}`,
    verdict: !c.mark.judged ? "Too few trades" : c.mark.passes ? "Yes" : "No" });
  const plain = (symbol, key) => cands.find((c) => c.symbol === symbol && c.key === key && !c.with_his_trend);
  const summary = Object.entries(ROUND_TWO).map(([key, wayOut]) => ({ way: wayOut, gold: cell((plain("XAUUSD", key) || { mark: {} }).mark.average_r, 3), nasdaq: cell((plain("NAS100", key) || { mark: {} }).mark.average_r, 3) }))
    .filter((r) => r.gold.text || r.nasdaq.text);
  return { title, chip, detail: detail.trim(), summary, rows: cands.map((c) => row(c, 6)), exam: sat ? sat.map((c) => row(c, 5)) : null };
}
