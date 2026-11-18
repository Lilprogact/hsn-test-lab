// Champions, the first page: the rounds as they are played. What each of the five agents is doing now, the money its
// standing version makes in a middle month, how that has moved round by round, and every decision of the judge.
// The page is drawn again whenever the judge's progress file changes (view.js reads it every few seconds while the page
// is open). It only reads.
import { h, chip, fold, svg, cx, tidy } from "../ui.js";
import { ago, liveState, batchTrack, board, best, agentCard, sparkline, readout, roundRows, tryNotes, feedRows, measuredOn, judgedBy } from "../logic/progress.js";
import { unseenRows, unseenHeadline, unseenFor } from "../logic/unseen.js";
import { edgeHeadline, edgeBars, edgeGroups, edgeExits } from "../logic/edge.js";
import { examHeadline, examWinners, examLosers, examBase, examAfterStudy } from "../logic/exam.js";
import { hero, weeksTrack } from "../logic/overview.js";
import { checkLines, checksSummary, storedPrices } from "../logic/checks.js";
import { bullets, dataTable, todoBox, unreadNote } from "./parts.js";

export const needs = ["progress", "unseen", "edge", "exam", "score", "card", "score2", "card2", "login", "cloud", "coverage", "match", "agents"];
export const watch = ["progress"];                            // read again while the page is open

const progressOf = (out, failed) => (failed.progress ? null : out.progress);

/** What the page shows depends on this: when it changes, the page is drawn again. */
export function stamp({ out, failed, now }) {
  const p = progressOf(out, failed);
  return `${p ? p.updated_at : "none"}|${liveState(p, now).kind}`;
}

/** Once a second: the "… ago" words, and a line when the last read failed. Nothing is read here. */
export function tick(root, now, problem) {
  for (const el of root.querySelectorAll("[data-cx-ago]")) el.textContent = ago(el.getAttribute("data-cx-ago"), now);
  const note = root.querySelector("[data-cx-problem]");
  if (note) note.textContent = problem ? `The last read failed: ${problem} It is tried again every few seconds.` : "";
}

const agoSpan = (iso, now) => h("span", { "data-cx-ago": iso }, ago(iso, now));

/** How far a sum has moved: an arrow, the signed sum and what it is measured from. */
function delta(change, words) {
  if (!change) return null;
  const arrow = change.dir === "up" ? "▲" : change.dir === "down" ? "▼" : "•";
  return h("p", { class: `delta ${change.dir}` }, h("span", { "aria-hidden": "true" }, arrow), " ", h("span", {}, change.dir === "flat" ? "No change" : change.text), " ", h("span", { class: "delta-words" }, words));
}

/** Small marks in a row, one for each try: kept, dropped or still to come. */
function pips(list, label, cls = "pips") {
  return h("div", { class: cls, role: "img", "aria-label": label }, ...list.map((kind) => h("i", { class: kind })));
}

/** One agent's sum as a bar against the largest sum, with a tick where it stood when the batch began. */
function bar(row) {
  const fillEl = h("i", { class: "bar-fill" }), start = row.start === null ? null : h("i", { class: "bar-start" });
  fillEl.style.setProperty("--w", `${(100 * row.share).toFixed(1)}%`);
  if (start) start.style.setProperty("--x", `${(100 * row.startShare).toFixed(1)}%`);
  return h("div", { class: "bar", role: "img", "aria-label": `${row.name}: ${row.text} now, ${row.startText} when this batch began` }, fillEl, start);
}

