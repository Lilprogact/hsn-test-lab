// Sealed box: the one encryption GitHub's API accepts for an Actions secret (libsodium's crypto_box_seal).
//
// How it is built (nothing here is home-made cryptography; the primitives come from the two bundled libraries in
// js/vendor/, which the tests pin to their upstream files byte for byte):
//   1. make a fresh one-use key pair for this single value (X25519), from the browser's own secure random numbers;
//   2. nonce = BLAKE2b, 24-byte output, of (one-use public key || the repository's public key);
//   3. box  = nacl.box(value, nonce, repository public key, one-use secret key)   (X25519 + XSalsa20-Poly1305);
//   4. send (one-use public key || box). Only GitHub holds the repository's private key, so only GitHub can open it.
// tests/sealedbox.test.js proves the result against libsodium itself, in both directions.
import nacl from "./vendor/tweetnacl.js";
import { blake2b } from "./vendor/blake2b.js";

export const PUBLIC_KEY_BYTES = 32;
export const OVERHEAD_BYTES = 48;            // 32 (one-use public key) + 16 (authentication tag)
const NONCE_BYTES = 24;

function bytes(x, what, length) {
  if (!(x instanceof Uint8Array)) throw new TypeError(`${what} must be bytes`);
  if (length !== undefined && x.length !== length) throw new RangeError(`${what} must be ${length} bytes, got ${x.length}`);
  return x;
}

/** The deterministic core, exported for the tests only: the same inputs always give the same sealed bytes. */
export function sealWithEphemeralKey(message, recipientPublicKey, ephemeralSecretKey) {
  bytes(message, "message");
  bytes(recipientPublicKey, "public key", PUBLIC_KEY_BYTES);
  bytes(ephemeralSecretKey, "one-use secret key", 32);
  const pair = nacl.box.keyPair.fromSecretKey(ephemeralSecretKey);
  const both = new Uint8Array(PUBLIC_KEY_BYTES * 2);
  both.set(pair.publicKey, 0);
  both.set(recipientPublicKey, PUBLIC_KEY_BYTES);
  const nonce = blake2b(both, undefined, NONCE_BYTES);
  const box = nacl.box(message, nonce, recipientPublicKey, ephemeralSecretKey);
  const out = new Uint8Array(PUBLIC_KEY_BYTES + box.length);
  out.set(pair.publicKey, 0);
  out.set(box, PUBLIC_KEY_BYTES);
  if (out.length !== message.length + OVERHEAD_BYTES) throw new Error("sealed box has the wrong length");
  return out;
}

/** Seal `message` (bytes) for `recipientPublicKey` (32 bytes). A new one-use key every call. */
export function seal(message, recipientPublicKey) {
  const rng = globalThis.crypto;
  if (!rng || typeof rng.getRandomValues !== "function") throw new Error("this browser has no secure random numbers");
  const secret = new Uint8Array(32);
  rng.getRandomValues(secret);
  try {
    if (secret.every((b) => b === 0)) throw new Error("the browser's random numbers failed");
    return sealWithEphemeralKey(message, recipientPublicKey, secret);
  } finally {
    secret.fill(0);
  }
}

export function base64ToBytes(text) {
  const clean = String(text).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) throw new Error("not base64");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(data) {
  let bin = "";
  for (let i = 0; i < data.length; i += 0x2000) bin += String.fromCharCode.apply(null, data.subarray(i, i + 0x2000));
  return btoa(bin);
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** Seal a text value for a GitHub public key (base64) and return what the API wants: base64 of the sealed bytes. */
export function sealTextForGitHub(text, publicKeyBase64) {
  const key = base64ToBytes(publicKeyBase64);
  if (key.length !== PUBLIC_KEY_BYTES) throw new Error("GitHub's public key is not 32 bytes");
  const message = new TextEncoder().encode(text);
  try {
    return bytesToBase64(seal(message, key));
  } finally {
    message.fill(0);
  }
}

// One known answer, made with libsodium 1.0.18 (crypto_scalarmult_base, crypto_generichash, crypto_box_easy) and
// opened again with its crypto_box_seal_open. selfTest() runs it in the browser before anything real is sealed, so
// a browser that computes any step differently is caught before a value is sent. All of it is test material.
const KNOWN = {
  message: "464f5245582e636f6d2d546573742031",
  publicKey: "3694cba7259cee3880ea6bd9fcdf09f442635c9f98394bbf8d773dd259c8c67d",
  ephemeralSecretKey: "dad4ad0c0349ff749477f8946956bdb7893f2bd1f8028790d72c487cc69b7bee",
  sealed: "4d481bf1c6764b86ee09f41ce9f51632773fe38457104020546508694796ad3d9c6fffd6b9639929d0e81db143a9b8b78e814750ee65f09e348393eca1fa5ccc",
};

/** True when this browser reproduces libsodium's sealed box exactly and two fresh seals differ. */
export function selfTest() {
  try {
    const want = hexToBytes(KNOWN.sealed);
    const got = sealWithEphemeralKey(hexToBytes(KNOWN.message), hexToBytes(KNOWN.publicKey), hexToBytes(KNOWN.ephemeralSecretKey));
    if (got.length !== want.length || !got.every((b, i) => b === want[i])) return false;
    const a = seal(hexToBytes(KNOWN.message), hexToBytes(KNOWN.publicKey));
    const b = seal(hexToBytes(KNOWN.message), hexToBytes(KNOWN.publicKey));
    if (a.length !== want.length || a.every((x, i) => x === b[i])) return false;      // a fresh key each time
    return bytesToBase64(base64ToBytes("AAECAwQF+/8=")) === "AAECAwQF+/8=";
  } catch {
    return false;
  }
}
