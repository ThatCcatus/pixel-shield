# Contributing to PixelShield

PixelShield is a student R&D project. Contributions are welcome in the form of bug reports, suggestions, and pull requests.

---

## Project context

This project is built as part of a Grades 2–4 R&D study (2025–2026) supervised by Ms. Poon. The goal is to understand whether pixel-level client-side encryption can protect images from AI scrapers while remaining perfectly reversible for human viewers.

The current state is a working v1.0 proof of concept. Planned next phases are described in the [CHANGELOG roadmap](CHANGELOG.md).

---

## What we welcome

- **Bug reports** — if something doesn't work in a specific browser or with a specific image format
- **Accuracy improvements** — corrections to algorithm documentation or security analysis
- **Performance improvements** — the core loop processes millions of pixels; any speedup helps
- **New test cases** — edge cases (R=0, solid-colour images, transparency, very small images)
- **Security analysis** — formal analysis of the seed space or the PRNG's statistical properties

---

## What to expect

This is a research project with a small team. We may not respond immediately but we do read everything.

---

## How to contribute

### Reporting a bug

Open a GitHub Issue with:
- Browser and OS
- What you did (steps to reproduce)
- What you expected
- What happened instead
- If possible, a screenshot or the image that triggered the issue

### Suggesting a change

Open a GitHub Issue describing what you want to change and why before writing code. It's faster to discuss direction first than to write code that doesn't fit the project.

### Submitting a pull request

1. Fork the repo
2. Create a branch: `git checkout -b fix/describe-what-you-fixed`
3. Make your changes
4. Test in at least two browsers (Chrome and Firefox)
5. Open a pull request with a clear description of what changed and why

---

## Code style

There is no build step. `pixel-shield.js` is a single self-contained file. Keep it that way:

- No dependencies, no npm, no bundler
- Vanilla JS (ES6+) only
- Keep the library under 10KB minified
- Keep variable names descriptive — this is partly an educational codebase
- Comment anything non-obvious, especially in the crypto core

---

## Testing

Currently tested manually via `demo.html`. To test a change:

1. Open `demo.html` in a browser
2. Go to the Live Demo tab
3. Upload a test image, encrypt with a known seed, decrypt with the same seed
4. Verify: 0 errors in the stats bar, identical visual output
5. Try decrypting with a different seed — verify the wrong-seed warning appears

Edge cases worth testing:
- An image where some pixels have R=0, G=0, or B=0
- A solid-colour image (all pixels identical)
- A very small image (1×1, 2×2)
- A large image (>2MP)
- A seed of 0 or 1
- A seed of 4294967295 (max uint32)

---

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