/** The money round by round, as a stepped line: it moves only when a change is kept. Point at it, tap it or use the arrow keys to read a round. */
function chart(agent) {
  const { points, low, high, firstNew } = sparkline(agent);
  if (points.length < 2) return null;
  const W = 320, H = 92, L = 7, R = 11, T = 11, B = 9, last = points.length - 1;
  const x = (i) => L + (i * (W - L - R)) / last;
  const y = (v) => T + (1 - (v - low) / ((high - low) || 1)) * (H - T - B);
  const at = (n) => n.toFixed(1);
  let path = `M${at(x(0))},${at(y(points[0].value))}`;
  for (let i = 1; i <= last; i++) path += `H${at(x(i))}V${at(y(points[i].value))}`;
  const bandFrom = firstNew > 0 ? (x(firstNew - 1) + x(firstNew)) / 2 : null;
  const rule = svg("line", { class: "spark-rule", x1: 0, x2: 0, y1: 2, y2: H - 2 }), pick = svg("circle", { class: "spark-pick", r: 6, cx: 0, cy: 0 });
  const marker = svg("g", { class: "spark-at off" }, rule, pick);
  const label = chip({ kind: "", text: "" }), text = h("span", {});
  const words = h("div", { class: "spark-words", "aria-live": "polite" }, label, h("p", {}, text));
  const say = (i) => {
    const r = readout(points[i]);
    label.className = cx(`chip ${r.kind === "kept" ? "ok" : ""}`);
    label.textContent = r.label;
    text.textContent = tidy(r.text);
  };
  say(last);
  const drawing = svg("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, role: "group", tabindex: "0",
    "aria-label": `${agent.name}: a middle month's money after each round. Use the left and right arrow keys to read each round.` },
    bandFrom === null ? null : svg("rect", { class: "spark-band", x: at(bandFrom), y: 0, width: at(W - bandFrom), height: H, rx: 8 }),
    svg("line", { class: "spark-zero", x1: L, x2: W - R, y1: at(y(0)), y2: at(y(0)) }),
    svg("path", { class: "spark-line", d: path }),
    ...points.map((p, i) => (i === 0 || i === last ? null : svg("circle", { class: p.kept ? "spark-kept" : "spark-dropped", cx: at(x(i)), cy: at(y(p.value)), r: p.kept ? 3 : 2.4 }))),
    svg("circle", { class: "spark-end", cx: at(x(last)), cy: at(y(points[last].value)), r: 4.5 }),
    marker);
  let current = last;
  const show = (i) => {
    current = Math.max(0, Math.min(last, i));
    rule.setAttribute("x1", at(x(current))); rule.setAttribute("x2", at(x(current)));
    pick.setAttribute("cx", at(x(current))); pick.setAttribute("cy", at(y(points[current].value)));
    marker.classList.remove(cx("off"));
    say(current);
  };
  const rest = () => { current = last; marker.classList.add(cx("off")); say(last); };
  const nearest = (e) => {
    const box = drawing.getBoundingClientRect();
    const ux = box.width ? ((e.clientX - box.left) / box.width) * W : 0;
    return Math.round(((ux - L) / (W - L - R)) * last);
  };
  drawing.addEventListener("pointermove", (e) => show(nearest(e)));
  drawing.addEventListener("pointerdown", (e) => show(nearest(e)));
  drawing.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") rest(); });
  drawing.addEventListener("focus", () => show(current));
  drawing.addEventListener("blur", rest);
  drawing.addEventListener("keydown", (e) => {
    const to = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    show(to);
  });
  return h("div", { class: "spark-box" }, drawing,
    h("div", { class: "spark-ends" }, h("span", {}, "Start"), h("span", {}, bandFrom === null ? `Round ${points[last].round}` : "Shaded: this step's rounds")),
    words);
}

/** What a version did on the unseen months, when it has been looked at: a mark that says whether it counts, and the sums. */
function unseenLine(look, cls = "agent-unseen") {
  return look ? h("div", { class: cls }, chip({ kind: look.counts ? "ok" : "no", text: look.label }), h("p", {}, look.text)) : null;
}

