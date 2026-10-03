// Laser Design Atelier - exportkern
// Eén ontwerpmodel (mm, y naar beneden) -> SVG (LightBurn-profiel) en LightBurn-project (.lbrn2).
// Werkt in de browser en in Node (geen afhankelijkheden; tekst via opentype.js, door de aanroeper geleverd).

// ---------------------------------------------------------------------------
// Rollen: wat een object DOET. Kleur/laag/modus volgen uit de rol.
// layer = LightBurn-laagnummer (bepaalt de kleur in LightBurn).
// mode: 'Scan' = Fill, 'Cut' = Line, 'Image' = bitmap, 'Tool' = niet branden.
// Snelheid (mm/s) en vermogen (%) zijn STARTWAARDEN; stel ze af op je eigen laser.
// ---------------------------------------------------------------------------
export const ROLES = [
  { id: 'vul',    label: 'Vlak graveren',           short: 'Vlak graveren',  desc: 'Brandt het hele vlak in: donker resultaat.',                         layer: 0,  color: '#000000', mode: 'Scan',  fill: true,  speed: 300, power: 20, interval: 0.1 },
  { id: 'vul2',   label: 'Vlak graveren (licht)',   short: 'Vlak licht',     desc: 'Zelfde, met minder vermogen: een lichtere tint.',                    layer: 4,  color: '#D0D000', mode: 'Scan',  fill: true,  speed: 300, power: 12, interval: 0.1 },
  { id: 'foto',   label: 'Foto graveren',           short: 'Foto',           desc: 'Grijswaarden worden gerasterd gegraveerd.',                          layer: 5,  color: '#FF8000', mode: 'Image', fill: false, speed: 300, power: 18, interval: 0.1, dither: 'jarvis' },
  { id: 'score',  label: 'Lijn graveren',           short: 'Lijn graveren',  desc: 'De laser volgt de lijn op laag vermogen en snijdt niet door.',       layer: 1,  color: '#0000FF', mode: 'Cut',   fill: false, speed: 100, power: 15 },
  { id: 'binnen', label: 'Uitsnijden: gat',         short: 'Gat',            desc: 'Snijdt door. Voor gaten en uitsparingen in het werkstuk. Normaal als eerste van de snedes.', layer: 3, color: '#00E000', mode: 'Cut', fill: false, speed: 10, power: 60 },
  { id: 'buiten', label: 'Uitsnijden: buitenrand',  short: 'Buitenrand',     desc: 'Snijdt door. De omtrek die het werkstuk uit de plaat haalt. Normaal als allerlaatste.', layer: 2, color: '#FF0000', mode: 'Cut', fill: false, speed: 10, power: 60 },
  { id: 'hulp',   label: 'Hulplijn',                short: 'Hulplijn',       desc: 'Alleen om te richten. Wordt niet gelaserd.',                        layer: 'T1', color: '#F36926', mode: 'Tool', fill: false },
];
export const ROLE = Object.fromEntries(ROLES.map((r) => [r.id, r]));

// Rollen in uitvoervolgorde. order = lijst met rol-ids (doc.layerOrder); ontbrekende rollen
// komen achteraan in hun standaardvolgorde. Hulplijnen staan altijd als laatste.
export function orderedRoles(order) {
  const ids = Array.isArray(order) ? order.filter((id) => ROLE[id]) : [];
  const rest = ROLES.map((r) => r.id).filter((id) => !ids.includes(id));
  return [...ids, ...rest].map((id) => ROLE[id]).sort((a, b) => (a.mode === 'Tool') - (b.mode === 'Tool'));
}

// ---------------------------------------------------------------------------
// Model
//   doc = { width, height, margin, items: [...] }   (mm)
//   item.type: 'rect'   {x,y,w,h,r}
//              'ellipse'{cx,cy,rx,ry}
//              'path'   {subpaths:[{start:[x,y], segs:[{t:'L',p}|{t:'C',c1,c2,p}], closed}]}
//              'image'  {x,y,w,h, png (base64), pxW, pxH}
//   item.role: id uit ROLES
// ---------------------------------------------------------------------------

