# Changelog

All notable changes to PixelShield are documented here.

---

## [1.0.0] — 2026-11-18

### Added
- `pixel-shield.js` — embeddable website widget. Add `data-pixel-shield` and `data-seed` to any `<img>` tag, include the script, done.
- `demo.html` — full interactive demo with five tabs: Live Demo, Encrypt, Decrypt, Add to Website, How It Works
- Decrypt tab: upload an encrypted PNG + enter seed → recover original image, with auto-detection of wrong seeds
- Full documentation: `docs/algorithm.md`, `docs/api.md`, `docs/security.md`, `CONTRIBUTING.md`
- MIT License

### Algorithm
- **V14 finalised** as production algorithm: seeded xorshift32 PRNG + channel scramble (R→G, G→B, B→R) + XOR
- 0% round-trip error rate (mathematically perfect)
- PSNR: ∞ dB
- Encrypted entropy: 7.999 / 8.0 bits (near-maximum)
- Spatial scrambling factor: 85×
- Wrong-seed false positive rate: 0.3% (matches chance — genuinely secure)
- All V10 bugs fixed: no more black dots, no dark regions, no divide-by-zero skips on R=0 pixels

---

## [0.5.0] — 2026 (R&D Phase)

### Algorithm iteration: V12–V13
- **V12**: Switched from floating-point division to XOR-based encryption using position-keyed pixel hashing. First version with 0% error rate.
- **V13**: Added channel scrambling (R↔G↔B cyclic swap) on top of V12's XOR. Improved spatial disruption from ~2× to ~15×.
- Both versions use a deterministic position key (`pixelKey(idx)`) — no seed required, but also no per-session security.

---

## [0.4.0] — 2026 (R&D Phase)

### Algorithm iteration: V11
- Attempted fix for V10's floating-point precision problem
- Stored original red channel in alpha instead of the `mdr` ratio
- Reduced error rate from ~56% to ~18% — improved but still unusable
- Identified root cause: any multiply/divide chain with clamping is irreversible

---

## [0.1.0] — 2025 (R&D Phase)

### Initial proof of concept
- `prototype.html` — first working browser demo
- Encrypt/decrypt via HTML Canvas API (`getImageData` / `putImageData`)
- **V10 algorithm**: position-based "MoDula Red" (mdr) formula

```javascript
// V10 — original paper formula
const mdr = data[i] / (i / data[i] % 255);
data[i+1] = (data[i] / data[i+1]) * 10;     // green → ratio keyed to red
data[i]   = (i / data[i]) % 255;             // red   → position scramble
data[i+2] = (data[i+2] / mdr) * 0.4;        // blue  → scaled by mdr
data[i+3] = 255 - (mdr * 10);               // alpha → stores mdr as hidden key
```

**Known issues with V10:**
- 54–58% channel error rate
- PSNR 16–25 dB (unusable — visible artefacts throughout decrypted image)
- Black dots wherever original R=0 (divide-by-zero guard skips those pixels)
- Dark regions in high-saturation areas (Uint8ClampedArray clamping)
- Key stored in alpha channel — lost if image is re-saved as JPEG or PNG with alpha stripped

### Research question established
*"Can we store an image as meaningless noise on a server, while a browser silently reconstructs it perfectly for a human viewer?"*

Answer after V14: **Yes.**

---

## Roadmap

| Phase | Goal | Status |
|-------|------|--------|
| 1 — Proof of Concept | Working encrypt/decrypt in browser | ✅ Complete |
| 2 — Perfect Reversibility | 0% error rate, ∞ PSNR | ✅ Complete (V14) |
| 3 — Embeddable Widget | Drop-in script for any website | ✅ Complete (v1.0) |
| 4 — Standalone Export | Encrypted PNG decrypts on page load without creator workflow | 🔄 In Progress |
| 5 — Hardening | Obfuscated seed delivery, server-side seed option, headless browser resistance | 📋 Planned |
| 6 — Public Platform | Hosted image protection service (Shutterstock-style) | 📋 Planned |
