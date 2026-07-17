/* Storage adapter: claude.ai artifact storage when present,
   localStorage otherwise, in-memory as last resort. */

const mem = new Map();

export const store = {
  async get(k, fb) {
    try {
      if (typeof window !== "undefined" && window.storage?.get) {
        const r = await window.storage.get(k);
        return r ? JSON.parse(r.value) : fb;
      }
      const r = localStorage.getItem(k);
      return r != null ? JSON.parse(r) : fb;
    } catch (e) {
      return mem.has(k) ? mem.get(k) : fb;
    }
  },
  async set(k, v) {
    mem.set(k, v);
    try {
      if (typeof window !== "undefined" && window.storage?.set) {
        await window.storage.set(k, JSON.stringify(v));
        return;
      }
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      /* in-memory only */
    }
  },
};