const num = (v) => {
  const s = (Math.round(v * 10000) / 10000).toFixed(4);
  return s.replace(/\.?0+$/, '') || '0';
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// Tekst naar paden (opentype.js-font). Kwadratische bochten worden kubisch.
// size = kapitaalhoogte in mm, y = basislijn.
// ---------------------------------------------------------------------------
export function textToPath(font, text, x, y, size, anchor = 'start', opts = {}) {
  const capRatio = (font.tables.os2 && font.tables.os2.sCapHeight) ? font.tables.os2.sCapHeight / font.unitsPerEm : 0.72;
  const fontSize = size / capRatio;
  const spacing = opts.spacing || 0;              // extra letterafstand in mm
  const lineGap = (opts.lineHeight || 1.6) * size; // afstand tussen basislijnen in mm
  // Eigen eenvoudige opmaak (teken -> glyph + kerning); robuuster dan de
  // volledige OpenType-shaping, die op sommige fonts faalt.
  const scale = fontSize / font.unitsPerEm;
  const cmds = [];
  const bend = ((opts.bend || 0) * Math.PI) / 180; // boog: totale hoek van de regel in radialen
  String(text).split('\n').forEach((line, li) => {
    // hartje: geen enkel lettertype heeft het, dus zelf tekenen
    const heart = () => {
      const H = fontSize * capRatio, W = H * 1.05;
      const pts = [[0.5, 0.3], [0.5, 0.05, 0.1, -0.05, 0.02, 0.3], [-0.05, 0.6, 0.35, 0.8, 0.5, 1], [0.65, 0.8, 1.05, 0.6, 0.98, 0.3], [0.9, -0.05, 0.5, 0.05, 0.5, 0.3]];
      return { fake: true, advanceWidth: (W + H * 0.25) / scale, getPath: (gx, gy) => {
        const X = (u) => gx + H * 0.12 + u * W, Y = (v) => gy - H + v * H;
        const c = [{ type: 'M', x: X(pts[0][0]), y: Y(pts[0][1]) }];
        for (const q of pts.slice(1)) c.push({ type: 'C', x1: X(q[0]), y1: Y(q[1]), x2: X(q[2]), y2: Y(q[3]), x: X(q[4]), y: Y(q[5]) });
        c.push({ type: 'Z' });
        return { commands: c };
      } };
    };
    const glyphs = Array.from(line).map((ch) => ((ch === '\u2665' || ch === '\u2764') && !font.charToGlyphIndex(ch) ? heart() : font.charToGlyph(ch)));
    const adv = glyphs.map((g, i) => {
      const kern = i + 1 < glyphs.length && !g.fake && !glyphs[i + 1].fake ? font.getKerningValue(g, glyphs[i + 1]) : 0;
      return ((g.advanceWidth || 0) + kern) * scale + (i + 1 < glyphs.length ? spacing : 0);
    });
    const width = adv.reduce((a, b) => a + b, 0);
    let gx = x;
    if (anchor === 'middle') gx -= width / 2;
    if (anchor === 'end') gx -= width;
    const gy = y + li * lineGap;
    const xMid = gx + width / 2;
    const R = Math.abs(bend) > 1e-4 && width > 0 ? width / bend : 0; // straal (negatief = boog omlaag)
    glyphs.forEach((g, i) => {
      const gc = g.getPath(gx, gy, fontSize).commands;
      if (R) {
        // letter rond zijn eigen basislijnmidden op de cirkel zetten en meedraaien
        const ax = gx + ((g.advanceWidth || 0) * scale) / 2;
        const th = (ax - xMid) / R;
        const px = xMid + R * Math.sin(th), py = gy + R * (1 - Math.cos(th));
        const co = Math.cos(th), si = Math.sin(th);
        const T = (X, Y) => { const dx = X - ax, dy = Y - gy; return [px + dx * co - dy * si, py + dx * si + dy * co]; };
        for (const c of gc) {
          if ('x' in c) [c.x, c.y] = T(c.x, c.y);
          if ('x1' in c) [c.x1, c.y1] = T(c.x1, c.y1);
          if ('x2' in c) [c.x2, c.y2] = T(c.x2, c.y2);
        }
      }
      cmds.push(...gc);
      gx += adv[i];
    });
  });
  const subpaths = [];
  let cur = null;
  let last = null;
  for (const c of cmds) {
    if (c.type === 'M') {
      cur = { start: [c.x, c.y], segs: [], closed: false };
      subpaths.push(cur);
      last = [c.x, c.y];
    } else if (c.type === 'L') {
      cur.segs.push({ t: 'L', p: [c.x, c.y] });
      last = [c.x, c.y];
    } else if (c.type === 'C') {
      cur.segs.push({ t: 'C', c1: [c.x1, c.y1], c2: [c.x2, c.y2], p: [c.x, c.y] });
      last = [c.x, c.y];
    } else if (c.type === 'Q') {
      const c1 = [last[0] + (2 / 3) * (c.x1 - last[0]), last[1] + (2 / 3) * (c.y1 - last[1])];
      const c2 = [c.x + (2 / 3) * (c.x1 - c.x), c.y + (2 / 3) * (c.y1 - c.y)];
      cur.segs.push({ t: 'C', c1, c2, p: [c.x, c.y] });
      last = [c.x, c.y];
    } else if (c.type === 'Z') {
      cur.closed = true;
    }
  }
  return subpaths.filter((s) => s.segs.length > 0);
}

// ---------------------------------------------------------------------------
// SVG-export
// opts.preview = true -> witte achtergrond en dikkere lijnen, om te bekijken
// ---------------------------------------------------------------------------
function svgPathData(subpaths) {
  return subpaths.map((sp) => {
    let d = `M${num(sp.start[0])} ${num(sp.start[1])}`;
    for (const s of sp.segs) {
      if (s.t === 'L') d += `L${num(s.p[0])} ${num(s.p[1])}`;
      else d += `C${num(s.c1[0])} ${num(s.c1[1])} ${num(s.c2[0])} ${num(s.c2[1])} ${num(s.p[0])} ${num(s.p[1])}`;
    }
    return sp.closed ? d + 'Z' : d;
  }).join('');
}

// Draaiing (graden, met de klok mee) en spiegeling van een foto, rond het midden van de foto
export function imageTransform(it) {
  const rot = it.rot || 0;
  if (!rot && !it.fx && !it.fy) return '';
  const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
  return `translate(${num(cx)} ${num(cy)}) rotate(${num(rot)}) scale(${it.fx ? -1 : 1} ${it.fy ? -1 : 1}) translate(${num(-cx)} ${num(-cy)})`;
}

function svgItem(it) {
  switch (it.type) {
    case 'rect': {
      const r = it.r ? ` rx="${num(it.r)}" ry="${num(it.r)}"` : '';
      return `<rect x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}"${r}/>`;
    }
    case 'ellipse':
      return `<ellipse cx="${num(it.cx)}" cy="${num(it.cy)}" rx="${num(it.rx)}" ry="${num(it.ry)}"/>`;
    case 'path':
      return `<path d="${svgPathData(it.subpaths)}"${it.evenodd ? ' fill-rule="evenodd"' : ''}/>`;
    case 'image':
      return `<image x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}" preserveAspectRatio="none"${imageTransform(it) ? ` transform="${imageTransform(it)}"` : ''} href="data:image/png;base64,${it.png}"/>`;
    default:
      return '';
  }
}

export function toSVG(doc, opts = {}) {
  const m = doc.margin || 0;
  const W = doc.width + 2 * m;
  const H = doc.height + 2 * m;
  const groups = [];
  for (const role of orderedRoles(doc.layerOrder)) {
    const items = doc.items.filter((i) => i.role === role.id);
    if (!items.length) continue;
    if (opts.noTool && role.mode === 'Tool') continue;
    const sw = opts.preview ? (role.fill ? 0.02 : 0.35) : opts.hairline ? 0.01 : 0.1;
    const fill = role.fill ? role.color : 'none';
    const name = `${typeof role.layer === 'number' ? 'C' + String(role.layer).padStart(2, '0') : role.layer} ${role.label}`;
    groups.push(
      `  <g id="${role.id}" inkscape:groupmode="layer" inkscape:label="${esc(name)}" fill="${fill}" stroke="${role.color}" stroke-width="${sw}">\n` +
      items.map((i) => '    ' + svgItem(i)).join('\n') + '\n  </g>'
    );
  }
  const bg = opts.preview ? `  <rect x="${-m}" y="${-m}" width="${num(W)}" height="${num(H)}" fill="#ffffff"/>\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Laser Design Atelier - ${esc(doc.title || 'ontwerp')}. Eenheden: mm. Kleuren = LightBurn-laagpalet. -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${num(W)}mm" height="${num(H)}mm" viewBox="${num(-m)} ${num(-m)} ${num(W)} ${num(H)}">
${bg}${groups.join('\n')}
</svg>
`;
}

// ---------------------------------------------------------------------------
// LightBurn-project (.lbrn2)
// LightBurn rekent met y naar boven; we spiegelen y rond de documenthoogte en
// schuiven het ontwerp op (opts.offset) zodat het in het werkgebied ligt.
// Hulplijnen (T1) worden niet meegegeven: in een project zijn ze overbodig.
// ---------------------------------------------------------------------------
function lbVert(x, y, c0, c1) {
  const a = c0 ? `c0x${num(c0[0])}c0y${num(c0[1])}` : 'c0x1';
  const b = c1 ? `c1x${num(c1[0])}c1y${num(c1[1])}` : 'c1x1';
  return `V${num(x)} ${num(y)}${a}${b}`;
}

function lbPathShape(sp, cutIndex, T) {
  // punten en segmenten verzamelen
  const pts = [T(sp.start)];
  const segs = [];
  for (const s of sp.segs) {
    const p = T(s.p);
    const prev = pts[pts.length - 1];
    if (s.t === 'L' && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1e-6) continue; // nul-lengte lijn
    pts.push(p);
    segs.push(s.t === 'C' ? { t: 'B', c1: T(s.c1), c2: T(s.c2) } : { t: 'L' });
  }
  // gesloten pad waarvan het laatste punt op het startpunt valt: punt samenvoegen
  let n = pts.length;
  const lastEqualsStart = Math.hypot(pts[n - 1][0] - pts[0][0], pts[n - 1][1] - pts[0][1]) < 1e-6;
  const closed = sp.closed || lastEqualsStart;
  if (closed && lastEqualsStart && n > 1) { pts.pop(); n--; }
  if (closed && !lastEqualsStart) segs.push({ t: 'L' }); // sluitlijn
  const c0 = new Array(n).fill(null); // uitgaand handvat
  const c1 = new Array(n).fill(null); // inkomend handvat
  const prims = [];
  segs.forEach((s, i) => {
    const a = i;
    const b = (i + 1) % n;
    if (!closed && i + 1 >= n) return;
    if (s.t === 'B') {
      c0[a] = s.c1;
      c1[b] = s.c2;
      prims.push(`B${a} ${b}`);
    } else {
      prims.push(`L${a} ${b}`);
    }
  });
  const verts = pts.map((p, i) => lbVert(p[0], p[1], c0[i], c1[i])).join('');
  return `  <Shape Type="Path" CutIndex="${cutIndex}">\n    <XForm>1 0 0 1 0 0</XForm>\n    <VertList>${verts}</VertList>\n    <PrimList>${prims.join('')}</PrimList>\n  </Shape>`;
}

// Rol + eigen laserinstellingen uit het ontwerp (doc.laser[rolId] = {speed, power, passes, interval})
export function laserSettings(doc, r) {
  const o = (doc && doc.laser && doc.laser[r.id]) || {};
  const pick = (k, d) => (Number.isFinite(+o[k]) && +o[k] > 0 ? +o[k] : d);
  return { ...r, speed: pick('speed', r.speed), power: pick('power', r.power), passes: Math.max(1, Math.round(pick('passes', 1))), interval: pick('interval', r.interval) };
}

// ---------------------------------------------------------------------------
// Tijdschatting per laag. Benadering van hoe een laser werkt:
//  Lijn (Cut): lengte x passes / snelheid + verplaatsen tussen vormen + per vorm optrekken/afremmen.
//  Vlak (Scan) en foto: per scanlijn van uiterst links tot uiterst rechts in die rij, plus uitloop (overscan).
// ---------------------------------------------------------------------------
const RAPID = 250;      // mm/s verplaatsen met laser uit
const PER_SHAPE = 0.15; // s per vorm per pass (optrekken, afremmen, aan/uit)
const PER_LINE = 0.01;  // s per scanlijn (omkeren)
function bez(p0, c1, c2, p, t) { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p; }
function itemShapes(it) {
  // [{ len, start:[x,y], box:{x0,y0,x1,y1} }]
  if (it.type === 'rect') {
    const r = Math.min(it.r || 0, it.w / 2, it.h / 2);
    return [{ len: 2 * (it.w + it.h) - (8 - 2 * Math.PI) * r, start: [it.x, it.y], box: { x0: it.x, y0: it.y, x1: it.x + it.w, y1: it.y + it.h } }];
  }
  if (it.type === 'ellipse') {
    const a = it.rx, b = it.ry, h = ((a - b) / (a + b)) ** 2;
    return [{ len: Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))), start: [it.cx + a, it.cy], box: { x0: it.cx - a, y0: it.cy - b, x1: it.cx + a, y1: it.cy + b } }];
  }
  if (it.type === 'image') return [{ len: 0, start: [it.x, it.y], box: { x0: it.x, y0: it.y, x1: it.x + it.w, y1: it.y + it.h } }];
  if (it.type !== 'path') return [];
  return it.subpaths.map((sp) => {
    let L = 0, p = sp.start;
    const box = { x0: p[0], y0: p[1], x1: p[0], y1: p[1] };
    const add = (q) => { L += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; box.x0 = Math.min(box.x0, q[0]); box.y0 = Math.min(box.y0, q[1]); box.x1 = Math.max(box.x1, q[0]); box.y1 = Math.max(box.y1, q[1]); };
    for (const g of sp.segs) {
      if (g.t === 'C') { const p0 = p; for (let k = 1; k <= 8; k++) { const t = k / 8; add([bez(p0[0], g.c1[0], g.c2[0], g.p[0], t), bez(p0[1], g.c1[1], g.c2[1], g.p[1], t)]); } }
      else add(g.p);
    }
    if (sp.closed) L += Math.hypot(sp.start[0] - p[0], sp.start[1] - p[1]);
    return { len: L, start: sp.start, box };
  });
}
export function estimateTime(doc) {
  const layers = [];
  for (const r0 of orderedRoles(doc.layerOrder)) {
    if (r0.mode === 'Tool') continue;
    const items = doc.items.filter((i) => i.role === r0.id);
    if (!items.length) continue;
    const r = laserSettings(doc, r0);
    const shapes = items.flatMap(itemShapes);
    let time = 0, length = 0, lines = 0, area = 0;
    if (r.mode === 'Cut') {
      length = shapes.reduce((a, s) => a + s.len, 0);
      // verplaatsen: steeds naar het dichtstbijzijnde volgende beginpunt
      let pos = [0, 0], travel = 0;
      const left = shapes.slice();
      while (left.length) {
        let bi = 0, bd = Infinity;
        left.forEach((s, i) => { const d = Math.hypot(s.start[0] - pos[0], s.start[1] - pos[1]); if (d < bd) { bd = d; bi = i; } });
        travel += bd; pos = left[bi].start; left.splice(bi, 1);
      }
      time = (length * r.passes) / r.speed + (travel * r.passes) / RAPID + shapes.length * PER_SHAPE * r.passes;
    } else {
      const boxes = shapes.map((s) => s.box);
      const y0 = Math.min(...boxes.map((b) => b.y0)), y1 = Math.max(...boxes.map((b) => b.y1));
      const step = Math.max(r.interval, (y1 - y0) / 3000); // niet elke rij apart nodig voor een schatting
      const os = r.speed * 0.025; // uitloop aan beide kanten (zoals LightBurn standaard)
      for (let y = y0 + step / 2; y < y1; y += step) {
        let a = Infinity, b = -Infinity;
        for (const bx of boxes) if (bx.y0 <= y && y <= bx.y1) { a = Math.min(a, bx.x0); b = Math.max(b, bx.x1); }
        if (b < a) continue;
        const n = step / r.interval;
        lines += n; area += (b - a) * step;
        time += n * ((b - a + 2 * os) / r.speed + PER_LINE);
      }
      time = (time * r.passes) + Math.hypot(boxes[0].x0, boxes[0].y0) / RAPID;
    }
    layers.push({ role: r.id, label: r.label, color: r.color, layer: r.layer, mode: r.mode, speed: r.speed, power: r.power, passes: r.passes, interval: r.interval, shapes: shapes.length, length, lines: Math.round(lines), area, time });
  }
  return { layers, total: layers.reduce((a, l) => a + l.time, 0) };
}