function agentTile(agent, progress, now, finished) {
  const c = agentCard(agent, progress, now);
  const busy = ["trying", "studying", "thinking"].includes(c.state.kind);
  const rows = roundRows(agent), notes = tryNotes(agent);
  return h("article", { class: `tile agent-live ${c.state.kind}` },
    h("header", { class: "agent-head" },
      h("div", {}, h("h2", { class: "agent-name" }, c.name), c.knownFor ? h("p", { class: "cap" }, `Known for ${c.knownFor}`) : null),
      h("span", { class: `state ${c.state.kind}` }, busy ? h("span", { class: "live-dot", "aria-hidden": "true" }) : null, h("span", {}, c.state.text))),
    h("p", { class: "agent-doing" }, c.doing, c.lastLook ? h("span", { class: "agent-look" }, " Last studied: ", c.lastLook.what, c.lastLook.at ? ", " : "", c.lastLook.at ? agoSpan(c.lastLook.at, now) : null, ".") : null),
    h("div", { class: "agent-money" },
      h("p", { class: "sum" }, c.money, " ", h("span", { class: "sum-cap" }, "a middle month")),
      delta(c.change, `this batch (from ${c.startText})`)),
    unseenLine(unseenFor(finished, agent)),
    chart(agent),
    h("div", { class: "agent-tries" }, pips(c.pips, `${c.used}: ${c.keptNow} kept`), h("p", { class: "cap" }, `${c.used}, ${c.keptNow} kept.${c.looks ? ` ${c.looks}.` : ""}`)),
    h("dl", { class: "mini-facts" }, ...c.facts.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v)))),
    h("p", { class: "cap" }, `Money plan: ${c.plan}. ${c.safe ? "It passes the judge's safety marks." : "It does not pass the judge's safety marks."}`),
    fold(`${c.id}-rounds`, `Every round (${rows.length - 1})`,
      dataTable(["Round", "What was changed", "Result", "That version", "Standing"], rows, { numeric: [3, 4] }),
      h("p", { class: "cap" }, "That version: the middle month of the changed version. Standing: the middle month of the version the agent kept after the round.")),
    notes.length ? fold(`${c.id}-why`, `This step's changes, with reasons (${notes.length})`, h("ul", { class: "round" }, ...notes.map((n) => h("li", {},
      h("div", { class: "round-row" }, h("p", { class: "round-name" }, `${n.round}, ${n.at}`), chip({ kind: n.kept ? "ok" : "", text: n.kept ? "Kept" : "Dropped" })),
      h("p", {}, `${n.change}.`),
      n.why ? h("p", { class: "cap" }, `Why it tried this: ${n.why}`) : null,
      h("p", { class: "cap" }, `The judge: ${n.verdict}. Middle month ${n.money}${n.died ? `, ${n.died}` : ""}.`),
      n.exactly.length ? h("p", { class: "cap" }, `Exactly: ${n.exactly.join("; ")}.`) : null)))) : null,
    fold(`${c.id}-rules`, "Its rules now", c.rules.length ? bullets(c.rules) : h("p", { class: "cap" }, "Its rules could not be read."), c.version ? h("p", { class: "cap" }, `Version ${c.version}.`) : null));
}

const FEED_FIRST = 5;                                         // the newest decisions are shown; the earlier ones fold away

function feedTile(progress, now) {
  const rows = feedRows(progress, now);
  const item = (f) => h("li", {},
    h("div", { class: "round-row" }, h("p", { class: "feed-name" }, f.name), chip({ kind: f.kept ? "ok" : "", text: f.kept ? "Kept" : "Dropped" })),
    h("p", {}, `${f.change}.`),
    h("p", { class: "cap" }, f.kept ? `Its middle month is now ${f.money}. ` : `${f.verdict}. That version made ${f.money}. `, `${f.round}, `, agoSpan(f.iso, now), ` (${f.at}).`));
  return h("div", { class: "tile agent-live feed-tile" },
    h("h2", { class: "agent-name" }, "Latest decisions"),
    h("p", { class: "cap" }, "The Engine judges every change. An agent cannot keep one itself."),
    rows.length ? h("ol", { class: "feed" }, ...rows.slice(0, FEED_FIRST).map(item)) : h("p", { class: "agent-doing" }, "Nothing has been judged in this step yet."),
    rows.length > FEED_FIRST ? fold("feed-earlier", `Earlier decisions (${rows.length - FEED_FIRST})`, h("ol", { class: "feed" }, ...rows.slice(FEED_FIRST).map(item))) : null);
}

