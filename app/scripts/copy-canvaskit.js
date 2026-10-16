// Copies the CanvasKit WASM used by React Native Skia on web into public/ (served at /canvaskit.wasm).
const fs = require('fs');
const path = require('path');

try {
  const src = require.resolve('canvaskit-wasm/bin/full/canvaskit.wasm');
  const dest = path.join(__dirname, '..', 'public', 'canvaskit.wasm');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('› canvaskit.wasm copied to public/');
} catch (err) {
  console.warn('› Could not copy canvaskit.wasm (web Skia will not load):', err.message);
}
