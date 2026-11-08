// Past runs: results/index.json plus what GitHub is running right now.
import * as gh from "./github.js";
import { state } from "./app.js";
import { ukDateTime } from "./clock.js";
import { h, card, table, badge, money, signed, pct } from "./ui.js";

export class RunsView {
  constructor(root, open) { this.root = root; this.open = open; }
  onUnlock() {}
  async show() {
    this.root.replaceChildren(h("p", { class: "muted" }, "Loading runs…"));
    try {
      const [idx, active] = await Promise.all([gh.getJson(state.token, state.owner, "results/index.json"), gh.activeRuns(state.token, state.owner)]);
      const runs = (idx?.runs || []).slice().reverse();
      const rows = runs.map((r) => ({ When: ukDateTime(r.started_at), Id: r.request_id, Mode: r.mode, Status: r.status, Settings: Object.entries(r.settings || {}).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("/") : v}`).join(" · "),
        Headline: r.headline ? (r.mode === "million" ? `${pct(r.headline.pct_reached_million)} reached £1M · median ${money(r.headline.median_final_balance)}` : `${r.headline.exit_style}: ${money(r.headline.pnl_gbp)} · avg R ${signed(r.headline.avg_r, 3)}${r.headline.beats_random ? " · beat random" : ""}`) : (r.error || ""), Seconds: r.seconds, _r: r }));
      const t = table(["When", "Id", "Mode", "Status", "Settings", "Headline", "Seconds"], rows, { numeric: ["Seconds"] });
      t.querySelectorAll("tbody tr").forEach((tr, i) => { tr.style.cursor = "pointer"; tr.addEventListener("click", () => this.open(rows[i]._r.request_id, rows[i]._r.mode)); });
      this.root.replaceChildren(
        card("Running now on GitHub", active.length ? table(["Workflow", "Name", "Status", "Started (UK)"], active.map((a) => ({ Workflow: a.name, Name: a.display_title, Status: a.status, "Started (UK)": ukDateTime(a.created_at) }))) : h("p", { class: "muted" }, "Nothing running.")),
        card(`Past runs (${rows.length})`, rows.length ? t : h("p", { class: "muted" }, "No runs yet.")));
    } catch (e) { this.root.replaceChildren(h("p", { class: "error" }, e.message)); }
  }
}
