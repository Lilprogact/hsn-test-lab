// What the Champions pages can never do (js/champions/). They only read: no code in them can start a GitHub job, save
// a setting, keep anything in the browser or write HTML from a file; and their class names all carry their own prefix,
// so their look (champions.css) cannot leak into another page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((n) => (statSync(join(ROOT, dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const code = (rel) => read(rel).split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
const FILES = walk(join("js", "champions")).filter((f) => f.endsWith(".js"));

test("the Champions pages only read", () => {
  assert.ok(FILES.length >= 14, "the pages, their words and their helpers are all here");
  for (const file of FILES) {
    const text = code(file);
    for (const word of ["dispatch", "startRun", "startSettingsWorkflow", "POST", "PUT", "PATCH", "DELETE", "fetch(", "XMLHttpRequest", "localStorage", "sessionStorage", "document.cookie",
      "innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("]) {
      assert.ok(!text.includes(word), `${file}: ${word}`);
    }
  }
  const view = code(join("js", "champions", "view.js"));
  assert.deepEqual([...new Set([...view.matchAll(/\bgh\.([A-Za-z]+)/g)].map((m) => m[1]))].sort(), ["getJson", "getText"], "the only things asked of GitHub are files to read");
  for (const file of FILES.filter((f) => f !== join("js", "champions", "view.js"))) assert.ok(!/\bgh\./.test(code(file)), `${file}: only view.js reads from GitHub`);
});

test("the files they read are the Champions work and the Lab's own status files, by name", () => {
  const files = [...code(join("js", "champions", "view.js")).matchAll(/: "([a-z0-9_]+\/[A-Za-z0-9_./-]+\.(?:json|jsonl))"/g)].map((m) => m[1]);
  assert.equal(files.length, 13);
  for (const f of files) assert.match(f, /^(status|champions|live_test)\//, f);
});

test("their look stays their own: every class carries the prefix, and plain elements are styled only inside the area", () => {
  const { cx } = { cx: (names) => String(names || "").split(/\s+/).filter(Boolean).map((n) => `cx-${n}`).join(" ") };
  assert.equal(cx("tile dark  span-12"), "cx-tile cx-dark cx-span-12");
  const ui = code(join("js", "champions", "ui.js"));
  assert.match(ui, /if \(k === "class"\) el\.className = cx\(v\);/, "the one place class names are set adds the prefix");
  const css = read("champions.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter((s) => !/^(from|to|\d+%)$/.test(s));
  assert.ok(selectors.length > 120);
  for (const group of selectors) for (const sel of group.split(",").map((s) => s.trim())) {
    for (const cls of sel.match(/\.[A-Za-z][\w-]*/g) || []) assert.ok(/^\.(cx-|main$|notice$)/.test(cls) || cls === ".main" || cls === ".notice", `${sel}: ${cls} is not the area's own`);
    assert.ok(/cx-|^html\.cx-on/.test(sel), `${sel}: reaches outside the Champions pages`);
  }
});

test("the tab is wired in with one stylesheet, one button, one section, one import and one line", () => {
  const html = read("index.html"), app = read(join("js", "app.js"));
  assert.equal((html.match(/champions/gi) || []).length, 5, "the stylesheet, the tab (its data-view, its title and its name) and the section");
  assert.match(html, /<link rel="stylesheet" href="champions\.css">/);
  assert.match(html, /<button type="button" class="tab" data-view="champions"[^>]*>Champions<\/button>/);
  assert.match(html, /<section id="view-champions" class="view" hidden><\/section>/);
  assert.equal((app.match(/[Cc]hampions/g) || []).length, 5);
  assert.match(app, /import \{ ChampionsView \} from "\.\/champions\/view\.js";/);
  assert.match(app, /views\.champions = new ChampionsView\(document\.getElementById\("view-champions"\)\);/);
});
