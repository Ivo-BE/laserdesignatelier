// Bouwt twee versies uit dezelfde bron:
//  dist/index.html            verkoopversie (losse webapp, licentie via Sparkgate) -> Vercel
//  build/claude-viewer.html   prototype in de Claude-viewer (zonder licentie)
import fs from 'node:fs';
const core = fs.readFileSync('src/core.js', 'utf8').replace(/^export /gm, '');
const fonts = Object.fromEntries(fs.readdirSync('fonts').filter((f) => f.endsWith('.ttf')).map((f) => f.slice(0, -4)).map((k) => [k, fs.readFileSync(`fonts/${k}.ttf`).toString('base64')]));
const src = fs.readFileSync('src/editor.html', 'utf8');
const make = (app) => src.replace('/*__CORE__*/', () => core).replace('/*__FONTS__*/', () => JSON.stringify(fonts)).replace('/*__APP__*/{ standalone: false }', () => JSON.stringify(app));

const head = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Ontwerp lasercut-bestanden: tekst, vormen, foto's en logo's naar vector, klaar voor LightBurn, xTool, Glowforge, Epilog, Trotec en RDWorks.">
<meta name="theme-color" content="#155e75">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
</head>
<body>
`;
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist', { recursive: true });
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('dist/index.html', head + make({ standalone: true, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev' }) + '\n</body>\n</html>\n');
for (const f of fs.readdirSync('public')) fs.copyFileSync(`public/${f}`, `dist/${f}`);
fs.writeFileSync('build/claude-viewer.html', make({ standalone: false }));
console.log('dist/index.html', (fs.statSync('dist/index.html').size / 1024).toFixed(0) + ' KB');
console.log('build/claude-viewer.html', (fs.statSync('build/claude-viewer.html').size / 1024).toFixed(0) + ' KB');
