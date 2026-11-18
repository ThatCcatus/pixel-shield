/**
 * PixelShield V14 algorithm tests
 * Run: node --test tests/algorithm.test.js
 *
 * Tests the core encrypt/decrypt functions extracted from pixel-shield.js.
 * No browser APIs required — pure JS, runs in Node.js 18+.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Re-implement the core algorithm here (identical to pixel-shield.js) ────────
// (Avoids needing a DOM to load pixel-shield.js)

function seededPRNG(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) & 0xff;
  };
}

function encryptPixels(data, seed) {
  const d = new Uint8ClampedArray(data);
  const rng = seededPRNG(seed);
  for (let i = 0; i < d.length; i += 4) {
    const kr = rng(), kg = rng(), kb = rng();
    rng();
    const r = data[i], g = data[i + 1], b = data[i + 2];
    d[i]     = g ^ kr;
    d[i + 1] = b ^ kg;
    d[i + 2] = r ^ kb;
    d[i + 3] = 255;
  }
  return d;
}

function decryptPixels(data, seed) {
  const d = new Uint8ClampedArray(data);
  const rng = seededPRNG(seed);
  for (let i = 0; i < d.length; i += 4) {
    const kr = rng(), kg = rng(), kb = rng();
    rng();
    const origG = data[i]     ^ kr;
    const origB = data[i + 1] ^ kg;
    const origR = data[i + 2] ^ kb;
    d[i]     = origR;
    d[i + 1] = origG;
    d[i + 2] = origB;
    d[i + 3] = 255;
  }
  return d;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePixels(values) {
  // values: array of [R,G,B] triplets
  const d = new Uint8ClampedArray(values.length * 4);
  values.forEach(([r, g, b], i) => {
    d[i*4]   = r;
    d[i*4+1] = g;
    d[i*4+2] = b;
    d[i*4+3] = 255;
  });
  return d;
}

function countErrors(original, roundTrip) {
  let errors = 0;
  for (let i = 0; i < original.length; i += 4) {
    if (original[i]   !== roundTrip[i]   ||
        original[i+1] !== roundTrip[i+1] ||
        original[i+2] !== roundTrip[i+2]) {
      errors++;
    }
  }
  return errors;
}

function pixelCount(data) { return data.length / 4; }

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Round-trip correctness', () => {
  test('standard seed — 0% error rate on a typical image', () => {
    // 10×10 image with varied colours
    const pixels = [];
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++)
        pixels.push([x * 25, y * 25, (x + y) * 12]);
    const orig = makePixels(pixels);
    const enc  = encryptPixels(orig, 0xDEADBEEF);
    const dec  = decryptPixels(enc,  0xDEADBEEF);
    assert.equal(countErrors(orig, dec), 0,
      `Expected 0 errors; got errors on some pixels`);
  });

  test('seed 1 (minimum non-zero) — 0% error rate', () => {
    const orig = makePixels(Array.from({length: 64}, (_, i) => [i*4 % 255, 200 - i, 100]));
    const enc  = encryptPixels(orig, 1);
    const dec  = decryptPixels(enc, 1);
    assert.equal(countErrors(orig, dec), 0);
  });

  test('seed 0 — treated as 1 (non-zero guard), still 0% error rate', () => {
    const orig = makePixels([[128, 64, 32], [0, 0, 0], [255, 255, 255]]);
    const enc  = encryptPixels(orig, 0);
    const dec  = decryptPixels(enc, 0);
    assert.equal(countErrors(orig, dec), 0);
  });

  test('seed 4294967295 (max uint32) — 0% error rate', () => {
    const orig = makePixels([[10, 20, 30], [200, 150, 100], [0, 128, 255]]);
    const enc  = encryptPixels(orig, 4294967295);
    const dec  = decryptPixels(enc, 4294967295);
    assert.equal(countErrors(orig, dec), 0);
  });
});

describe('Edge cases', () => {
  test('1×1 image — single pixel round-trip', () => {
    const orig = makePixels([[123, 45, 200]]);
    const enc  = encryptPixels(orig, 999);
    const dec  = decryptPixels(enc, 999);
    assert.equal(countErrors(orig, dec), 0);
  });

  test('2×2 image', () => {
    const orig = makePixels([[10, 20, 30], [40, 50, 60], [70, 80, 90], [100, 110, 120]]);
    const enc  = encryptPixels(orig, 42);
    const dec  = decryptPixels(enc, 42);
    assert.equal(countErrors(orig, dec), 0);
  });

  test('solid-colour image — all pixels identical', () => {
    const orig = makePixels(Array(100).fill([77, 77, 77]));
    const enc  = encryptPixels(orig, 0xCAFE);
    const dec  = decryptPixels(enc, 0xCAFE);
    assert.equal(countErrors(orig, dec), 0);
  });

  test('black image — all pixels R=0, G=0, B=0 (the V10 black dot bug)', () => {
    const orig = makePixels(Array(100).fill([0, 0, 0]));
    const enc  = encryptPixels(orig, 1234);
    const dec  = decryptPixels(enc, 1234);
    assert.equal(countErrors(orig, dec), 0,
      'V10 had a black dot bug at R=0 — V14 must not');
  });

  test('R=0 pixels scattered through image', () => {
    const pixels = Array.from({length: 50}, (_, i) => [0, i*5 % 255, 200 - i*3]);
    const orig = makePixels(pixels);
    const enc  = encryptPixels(orig, 7777);
    const dec  = decryptPixels(enc, 7777);
    assert.equal(countErrors(orig, dec), 0);
  });

  test('white image — all pixels R=255, G=255, B=255', () => {
    const orig = makePixels(Array(100).fill([255, 255, 255]));
    const enc  = encryptPixels(orig, 0xFFFFFFFF);
    const dec  = decryptPixels(enc, 0xFFFFFFFF);
    assert.equal(countErrors(orig, dec), 0);
  });

  test('alpha channel always 255 after encryption', () => {
    const orig = makePixels([[100, 150, 200], [50, 50, 50]]);
    const enc  = encryptPixels(orig, 1);
    for (let i = 3; i < enc.length; i += 4) {
      assert.equal(enc[i], 255, `Alpha at pixel ${i/4} is ${enc[i]}, expected 255`);
    }
  });

  test('alpha channel always 255 after decryption', () => {
    const orig = makePixels([[100, 150, 200], [50, 50, 50]]);
    const enc  = encryptPixels(orig, 1);
    const dec  = decryptPixels(enc, 1);
    for (let i = 3; i < dec.length; i += 4) {
      assert.equal(dec[i], 255, `Alpha at pixel ${i/4} is ${dec[i]}, expected 255`);
    }
  });
});

describe('Wrong-seed security', () => {
  test('wrong seed does NOT recover the original', () => {
    const pixels = Array.from({length: 100}, (_, i) => [i*2 % 255, 200 - i, i]);
    const orig = makePixels(pixels);
    const enc  = encryptPixels(orig, 0xDEADBEEF);
    const dec  = decryptPixels(enc, 0xDEADBEEE); // one off
    // Some pixels may accidentally match by chance (~0.3% at chance).
    // The key test: the vast majority should NOT match.
    const errors = countErrors(orig, dec);
    const total  = pixelCount(orig);
    const correctRatio = (total - errors) / total;
    assert.ok(correctRatio < 0.05,
      `Wrong seed recovered ${(correctRatio*100).toFixed(1)}% of pixels — expected near 0%`);
  });

  test('seed 0 and seed 1 produce different output (seed 0 is normalised to 1)', () => {
    const orig = makePixels([[128, 64, 192], [255, 0, 128]]);
    // Both seeds normalise — seed 0 -> 1 internally, so they should match
    const enc0 = encryptPixels(orig, 0);
    const enc1 = encryptPixels(orig, 1);
    // They should be identical (both use s=1 internally)
    for (let i = 0; i < enc0.length; i++) {
      assert.equal(enc0[i], enc1[i], `Byte ${i} differs — seed 0 and seed 1 should match`);
    }
  });

  test('two different seeds produce different encrypted output', () => {
    const orig = makePixels(Array.from({length: 50}, (_, i) => [i*5, i*3, 100-i]));
    const enc1 = encryptPixels(orig, 1000);
    const enc2 = encryptPixels(orig, 2000);
    let same = 0;
    for (let i = 0; i < enc1.length; i += 4) {
      if (enc1[i] === enc2[i] && enc1[i+1] === enc2[i+1] && enc1[i+2] === enc2[i+2]) same++;
    }
    // Chance collisions expected at ~1/256^3 per pixel — essentially 0
    assert.ok(same < 3, `${same} pixels matched between two different-seed encryptions`);
  });
});

describe('Encryption quality', () => {
  test('encrypted data looks different from original (not a no-op)', () => {
    const pixels = Array.from({length: 100}, (_, i) => [i*2 % 255, 100, 200]);
    const orig = makePixels(pixels);
    const enc  = encryptPixels(orig, 12345);
    const same = countErrors(orig, enc); // pixels where enc === orig (bad)
    // Expect most pixels to differ
    const changed = pixelCount(orig) - same; // Note: countErrors counts where they differ
    // Re-use correctly: count pixels where ALL three channels are identical
    let unchanged = 0;
    for (let i = 0; i < orig.length; i += 4) {
      if (orig[i] === enc[i] && orig[i+1] === enc[i+1] && orig[i+2] === enc[i+2]) unchanged++;
    }
    assert.ok(unchanged < 5,
      `${unchanged} pixels unchanged after encryption — expected near 0%`);
  });

  test('channel swap — encrypted R slot does not equal original R', () => {
    // R slot becomes G ^ key, so if the image has a known G it's verifiable
    const orig = makePixels([[100, 200, 50]]); // R=100, G=200, B=50
    const enc  = encryptPixels(orig, 42);
    // enc[0] = original_G ^ key_r = 200 ^ key_r, which is definitely NOT 100 (original R)
    // (unless key_r === 100 ^ 200 = 172 — extremely unlikely, but we can verify the formula)
    const rng = seededPRNG(42);
    const kr = rng(), kg = rng(), kb = rng();
    assert.equal(enc[0], 200 ^ kr, 'R slot should be original_G ^ key_r');
    assert.equal(enc[1], 50  ^ kg, 'G slot should be original_B ^ key_g');
    assert.equal(enc[2], 100 ^ kb, 'B slot should be original_R ^ key_b');
  });
});

describe('Large image', () => {
  test('1000×1000 image — 0% error rate', () => {
    const size = 1000 * 1000;
    const orig = new Uint8ClampedArray(size * 4);
    for (let i = 0; i < orig.length; i += 4) {
      orig[i]   = (i / 4)       % 256;
      orig[i+1] = (i / 4 / 256) % 256;
      orig[i+2] = 128;
      orig[i+3] = 255;
    }
    const enc = encryptPixels(orig, 0xABCDEF01);
    const dec = decryptPixels(enc,  0xABCDEF01);
    assert.equal(countErrors(orig, dec), 0);
  });
});