/** The one look at the unseen months: what each finished version made where no agent had studied, beside its practice figure. */
function unseenSection(finished, order, onCard2) {
  const look = unseenHeadline(finished);
  if (!look) return null;
  const rows = unseenRows(finished, order);
  return h("section", { class: "wrap" }, h("div", { class: `tile unseen-tile ${look.counted ? "" : "attention"}`.trim() },
    h("p", { class: "tile-label" }, "The one look at the unseen months"),
    h("h2", { class: "slim-title" }, look.title),
    h("p", { class: "cap" }, "A small account's middle month, on the practice months and then on the unseen months. The last three columns are the unseen months."),
    dataTable(["Agent", "Practice", "Unseen", "Accounts that died", "Standard account", "Counts?"],
      rows.map((r) => [r.sameAs ? `${r.name}. ${r.sameAs}` : r.name, { text: r.practice }, { text: r.unseen, sign: r.unseenValue > 0 ? "up" : r.unseenValue < 0 ? "down" : "" }, r.died, r.standard, r.counts ? "Yes" : "No"]),
      { numeric: [1, 2, 3] }),
    h("p", { class: "cap" }, look.detail),
    onCard2 ? h("p", { class: "cap" }, "All of them are on forward-test card 2, with this result beside each. New prices are the only clean test left.") : null));
}

/** One exit's bar: the kinds of signal that held in every stretch, with a tick at the most that luck alone gave. */
function edgeBar(row) {
  const fillEl = h("i", { class: "bar-fill" }), tick = row.luckShare === null ? null : h("i", { class: "bar-start" });
  fillEl.style.setProperty("--w", `${(100 * row.share).toFixed(1)}%`);
  if (tick) tick.style.setProperty("--x", `${(100 * row.luckShare).toFixed(1)}%`);
  return h("div", { class: `bar ${row.found ? "" : "none"}`.trim(), role: "img", "aria-label": `${row.name}: ${row.text} made money in every stretch. ${row.words}` }, fillEl, tick);
}

/** The edge study: the indicator's raw signals, with no rule applied, and the kinds of them that made money stretch after stretch. */
function edgeSection(study, exam) {
  const head = edgeHeadline(study);
  if (!head) return null;
  const since = examAfterStudy(exam);
  const bars = edgeBars(study), groups = edgeGroups(study, head.key), exits = edgeExits(study);
  return h("section", { class: "wrap" }, h("div", { class: "tile edge-tile" },
    h("div", { class: "edge-top" },
      h("div", {},
        h("p", { class: "tile-label" }, "The edge study"),
        h("h2", { class: "slim-title" }, head.title),
        h("p", { class: "cap" }, head.detail),
        h("p", { class: since ? "edge-since" : "cap" }, since || "Found on the months the agents study. The unseen months and the locked older months were not read: they are still the exam.")),
      h("div", {},
        h("p", { class: "tile-label" }, "Kinds of signal that made money in every stretch, by exit"),
        h("ol", { class: "board" }, ...bars.map((r) => h("li", {},
          h("div", { class: "board-line" }, h("span", { class: "board-name" }, r.name), h("span", { class: "board-sum" }, r.text)),
          edgeBar(r),
          h("p", { class: "cap" }, r.words)))),
        h("p", { class: "cap" }, "The tick on a bar is the most that luck alone gave: the same count with the results shuffled among the signals."))),
    groups.length ? fold("edge-groups", `The kinds that held with ${head.exit.toLowerCase()} (${groups.length})`,
      dataTable(["Kind of signal", "Signals", "Average a signal", "Worst stretch"], groups.map((g) => [g.group, g.signals, g.average, g.worst]), { numeric: [1, 2, 3] }),
      h("p", { class: "cap" }, "R is a signal's result against what it risked: +1 R wins what was risked, −1 R loses it.")) : null,
    fold("edge-exits", "Every exit, with the check on luck",
      dataTable(["Exit", "All signals together", "Held in every stretch", "Held in five or six"], exits.map((e) => [e.exit, e.together, e.everywhere, e.mostly])),
      h("p", { class: "cap" }, "Held in five or six: a kind of signal that made money in at least five of the six stretches, and over all six together."))));
}

