# JavaScript API Reference

PixelShield exposes a single global object `PixelShield` with five methods and two properties.

---

## Auto-initialization

Include the script once per page and add `data-pixel-shield` to any image:

```html
<img
  src="encrypted-photo.png"
  data-pixel-shield
  data-seed="12345678"
  alt="My photo"
>
<script src="pixel-shield.js"></script>
```

On `DOMContentLoaded`, PixelShield automatically finds every `[data-pixel-shield]` element and calls `decryptImage()` on each. No code required.

**Seed priority** (highest to lowest):
1. `data-seed` attribute on the `<img>` element
2. `PixelShield.defaultSeed` (set in JS before `DOMContentLoaded`)
3. `data-default-seed` attribute on the `<script>` tag

---

## `PixelShield.defaultSeed`

**Type:** `number`

Default seed used for all images that don't have their own `data-seed` attribute.

```javascript
PixelShield.defaultSeed = 99887766;
```

Must be set before `DOMContentLoaded` fires to affect auto-initialization.

---

## `PixelShield.decryptAll()`

Re-runs auto-initialization. Finds every `[data-pixel-shield]` element in the document and decrypts it.

```javascript
PixelShield.decryptAll();
```

Useful if you inject `<img data-pixel-shield>` elements dynamically after page load.

**Returns:** `Promise<void>`

---

## `PixelShield.decryptImage(imgElement, seed?)`

Decrypts a single image element in-place, replacing its visual content with the decrypted version.

```javascript
const img = document.getElementById('my-image');
await PixelShield.decryptImage(img, 12345678);
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `imgElement` | `HTMLImageElement` | Yes | The `<img>` element to decrypt |
| `seed` | `number` | No | 32-bit seed. Falls back to `data-seed` attribute, then `PixelShield.defaultSeed` |

**Returns:** `Promise<void>`

**Throws:** If the image hasn't loaded or is cross-origin without CORS headers.

---

## `PixelShield.encrypt(imgElement, seed)`

Encrypts an image and returns the result as a `Blob` (PNG format). Use this to generate encrypted PNGs for hosting.

```javascript
const img = document.getElementById('original-photo');
const blob = await PixelShield.encrypt(img, 12345678);

// Save as file
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'encrypted.png';
a.click();
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `imgElement` | `HTMLImageElement` | Yes | The original (unencrypted) image |
| `seed` | `number` | Yes | 32-bit seed used to encrypt |

**Returns:** `Promise<Blob>` — PNG image data

---

## `PixelShield.encryptToDataURL(imgElement, seed)`

Same as `encrypt()` but returns a data URL string instead of a Blob. Useful for previewing the encrypted result without file I/O.

```javascript
const dataURL = await PixelShield.encryptToDataURL(img, 12345678);
previewImg.src = dataURL;
```

**Parameters:** Same as `encrypt()`.

**Returns:** `Promise<string>` — `data:image/png;base64,...`

---

## `PixelShield.algorithm`

Low-level access to the raw encrypt/decrypt functions. Operates directly on `Uint8ClampedArray` pixel data.

```javascript
const PixelShield.algorithm = {
  encrypt(pixelData, seed) → Uint8ClampedArray,
  decrypt(pixelData, seed) → Uint8ClampedArray
};
```

### `PixelShield.algorithm.encrypt(pixelData, seed)`

```javascript
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
ctx.drawImage(imgElement, 0, 0);
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

const encryptedPixels = PixelShield.algorithm.encrypt(imageData.data, 12345678);
ctx.putImageData(new ImageData(encryptedPixels, canvas.width, canvas.height), 0, 0);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `pixelData` | `Uint8ClampedArray` | Flat RGBA pixel array from `getImageData()` |
| `seed` | `number` | 32-bit integer seed |

**Returns:** `Uint8ClampedArray` — encrypted pixel data (same length as input)

### `PixelShield.algorithm.decrypt(pixelData, seed)`

Identical signature to `encrypt`. Decryption is the mathematical inverse — pass the same seed and the original pixels are recovered exactly.

---

## CORS Requirements

PixelShield reads pixel data via the Canvas API (`getImageData`). The browser's same-origin policy applies:

| Image origin | Works? | Fix |
|-------------|--------|-----|
| Same origin as the page | ✅ Always | — |
| Different domain with `Access-Control-Allow-Origin: *` | ✅ Works | Add CORS header on image server |
| Different domain without CORS header | ❌ Fails | Move image to same origin or add CORS header |
| `data:` URL | ✅ Works | — |

---

## Multiple images with different seeds

```html
<img src="photo1.png" data-pixel-shield data-seed="11111111" alt="Photo 1">
<img src="photo2.png" data-pixel-shield data-seed="22222222" alt="Photo 2">
<img src="photo3.png" data-pixel-shield data-seed="33333333" alt="Photo 3">
<script src="pixel-shield.js"></script>
```

Each image uses its own `data-seed`. Auto-initialization handles all three.

---

## Dynamic content

```javascript
// Images loaded after page init
async function loadGallery(items) {
  for (const item of items) {
    const img = document.createElement('img');
    img.src = item.encryptedUrl;
    img.dataset.pixelShield = '';
    img.dataset.seed = item.seed;
    gallery.appendChild(img);
    img.onload = () => PixelShield.decryptImage(img);
  }
}
```

---

## TypeScript type definitions

```typescript
interface PixelShieldAlgorithm {
  encrypt(pixelData: Uint8ClampedArray, seed: number): Uint8ClampedArray;
  decrypt(pixelData: Uint8ClampedArray, seed: number): Uint8ClampedArray;
}

interface PixelShieldAPI {
  defaultSeed: number;
  algorithm: PixelShieldAlgorithm;
  decryptAll(): Promise<void>;
  decryptImage(imgElement: HTMLImageElement, seed?: number): Promise<void>;
  encrypt(imgElement: HTMLImageElement, seed: number): Promise<Blob>;
  encryptToDataURL(imgElement: HTMLImageElement, seed: number): Promise<string>;
}

declare const PixelShield: PixelShieldAPI;
```
