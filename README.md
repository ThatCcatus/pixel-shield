# PixelShield

**Pixel-level image encryption that defeats AI scrapers — invisible to humans, unusable by bots.**

[![Version](https://img.shields.io/badge/version-1.0.0-blue)]()
[![Algorithm](https://img.shields.io/badge/algorithm-V14%20XOR%2BPRNG-gold)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()
[![Status](https://img.shields.io/badge/status-R%26D%20Prototype-orange)]()

---

## The Problem

AI image scrapers work in two steps:
1. A web crawler follows `<img>` tags and collects image URLs
2. An HTTP downloader sends `GET` requests and saves the raw bytes

**The scraper never opens a browser. It never executes JavaScript.**

PixelShield stores only scrambled pixel noise at the image URL. The scraper downloads that noise, trains on it, and gets nothing useful. Meanwhile, your visitor's browser silently runs a 3KB script, reverses the scramble, and shows the original — in under a second, invisibly.

---

## Quick Start

**Step 1 — Encrypt your image** (open `demo.html` → "Encrypt Your Image" tab):

Upload your photo, choose a secret seed number, download the encrypted PNG.

**Step 2 — Host the encrypted PNG** on your website instead of the original.

**Step 3 — Add two things to your HTML:**

```html
<!-- Your image, now pointing to the encrypted file -->
<img
  src="encrypted-photo.png"
  data-pixel-shield
  data-seed="YOUR_SECRET_SEED"
  alt="My artwork"
>

<!-- Add once per page, just before </body> -->
<script src="pixel-shield.js"></script>
```

That's it. Visitors see the original. Scrapers download noise.

---

## Demo

Open `demo.html` in any browser — no server required.

| Tab | What it does |
|-----|-------------|
| **▶ Live Demo** | Upload any image, see original / encrypted / decrypted side-by-side with timing stats |
| **🔒 Encrypt** | Creator workflow — upload → encrypt → download the PNG to host |
| **🔓 Decrypt** | Upload an encrypted PNG + enter seed → recover the original |
| **⟨/⟩ Add to Website** | Copy-paste embed snippets and integration guide |
| **❓ How It Works** | Algorithm explainer with V10 vs V14 comparison |

---

## Files

```
pixel-shield/
├── pixel-shield.js     # The library — add to any website
├── demo.html           # Interactive demo (all features, no server needed)
├── prototype.html      # Original R&D prototype
├── docs/
│   ├── algorithm.md    # Algorithm deep-dive: V10 → V14, test results
│   ├── api.md          # Full JavaScript API reference
│   └── security.md     # Threat model and limitations
├── CHANGELOG.md        # Version history
├── CONTRIBUTING.md     # How to contribute
└── LICENSE             # MIT
```

---

## How It Works

### The V14 Algorithm

```javascript
// Seeded PRNG — unique key for every pixel, derived from a secret seed
function seededPRNG(seed) {
  let s = seed >>> 0;
  return () => { s ^= s<<13; s ^= s>>17; s ^= s<<5; return (s>>>0) & 0xFF; };
}

// ENCRYPT — run once, store result on server
for each pixel {
  const [kr, kg, kb] = [rng(), rng(), rng()];  rng(); // 4 values per pixel
  encrypted.R = original.G ^ kr;   // swap channels + XOR unique key
  encrypted.G = original.B ^ kg;
  encrypted.B = original.R ^ kb;
  encrypted.A = 255;                // always opaque
}

// DECRYPT — same seed = perfect recovery, different seed = garbage
for each pixel {
  const [kr, kg, kb] = [rng(), rng(), rng()];  rng();
  decrypted.R = encrypted.B ^ kb;
  decrypted.G = encrypted.R ^ kr;
  decrypted.B = encrypted.G ^ kg;
}
```

**Why XOR?** Unlike the original V10 formula (which used floating-point division chains), XOR is an exact bitwise operation. `a XOR key XOR key = a`, always, with zero precision loss. Combined with channel scrambling and a seeded PRNG, V14 achieves mathematically perfect decryption.

### Benchmark Results

| Metric | V10 (original) | V14 (current) |
|--------|---------------|---------------|
| Round-trip error rate | 54–58% ❌ | **0%** ✅ |
| PSNR (image quality) | 16–25 dB (unusable) ❌ | **∞ dB (perfect)** ✅ |
| Encrypted entropy | ~6 bits | **7.999 / 8.0 bits** ✅ |
| Spatial scrambling | ~2× | **85×** ✅ |
| Wrong-seed false positive | — | **0.3% (matches chance)** ✅ |
| Handles R=0 pixels | No (black dot bug) ❌ | **Yes** ✅ |

For full algorithm documentation see [`docs/algorithm.md`](docs/algorithm.md).

---

## JavaScript API

```javascript
// Auto-decrypt all [data-pixel-shield] images on page load (happens automatically)
PixelShield.decryptAll();

// Decrypt a specific image element
await PixelShield.decryptImage(imgElement, seed);

// Encrypt an image → returns a Blob (save as PNG)
const blob = await PixelShield.encrypt(imgElement, seed);

// Encrypt → data URL (useful for previewing)
const dataURL = await PixelShield.encryptToDataURL(imgElement, seed);

// Set a default seed for all images on the page
PixelShield.defaultSeed = 12345678;

// Low-level pixel array access
const encrypted = PixelShield.algorithm.encrypt(uint8ClampedArray, seed);
const decrypted = PixelShield.algorithm.decrypt(uint8ClampedArray, seed);
```

Full API reference: [`docs/api.md`](docs/api.md)

---

## Limitations

| Limitation | Detail |
|-----------|--------|
| **Social media** | Doesn't protect images uploaded to Instagram, X, TikTok — those platforms re-host on their own CDN and never run your JS |
| **Headless browsers** | A sophisticated scraper running full headless Chrome would execute the script. Mitigation: obfuscate `pixel-shield.js` and serve the seed from a backend |
| **CORS** | Encrypted image must be same-origin OR served with `Access-Control-Allow-Origin: *` |
| **JPEG re-saves** | Lossy compression breaks pixel-perfect encryption — always use PNG |
| **No server required** | Encryption is 100% client-side. Keep seeds out of public repos for maximum security |

Full threat model: [`docs/security.md`](docs/security.md)

---

## Comparison with Existing Approaches

| Approach | What it does | Why it's not enough |
|----------|-------------|---------------------|
| `robots.txt` | Asks crawlers not to index | Freely ignored |
| Visible watermark | Marks ownership | Easy to crop or inpaint |
| Metadata / IPTC | Embeds author info | Stripped on re-save |
| Glaze / Nightshade | Adversarial perturbation confuses AI training | Permanent — no reversibility for the viewer |
| **PixelShield** | Pixel encryption reversible only in browser | Hard technical barrier; scraper gets noise |

---

## Project History

This project started as an R&D question: *can we store an image as meaningless noise on a server, while a browser silently reconstructs it perfectly for a human viewer?*

The answer, after iterating through 14 formula versions, is **yes**.

See [`CHANGELOG.md`](CHANGELOG.md) for the full version history.

---

## Authors

**Hudson Horwood** and **Graham Barclay**
Supervised by Ms. Poon
Grades 2–4 R&D Project, 2025–2026

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE) — free to use, modify, and build on. Attribution appreciated.
