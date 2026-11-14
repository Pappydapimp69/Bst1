// Seeded random streams. Each consumer gets its own stream keyed by a stable
// name, so adding a consumer never shifts another's draws. A stream's whole
// state is four integer words, so it saves as plain JSON.

// Hash the seed text first: raw small seeds give alike first draws.
function hasher(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function makeStream(seed, name) {
  const h = hasher(String(seed) + ':' + name);
  const s = [h(), h(), h(), h()];
  for (let i = 0; i < 12; i++) next(s);
  return s;
}

// sfc32 stepped in place on the four words; returns a float in [0, 1).
export function next(s) {
  let a = s[0] | 0, b = s[1] | 0, c = s[2] | 0, d = s[3] | 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s[0] = a; s[1] = b; s[2] = c; s[3] = d;
  return (t >>> 0) / 4294967296;
}