/** The exam: the kinds of signal the study found, tried once on months the study never read. */
function examSection(exam) {
  const head = examHeadline(exam);
  if (!head) return null;
  const rows = examWinners(exam), losers = examLosers(exam), base = examBase(exam);
  return h("section", { class: "wrap" }, h("div", { class: `tile exam-tile ${head.luck ? "attention" : ""}`.trim() },
    h("p", { class: "tile-label" }, "The exam of the edge study"),
    h("h2", { class: "slim-title" }, head.title),
    head.verdict ? h("p", { class: "exam-verdict" }, head.verdict) : null,
    h("ol", { class: "exam-kinds" }, ...rows.map((r) => h("li", {},
      h("div", { class: "round-row" }, h("p", { class: "feed-name" }, r.group), chip(r.chip)),
      pips(r.pips, `${r.group}: ${r.stretches}`),
      h("p", { class: "cap" }, `${r.text}. ${r.stretches}. ${r.study ? `${r.study}. ` : ""}${r.luck}.`)))),
    h("p", { class: "cap" }, "One mark for each stretch of the exam months, in order of time: a green mark is a stretch in which that kind made money, a dash one in which it lost."),
    base ? h("p", { class: "cap" }, base) : null,
    h("p", { class: "cap" }, head.detail),
    losers && losers.rows.length ? fold("exam-losers", `The kinds that lost every time in the study (${losers.rows.length})`,
      h("p", { class: "cap" }, `${losers.title} ${losers.verdict}`.trim()),
      dataTable(["Kind of signal", "Signals", "Average", "Stretches below the rest", "Worse again?", "By luck in"],
        losers.rows.map((r) => [r.group, r.signals, r.average, r.below, r.again, r.luck]), { numeric: [1, 2] })) : null));
}

