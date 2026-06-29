/**
 * SHA-1 v5 UUID derivation for kit-account names.
 *
 * Mirrors `service.AccountUUIDFromName` in the Go backend
 * (`mdp-module-facebook/backend/internal/service/account_uuid.go`)
 * byte-for-byte: same RFC4122 v5 algorithm, same fixed namespace
 * (`8c3f4a1e-fb2d-4b3e-9c0a-1d2e3f4a5b6c`). Output format is the
 * canonical hyphenated UUID string.
 *
 * Why we need this in the plugin: the brain's per-account scoping key
 * is `graph_entities.scope->>'user_id'`, which the backend stores as
 * the SHA-1 v5 UUID (matching `fb_groups.assigned_account_id` and
 * `repost_jobs.account_id`). To filter the BrainDevTab UI by account,
 * the plugin must hash the kit account name into the same UUID the
 * backend uses — without round-tripping the name through the API.
 *
 * Implementation: inline SHA-1 (≈100 lines) so the call is synchronous
 * and the resulting UUID can be used directly in render code (e.g. as
 * a query param). Avoids pulling in a SHA-1 dependency just for this.
 */

const NAMESPACE_BYTES = new Uint8Array([
  0x8c, 0x3f, 0x4a, 0x1e, 0xfb, 0x2d, 0x4b, 0x3e,
  0x9c, 0x0a, 0x1d, 0x2e, 0x3f, 0x4a, 0x5b, 0x6c,
]);

// SHA-1 — FIPS 180-4, plain implementation. Adapted from public-domain
// reference implementations; no external deps.
function sha1(message: Uint8Array): Uint8Array {
  const ml = message.length * 8;
  // Pad: append 0x80, then zeros, then 64-bit big-endian length.
  const padded = new Uint8Array(((message.length + 9 + 63) >> 6) << 6);
  padded.set(message);
  padded[message.length] = 0x80;
  // 64-bit length, big-endian. JS bitwise ops are 32-bit, so split.
  // High 32 bits (top half — for our use the message is always short
  // enough that the high half is zero).
  const hi = Math.floor(ml / 0x100000000) >>> 0;
  const lo = (ml >>> 0);
  const lenIdx = padded.length - 8;
  padded[lenIdx]     = (hi >>> 24) & 0xff;
  padded[lenIdx + 1] = (hi >>> 16) & 0xff;
  padded[lenIdx + 2] = (hi >>> 8) & 0xff;
  padded[lenIdx + 3] = hi & 0xff;
  padded[lenIdx + 4] = (lo >>> 24) & 0xff;
  padded[lenIdx + 5] = (lo >>> 16) & 0xff;
  padded[lenIdx + 6] = (lo >>> 8) & 0xff;
  padded[lenIdx + 7] = lo & 0xff;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);
  for (let chunk = 0; chunk < padded.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const o = chunk + i * 4;
      w[i] = ((padded[o] << 24) | (padded[o + 1] << 16) | (padded[o + 2] << 8) | padded[o + 3]) >>> 0;
    }
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = ((x << 1) | (x >>> 31)) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const hs = [h0, h1, h2, h3, h4];
  for (let i = 0; i < 5; i++) {
    out[i * 4]     = (hs[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (hs[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (hs[i] >>> 8) & 0xff;
    out[i * 4 + 3] = hs[i] & 0xff;
  }
  return out;
}

// UTF-8 encode without depending on TextEncoder (avoids pulling the
// encoding helper into plugin/dist for what is essentially a one-shot
// string-to-bytes).
function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6));
      out.push(0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      out.push(0xe0 | (c >> 12));
      out.push(0x80 | ((c >> 6) & 0x3f));
      out.push(0x80 | (c & 0x3f));
    } else {
      // Surrogate pair.
      i++;
      const c2 = s.charCodeAt(i);
      const cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      out.push(0xf0 | (cp >> 18));
      out.push(0x80 | ((cp >> 12) & 0x3f));
      out.push(0x80 | ((cp >> 6) & 0x3f));
      out.push(0x80 | (cp & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function bytesToUuid(buf: Uint8Array): string {
  // RFC4122 v5: set version (high 4 bits of byte 6) and variant
  // (high 2 bits of byte 8) per the standard.
  const b = new Uint8Array(buf);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(b[i].toString(16).padStart(2, '0'));
  }
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

/**
 * Deterministic UUID v5 from a kit account name. Output matches
 * `service.AccountUUIDFromName(name)` in the Go backend exactly.
 *
 * Sync so callers can use the result inline in render code (e.g. as
 * a query param without awaiting a Promise).
 */
export function accountUUIDFromName(name: string): string {
  const input = new Uint8Array(NAMESPACE_BYTES.length + utf8(name).length);
  input.set(NAMESPACE_BYTES, 0);
  input.set(utf8(name), NAMESPACE_BYTES.length);
  return bytesToUuid(sha1(input));
}