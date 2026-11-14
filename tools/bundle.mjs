// Build the game into one self-contained page, for places that load a single
// file and no sibling scripts: `npm run bundle` writes dist/glowmoth.html.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const ORDER = ['rng', 'sim', 'bot', 'loop', 'camera', 'input', 'audio', 'render', 'save', 'main'];

const code = ORDER.map((name) => {
  const src = read(`src/${name}.js`)
    .replace(/^import .*;\n/gm, '')
    .replace(/^export (function|const) /gm, '$1 ');
  if (/^(import|export) /m.test(src)) throw new Error(`${name}.js has an import or export the bundler does not handle`);
  return `// ---- ${name}.js\n${src}`;
}).join('\n');

const page = read('index.html');
const style = page.match(/<style>[\s\S]*<\/style>/)[0].replace('<style>', '<style>\n  :root { color-scheme: dark; }');
const body = page.match(/<body>([\s\S]*)<script/)[1].trim();
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/glowmoth.html', root),
  `<title>Glowmoth</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${style}\n${body}\n<script type="module">\n${code}</script>\n`);
console.log('wrote dist/glowmoth.html');
