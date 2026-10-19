const lib = (() => {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open('video-library', 3);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'path' });
      if (!d.objectStoreNames.contains('bin')) d.createObjectStore('bin', { keyPath: 'bid' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const q = fn(t.objectStore(store));
      t.oncomplete = () => { d.close(); res(q && q.result); };
      t.onerror = () => rej(t.error);
    });
  };
  const sortPaths = a => a.sort((x, y) => {
    const p = x.split('/'), q = y.split('/');
    for (let i = 0; i < Math.min(p.length, q.length); i++) {
      if (p[i] === q[i]) continue;
      if (i === 0 && p[0] === 'General') return -1;
      if (i === 0 && q[0] === 'General') return 1;
      return p[i].localeCompare(q[i]);
    }
    return p.length - q.length;
  });
  const ancestors = p => { const s = p.split('/'); return s.map((_, i) => s.slice(0, i + 1).join('/')); };
  const clean = p => { const s = String(p || '').split('/').map(x => x.trim()).filter(Boolean); return s.length ? s.join('/') : 'General'; };
  const rawFolders = () => tx('folders', 'readonly', s => s.getAllKeys());
  const addFolder = async path => {
    const have = await rawFolders(), low = new Map(have.map(p => [p.toLowerCase(), p]));
    let acc = '';
    for (const seg of clean(path).split('/')) { const c = acc ? acc + '/' + seg : seg; acc = low.get(c.toLowerCase()) || c; }
    await tx('folders', 'readwrite', s => { ancestors(acc).forEach(a => s.put({ path: a })); });
    return acc;
  };
  const move = async (from, mapper) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(['items', 'folders'], 'readwrite'), I = t.objectStore('items'), F = t.objectStore('folders');
      const hit = p => p === from || p.startsWith(from + '/'), map = p => hit(p) ? mapper(p) : p;
      F.getAllKeys().onsuccess = e => { for (const p of e.target.result) if (hit(p)) { F.delete(p); ancestors(map(p)).forEach(a => F.put({ path: a })); } };
      I.getAll().onsuccess = e => { for (const i of e.target.result) { const f = i.folders || [i.folder || 'General'], n = [...new Set(f.map(map))]; if (JSON.stringify(n) !== JSON.stringify(i.folders)) { i.folders = n; delete i.folder; I.put(i); } } };
      t.oncomplete = () => { d.close(); res(); };
      t.onerror = () => rej(t.error);
    });
  };
  return {
    all: () => tx('items', 'readonly', s => s.getAll()),
    get: id => tx('items', 'readonly', s => s.get(id)),
    put: o => tx('items', 'readwrite', s => s.put(o)),
    del: id => tx('items', 'readwrite', s => s.delete(id)),
    folders: async () => {
      const k = await rawFolders();
      if (!k.includes('General')) { await addFolder('General'); k.push('General'); }
      return sortPaths(k);
    },
    addFolder,
    setFolders: paths => tx('folders', 'readwrite', s => { s.clear(); paths.forEach(p => s.put({ path: p })); }),
    binAll: () => tx('bin', 'readonly', s => s.getAll()),
    binPut: o => tx('bin', 'readwrite', s => s.put(o)),
    binDel: id => tx('bin', 'readwrite', s => s.delete(id)),
    moveFolder: (from, to) => move(from, p => to + p.slice(from.length)),
    removeFolder: from => move(from, () => from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : 'General'),
  };
})();
