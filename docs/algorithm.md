# Algorithm Documentation

## Overview

PixelShield encrypts images at the pixel level using a combination of:
1. **Channel scrambling** — swaps R, G, B positions cyclically
2. **XOR encryption** — applies a unique key to each channel
3. **Seeded PRNG** — generates per-pixel keys from a secret seed number

The result looks like random noise to anything that downloads the raw file. A browser with the correct seed can perfectly reverse all three steps.

---

## The V14 Algorithm (Production)

### PRNG: xorshift32

```javascript
function seededPRNG(seed) {
  let s = (seed >>> 0) || 1;  // ensure non-zero uint32
  return function() {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) & 0xFF;  // return low 8 bits (0–255)
  };
}
```

xorshift32 is a fast, well-studied PRNG. For our purposes it has two key properties:
- **Deterministic**: same seed always produces the same sequence
- **Non-repeating**: the full period is 2³² − 1 (over 4 billion values before it cycles)

We consume **4 values per pixel** (kr, kg, kb, and one discarded), keeping the state aligned regardless of image dimensions.

### Encrypt

```javascript
function encrypt(pixels, seed) {
  const d = new Uint8ClampedArray(pixels);
  const rng = seededPRNG(seed);

  for (let i = 0; i < d.length; i += 4) {
    const kr = rng(), kg = rng(), kb = rng();
    rng(); // consume 4th to keep PRNG aligned

    const r = pixels[i], g = pixels[i+1], b = pixels[i+2];

    d[i]   = g ^ kr;   // R slot ← original G XOR key_r
    d[i+1] = b ^ kg;   // G slot ← original B XOR key_g
    d[i+2] = r ^ kb;   // B slot ← original R XOR key_b
    d[i+3] = 255;      // alpha always opaque
  }
  return d;
}
```

Two operations happen per channel:
1. **Channel swap**: original R moves to B slot, G to R slot, B to G slot
2. **XOR with PRNG key**: each slot gets a unique 8-bit key

### Decrypt

```javascript
function decrypt(pixels, seed) {
  const d = new Uint8ClampedArray(pixels);
  const rng = seededPRNG(seed);

  for (let i = 0; i < d.length; i += 4) {
    const kr = rng(), kg = rng(), kb = rng();
    rng();

    // Un-XOR (XOR is its own inverse: a ^ k ^ k = a)
    const origG = pixels[i]   ^ kr;   // slot 0 was G ^ kr
    const origB = pixels[i+1] ^ kg;   // slot 1 was B ^ kg
    const origR = pixels[i+2] ^ kb;   // slot 2 was R ^ kb

    // Un-swap channels back to original positions
    d[i]   = origR;
    d[i+1] = origG;
    d[i+2] = origB;
    d[i+3] = 255;
  }
  return d;
}
```

Because XOR is exactly self-inverse (`a ^ k ^ k = a`), decryption is identical in structure to encryption — just run the same PRNG from the same seed and XOR again.

---

## Why Previous Versions Failed

### V10 — Original Paper Formula (0.1.0)

```javascript
// Encrypt
const mdr = data[i] / (i / data[i] % 255);
data[i+1] = (data[i] / data[i+1]) * 10;
data[i]   = (i / data[i]) % 255;
data[i+2] = (data[i+2] / mdr) * 0.4;
data[i+3] = 255 - (mdr * 10);           // key stored in alpha

// Decrypt
const dmr = (255 - data[i+3]) / 10;
data[i]   = data[i] * dmr;
data[i+2] = data[i+2] * dmr * 2.5;
data[i+1] = data[i] / (data[i+1] * 0.1);
```

**Why it fails:** JavaScript uses 64-bit floating-point. After multiply → clamp to 0–255 → divide, the original value cannot be exactly recovered. Example:

```
original R = 200
encrypted R = (i / 200) % 255     → 47.3... → clamped to 47
decrypted R = 47 * dmr             → 198.6... → clamped to 198
error: 2 out of 255
```

Across millions of pixels, 54–58% of channels have errors > 2. The resulting image has visible black dots (R=0 pixels skipped entirely), dark regions, and colour shifts throughout.

### V11 — Alpha Key Storage Fix (0.4.0)

Stored the original R value directly in alpha instead of `mdr * 10`. Reduced errors to ~18% but the divide chains for G and B still lost precision. Identified the real root cause: **any irreversible operation (multiply, divide, modulo) with clamping cannot be exactly undone**.

### V12 — First XOR Version (0.5.0)

Switched entirely to XOR. `a ^ key ^ key = a` exactly, always, with no floating-point involved. First version to achieve 0% error rate. Used a position-based key: `((idx ^ 0x5A5A5A) * 0x9E3779B9) >>> 0 & 0xFF`. No seed — anyone who reads the source knows the key.

### V13 — Channel Scramble Added (0.5.0)

Added R→G→B cyclic channel swap on top of V12's XOR. Same key derivation (no seed). Improved spatial scrambling from ~2× to ~15× but security still depends entirely on keeping the source code secret.

### V14 — Seeded PRNG (1.0.0)

Replaced the position-based key with a seeded xorshift32 PRNG. The seed is a 32-bit number chosen by the image owner. Without the seed, brute-forcing requires testing up to 4,294,967,295 possible seeds × the full image size — computationally infeasible for real-time scraping.

---

## Benchmark Results

Tested on three synthetic image types (256×256): gradient, random noise, and photo-like (sky + ground).

### Round-trip correctness

| Version | Error rate | PSNR | Verdict |
|---------|-----------|------|---------|
| V10 | 54–58% | 16–25 dB | ❌ Unusable |
| V11 | ~18% | ~28 dB | ❌ Unusable |
| V12 | 0% | ∞ | ✅ Perfect |
| V13 | 0% | ∞ | ✅ Perfect |
| V14 | 0% | ∞ | ✅ Perfect |

### Encryption quality (how well it hides the image from AI)

| Metric | V14 result | Meaning |
|--------|-----------|---------|
| Entropy of encrypted output | 7.999 / 8.0 bits | Near-maximum — statistically indistinguishable from random |
| Avg neighbour pixel diff (original) | 1.0 / 255 | Smooth image |
| Avg neighbour pixel diff (encrypted) | 85.4 / 255 | Looks like noise |
| Spatial scrambling factor | **85×** | No spatial patterns survive |
| Wrong-seed correct pixels | 0.3% | Matches the 0.4% expected by pure chance |
| Alpha channel in encrypted output | Always 255 | No information leaks through alpha |

---

## Security Properties

**What V14 guarantees:**
- Perfect reversibility with correct seed (PSNR ∞, 0% error)
- Encrypted output is statistically indistinguishable from random noise (entropy 7.999 bits)
- Wrong seed produces output with no correlation to original (0.3% match = chance)
- Works on all pixel values including R=0

**What V14 does not guarantee:**
- Resistance to an attacker who can run JavaScript (headless browser scraper)
- Perfect secrecy if the seed is public (seed in HTML source is visible to anyone who views source)
- Protection after JPEG re-save (lossy compression alters pixel values, breaking XOR)

See [`security.md`](security.md) for the full threat model.