export function render({ out, failed, now }) {
  const progress = progressOf(out, failed);
  const live = liveState(progress, now);
  const finished = failed.unseen ? null : out.unseen;
  const study = failed.edge ? null : out.edge, exam = failed.exam ? null : out.exam;
  const card = failed.card ? null : out.card, score = failed.score ? null : out.score;
  const forward = failed.score ? { ok: false, title: "The score could not be read.", sub: failed.score.message, todo: null } : hero(out.score, card, storedPrices(out, failed), now);
  const card2 = failed.card2 ? null : out.card2;
  const forward2 = failed.score2 ? { ok: false, title: "Its score could not be read.", sub: failed.score2.message, todo: null }
    : card2 || out.score2 ? hero(out.score2 || null, card2, storedPrices(out, failed), now) : null;
  const weeks = weeksTrack(score, card);
  const lines = checkLines(out, failed, now), checks = checksSummary(lines);

  const top = h("section", { class: "live-top wrap" },
    h("div", { class: "live-row" },
      h("p", { class: `live-state ${live.kind}` }, h("span", { class: "live-dot", "aria-hidden": "true" }), h("b", {}, live.label), " ", live.detail),
      progress ? h("p", { class: "cap live-updated" }, "Updated ", agoSpan(progress.updated_at, now), ". This screen reads again every 15 seconds.") : null),
    live.next ? h("p", { class: "cap live-next" }, live.next) : null,
    h("p", { class: "cap live-problem", "data-cx-problem": "yes", role: "status" }),
    failed.progress ? unreadNote("The progress of the rounds", failed.progress) : null);

  const parts = [top];
  if (progress && live.kind !== "none") {
    const track = batchTrack(progress), topAgent = best(progress), rows = board(progress);
    parts.push(
      h("section", { class: "wrap" },
        pips(track.pips, `${track.text}: ${track.words}`, "pips wide"),
        h("p", { class: "cap" }, `Batch ${progress.batch}: ${track.text}. ${track.words[0].toUpperCase()}${track.words.slice(1)}.`)),
      h("section", { class: "wrap grid" },
        h("div", { class: "tile dark span-7 money-tile" },
          h("p", { class: "tile-label" }, "The best middle month so far, on the practice months"),
          h("p", { class: "money" }, topAgent ? topAgent.text : "no figure"),
          topAgent ? h("p", { class: "money-who" }, topAgent.who) : null,
          topAgent && topAgent.change ? delta(topAgent.change, `since this batch began (the best then: ${topAgent.from.text}, ${topAgent.from.name})`) : null,
          topAgent ? unseenLine(unseenFor(finished, progress.agents.find((a) => a.id === topAgent.id)), "agent-unseen money-unseen") : null,
          h("p", { class: "tile-foot" }, measuredOn(progress))),
        h("div", { class: "tile span-5 board-tile" },
          h("p", { class: "tile-label" }, "All five, a middle month"),
          h("ol", { class: "board" }, ...rows.map((r) => h("li", {},
            h("div", { class: "board-line" }, h("span", { class: "board-name" }, r.name), h("span", { class: "board-sum" }, r.text)),
            bar(r),
            r.change ? delta(r.change, "this batch") : null))),
          h("p", { class: "cap" }, "The tick on a bar is where that agent stood when this batch began."))),
      unseenSection(finished, progress.agents.map((a) => a.id), !!card2),
      edgeSection(study, exam),
      examSection(exam),
      h("section", { class: "wrap cards" }, ...progress.agents.map((a) => agentTile(a, progress, now, finished)), feedTile(progress, now)));
  } else {
    parts.push(unseenSection(finished, [], !!card2), edgeSection(study, exam), examSection(exam));
  }

  parts.push(
    h("section", { class: "wrap grid" },
      h("a", { class: `tile span-6 slim ${forward.ok && (!forward2 || forward2.ok) ? "" : "attention"}`.trim(), href: "#champions", "data-cx-go": "forward" },
        h("p", { class: "tile-label" }, "The forward test"),
        h("p", { class: "slim-title" }, forward.title),
        h("div", { class: "weeks", role: "img", "aria-label": `${weeks.stat} ${weeks.caption}` }, ...Array.from({ length: weeks.all }, (_, i) => h("i", { class: i < weeks.done ? "done" : null }))),
        h("div", { class: "weeks-ends" }, h("span", {}, weeks.start), h("span", {}, weeks.judged)),
        h("p", { class: "cap" }, forward2 ? "Card 1, the ten versions of 16 Nov: " : "", forward.sub),
        forward.todo ? todoBox(forward.todo) : null,
        forward2 ? h("p", { class: "cap" }, `Card 2, the ${card2 && card2.versions ? card2.versions.length : ""} versions of 17 Nov: ${forward2.title} ${forward2.sub}`.replace("the  versions", "the versions")) : null,
        forward2 && forward2.todo ? todoBox(forward2.todo) : null,
        h("span", { class: "link go" }, "Open the forward test")),
      h("a", { class: `tile span-6 slim ${checks.allOk ? "" : "attention"}`.trim(), href: "#champions", "data-cx-go": "checks" },
        h("p", { class: "tile-label" }, "Checks"),
        h("p", { class: "slim-title" }, `${checks.text} ${checks.caption}`),
        h("ul", { class: "dots", "aria-hidden": "true" }, ...lines.map((l) => h("li", { class: l.unread ? "unread" : l.ok ? "ok" : "no" }))),
        h("p", { class: "cap" }, checks.first),
        h("span", { class: "link go" }, "See each check"))),
    h("section", { class: "wrap small-print" },
      h("p", {}, "These are practice figures. Every sum is the Engine's own, on real FOREX.com gold prices, on the months the agents study. A version counts only when it also makes money on months it has never seen, and then in the forward test."),
      h("p", {}, "The judge does not look at the unseen months during these rounds. An agent changes one setting of its rules at a time; it cannot change the Engine, the prices or the judge."),
      judgedBy(progress).length ? fold("judged-by", "How a change is judged", bullets(judgedBy(progress))) : null));

  const page = h("div", { class: "live" }, ...parts);
  page.setAttribute("data-cx-live", live.kind);
  return page;
}
