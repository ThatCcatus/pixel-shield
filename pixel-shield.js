/**
 * pixel-shield.js — v1.0
 * Anti-AI image encryption widget
 *
 * Usage (decrypt images on page load):
 *   <img src="encrypted-photo.png" data-pixel-shield data-seed="3735928559">
 *   <script src="pixel-shield.js"></script>
 *
 * Usage (encrypt images in browser — creator workflow):
 *   PixelShield.encrypt(imageElement, seed).then(blob => ...)
 *
 * How it works:
 *   Images are stored as pixel-scrambled noise on the server.
 *   Web scrapers downloading the raw PNG get random-looking data.
 *   This script silently decrypts each protected image in the
 *   visitor's browser using V14 (seeded PRNG + channel scramble),
 *   swapping the scrambled image with the real one — invisibly,
 *   in under a second.
 *
 * Hudson Horwood, with support from Graham Barclay
 */

(function (global) {
  'use strict';

  // ── V14 Algorithm ────────────────────────────────────────────────────────────
  // Seeded xorshift32 PRNG — generates unique per-pixel keys from a secret seed.
  // Without the seed, brute-forcing 2^32 possibilities × 65k pixels is infeasible.

  function seededPRNG(seed) {
    let s = (seed >>> 0) || 1; // ensure non-zero
    return function () {
      s ^= s << 13;
      s ^= s >> 17;
      s ^= s << 5;
      return (s >>> 0) & 0xff;
    };
  }

  /**
   * Encrypt a Uint8ClampedArray of pixel data in-place (returns new array).
   * Layout: [R,G,B,A, R,G,B,A, ...]
   *
   * What it does to each pixel:
   *   encrypted_R = original_G  XOR  key_r
   *   encrypted_G = original_B  XOR  key_g
   *   encrypted_B = original_R  XOR  key_b
   *   encrypted_A = 255  (always opaque, no information leaks via alpha)
   */
  function encryptPixels(data, seed) {
    const d = new Uint8ClampedArray(data);
    const rng = seededPRNG(seed);
    for (let i = 0; i < d.length; i += 4) {
      const kr = rng(), kg = rng(), kb = rng();
      rng(); // consume 4th to keep PRNG state aligned per pixel
      const r = data[i], g = data[i + 1], b = data[i + 2];
      d[i]     = g ^ kr; // R slot ← original G
      d[i + 1] = b ^ kg; // G slot ← original B
      d[i + 2] = r ^ kb; // B slot ← original R
      d[i + 3] = 255;
    }
    return d;
  }

  /**
   * Decrypt a Uint8ClampedArray of pixel data (returns new array).
   * Exactly reverses encryptPixels — same seed required.
   */
  function decryptPixels(data, seed) {
    const d = new Uint8ClampedArray(data);
    const rng = seededPRNG(seed);
    for (let i = 0; i < d.length; i += 4) {
      const kr = rng(), kg = rng(), kb = rng();
      rng();
      // Un-XOR each slot to get original channels back
      const origG = data[i]     ^ kr; // slot 0 was G ^ kr
      const origB = data[i + 1] ^ kg; // slot 1 was B ^ kg
      const origR = data[i + 2] ^ kb; // slot 2 was R ^ kb
      d[i]     = origR;
      d[i + 1] = origG;
      d[i + 2] = origB;
      d[i + 3] = 255;
    }
    return d;
  }

  // ── Canvas helpers ───────────────────────────────────────────────────────────

  /**
   * Load an image src and return ImageData via an offscreen canvas.
   * Works with cross-origin images if the server sends CORS headers
   * (or if the image is on the same origin).
   */
  function loadImageData(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve({ imageData, canvas, ctx, width: canvas.width, height: canvas.height });
        } catch (e) {
          reject(new Error('PixelShield: Cannot read pixels (CORS?). ' + e.message));
        }
      };
      img.onerror = function () {
        reject(new Error('PixelShield: Failed to load image: ' + src));
      };
      img.src = src;
    });
  }

  /**
   * Given pixel data and dimensions, write to canvas and return a data URL.
   */
  function pixelsToDataURL(pixelData, width, height, format) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixelData);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL(format || 'image/png');
  }

  /**
   * Given pixel data and dimensions, return a Blob.
   */
  function pixelsToBlob(pixelData, width, height, format) {
    return new Promise(function (resolve) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(width, height);
      imageData.data.set(pixelData);
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(resolve, format || 'image/png');
    });
  }

  // ── Core API ─────────────────────────────────────────────────────────────────

  var PixelShield = {

    /**
     * Decrypt a single <img> element that has been pixel-shield encrypted.
     * Replaces the img src with the decrypted version (as a data URL).
     *
     * @param {HTMLImageElement} imgEl  - The image element to decrypt
     * @param {number} seed            - The encryption seed (must match encrypt)
     * @returns {Promise<void>}
     */
    decryptImage: function (imgEl, seed) {
      var src = imgEl.getAttribute('data-src') || imgEl.src;
      return loadImageData(src).then(function (result) {
        var decrypted = decryptPixels(result.imageData.data, seed);
        var dataURL = pixelsToDataURL(decrypted, result.width, result.height);
        imgEl.src = dataURL;
        imgEl.removeAttribute('data-src');
        imgEl.classList.add('pixel-shield-decrypted');
        imgEl.dispatchEvent(new CustomEvent('pixelshield:decrypted', { bubbles: true }));
      });
    },

    /**
     * Encrypt an image element and return a Blob of the encrypted PNG.
     * Use this in your creator workflow to generate the encrypted file
     * you'll store on the server.
     *
     * @param {HTMLImageElement|string} imgOrSrc  - Image element or src URL
     * @param {number} seed                       - Encryption seed
     * @param {string} [format]                   - MIME type, default 'image/png'
     * @returns {Promise<Blob>}
     */
    encrypt: function (imgOrSrc, seed, format) {
      var src = typeof imgOrSrc === 'string' ? imgOrSrc : (imgOrSrc.src || imgOrSrc.getAttribute('data-src'));
      return loadImageData(src).then(function (result) {
        var encrypted = encryptPixels(result.imageData.data, seed);
        return pixelsToBlob(encrypted, result.width, result.height, format || 'image/png');
      });
    },

    /**
     * Encrypt an image and return a data URL (useful for previewing).
     */
    encryptToDataURL: function (imgOrSrc, seed) {
      var src = typeof imgOrSrc === 'string' ? imgOrSrc : (imgOrSrc.src || imgOrSrc.getAttribute('data-src'));
      return loadImageData(src).then(function (result) {
        var encrypted = encryptPixels(result.imageData.data, seed);
        return pixelsToDataURL(encrypted, result.width, result.height);
      });
    },

    /**
     * Scan the page for all images marked data-pixel-shield and decrypt them.
     * Called automatically on DOMContentLoaded.
     *
     * @param {string} [selector]  - Custom CSS selector, default '[data-pixel-shield]'
     * @returns {Promise<number>}  - Number of images decrypted
     */
    decryptAll: function (selector) {
      selector = selector || '[data-pixel-shield]';
      var images = Array.from(document.querySelectorAll(selector));
      if (images.length === 0) return Promise.resolve(0);

      var promises = images.map(function (img) {
        var seed = parseInt(img.getAttribute('data-seed') || img.getAttribute('data-ps-seed'), 10);
        if (isNaN(seed)) {
          seed = PixelShield.defaultSeed;
        }
        // Preserve the original src so we can still load it after swapping
        if (!img.getAttribute('data-src')) {
          img.setAttribute('data-src', img.src);
        }
        return PixelShield.decryptImage(img, seed).catch(function (err) {
          console.warn('PixelShield: Could not decrypt image', img, err);
        });
      });

      return Promise.all(promises).then(function () { return images.length; });
    },

    /**
     * Default seed used when no data-seed attribute is found.
     * Set this before the script runs: PixelShield.defaultSeed = 12345;
     * Or set it in a data attribute on the script tag:
     *   <script src="pixel-shield.js" data-default-seed="12345"></script>
     */
    defaultSeed: 0xDEADBEEF, // 3735928559 in decimal

    /**
     * Version string.
     */
    version: '1.0.0',

    /**
     * Low-level access to the encryption algorithm.
     * Useful if you want to process raw pixel arrays directly.
     */
    algorithm: {
      encrypt: encryptPixels,
      decrypt: decryptPixels,
      prng: seededPRNG,
    },
  };

  // ── Auto-init ────────────────────────────────────────────────────────────────
  // Read default seed from script tag if provided:
  //   <script src="pixel-shield.js" data-default-seed="12345"></script>
  (function () {
    var scripts = document.getElementsByTagName('script');
    var thisScript = scripts[scripts.length - 1];
    var seedAttr = thisScript && thisScript.getAttribute('data-default-seed');
    if (seedAttr) {
      PixelShield.defaultSeed = parseInt(seedAttr, 10);
    }
  })();

  // Auto-decrypt on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      PixelShield.decryptAll();
    });
  } else {
    // DOM already loaded (script added dynamically)
    PixelShield.decryptAll();
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PixelShield; // CommonJS / Node.js
  } else {
    global.PixelShield = PixelShield; // Browser global
  }

})(typeof window !== 'undefined' ? window : this);
