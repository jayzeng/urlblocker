// make-icons.js — Generate shield PNG icons for URL Blocker
// Run: node make-icons.js

const fs = require("fs");
const zlib = require("zlib");

function createPNG(size) {
  const pixels = new Uint8Array(size * size * 4);

  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Normalized coords: -1 to 1
      const nx = (x - cx + 0.5) / (size / 2);
      const ny = (y - cy + 0.5) / (size / 2);

      // ── Background circle ─────────────────────────────────────────────
      const distFromCenter = Math.sqrt(nx * nx + ny * ny);
      if (distFromCenter > 0.96) {
        // Transparent
        pixels[idx] = pixels[idx+1] = pixels[idx+2] = pixels[idx+3] = 0;
        continue;
      }

      // Default: dark navy background
      let r = 30, g = 41, b = 59, a = 255;  // slate-800

      // ── Shield shape ─────────────────────────────────────────────────
      // Shield occupies roughly 80% of the circle width, centered
      // Top: flat arch, sides taper, bottom: pointed V
      const sw = 0.62;   // half-width at top
      const st = -0.72;  // top edge
      const sb =  0.82;  // bottom tip y

      function shieldContains(px, py) {
        if (py < st || py > sb) return false;
        // Width at this y
        const t = (py - st) / (sb - st); // 0=top, 1=bottom
        let hw; // half-width
        if (t < 0.5) {
          // Upper half: slight inward curve
          hw = sw * (1 - 0.08 * t);
        } else {
          // Lower half: taper to point
          hw = sw * (1 - 0.08 * 0.5) * (1 - (t - 0.5) * 2);
        }
        return Math.abs(px) <= hw;
      }

      if (shieldContains(nx, ny)) {
        r = 255; g = 255; b = 255; // white shield
      }

      // ── Red ban / stop circle ────────────────────────────────────────
      // Only draw inner symbol for sizes > 16
      if (size >= 32) {
        const banR = 0.30;
        const banDist = Math.sqrt(nx * nx + ny * ny);
        if (banDist <= banR && shieldContains(nx, ny)) {
          // Red filled circle
          r = 220; g = 38; b = 38;  // red-600

          // White horizontal slash through the circle
          const slashThick = banR * 0.38;
          // Angled slash: y = -x*0.35 ± thickness
          const slashY = -nx * 0.4;
          if (Math.abs(ny - slashY) <= slashThick) {
            r = 255; g = 255; b = 255;
          }
        }
      } else {
        // At 16px: just draw a small red dot center of shield
        const dotR = 0.18;
        const dotDist = Math.sqrt(nx * nx + (ny + 0.05) * (ny + 0.05));
        if (dotDist <= dotR && shieldContains(nx, ny)) {
          r = 220; g = 38; b = 38;
        }
      }

      pixels[idx]   = r;
      pixels[idx+1] = g;
      pixels[idx+2] = b;
      pixels[idx+3] = a;
    }
  }

  return encodePNG(size, size, pixels);
}

function encodePNG(width, height, rgba) {
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (1 + width * 4) + 1 + x * 4;
      rawData[dst]   = rgba[src];
      rawData[dst+1] = rgba[src+1];
      rawData[dst+2] = rgba[src+2];
      rawData[dst+3] = rgba[src+3];
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = buildChunk("IHDR", (() => {
    const b = Buffer.alloc(13);
    b.writeUInt32BE(width, 0); b.writeUInt32BE(height, 4);
    b[8]=8; b[9]=6; b[10]=0; b[11]=0; b[12]=0;
    return b;
  })());
  return Buffer.concat([sig, ihdr, buildChunk("IDAT", compressed), buildChunk("IEND", Buffer.alloc(0))]);
}

function buildChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([typeBytes, data]));
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return crc ^ 0xFFFFFFFF;
}

for (const size of [16, 48, 128]) {
  const png = createPNG(size);
  const path = `icons/icon${size}.png`;
  fs.writeFileSync(path, png);
  console.log(`Created ${path} (${png.length} bytes)`);
}
console.log("Done.");
