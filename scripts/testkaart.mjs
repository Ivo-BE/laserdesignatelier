// Testkaart fase 0 -> SVG (LightBurn), .lbrn2 (LightBurn-project) en preview-SVG.
// Gebruik: node scripts/testkaart.mjs <uitvoermap>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import opentype from 'opentype.js';
import { toSVG, toLBRN2, textToPath } from '../src/core.js';

const out = process.argv[2] || 'out';
fs.mkdirSync(out, { recursive: true });

const font = opentype.parse(fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf').buffer);

// Kleine PNG-encoder (grijswaarden) voor het testverloop
function pngGray(w, h, pix) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = pix(x, y);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

const items = [];
const add = (role, it) => items.push({ role, ...it });
const rect = (role, x, y, w, h, r = 0) => add(role, { type: 'rect', x, y, w, h, r });
const circle = (role, cx, cy, r) => add(role, { type: 'ellipse', cx, cy, rx: r, ry: r });
const line = (role, x1, y1, x2, y2) => add(role, { type: 'path', subpaths: [{ start: [x1, y1], segs: [{ t: 'L', p: [x2, y2] }], closed: false }] });
const label = (txt, x, y, size = 2.2, anchor = 'middle', role = 'vul') =>
  add(role, { type: 'path', subpaths: textToPath(font, txt, x, y, size, anchor) });

const W = 110, H = 75;

// Hulpkader T1 (alleen in SVG; niet branden)
rect('hulp', -3, -3, W + 6, H + 6);
// Buitencontour
rect('buiten', 0, 0, W, H, 4);
// Ophanggat
circle('binnen', W - 7, 7, 2.5);
// Titel
label('LASERCUT STUDIO', 6, 11, 4.2, 'start');
label('TESTKAART FASE 0', 6, 16, 2.4, 'start', 'score');

// Laagstalen
const sy = 21, sz = 14;
const cols = [0, 1, 2, 3, 4].map((i) => 6 + i * 20);
rect('vul', cols[0], sy, sz, sz);
label('C00 VUL', cols[0] + sz / 2, sy + sz + 4);
rect('vul2', cols[1], sy, sz, sz);
label('C04 VUL 2', cols[1] + sz / 2, sy + sz + 4);
rect('score', cols[2], sy, sz, sz);
line('score', cols[2], sy, cols[2] + sz, sy + sz);
line('score', cols[2] + sz, sy, cols[2], sy + sz);
label('C01 SCORE', cols[2] + sz / 2, sy + sz + 4);
add('foto', { type: 'image', x: cols[3], y: sy, w: sz, h: sz, pxW: 140, pxH: 140, png: pngGray(140, 140, (x) => Math.round((255 * x) / 139)) });
label('C05 FOTO', cols[3] + sz / 2, sy + sz + 4);
circle('binnen', cols[4] + sz / 2, sy + sz / 2, 5);
label('C03 BINNEN', cols[4] + sz / 2, sy + sz + 4);

// Kerfvierkant
rect('binnen', 6, 46, 20, 20);
label('KERF: MEET DIT', 16, 70, 2.0);

// Liniaal 50 mm
const rx = 34, ry = 47;
line('score', rx, ry, rx + 50, ry);
for (let i = 0; i <= 50; i += 5) {
  line('score', rx + i, ry, rx + i, ry + (i % 10 === 0 ? 4 : 2));
  if (i % 10 === 0) label(String(i), rx + i, ry + 7.5, 1.8);
}
label('50 MM = SCHAAL OK', rx + 25, ry - 2, 1.8);

// Sleuvenkam 3 mm
let x = 34;
for (const w of [2.8, 2.9, 3.0, 3.1, 3.2]) {
  rect('binnen', x, 63, w, 8);
  label(w.toFixed(1), x + w / 2, 61.8, 1.6);
  x += w + 4;
}
label('SLEUF 3 MM', x + 1, 68, 1.8, 'start');

const doc = { title: 'testkaart fase 0', width: W, height: H, margin: 3, items };

fs.writeFileSync(path.join(out, 'testkaart_lightburn.svg'), toSVG(doc));
fs.writeFileSync(path.join(out, 'testkaart.lbrn2'), toLBRN2(doc));
fs.writeFileSync(path.join(out, 'testkaart_preview.svg'), toSVG(doc, { preview: true }));
console.log('klaar:', fs.readdirSync(out).join(', '));
