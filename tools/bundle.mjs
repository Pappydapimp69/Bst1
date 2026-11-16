// Build the game into one self-contained page, for places that load a single
// file and no sibling scripts: `npm run bundle` writes dist/glowmoth.html.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
// Each game: its page, its modules in dependency order, and where the bundle goes.
const GAMES = {
  glowmoth: { page: 'index.html', out: 'dist/glowmoth.html',
    order: ['src/rng', 'src/sim', 'src/bot', 'src/loop', 'src/camera', 'src/input', 'src/audio', 'src/render', 'src/save', 'src/main'] },
  crab: { page: 'crab/index.html', out: 'dist/crab-castle.html',
    order: ['src/rng', 'crab/src/sim', 'crab/src/bot', 'src/loop', 'src/input', 'src/audio', 'src/save', 'crab/src/render', 'crab/src/main'] },
  hare: { page: 'hare/index.html', out: 'dist/hare-and-hounds.html',
    order: ['src/rng', 'hare/src/map', 'hare/src/fov', 'hare/src/sim', 'hare/src/bot', 'hare/src/main'] },
};
const game = GAMES[process.argv[2] || 'glowmoth'];
if (!game) throw new Error(`unknown game; choose one of ${Object.keys(GAMES).join(', ')}`);

const code = game.order.map((name) => {
  const src = read(`${name}.js`)
    .replace(/^import .*;\n/gm, '')
    .replace(/^export (function|const) /gm, '$1 ');
  if (/^(import|export) /m.test(src)) throw new Error(`${name}.js has an import or export the bundler does not handle`);
  return `// ---- ${name}.js\n${src}`;
}).join('\n');

const page = read(game.page);
const style = page.match(/<style>[\s\S]*<\/style>(\s*<link rel="stylesheet"[^>]*>)?/)[0].replace('<style>', page.includes('color-scheme') ? '<style>' : '<style>\n  :root { color-scheme: dark; }');
const body = page.match(/<body>([\s\S]*)<script/)[1].trim();
const title = page.match(/<title>(.*)<\/title>/)[1];
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL(game.out, root),
  `<title>${title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${style}\n${body}\n<script type="module">\n${code}</script>\n`);
console.log('wrote', game.out);
