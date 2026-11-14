// Settings and best score. Keys are namespaced because the page may share its
// web origin with other projects, and every access is wrapped because storage
// can throw (private mode, blocked site data, a full quota).
const PREFIX = 'bst1.glowmoth.';

export function load(key, fallback, store = globalThis.localStorage) {
  try {
    const raw = store.getItem(PREFIX + key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

export function save(key, value, store = globalThis.localStorage) {
  try { store.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

// The same two calls under another project's prefix, for other games that
// share this engine and this web origin.
export function createStore(prefix, store) {
  const at = () => store || globalThis.localStorage;
  return {
    load(key, fallback) {
      try {
        const raw = at().getItem(prefix + key);
        return raw === null || raw === undefined ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    save(key, value) {
      try { at().setItem(prefix + key, JSON.stringify(value)); return true; } catch { return false; }
    },
  };
}
