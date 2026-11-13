// The site's sealed box against libsodium itself. tests/fixtures/sealedbox.json was made with the real libsodium
// (crypto_box_seal and its building blocks); everything in it is test material.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import nacl from "../js/vendor/tweetnacl.js";
import { blake2b, blake2bHex } from "../js/vendor/blake2b.js";
import { seal, sealWithEphemeralKey, sealTextForGitHub, selfTest, base64ToBytes, bytesToBase64, OVERHEAD_BYTES } from "../js/sealedbox.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/sealedbox.json", import.meta.url), "utf8"));
const hex = (s) => Uint8Array.from(s.match(/../g) || [], (b) => parseInt(b, 16));
const toHex = (a) => Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
const pk = hex(fx.recipient_public_key);
const sk = hex(fx.recipient_secret_key_TEST_ONLY);

/** What GitHub does on its side (crypto_box_seal_open), written with the same bundled primitives. */
function open(sealed, publicKey, secretKey) {
  const epk = sealed.subarray(0, 32);
  const both = new Uint8Array(64);
  both.set(epk, 0);
  both.set(publicKey, 32);
  return nacl.box.open(sealed.subarray(32), blake2b(both, undefined, 24), epk, secretKey);
}

test("BLAKE2b matches libsodium's generichash (24, 32 and 64 byte outputs) and RFC 7693", () => {
  assert.ok(fx.blake2b.length >= 15);
  for (const v of fx.blake2b) assert.equal(toHex(blake2b(hex(v.input), undefined, v.outlen)), v.hash);
  assert.equal(blake2bHex(new TextEncoder().encode("abc")),
    "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923");
});

test("the test key pair is consistent (X25519 base point multiplication matches libsodium)", () => {
  assert.equal(toHex(nacl.box.keyPair.fromSecretKey(sk).publicKey), fx.recipient_public_key);
});

test("same one-use key in, byte-for-byte the same sealed box as libsodium out", () => {
  assert.ok(fx.known_answers.length >= 12);
  for (const v of fx.known_answers) {
    assert.equal(toHex(nacl.box.keyPair.fromSecretKey(hex(v.ephemeral_secret_key)).publicKey), v.ephemeral_public_key);
    const got = sealWithEphemeralKey(hex(v.message), pk, hex(v.ephemeral_secret_key));
    assert.equal(toHex(got), v.sealed);
  }
});

test("boxes sealed by libsodium's own crypto_box_seal open here (the nonce rule is the same in both directions)", () => {
  for (const v of fx.sealed_by_libsodium) {
    const plain = open(hex(v.sealed), pk, sk);
    assert.ok(plain, "must open");
    assert.equal(toHex(plain), v.message);
  }
});

test("seal(): fresh key every time, right length, opens to the same bytes, and tampering is refused", () => {
  const msg = new TextEncoder().encode("a value that is only test text");
  const a = seal(msg, pk);
  const b = seal(msg, pk);
  assert.equal(a.length, msg.length + OVERHEAD_BYTES);
  assert.notEqual(toHex(a), toHex(b));
  assert.notEqual(toHex(a.subarray(0, 32)), toHex(b.subarray(0, 32)));
  assert.equal(toHex(open(a, pk, sk)), toHex(msg));
  assert.equal(new TextDecoder().decode(msg), "a value that is only test text", "the caller's bytes are not changed by seal()");
  const bad = a.slice();
  bad[40] ^= 1;
  assert.equal(open(bad, pk, sk), null);
  assert.ok(!toHex(a).includes(toHex(msg)), "the plain bytes do not appear in the sealed box");
});

test("seal() refuses wrong inputs", () => {
  assert.throws(() => seal("text", pk), TypeError);
  assert.throws(() => seal(new Uint8Array(3), new Uint8Array(31)), RangeError);
  assert.throws(() => seal(new Uint8Array(3), "not bytes"), TypeError);
});

test("sealTextForGitHub: base64 key in, base64 sealed box out, UTF-8 kept exactly", () => {
  const key64 = bytesToBase64(pk);
  for (const text of ["12345678", "FOREX.com-Test 1", "pä ss wörd € 🔒 مرحبا", " kept as given ", "x".repeat(3000)]) {
    const out = sealTextForGitHub(text, key64);
    assert.match(out, /^[A-Za-z0-9+/]+={0,2}$/);
    const plain = open(base64ToBytes(out), pk, sk);
    assert.equal(new TextDecoder().decode(plain), text);
  }
  assert.throws(() => sealTextForGitHub("x", bytesToBase64(new Uint8Array(16))), /32 bytes/);
  assert.throws(() => sealTextForGitHub("x", "not base64 !!"), /base64/);
});

test("base64 helpers round-trip every byte value and long inputs", () => {
  const all = Uint8Array.from({ length: 70000 }, (_, i) => (i * 7 + 3) & 255);
  assert.equal(toHex(base64ToBytes(bytesToBase64(all))), toHex(all));
  assert.equal(bytesToBase64(new Uint8Array(0)), "");
  assert.equal(bytesToBase64(Uint8Array.from([0, 1, 2, 3, 4, 5, 251, 255])), "AAECAwQF+/8=");
});

test("the in-browser self-test passes here and fails if the arithmetic is wrong", () => {
  assert.equal(selfTest(), true);
  const real = nacl.box;
  try {
    nacl.box = (m, n, p, s) => { const out = real(m, n, p, s); out[20] ^= 1; return out; };
    assert.equal(selfTest(), false);
  } finally {
    nacl.box = real;
  }
  assert.equal(selfTest(), true);
});
