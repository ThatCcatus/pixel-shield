# Security Model

PixelShield is a **client-side image encryption system** built to defend against one specific threat: automated HTTP scrapers that download images without executing JavaScript.

This document covers what PixelShield does and doesn't protect against, the seed model, and how to harden a deployment.

---

## Threat Model

### Who PixelShield is designed against

**Standard AI image scrapers.**

These work by:
1. Web crawling — following links and finding `<img src="...">` URLs
2. HTTP downloading — sending `GET` requests to those URLs and saving the bytes

They have no JavaScript runtime. They see only the raw bytes at the image URL. PixelShield stores scrambled noise at that URL, so the scraper trains on garbage.

This covers the majority of real-world scraping tools, including:
- Common Crawl and LAION-5B style scrapers
- Simple wget/curl pipelines collecting image datasets
- Search engine image crawlers that don't execute JS

---

### Who PixelShield is NOT designed against

**Headless browser scrapers.**

A sophisticated attacker running full headless Chrome (Puppeteer, Playwright) can execute your JavaScript, see the decrypted image in the DOM, and capture it via screenshot or canvas extraction.

**Mitigation:** This can be significantly slowed by:
- Minifying and obfuscating `pixel-shield.js`
- Serving the seed from a backend endpoint that rate-limits and validates sessions
- Requiring a login before the seed is issued

None of these are perfect defenses, but they raise the cost and complexity enough that mass scraping becomes impractical compared to scraping unprotected sites.

---

## The Seed

The seed is a 32-bit integer (0 – 4,294,967,295) that initializes the PRNG. It is the only secret in the system.

### What happens with a wrong seed

A wrong seed produces output with ~0.3% channel match — identical to pure chance. There is no partial decryption, no degraded image. Without the seed, the ciphertext is information-theoretically close to noise.

### Brute-force infeasibility

Brute-forcing requires testing up to 4,294,967,295 seeds. For each seed attempt, the attacker must:
1. Run the PRNG for every pixel (a 1920×1080 image = 2,073,600 pixels × 4 PRNG values = 8.3M operations)
2. Evaluate whether the output "looks like a real image" (non-trivial heuristic)
3. Repeat

At 100 million seed attempts per second, exhaustive search takes ~43 seconds of CPU time — not infeasible for a determined attacker with one target image. For mass scraping at scale (millions of images), it is not feasible.

**For higher security**, use a 128-bit or larger seed space (this would require extending the PRNG beyond xorshift32, which is a planned future enhancement).

### Seed exposure risks

| Risk | Severity | Notes |
|------|----------|-------|
| Seed in HTML source | Medium | Anyone who views source sees it. Acceptable for most use cases; mitigate by serving seed from backend |
| Seed in JS bundle | Medium | Same as above. Obfuscation makes it harder to extract |
| Seed in browser network tab | Medium | Visible to anyone with devtools. Mitigate with short-lived tokens |
| Seed committed to a public repo | High | Never commit seeds to public source control |

---

## What the encrypted image reveals

The encrypted output reveals:
- **Image dimensions** — width and height are stored in the PNG header, unencrypted
- **File size** — correlated with image content density
- **Nothing else** — pixel values are statistically indistinguishable from random noise (entropy 7.999 bits)

For use cases where even dimensions are sensitive, a future version will support padding to fixed dimensions.

---

## Format constraints

### PNG only

PixelShield requires the encrypted image to be saved as a lossless PNG. JPEG compression is lossy — it alters pixel values by small amounts, which breaks XOR decryption.

If a JPEG-encoded encrypted image is decrypted, the output will appear as noise with slight distortions. PixelShield's wrong-seed heuristic will likely flag this as "wrong seed."

### Alpha channel

PixelShield always writes `alpha = 255` (fully opaque) in the encrypted output. This means:
- No information leaks through the alpha channel
- Original images with transparency will have their transparency replaced by solid opaque pixels in the encrypted form

A future version will support preserving transparency.

---

## Deployment checklist

### Minimum viable deployment
- [ ] Serve encrypted PNG from same origin as the page, or add `Access-Control-Allow-Origin: *` to the image server
- [ ] Keep `data-seed` values out of public source control
- [ ] Use different seeds for different images (re-using the same seed across images doesn't help an attacker, but it's good practice)

### Recommended hardening
- [ ] Minify and obfuscate `pixel-shield.js` before deployment
- [ ] Serve the seed from a backend API endpoint, not embedded in HTML
- [ ] Rate-limit the seed API (e.g. 10 requests per IP per minute)
- [ ] Issue short-lived seed tokens (the seed changes every 24 hours; re-encryption runs on a schedule)
- [ ] Log unusual patterns (many failed seed lookups from one IP)

### For maximum protection
- [ ] Require a login/session before the seed is issued
- [ ] Watermark the decrypted image (invisible, recoverable watermark) so leaked copies can be traced
- [ ] Consider a larger seed space (128-bit) when the brute-force window matters

---

## Comparison with other approaches

| Approach | Protects against scrapers | Reversible | Implementation effort |
|----------|--------------------------|------------|----------------------|
| `robots.txt` | No — freely ignored | N/A | None |
| Visible watermark | No | N/A | Low |
| Metadata / IPTC | No — stripped on download | N/A | Low |
| Glaze / Nightshade | Partially — confuses AI training | No | Medium |
| PixelShield (client-side seed) | Yes — against HTTP scrapers | Yes | Low–Medium |
| PixelShield (server-side seed) | Yes — including most headless scrapers | Yes | Medium–High |

---

## Known limitations

| Limitation | Workaround |
|-----------|------------|
| Social media platforms re-host images — your JS never runs | Don't upload to platforms you don't control |
| Headless browser scrapers can execute the decryption | Obfuscate + serve seed from backend |
| JPEG re-saves break decryption | Always use PNG; warn users not to re-save as JPEG |
| Image dimensions leak from PNG header | Pad to fixed dimensions (planned) |
| Transparency is replaced by opaque pixels | Transparency support planned |
| Seed is 32-bit (brute-forceable for a single target) | Larger seed space planned |
