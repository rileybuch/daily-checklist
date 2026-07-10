// Dev-time icon generator (NOT a serve-time build step).
//
// Produces the static PNG app icons in app/icons/ as committed binary assets.
// The served app never runs this — it just loads the committed PNGs. Re-run this
// only when you want to change the icon art:
//
//     node scripts/gen-icons.mjs
//
// The art is a solid brand-green tile (matching --green / theme_color) with a
// white check glyph — deliberately simple, per the M6 task ("a solid-color tile
// with a check glyph"). PNGs are encoded here with a tiny self-contained encoder
// (zlib for IDAT compression) so there is no image-tooling dependency.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(HERE, "..", "app", "icons");

// Brand green (app/css/today.css --green) and white glyph.
const BG = [46, 125, 50];
const FG = [255, 255, 255];

// Check-glyph polyline in normalized [0,1] coordinates, with a round-capped stroke.
const CHECK = [
  [0.26, 0.52],
  [0.44, 0.7],
  [0.76, 0.32],
];
const STROKE_HALF = 0.06;

/** CRC-32 (PNG/zlib polynomial) over a byte buffer. */
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Serialize one PNG chunk: length + type + data + crc. */
function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBytes, data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), out.length - 4);
  return out;
}

/** Distance from point p to segment a-b in normalized space. */
function pointSegDist(p, a, b) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** True when the normalized point falls inside the stroked check glyph. */
function inGlyph(nx, ny) {
  for (let i = 0; i < CHECK.length - 1; i += 1) {
    if (pointSegDist([nx, ny], CHECK[i], CHECK[i + 1]) <= STROKE_HALF) {
      return true;
    }
  }
  return false;
}

/** Encode an RGB (color type 2) PNG of the given size with the check icon. */
function renderIcon(size) {
  const bytesPerRow = size * 3;
  const raw = Buffer.alloc((bytesPerRow + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (bytesPerRow + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const [r, g, b] = inGlyph(nx, ny) ? FG : BG;
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const TARGETS = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];

mkdirSync(ICONS_DIR, { recursive: true });
for (const [name, size] of TARGETS) {
  const png = renderIcon(size);
  writeFileSync(join(ICONS_DIR, name), png);
  process.stdout.write(`wrote app/icons/${name} (${size}x${size}, ${png.length} bytes)\n`);
}
