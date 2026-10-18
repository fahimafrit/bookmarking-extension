const lib = (() => {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open('video-library', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction('items', mode);
      const q = fn(t.objectStore('items'));
      t.oncomplete = () => res(q && q.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    all: () => tx('readonly', s => s.getAll()),
    get: id => tx('readonly', s => s.get(id)),
    put: o => tx('readwrite', s => s.put(o)),
    del: id => tx('readwrite', s => s.delete(id)),
  };
})();