export function toLBRN2(doc, opts = {}) {
  const off = opts.offset || [10, 10];
  const H = doc.height;
  const T = (p) => [p[0] + off[0], H - p[1] + off[1]];
  const used = orderedRoles(doc.layerOrder).filter((r) => r.mode !== 'Tool' && doc.items.some((i) => i.role === r.id)).map((r) => laserSettings(doc, r));

  const settings = used.map((r, prio) => {
    const name = 'C' + String(r.layer).padStart(2, '0');
    if (r.mode === 'Image') {
      return `  <CutSetting_Img type="Image">
    <index Value="${r.layer}"/>
    <name Value="${name}"/>
    <maxPower Value="${r.power}"/>
    <maxPower2 Value="${r.power}"/>
    <speed Value="${r.speed}"/>
    <priority Value="${prio}"/>
    <ditherMode Value="${r.dither}"/>
    <interval Value="${r.interval}"/>
  </CutSetting_Img>`;
    }
    const extra = (r.mode === 'Scan' ? `\n    <interval Value="${r.interval}"/>` : '') + ((r.passes || 1) > 1 ? `\n    <numPasses Value="${r.passes}"/>` : '');
    return `  <CutSetting type="${r.mode}">
    <index Value="${r.layer}"/>
    <name Value="${name}"/>
    <maxPower Value="${r.power}"/>
    <maxPower2 Value="${r.power}"/>
    <speed Value="${r.speed}"/>
    <priority Value="${prio}"/>${extra}
  </CutSetting>`;
  });

  const shapes = [];
  for (const r of used) {
    for (const it of doc.items.filter((i) => i.role === r.id)) {
      const ci = r.layer;
      if (it.type === 'rect') {
        const [cx, cy] = T([it.x + it.w / 2, it.y + it.h / 2]);
        shapes.push(`  <Shape Type="Rect" CutIndex="${ci}" W="${num(it.w)}" H="${num(it.h)}" Cr="${num(it.r || 0)}">\n    <XForm>1 0 0 1 ${num(cx)} ${num(cy)}</XForm>\n  </Shape>`);
      } else if (it.type === 'ellipse') {
        const [cx, cy] = T([it.cx, it.cy]);
        shapes.push(`  <Shape Type="Ellipse" CutIndex="${ci}" Rx="${num(it.rx)}" Ry="${num(it.ry)}">\n    <XForm>1 0 0 1 ${num(cx)} ${num(cy)}</XForm>\n  </Shape>`);
      } else if (it.type === 'path') {
        for (const sp of it.subpaths) shapes.push(lbPathShape(sp, ci, T));
      } else if (it.type === 'image') {
        const [cx, cy] = T([it.x + it.w / 2, it.y + it.h / 2]);
        // LightBurn: y omhoog, dus een draaiing met de klok mee is een negatieve hoek
        const kx = (it.w / it.pxW) * (it.fx ? -1 : 1);
        const ky = (it.h / it.pxH) * (it.fy ? -1 : 1);
        const phi = (-(it.rot || 0) * Math.PI) / 180;
        const a = kx * Math.cos(phi), b = kx * Math.sin(phi), c = -ky * Math.sin(phi), d = ky * Math.cos(phi);
        shapes.push(`  <Shape Type="Bitmap" CutIndex="${ci}" W="${it.pxW}" H="${it.pxH}" Gamma="1" Contrast="0" Brightness="0" EnhanceAmount="0" EnhanceRadius="0" EnhanceDenoise="0" File="" SourceHash="0" Data="${it.png}">\n    <XForm>${num(a)} ${num(b)} ${num(c)} ${num(d)} ${num(cx)} ${num(cy)}</XForm>\n  </Shape>`);
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<LightBurnProject AppVersion="1.7.08" FormatVersion="1" MaterialHeight="0" MirrorX="False" MirrorY="False">
${settings.join('\n')}
${shapes.join('\n')}
  <Notes ShowOnLoad="0" Notes="Gemaakt met Laser Design Atelier. Snelheid en vermogen zijn startwaarden: stel ze af op je eigen laser en materiaal."/>
</LightBurnProject>
`;
}

// ---------------------------------------------------------------------------
// Geometrie van elk object als subpaden (rechthoek, ellips, pad)
// ---------------------------------------------------------------------------
const KAPPA = 0.5522847498;
export function itemSubpaths(it) {
  if (it.type === 'path') return it.subpaths;
  if (it.type === 'ellipse') {
    const { cx, cy, rx, ry } = it, k = KAPPA;
    return [{ start: [cx + rx, cy], closed: true, segs: [
      { t: 'C', c1: [cx + rx, cy + ry * k], c2: [cx + rx * k, cy + ry], p: [cx, cy + ry] },
      { t: 'C', c1: [cx - rx * k, cy + ry], c2: [cx - rx, cy + ry * k], p: [cx - rx, cy] },
      { t: 'C', c1: [cx - rx, cy - ry * k], c2: [cx - rx * k, cy - ry], p: [cx, cy - ry] },
      { t: 'C', c1: [cx + rx * k, cy - ry], c2: [cx + rx, cy - ry * k], p: [cx + rx, cy] },
    ] }];
  }
  if (it.type === 'rect') {
    const { x, y, w, h } = it, r = Math.max(0, Math.min(it.r || 0, w / 2, h / 2)), k = KAPPA * r;
    if (!r) return [{ start: [x, y], closed: true, segs: [{ t: 'L', p: [x + w, y] }, { t: 'L', p: [x + w, y + h] }, { t: 'L', p: [x, y + h] }] }];
    return [{ start: [x + r, y], closed: true, segs: [
      { t: 'L', p: [x + w - r, y] }, { t: 'C', c1: [x + w - r + k, y], c2: [x + w, y + r - k], p: [x + w, y + r] },
      { t: 'L', p: [x + w, y + h - r] }, { t: 'C', c1: [x + w, y + h - r + k], c2: [x + w - r + k, y + h], p: [x + w - r, y + h] },
      { t: 'L', p: [x + r, y + h] }, { t: 'C', c1: [x + r - k, y + h], c2: [x, y + h - r + k], p: [x, y + h - r] },
      { t: 'L', p: [x, y + r] }, { t: 'C', c1: [x, y + r - k], c2: [x + r - k, y], p: [x + r, y] },
    ] }];
  }
  return [];
}
// bezier -> punten (fijn genoeg voor de laser: ~0,05 mm afwijking)
export function flattenSubpath(sp, tol = 0.05) {
  const pts = [sp.start];
  let p = sp.start;
  for (const g of sp.segs) {
    if (g.t === 'C') {
      const len = Math.hypot(g.c1[0] - p[0], g.c1[1] - p[1]) + Math.hypot(g.c2[0] - g.c1[0], g.c2[1] - g.c1[1]) + Math.hypot(g.p[0] - g.c2[0], g.p[1] - g.c2[1]);
      const n = Math.max(2, Math.min(200, Math.ceil(Math.sqrt(len / tol) * 1.2)));
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        pts.push([u * u * u * p[0] + 3 * u * u * t * g.c1[0] + 3 * u * t * t * g.c2[0] + t * t * t * g.p[0], u * u * u * p[1] + 3 * u * u * t * g.c1[1] + 3 * u * t * t * g.c2[1] + t * t * t * g.p[1]]);
      }
    } else pts.push(g.p);
    p = g.p;
  }
  return pts;
}

// ---------------------------------------------------------------------------
// DXF (R12, mm) voor RDWorks / LaserCut (Ruida), EZCAD en andere CAD-gebaseerde software.
// Eén DXF-laag per bewerking, met een vaste kleur (AutoCAD-kleurnummer). Foto's kunnen niet in DXF.
// ---------------------------------------------------------------------------
const ACI = { '#000000': 7, '#0000FF': 5, '#FF0000': 1, '#00E000': 3, '#D0D000': 2, '#FF8000': 30, '#F36926': 30 };
export function dxfLayerName(r) { return (typeof r.layer === 'number' ? 'C' + String(r.layer).padStart(2, '0') : r.layer) + '_' + r.short.replace(/[^A-Za-z0-9]+/g, '_'); }
export function toDXF(doc, opts = {}) {
  const H = doc.height;
  const out = [];
  const w = (code, val) => { out.push(String(code)); out.push(String(val)); };
  const roles = orderedRoles(doc.layerOrder).filter((r) => r.mode !== 'Tool' && r.mode !== 'Image' && doc.items.some((i) => i.role === r.id));
  w(0, 'SECTION'); w(2, 'HEADER');
  w(9, '$ACADVER'); w(1, 'AC1009');
  w(9, '$INSUNITS'); w(70, 4);
  w(9, '$EXTMIN'); w(10, 0); w(20, 0);
  w(9, '$EXTMAX'); w(10, num(doc.width)); w(20, num(H));
  w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'TABLES');
  w(0, 'TABLE'); w(2, 'LAYER'); w(70, roles.length);
  for (const r of roles) { w(0, 'LAYER'); w(2, dxfLayerName(r)); w(70, 0); w(62, ACI[r.color] || 7); w(6, 'CONTINUOUS'); }
  w(0, 'ENDTAB'); w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'ENTITIES');
  let count = 0;
  for (const r of roles) {
    const lname = dxfLayerName(r), col = ACI[r.color] || 7;
    for (const it of doc.items.filter((i) => i.role === r.id)) {
      // cirkels als echte cirkel: RDWorks en EZCAD snijden die mooier
      if (it.type === 'ellipse' && Math.abs(it.rx - it.ry) < 1e-6) {
        w(0, 'CIRCLE'); w(8, lname); w(62, col); w(10, num(it.cx)); w(20, num(H - it.cy)); w(30, 0); w(40, num(it.rx)); count++;
        continue;
      }
      for (const sp of itemSubpaths(it)) {
        let pts = flattenSubpath(sp, opts.tol || 0.05);
        const closed = sp.closed || Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6;
        if (closed && pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts = pts.slice(0, -1);
        if (pts.length < 2) continue;
        w(0, 'POLYLINE'); w(8, lname); w(62, col); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, closed ? 1 : 0);
        for (const q of pts) { w(0, 'VERTEX'); w(8, lname); w(10, num(q[0])); w(20, num(H - q[1])); w(30, 0); }
        w(0, 'SEQEND'); w(8, lname);
        count++;
      }
    }
  }
  w(0, 'ENDSEC'); w(0, 'EOF');
  return { text: out.join('\r\n') + '\r\n', count, skippedImages: doc.items.filter((i) => i.type === 'image').length };
}

// ---------------------------------------------------------------------------
// Vector-PDF voor lasers met een printerdriver (Epilog, Trotec, Universal, Thunder via driver):
// snijlijnen als haarlijn (0,01 mm) in zuivere RGB-kleuren, gravure als gevuld vlak.
// opts.images: { [itemIndex]: { jpeg: Uint8Array, w, h } } voor foto's (grijswaarden-JPEG).
// Geeft een Uint8Array terug.
// ---------------------------------------------------------------------------
export function toPDF(doc, opts = {}) {
  const PT = 72 / 25.4;
  const W = doc.width * PT, H = doc.height * PT;
  const f = (v) => (Math.round(v * 1000) / 1000).toString();
  const P = (p) => `${f(p[0] * PT)} ${f((doc.height - p[1]) * PT)}`;
  const rgb = (hex) => [1, 3, 5].map((i) => f(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');
  const ops = [];
  const imgOps = [];
  const xobjs = [];
  for (const r of orderedRoles(doc.layerOrder)) {
    if (r.mode === 'Tool' && !opts.withTool) continue;
    doc.items.forEach((it, idx) => {
      if (it.role !== r.id) return;
      if (it.type === 'image') {
        const im = opts.images && opts.images[idx];
        if (!im) return;
        const name = 'Im' + (xobjs.length + 1);
        xobjs.push({ name, ...im });
        // zelfde transformatie als de LightBurn-export: midden, draaien, spiegelen
        const cx = (it.x + it.w / 2) * PT, cy = (doc.height - (it.y + it.h / 2)) * PT;
        const phi = (-(it.rot || 0) * Math.PI) / 180, kx = it.w * PT * (it.fx ? -1 : 1), ky = it.h * PT * (it.fy ? -1 : 1);
        const a = kx * Math.cos(phi), b = kx * Math.sin(phi), c = -ky * Math.sin(phi), d = ky * Math.cos(phi);
        // eenheidsvierkant (0..1) -> midden-gecentreerd
        const e = cx - (a + c) / 2, g = cy - (b + d) / 2;
        // foto's onderaan, anders bedekt het witte van de foto de gravure eronder
        imgOps.push(`q ${f(a)} ${f(b)} ${f(c)} ${f(d)} ${f(e)} ${f(g)} cm /${name} Do Q`);
        return;
      }
      const sps = itemSubpaths(it);
      if (!sps.length) return;
      let d = '';
      for (const sp of sps) {
        d += `${P(sp.start)} m `;
        for (const g of sp.segs) d += g.t === 'C' ? `${P(g.c1)} ${P(g.c2)} ${P(g.p)} c ` : `${P(g.p)} l `;
        if (sp.closed) d += 'h ';
      }
      if (r.fill) ops.push(`${rgb(r.color)} rg ${d}f*`);
      else ops.push(`${rgb(r.color)} RG ${f(0.01 * PT)} w ${d}S`);
    });
  }
  const content = [...imgOps, ...ops].join('\n');
  // objecten opbouwen
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  const nImg = xobjs.length;
  const xref = xobjs.map((x, i) => `/${x.name} ${5 + i} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /Contents 4 0 R /Resources << ${nImg ? `/XObject << ${xref} >>` : ''} >> >>`);
  const cb = enc.encode(content);
  obj(4, [`<< /Length ${cb.length} >>\nstream\n`, cb, '\nendstream']);
  xobjs.forEach((x, i) => obj(5 + i, [`<< /Type /XObject /Subtype /Image /Width ${x.w} /Height ${x.h} /ColorSpace ${x.rgb ? "/DeviceRGB" : "/DeviceGray"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${x.jpeg.length} >>\nstream\n`, x.jpeg, '\nendstream']));
  const nObj = 5 + nImg;
  const xrefAt = len;
  let xr = `xref\n0 ${nObj}\n0000000000 65535 f \n`;
  for (let i = 1; i < nObj; i++) xr += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(xr + `trailer\n<< /Size ${nObj} /Root 1 0 R /Info << /Producer (Laser Design Atelier) /Title (${String(doc.title || 'ontwerp').replace(/[()\\]/g, '')}) >> >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  const outB = new Uint8Array(len);
  let o = 0;
  for (const b of parts) { outB.set(b, o); o += b.length; }
  return outB;
}
