// Palette audit: text contrast on its real (composited) surface, and entity pairs under colour-blindness stand-ins.
// Pairs that share a hue are also told apart by shape (listed), never by colour alone.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg, a, bg) => fg.map((v, i) => v * a + bg[i] * (1 - a));
// Vienot 1999 dichromat simulation in linear RGB
const M = { protan: [[0.11238, 0.88762, 0], [0.11238, 0.88762, 0], [0.00401, -0.00401, 1]], deutan: [[0.29275, 0.70725, 0], [0.29275, 0.70725, 0], [-0.02234, 0.02234, 1]],
  tritan: [[1, 0.14461, -0.14461], [0, 0.85924, 0.14076], [0, 0.85924, 0.14076]] };
const sim = (rgb, t) => { const l = rgb.map(lin); return M[t].map((r) => { const v = Math.max(0, Math.min(1, r[0] * l[0] + r[1] * l[1] + r[2] * l[2])); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); }); };
const out = []; let fails = 0;
const check = (name, v, min) => { const ok = v >= min; if (!ok) fails++; out.push(`${ok ? 'PASS' : 'FAIL'} ${name}: ${v.toFixed(2)} (need ${min})`); };
const ink = hex('#ece6d6'), dim = hex('#b4b2a8'), lantern = hex('#ffc46b'), glyph = hex('#f1ebdc');
const backdrops = { darkest: [3, 5, 10], lightestLit: [190, 172, 135] };   // night ground, and sand inside the lantern
const panel = [9, 13, 24], bubble = [5, 7, 14], btn = hex('#16203a'), bar = hex('#070a14');
for (const [bn, bd] of Object.entries(backdrops)) {
  const card = over(panel, 0.94, over([3, 5, 10], 0.66, bd));
  check(`card text on ${bn}`, contrast(ink, card), 7); check(`card dim text on ${bn}`, contrast(dim, card), 4.5);
  const bub = over(bubble, 0.9, bd);
  check(`song glyph on bubble over ${bn}`, contrast(glyph, bub), 7); check(`translated glyph on bubble over ${bn}`, contrast(lantern, bub), 4.5);
  const lab = over([5, 7, 14], 0.88, bd); check(`note label over ${bn}`, contrast(ink, lab), 4.5);
}
check('button label', contrast(ink, btn), 7); check('button key hint', contrast(dim, btn), 4.5); check('HUD text on bar', contrast(ink, bar), 7);
check('faintest faded glyph (alpha 0.45) on bubble', contrast(over(glyph, 0.45, bubble), bubble), 3);
// entities against the night ground (luminance band: every creature reads lighter than the ground under the dark)
const ground = over([4, 8, 24], 0.8, [156, 140, 108]);
for (const [n, c] of Object.entries({ crab: '#78e0f0', moth: '#efe4c8', fish: '#f3dc8a', spirit: '#a9f5d4', moss: '#7ff0c4', lantern: '#ffc46b' })) check(`${n} glow vs dark ground`, contrast(hex(c), ground), 3);
// pairs that could be confused: their colour distance under each stand-in, and the shape that also separates them
const pairs = [['crab', '#78e0f0', 'moss', '#7ff0c4', 'clawed body vs scattered dots'], ['lantern', '#ffc46b', 'fish', '#f3dc8a', 'keeper figure vs fish in a pool'],
  ['moth', '#efe4c8', 'fish', '#f3dc8a', 'flapping wings in the air vs fish in a ringed pool'], ['bell rung', '#b9c48f', 'bell', '#8f9a74', 'rung bells add a pale ring']];
for (const [a, ca, b, cb, shape] of pairs) {
  const d = ['protan', 'deutan', 'tritan'].map((t) => { const x = sim(hex(ca), t), y = sim(hex(cb), t); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); });
  out.push(`INFO ${a} vs ${b}: colour distance protan ${d[0].toFixed(0)}, deutan ${d[1].toFixed(0)}, tritan ${d[2].toFixed(0)}; told apart by shape: ${shape}`);
}
console.log(out.join('\n')); console.log(fails ? `${fails} palette checks failed` : 'palette: all checks passed');
process.exitCode = fails ? 1 : 0;
