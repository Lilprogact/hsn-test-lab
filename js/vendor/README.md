# Bundled encryption libraries

The One-time setup page seals each value in the browser before it goes to GitHub (a libsodium "sealed box", the
only format GitHub's API accepts for an Actions secret). The cryptography is not home-made: it comes from two small,
well-known, pure-JavaScript libraries that are **part of this site**. Nothing is loaded from a CDN or any other
address, and the site's safety header (`script-src 'self'`) would block it if something tried.

| File here | Upstream file | From | Version | SHA-256 of the upstream file |
|---|---|---|---|---|
| `tweetnacl.js` | `nacl-fast.js` | https://github.com/dchest/tweetnacl-js at commit `e6141a20553498697e9e7d92fbc4517994caff52` | 1.0.3 | `6bcd37a3b20dce913f82d4b23e4e2b661058b4b953df8a3f8c45d56ac4f72447` |
| `blake2b.js` | `blake2b.js` | https://github.com/dcposch/blakejs at commit `88e5b3f5895d78558da934e6f7cd960878b466af` | 1.2.1 | `79e88d06fcb301e862d7908d14698e7d2e647b850e3bfbcaf33234615a7b5219` |

Each file here is the upstream file **byte for byte**, between a `BEGIN upstream` and an `END upstream` line, with a
few lines around it that hand the library to the site as an ES module. `tests/vendor.test.js` hashes the text between
the two lines and fails if it is not exactly the upstream file, and fails if any other file appears in this folder.
blakejs loads a small helper (`util.js`) for turning its input into bytes; the wrapper supplies a stand-in that does
only that, accepts bytes only and contains no logging.

What each is used for (`js/sealedbox.js`):

* **TweetNaCl.js** (public domain; audited by Cure53 in 2017): X25519 key agreement and XSalsa20-Poly1305
  authenticated encryption (`nacl.box`), and the one-use key pair for each value.
* **blakejs** (MIT): BLAKE2b with a 24-byte output, which a sealed box uses to derive its nonce from the two public
  keys.

How it is checked against the real thing (`tests/sealedbox.test.js`, fixtures made with libsodium 1.0.18):

* with the same one-use key, the site's sealed box is byte-for-byte libsodium's;
* boxes sealed by libsodium's own `crypto_box_seal` open here;
* BLAKE2b matches libsodium's `crypto_generichash` and RFC 7693;
* before anything real is sealed, the page reproduces one known sealed box in the browser itself (`selfTest()`), and
  sends nothing if that fails.

To update a library: replace the text between the two marker lines with the new upstream file, put its SHA-256 in
`tests/vendor.test.js` and in the table above, regenerate the fixtures with libsodium, and run `npm test`.

## Licences

TweetNaCl.js is released into the public domain (The Unlicense).

blakejs is under the MIT licence:

> Copyright (c) 2022 Blakejs contributors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation
> the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
> permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of
> the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
> WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
> OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
