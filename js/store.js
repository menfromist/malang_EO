/* ── 보관함 저장소 (localStorage) ── */

const Store = (() => {
  const KEY = 'mallang.library.v1';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
  }

  function add(fields) {
    const item = {
      id: `m_${Date.now()}_${Math.floor(Math.random() * 1e4)}`,
      createdAt: new Date().toISOString(),
      ...fields,
    };
    const items = load();
    items.unshift(item);
    save(items);
    return item;
  }

  function get(id) {
    return load().find((i) => i.id === id) || null;
  }

  function update(id, patch) {
    const items = load();
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    items[idx] = { ...items[idx], ...patch };
    save(items);
    return items[idx];
  }

  function remove(id) {
    save(load().filter((i) => i.id !== id));
  }

  return { load, save, add, get, update, remove };
})();
