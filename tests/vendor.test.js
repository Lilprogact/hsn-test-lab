// The bundled encryption libraries are the upstream files, byte for byte. Each wrapper in js/vendor/ keeps the
// upstream text between a BEGIN and an END line; this test hashes that text and compares it with the pinned
// SHA-256 of the upstream file (js/vendor/README.md says where each file comes from).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

const PINNED = {
  "tweetnacl.js": { upstream: "nacl-fast.js", sha256: "6bcd37a3b20dce913f82d4b23e4e2b661058b4b953df8a3f8c45d56ac4f72447" },
  "blake2b.js": { upstream: "blake2b.js", sha256: "79e88d06fcb301e862d7908d14698e7d2e647b850e3bfbcaf33234615a7b5219" },
};
const dir = new URL("../js/vendor/", import.meta.url);

function parts(file, upstream) {
  const text = readFileSync(new URL(file, dir), "utf8");
  const begin = `/* ==== BEGIN upstream ${upstream} ==== */\n`;
  const end = `/* ==== END upstream ${upstream} ==== */\n`;
  const a = text.indexOf(begin);
  const b = text.indexOf(end);
  assert.ok(a >= 0 && b > a, `${file}: markers present`);
  assert.equal(text.indexOf(begin, a + 1), -1, `${file}: one BEGIN line`);
  return { head: text.slice(0, a), body: text.slice(a + begin.length, b), tail: text.slice(b + end.length) };
}

test("every file in js/vendor/ is a pinned one", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".js")).sort();
  assert.deepEqual(files, Object.keys(PINNED).sort());
});

for (const [file, pin] of Object.entries(PINNED)) {
  test(`${file}: the code between the markers is upstream ${pin.upstream}, unchanged`, () => {
    const { body } = parts(file, pin.upstream);
    assert.equal(createHash("sha256").update(body, "utf8").digest("hex"), pin.sha256);
  });

  test(`${file}: the wrapper lines around it reach nothing outside the page`, () => {
    const { head, tail } = parts(file, pin.upstream);
    const code = (head + tail).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(code, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document|console|eval|Function|import\s*\()/);
    assert.ok(code.split("\n").filter((l) => l.trim()).length <= 16, "the wrapper stays tiny");
  });

  test(`${file}: the upstream code does not talk to a network, storage or the console`, () => {
    const { body } = parts(file, pin.upstream);
    const code = body.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(code, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document\.|console\.|eval\(|new Function|import\s*\()/);
  });
}
