const $ = s => document.querySelector(s);
const el = (t, p = {}, ...k) => {
  const e = document.createElement(t);
  for (const [a, v] of Object.entries(p)) {
    if (a === 'class') e.className = v;
    else if (a.startsWith('on')) e.addEventListener(a.slice(2), v);
    else if (a in e) e[a] = v; else e.setAttribute(a, v);
  }
  e.append(...k.flat().filter(x => x != null)); return e;
};
const fmt = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const isYT = i => i.url.startsWith('https://www.youtube.com/watch');
const link = (i, s) => isYT(i) ? `${i.url}&t=${Math.floor(s)}s` : `${i.url}#t=${s}`;
const ICON = { video: '🎬', image: '🖼️', gif: '🎞️', page: '🌐' };
let items = [], folders = [], q = '', type = '', folder = new URLSearchParams(location.search).get('f') || '';
const co = new Set(); let coFor = '', lastF = null;
let openF = new Set(); try { openF = new Set(JSON.parse(localStorage.getItem('openF') || '[]')); } catch {}
const saveOpen = () => { try { localStorage.setItem('openF', JSON.stringify([...openF])); } catch {} };

function ask({ title, message = '', input = null, ok = 'OK', cancel = 'Cancel', warn = false }) {
  return new Promise(res => {
    const d = $('#modal'); let done = false;
    const fin = v => { if (done) return; done = true; d.close(); res(v); };
    const inp = input ? el('input', { type: 'text', value: input.value || '', placeholder: input.placeholder || '' }) : null;
    d.replaceChildren(el('h3', {}, title), message ? el('p', {}, message) : null, inp,
      el('div', { class: 'mb' }, cancel ? el('button', { onclick: () => fin(null) }, cancel) : null,
        el('button', { class: 'primary' + (warn ? ' warn' : ''), onclick: () => fin(inp ? inp.value : true) }, ok)));
    d.onkeydown = e => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); fin(inp ? inp.value : true); } };
    d.oncancel = e => { e.preventDefault(); fin(null); };
    d.onclick = e => { if (e.target === d) fin(null); };
    d.showModal(); if (inp) { inp.focus(); inp.select(); }
  });
}
const inF = (f, p) => f === p || f.startsWith(p + '/');
const inTree = (i, p) => i.folders.some(f => inF(f, p));
const parentOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
let fwd = '';
const below = (a, d) => d !== a && (a === '' ? d !== '' : d.startsWith(a + '/'));
function trackFwd(old, nw) {
  if (old === null) { fwd = ''; return; }
  if (below(nw, old)) fwd = fwd && below(old, fwd) ? fwd : old;
  else if (below(old, nw)) fwd = fwd && below(nw, fwd) ? fwd : '';
  else fwd = '';
}
function nextToward() {
  if (!fwd || !below(folder, fwd)) return '';
  return fwd.split('/').slice(0, (folder ? folder.split('/').length : 0) + 1).join('/');
}
const sel = new Set();
let selMode = false;
const picking = () => selMode;
const BIN = '\u0001bin';
let bin = [], sbSel = null, ctx = 'main', clip = null, view = { subs: [], f: [] };
function setSelMode(on) { selMode = on; if (on) { ctx = 'main'; sbSel = null; } else sel.clear(); render(); }
function toggleSel(k) { ctx = 'main'; sbSel = null; if (sel.has(k)) sel.delete(k); else sel.add(k); render(); }
const cbx = k => el('input', { type: 'checkbox', class: 'cbx', checked: sel.has(k), onclick: e => { e.stopPropagation(); toggleSel(k); } });
const CHEV = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const fHref = p => p ? 'library.html?f=' + encodeURIComponent(p) : 'library.html';
const plain = e => !(e.ctrlKey || e.metaKey || e.shiftKey);
const nav = p => e => { if (plain(e)) { e.preventDefault(); goTo(p); } };
const openTab = (p, active = true) => chrome.tabs.create({ url: chrome.runtime.getURL(fHref(p)), active });
const rowProps = (p, cls) => ({
  class: cls,
  onclick: e => { if (plain(e)) goTo(p); },
  onauxclick: e => { if (e.button === 1 && !e.target.closest('a')) { e.preventDefault(); openTab(p, false); } },
  onmousedown: e => { if (e.button === 1 && !e.target.closest('a')) e.preventDefault(); },
});
const nameLink = (p, text) => el('a', { class: 'n', href: fHref(p), onclick: e => { if (!e.shiftKey) e.preventDefault(); } }, text);
const lbl = p => { const s = p.split('/'); return '\u2003'.repeat(s.length - 1) + s[s.length - 1]; };

async function load() {
  items = await lib.all(); folders = await lib.folders();
  bin = await lib.binAll();
  if (folder && folder !== BIN && !folders.includes(folder)) folder = '';
  for (const i of items) if (!Array.isArray(i.folders) || 'tags' in i) {
    if (!Array.isArray(i.folders)) i.folders = [i.folder || 'General'];
    delete i.folder; delete i.tags; (i.moments || []).forEach(m => delete m.tags); await lib.put(i);
  }
  items.sort((a, b) => b.saved - a.saved); render();
  try { chrome.runtime.sendMessage({ k: 'changed' }).catch(() => {}); } catch {}
  showBanner();
}

const normF = a => [...new Set(a)].filter(f => !a.some(g => g !== f && g.startsWith(f + '/')));
const moveFolders = (it, t) => normF([...(folder && it.folders.some(f => inF(f, folder)) ? it.folders.filter(f => !inF(f, folder)) : []), t]);
const uid = () => crypto.randomUUID();
const leaf = p => p.split('/').pop();
const qt = s => { s = String(s); return '"' + (s.length > 40 ? s.slice(0, 39) + '…' : s) + '"'; };
const tn = t => qt(t ? leaf(t) : 'All bookmarks');
const idsFor = (ids, fl) => [...new Set([...ids, ...items.filter(i => fl.some(p => inTree(i, p))).map(i => i.id)])];
const keyItems = ks => ks.filter(k => k[0] === 'i').map(k => items.find(i => i.id === k.slice(2))).filter(Boolean);
const keyFolders = ks => { const fs = ks.filter(k => k[0] === 'f').map(k => k.slice(2)).filter(p => folders.includes(p)); return fs.filter(p => !fs.some(o => o !== p && inF(p, o))); };

/* ---------- toasts ---------- */
const tbox = el('div', { id: 'toasts' }); document.body.append(tbox);
const live = [];
function toast(msg, entry) {
  if (entry) for (const o of live) if (o.btn) { o.btn.remove(); o.btn = null; }
  const t = { btn: null };
  t.kill = () => { clearTimeout(t.tm); const i = live.indexOf(t); if (i < 0) return; live.splice(i, 1); t.w.classList.remove('show'); setTimeout(() => t.w.remove(), 320); };
  if (entry) t.btn = el('button', { class: 'tundo', onclick: () => { t.kill(); undo(); } }, 'Undo');
  t.w = el('div', { class: 'tw' }, el('div', { class: 'tin' }, el('div', { class: 'tb' },
    el('span', { class: 'tm' }, msg), t.btn, el('button', { class: 'tx', title: 'Dismiss', onclick: t.kill }, '✕'))));
  tbox.append(t.w); live.push(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.w.classList.add('show')));
  t.tm = setTimeout(t.kill, entry ? 7000 : 4500);
  while (live.length > 5) live[0].kill();
}

/* ---------- undo / redo (snapshots of only the records an action touches) ---------- */
const undoS = [], redoS = [];
async function snap(ids, bids) {
  const st = { folders: await lib.folders(), items: {}, bin: {} };
  for (const id of ids) st.items[id] = (await lib.get(id)) || null;
  if (bids.length) { const bn = await lib.binAll(); for (const b of bids) st.bin[b] = bn.find(x => x.bid === b) || null; }
  return st;
}
async function restoreSt(st) {
  await lib.setFolders(st.folders);
  for (const [id, v] of Object.entries(st.items)) { if (v) await lib.put(v); else await lib.del(id); }
  for (const [b, v] of Object.entries(st.bin)) { if (v) await lib.binPut(v); else await lib.binDel(b); }
}
async function doAct(ids, bids, fn) {
  const before = await snap(ids, bids), made = [];
  let msg;
  try { msg = await fn(made); } catch (e) { console.error(e); toast('Something went wrong'); await load(); return; }
  if (msg == null) { await load(); return; }
  const after = await snap(ids, [...new Set([...bids, ...made])]);
  for (const b of made) if (!(b in before.bin)) before.bin[b] = null;
  const entry = { msg, before, after };
  undoS.push(entry); if (undoS.length > 30) undoS.shift(); redoS.length = 0;
  await load(); toast(msg, entry);
}
async function undo() { const e = undoS.pop(); if (!e) return; await restoreSt(e.before); redoS.push(e); await load(); toast('Undone: ' + e.msg); }
async function redo() { const e = redoS.pop(); if (!e) return; await restoreSt(e.after); undoS.push(e); await load(); toast('Redone: ' + e.msg); }
function updUR() {
  const u = undoS[undoS.length - 1], r = redoS[redoS.length - 1];
  $('#undo').disabled = !u; $('#redo').disabled = !r;
  $('#undo').title = u ? `Undo: ${u.msg} (Ctrl+Z)` : 'Nothing to undo'; $('#redo').title = r ? `Redo: ${r.msg} (Ctrl+Y)` : 'Nothing to redo';
}

/* ---------- actions ---------- */
async function addTo(i, p) {
  await doAct([i.id], [], async () => { const c = await lib.get(i.id); if (!c) return null; c.folders = normF([...c.folders, p]); await lib.put(c); return `${qt(c.title)} copied to ${tn(p)}`; });
}
async function moveTo(i, p) {
  await doAct([i.id], [], async () => { const c = await lib.get(i.id); if (!c) return null; c.folders = moveFolders(c, p); await lib.put(c); return `${qt(c.title)} moved to ${tn(p)}`; });
}
async function createFolderAct(full) {
  let out = null;
  await doAct([], [], async () => {
    const ex = folders.some(f => f.toLowerCase() === full.toLowerCase());
    out = await lib.addFolder(full);
    return ex ? null : `Folder ${qt(leaf(out))} created`;
  });
  return out;
}
function createIn(parent) {
  return new Promise(res => {
    const d = $('#modal'); let done = false, choice = parent || '';
    const fin = v => { if (done) return; done = true; d.close(); res(v); };
    const inp = el('input', { type: 'text', placeholder: 'Folder name' });
    const sg = choice ? choice.split('/') : [];
    const tb = treeBox({ rootOption: true, isOn: p => choice === p, onPick: p => { choice = p; tb.draw(); }, openInit: sg.slice(0, -1).map((_, i) => sg.slice(0, i + 1).join('/')) });
    const create = async () => {
      const n = inp.value.split('/').map(x => x.trim()).filter(Boolean).join('/'); if (!n) { inp.focus(); return; }
      if (done) return; done = true; d.close();
      res(await createFolderAct(choice ? choice + '/' + n : n));
    };
    d.replaceChildren(el('h3', {}, 'New folder'), inp, el('div', { class: 'm', style: 'margin:10px 0 4px' }, 'Place it inside:'), tb.box,
      el('div', { class: 'mb' }, el('button', { onclick: () => fin(null) }, 'Cancel'), el('button', { class: 'primary', onclick: create }, 'Create')));
    d.onkeydown = e => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); create(); } };
    d.oncancel = e => { e.preventDefault(); fin(null); };
    d.onclick = e => { if (e.target === d) fin(null); };
    tb.draw(); d.showModal(); inp.focus();
  });
}
async function goTo(p) {
  if (p === folder) return;
  if (sel.size) {
    const ok = await ask({ title: 'Leave this folder?', message: `Your ${sel.size} selected item${sel.size > 1 ? 's' : ''} will be deselected. Selection works inside one folder at a time.`, ok: 'Leave and deselect' });
    if (!ok) return;
    sel.clear(); selMode = false;
  }
  folder = p; render();
}
async function dropMove(it, p) {
  if (it.folders.includes(p)) return;
  if (!await ask({ title: 'Move bookmark', message: `Move ${qt(it.title)} to ${tn(p)}?`, ok: 'Move' })) return;
  moveTo(it, p);
}
function cancelClip() { const c = clip; if (!c) return; clip = null; render(); toast(c.mode === 'cut' ? 'Cut cancelled' : 'Copy cancelled'); }
async function renameItem(i) {
  const name = await ask({ title: 'Rename bookmark', input: { value: i.title }, ok: 'Rename' });
  const n = (name || '').trim(); if (!n || n === i.title) return;
  await doAct([i.id], [], async () => { const c = await lib.get(i.id); if (!c) return null; c.title = n; await lib.put(c); return `${qt(i.title)} renamed to ${qt(n)}`; });
}
async function trashSel(its, fl) {
  const n = its.length + fl.length; if (!n) return;
  const what = n === 1 ? (its.length ? qt(its[0].title) + ' will be moved to the recycle bin.' : `Folder ${qt(leaf(fl[0]))} will be moved to the recycle bin. Its bookmarks move up to ${tn(parentOf(fl[0]) || 'General')}.`) : `${n} items will be moved to the recycle bin.`;
  if (!await ask({ title: 'Move to recycle bin?', message: what + ' You can restore them from the bin.', ok: 'Move to bin', warn: true })) return;
  let note = '';
  await doAct(idsFor(its.map(i => i.id), fl), [], async made => {
    for (const f of fl) {
      const par = parentOf(f) || 'General', tree = folders.filter(x => inF(x, f));
      const aff = items.filter(i => inTree(i, f)).map(i => ({ id: i.id, folders: [...i.folders] }));
      await lib.removeFolder(f);
      const bid = uid(); await lib.binPut({ bid, kind: 'folder', at: Date.now(), path: f, tree, aff, par }); made.push(bid);
      if (inF(folder, f)) folder = par;
      if (n === 1 && aff.length) note = ` · its bookmarks moved to ${tn(par)}`;
    }
    for (const i of its) {
      const c = await lib.get(i.id); if (!c) continue;
      await lib.del(i.id); const bid = uid(); await lib.binPut({ bid, kind: 'item', at: Date.now(), item: c }); made.push(bid);
    }
    sel.clear(); sbSel = null;
    return `${n === 1 ? qt(its.length ? its[0].title : leaf(fl[0])) : n + ' items'} moved to bin` + note;
  });
}
const binName = e => e.kind === 'item' ? e.item.title : leaf(e.path);
async function restoreBin(e) {
  if (!await ask({ title: 'Restore from bin?', message: `Restore ${qt(binName(e))}?`, ok: 'Restore' })) return;
  await doAct(e.kind === 'item' ? [e.item.id] : e.aff.map(a => a.id), [e.bid], async () => {
    if (e.kind === 'item') {
      const fs = []; for (const f of e.item.folders) fs.push(await lib.addFolder(f));
      const ex = await lib.get(e.item.id);
      if (ex) { ex.folders = normF([...ex.folders, ...fs]); await lib.put(ex); }
      else { e.item.folders = normF(fs.length ? fs : ['General']); await lib.put(e.item); }
    } else {
      for (const t of e.tree) await lib.addFolder(t);
      for (const a of e.aff) {
        const c = await lib.get(a.id); if (!c) continue;
        const keep = c.folders.filter(f => !(f === e.par && !a.folders.includes(e.par)));
        c.folders = normF([...keep, ...a.folders.filter(f => inF(f, e.path))]); if (!c.folders.length) c.folders = ['General'];
        await lib.put(c);
      }
    }
    await lib.binDel(e.bid);
    return `${qt(binName(e))} restored`;
  });
}
async function purge(es, confirmed = false) {
  if (!confirmed && !await ask({ title: 'Delete forever?', message: `${es.length === 1 ? qt(binName(es[0])) : es.length + ' items'} will be permanently deleted. You can still undo right afterwards.`, ok: 'Delete forever', warn: true })) return;
  const nm = es.length === 1 ? qt(binName(es[0])) : `${es.length} items`;
  await doAct([], es.map(e => e.bid), async () => { for (const e of es) await lib.binDel(e.bid); return `${nm} deleted permanently`; });
}
async function emptyBin() {
  if (!bin.length) return;
  if (!await ask({ title: 'Empty recycle bin', message: `Permanently delete ${bin.length} item${bin.length > 1 ? 's' : ''}? You can still undo right afterwards.`, ok: 'Empty bin', warn: true })) return;
  purge([...bin], true);
}
async function transfer(kind, ids, fl0, target) {
  const fl = fl0.filter(f => !inF(target, f));
  if (!ids.length && !fl.length) { toast(fl0.length ? "A folder can't be placed inside itself" : 'Nothing to do'); return; }
  const skipped = [], total = ids.length + fl.length;
  await doAct(idsFor(ids, fl), [], async () => {
    let okc = 0;
    for (const f of fl) {
      if (kind === 'copy') { await copyFolder(f, target); okc++; }
      else if (await moveFolderTo(f, target) === 'ok') okc++; else skipped.push(f);
    }
    items = await lib.all(); folders = await lib.folders();
    for (const id of ids) {
      const it = items.find(x => x.id === id); if (!it) continue;
      it.folders = kind === 'copy' ? normF([...it.folders, target]) : moveFolders(it, target); await lib.put(it);
    }
    const done = ids.length + okc;
    if (!done) { toast(`Not moved: a folder named ${qt(leaf(skipped[0] || ''))} already exists there`); return null; }
    const first = ids.length ? (items.find(x => x.id === ids[0]) || {}).title : leaf(fl[0]);
    return `${total === 1 ? qt(first) : total + ' items'} ${kind === 'copy' ? 'copied' : 'moved'} to ${tn(target)}` + (skipped.length ? ` (${skipped.length} skipped: name already exists)` : '');
  });
}

/* ---------- selection contexts: 'main' = items/folders in the big area (multi), 'side' = one row in the sidebar ---------- */
function selectKey(k, where) {
  if (where === 'side') { sel.clear(); selMode = false; sbSel = k; ctx = 'side'; }
  else { sbSel = null; selMode = true; sel.add(k); ctx = 'main'; }
  render();
}
const selKeys = () => ctx === 'side' && sbSel ? [sbSel] : [...sel];
const isCut = k => clip && clip.mode === 'cut' && clip.keys.includes(k);
async function delKeys() {
  const ks = selKeys(), its = keyItems(ks), fl = keyFolders(ks).filter(p => p !== 'General');
  if (!its.length && !fl.length) { if (ks.length) toast('"General" can\'t be deleted'); return; }
  await trashSel(its, fl);
}
function renKey() {
  const ks = selKeys(); if (ks.length !== 1) { if (ks.length) toast('Select one thing to rename'); return; }
  const k = ks[0];
  if (k[0] === 'f') { if (k.slice(2) === 'General') toast('"General" can\'t be renamed'); else renameF(k.slice(2)); }
  else { const i = items.find(x => x.id === k.slice(2)); if (i) renameItem(i); }
}
function copyCut(mode) {
  const ks = [...sel].filter(k => mode === 'copy' || k !== 'f:General');
  if (!ks.length) { toast('"General" can\'t be cut'); return; }
  clip = { mode, keys: ks }; sel.clear(); selMode = false; render();
  const its = keyItems(ks), fl = keyFolders(ks), n = its.length + fl.length;
  toast(`${n === 1 ? qt(its.length ? its[0].title : leaf(fl[0])) : n + ' items'} ${mode === 'copy' ? 'copied' : 'cut'} · open a folder and press Ctrl+V`);
}
async function paste() {
  if (!clip || folder === BIN) return;
  const c = clip, target = ctx === 'side' && sbSel && sbSel[0] === 'f' ? sbSel.slice(2) : folder;
  const its = keyItems(c.keys), fl = keyFolders(c.keys);
  if (!its.length && !fl.length) { clip = null; render(); return; }
  if (its.length && !target) { toast("Open a folder first: bookmarks can't sit at the top level"); return; }
  const n = its.length + fl.length, verb = c.mode === 'cut' ? 'Move' : 'Copy';
  if (!await ask({ title: `${verb} here?`, message: `${verb} ${n === 1 ? qt(its.length ? its[0].title : leaf(fl[0])) : n + ' items'} to ${tn(target)}?`, ok: verb })) return;
  await transfer(c.mode === 'cut' ? 'move' : 'copy', its.map(i => i.id), fl, target);
  if (c.mode === 'cut') clip = null; render();
}
function selAll() {
  if (folder === BIN) return;
  ctx = 'main'; sbSel = null; selMode = true;
  view.subs.forEach(p => sel.add('f:' + p)); view.f.forEach(i => sel.add('i:' + i.id)); render();
}
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
  const t = e.target; if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), has = selKeys().length > 0;
  let used = true;
  if (e.key === 'Escape') { if (clip) cancelClip(); else if (selMode || sel.size) setSelMode(false); else if (sbSel) { sbSel = null; renderTree(); } else used = false; }
  else if (mod && k === 'z') (e.shiftKey ? redo : undo)();
  else if (mod && k === 'y') redo();
  else if (mod && k === 'a') selAll();
  else if (mod && k === 'c' && ctx === 'main' && sel.size) copyCut('copy');
  else if (mod && k === 'x' && ctx === 'main' && sel.size) copyCut('cut');
  else if (mod && k === 'v' && clip) paste();
  else if (e.key === 'Delete' && has) delKeys();
  else if (e.key === 'F2' && has) renKey();
  else used = false;
  if (used) e.preventDefault();
});

function render() {
  if (folder === BIN) { selMode = false; sel.clear(); }
  if (folder !== lastF) {
    trackFwd(lastF, folder); lastF = folder; try { history.replaceState(null, '', fHref(folder)); } catch {}
    if (folder && folder !== BIN) { const s = folder.split('/'); s.forEach((_, i) => openF.add(s.slice(0, i + 1).join('/'))); saveOpen(); }
  }
  renderTree(); renderSel(); updUR();
  const inB = folder === BIN;
  for (const s of ['#addf', '#sel', '#more']) $(s).disabled = inB;
  $('#grid').classList.toggle('binv', inB);
  if (inB) return renderBin();
  const searching = !!q;
  const ok = i => (!type || i.type === type) && (!folder || inTree(i, folder)) &&
    (!q || (i.title + ' ' + i.url + ' ' + i.notes + ' ' + i.moments.map(m => m.note).join(' ')).toLowerCase().includes(q));
  if (coFor !== folder) { co.clear(); coFor = folder; }
  const base = items.filter(ok);
  const rel = p => inF(folder, p);
  const avail = folder ? folders.filter(p => !rel(p) && base.some(i => inTree(i, p))) : [];
  for (const p of [...co]) if (!avail.includes(p)) co.delete(p);
  const f = base.filter(i => [...co].every(p => inTree(i, p)));
  $('#chips').replaceChildren(...(avail.length ? [el('span', { class: 'm', style: 'align-self:center' }, 'Also in:'),
    ...avail.map(p => el('span', { class: 'chip' + (co.has(p) ? ' on' : ''), onclick: () => { co.has(p) ? co.delete(p) : co.add(p); render(); } },
      '📁 ' + p, ' ', el('small', {}, base.filter(i => inTree(i, p)).length)))] : []));
  const th = i => i.thumb || (i.snaps[0] && i.snaps[0].img);
  const subs = searching ? [] : folders.filter(p => parentOf(p) === folder);
  view = { subs, f };
  const parts = folder ? folder.split('/') : [];
  const crumbs = [{ icon: '📚', name: 'All bookmarks', p: '' }, ...parts.map((x, i) => ({ icon: '📁', name: x, p: parts.slice(0, i + 1).join('/') }))];
  $('#crumbs').replaceChildren(...crumbs.flatMap((c, i) => {
    const last = i === crumbs.length - 1, kids = [el('span', { class: 'ci' }, c.icon), c.name];
    return [i ? el('span', { class: 'sep' }, '›') : null,
      last ? el('span', { class: 'cur cr' }, ...kids) : el('a', { class: 'cr', href: fHref(c.p), onclick: nav(c.p) }, ...kids)];
  }).filter(Boolean));
  if (fwd && !folders.includes(fwd)) fwd = '';
  $('#back').disabled = !folder; $('#fwd').disabled = !nextToward();
  $('#subs').replaceChildren(...subs.map(p => {
    const inside = items.filter(i => inTree(i, p)), prev = inside.slice(0, 4), n = inside.length;
    return el('a', { class: 'fcard' + (sel.has('f:' + p) ? ' sel' : '') + (isCut('f:' + p) ? ' cut' : ''), href: fHref(p), onclick: e => { if (picking(e)) { e.preventDefault(); toggleSel('f:' + p); } else nav(p)(e); } },
      cbx('f:' + p),
      el('div', { class: 'fgrid' }, ...[0, 1, 2, 3].map(k => { const u = prev[k] && th(prev[k]); return el('div', { class: 'fc' }, u ? el('img', { src: u, loading: 'lazy', onerror: e => e.target.remove() }) : null); })),
      el('div', { class: 'fname' }, leaf(p)), el('div', { class: 'fcount' }, `${n} item${n === 1 ? '' : 's'}`),
      el('button', { class: 'dots', title: 'More', onclick: e => { e.preventDefault(); e.stopPropagation(); folderMenu(e.currentTarget, p, { where: 'main' }); } }, '⋮'));
  }));
  $('#grid').replaceChildren(...(f.length ? f.map(i => el('div', { class: 'card' + (sel.has('i:' + i.id) ? ' sel' : '') + (isCut('i:' + i.id) ? ' cut' : '') }, cbx('i:' + i.id),
    el('a', { class: 'cl', href: i.url, target: '_blank', rel: 'noopener', onclick: e => { if (picking(e)) { e.preventDefault(); toggleSel('i:' + i.id); } }, ondragstart: e => e.dataTransfer.setData('text/plain', i.id) },
      el('div', { class: 'th' }, th(i) ? el('img', { src: th(i), loading: 'lazy', onerror: e => e.target.replaceWith(ICON[i.type]) }) : ICON[i.type]),
      el('div', { class: 'cb' }, el('div', { class: 't' }, i.title),
        el('div', { class: 'm' }, `${ICON[i.type]} ${new URL(i.url).hostname}` + (i.snaps.length ? ` · 📷 ${i.snaps.length}` : '') + (i.moments.length ? ` · ⏱ ${i.moments.length}` : '') + (!folder || searching ? ` · 📁 ${i.folders.join(', ')}` : '')))),
    el('button', { class: 'dots', title: 'More', onclick: e => { e.preventDefault(); e.stopPropagation(); menu(e.currentTarget, i); } }, '⋮'))) :
    (subs.length ? [] : [el('div', { class: 'empty' }, items.length ? (folder ? 'Nothing here.' : 'Nothing matches.') : 'Empty library. Open any page and press Alt+B, or right-click → "Save to my library".')])));
}

const ago = t => { const m = Math.floor((Date.now() - t) / 6e4); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.floor(m / 60); return h < 24 ? h + ' h ago' : Math.floor(h / 24) + ' d ago'; };
function renderBin() {
  $('#back').disabled = false; $('#fwd').disabled = true;
  $('#crumbs').replaceChildren(el('a', { class: 'cr', href: fHref(''), onclick: nav('') }, el('span', { class: 'ci' }, '📚'), 'All bookmarks'),
    el('span', { class: 'sep' }, '›'), el('span', { class: 'cur cr' }, el('span', { class: 'ci' }, '🗑'), 'Recycle bin'));
  $('#subs').replaceChildren(); $('#chips').replaceChildren();
  const list = [...bin].sort((a, b) => b.at - a.at);
  $('#grid').replaceChildren(...(list.length ? [
    el('div', { class: 'binhd' }, el('span', { class: 'm' }, `${list.length} deleted item${list.length > 1 ? 's' : ''}`), el('button', { class: 'warnb', onclick: emptyBin }, 'Empty bin')),
    ...list.map(e => el('div', { class: 'brow' },
      el('span', { class: 'bi' }, e.kind === 'item' ? ICON[e.item.type] : '📁'),
      el('div', { class: 'bt' }, el('div', { class: 't1' }, binName(e)),
        el('div', { class: 'm' }, (e.kind === 'item' ? 'Bookmark' : 'Folder') + ' · deleted ' + ago(e.at) + (e.kind === 'item' ? ' · 📁 ' + e.item.folders.join(', ') : ' · ' + e.path))),
      el('button', { onclick: () => restoreBin(e) }, '↩ Restore'), el('button', { class: 'warnb', onclick: () => purge([e]) }, 'Delete forever')))
  ] : [el('div', { class: 'empty' }, 'The recycle bin is empty.')]));
}

function renderSel() {
  for (const k of [...sel]) if (k[0] === 'i' ? !items.some(i => i.id === k.slice(2)) : !folders.includes(k.slice(2))) sel.delete(k);
  document.body.classList.toggle('selmode', selMode); $('#sel').classList.toggle('on', selMode);
  const bar = $('#selbar');
  if (!sel.size) {
    const n = clip && folder !== BIN ? keyItems(clip.keys).length + keyFolders(clip.keys).length : 0;
    if (clip && !n && folder !== BIN) clip = null;
    bar.hidden = !n; if (!n) return;
    bar.replaceChildren(el('span', { class: 'sc' }, `${n} ${clip.mode === 'cut' ? 'cut' : 'copied'}`), el('button', { class: 'primary', onclick: () => paste() }, '📥 Paste here'), el('button', { onclick: cancelClip }, 'Cancel'));
    return;
  }
  bar.hidden = false;
  bar.replaceChildren(el('span', { class: 'sc' }, `${sel.size} selected`),
    el('button', { onclick: () => bulk('copy') }, '📋 Copy to…'), el('button', { onclick: () => bulk('move') }, '➡️ Move to…'),
    el('button', { class: 'warnb', onclick: bulkDelete }, '🗑 Delete'), el('button', { title: 'Exit select mode', onclick: () => setSelMode(false) }, 'Done'));
}
const selItems = () => keyItems([...sel]);
const selFolders = () => keyFolders([...sel]);

function treeBox({ hidden = () => false, disabled = () => false, isOn = () => false, onPick, onDbl, rootOption = false, openInit = [] }) {
  const opened = new Set(openInit), box = el('div', { class: 'pkl' });
  const cnt = p => items.filter(i => inTree(i, p)).length;
  const draw = () => {
    const st = box.scrollTop;
    const mk = (p, label, depth, ks, count, toggle) => {
      const dis = disabled(p), has = ks && ks.length;
      return el('div', { class: 'fr' + (isOn(p) ? ' on' : '') + (dis ? ' dis' : ''), onclick: () => { if (!dis) onPick(p); }, ondblclick: () => { if (!dis && onDbl) onDbl(p); } },
        el('span', { class: 'tg', style: `width:${depth * 16 + 22}px`, ondblclick: e => e.stopPropagation(), onclick: e => { e.stopPropagation(); if (has) toggle(); } },
          el('span', { class: 'chev' + (opened.has(p) ? ' open' : ''), innerHTML: has ? CHEV : '' })),
        el('span', { class: 'n' }, label), el('span', { class: 'c' }, count));
    };
    const walk = (p, depth) => {
      if (hidden(p)) return [];
      const ks = folders.filter(x => parentOf(x) === p && !hidden(x));
      let w = null;
      const row = mk(p, '📁 ' + leaf(p), depth, ks, cnt(p), () => {
        const o = !opened.has(p); o ? opened.add(p) : opened.delete(p);
        w.classList.toggle('open', o); row.querySelector('.chev').classList.toggle('open', o);
      });
      if (!ks.length) return [row];
      w = el('div', { class: 'sub' + (opened.has(p) ? ' open' : '') }, el('div', { class: 'subi' }, ...ks.flatMap(c => walk(c, depth + 1))));
      return [row, w];
    };
    const out = [];
    if (rootOption) out.push(mk('', '📚 Top level', 0, [], ''));
    folders.filter(x => !x.includes('/')).forEach(t => out.push(...walk(t, 0)));
    box.replaceChildren(...out); box.scrollTop = st;
  };
  return { box, draw, opened };
}

function pickFolder({ title, ok, rootOption = false, exclude = () => false, disabled = () => false }) {
  return new Promise(res => {
    const d = $('#modal'); let done = false, choice = null, adding = false;
    const fin = v => { if (done) return; done = true; d.close(); res(v); };
    const tb = treeBox({ hidden: exclude, disabled, rootOption, isOn: p => choice === p, onPick: p => { choice = p; draw(); }, onDbl: p => { choice = p; fin(p); } });
    const draw = () => {
      const st = tb.box.scrollTop; tb.draw();
      let foot;
      if (adding) {
        const inp = el('input', { type: 'text', placeholder: choice ? `New folder inside "${choice}"` : 'New top-level folder' });
        const create = async () => {
          const n = inp.value.split('/').map(x => x.trim()).filter(Boolean).join('/'); if (!n) return;
          choice = await createFolderAct(choice ? choice + '/' + n : n); folders = await lib.folders();
          const s = choice.split('/'); s.slice(0, -1).forEach((_, i) => tb.opened.add(s.slice(0, i + 1).join('/')));
          adding = false; draw();
        };
        inp.onkeydown = e => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); create(); } };
        foot = [inp, el('div', { class: 'mb' }, el('button', { onclick: () => { adding = false; draw(); } }, 'Back'), el('button', { class: 'primary', onclick: create }, 'Create'))];
        setTimeout(() => inp.focus());
      } else foot = [el('div', { class: 'mb' }, el('button', { onclick: () => { adding = true; draw(); } }, '➕ New folder'), el('span', { class: 'grow' }),
        el('button', { onclick: () => fin(null) }, 'Cancel'), el('button', { class: 'primary', disabled: choice === null, onclick: () => fin(choice) }, ok))];
      d.replaceChildren(el('h3', {}, title), tb.box, ...foot); tb.box.scrollTop = st;
    };
    d.onkeydown = e => { if (e.key === 'Enter' && !adding && choice !== null && e.target.tagName !== 'BUTTON') { e.preventDefault(); fin(choice); } };
    d.oncancel = e => { e.preventDefault(); fin(null); };
    d.onclick = e => { if (e.target === d) fin(null); };
    draw(); d.showModal();
  });
}

async function copyFolder(src, tp) {
  const name = src.split('/').pop(), dest = await lib.addFolder(tp ? tp + '/' + name : name), map = new Map();
  for (const f of folders.filter(f => inF(f, src))) map.set(f, await lib.addFolder(dest + f.slice(src.length)));
  for (const it of items) {
    const add = it.folders.filter(f => inF(f, src)).map(f => map.get(f) || (dest + f.slice(src.length)));
    if (add.length) { it.folders = normF([...it.folders, ...add]); await lib.put(it); }
  }
}

async function moveFolderTo(src, tp) {
  const nm = src.split('/').pop(), to = tp ? tp + '/' + nm : nm;
  if (to === src) return 'same';
  if (folders.some(x => x !== src && x.toLowerCase() === to.toLowerCase())) return 'exists';
  await lib.moveFolder(src, to);
  openF = new Set([...openF].map(x => inF(x, src) ? to + x.slice(src.length) : x)); saveOpen();
  if (inF(folder, src)) folder = to + folder.slice(src.length);
  folders = await lib.folders(); return 'ok';
}

async function bulk(kind) {
  const its = selItems(), ids = its.map(i => i.id), fl = selFolders().filter(p => kind === 'copy' || p !== 'General');
  if (!ids.length && !fl.length) { toast('"General" can\'t be moved'); return; }
  const n = ids.length + fl.length;
  const target = await pickFolder({ title: `${kind === 'copy' ? 'Copy' : 'Move'} ${n} item${n > 1 ? 's' : ''} to…`, ok: kind === 'copy' ? 'Copy here' : 'Move here', rootOption: !ids.length, exclude: p => fl.some(f => inF(p, f)) });
  if (target === null) return;
  sel.clear(); await transfer(kind, ids, fl, target);
}
async function bulkDelete() {
  const its = selItems(), fl = selFolders().filter(p => p !== 'General');
  if (!its.length && !fl.length) { toast('"General" can\'t be deleted'); return; }
  await trashSel(its, fl);
}
async function itemTo(i, mode) {
  const from = folder || (i.folders.length === 1 ? i.folders[0] : null);
  const t = await pickFolder({ title: mode === 'add' ? 'Copy to…' : 'Move to…', ok: mode === 'add' ? 'Copy here' : 'Move here', disabled: p => mode === 'add' ? i.folders.some(f => inF(f, p)) : p === from });
  if (t === null) return; mode === 'add' ? addTo(i, t) : moveTo(i, t);
}
async function folderTo(p, kind) {
  const t = await pickFolder({ title: `${kind === 'copy' ? 'Copy' : 'Move'} "${leaf(p)}" to…`, ok: kind === 'copy' ? 'Copy here' : 'Move here', rootOption: true, exclude: x => inF(x, p) });
  if (t === null) return; transfer(kind, [], [p], t);
}

function closeMenu() { $('#menu')?.remove(); }
function popup(btn, left = false) {
  closeMenu();
  const m = el('div', { class: 'menu', id: 'menu' });
  const mi = (t, fn, c = '') => el('button', { class: 'mi ' + c, onclick: e => { e.stopPropagation(); fn(); } }, t);
  const place = () => {
    const r = btn.getBoundingClientRect();
    m.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8)) + 'px';
    m.style.left = Math.max(8, Math.min(left ? r.left : r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px';
  };
  document.body.append(m);
  return { m, mi, place };
}
function menu(btn, i, side = false) {
  const { m, mi, place } = popup(btn);
  m.replaceChildren(
    mi('☑️  Select', () => { closeMenu(); selectKey('i:' + i.id, side ? 'side' : 'main'); }),
    ...(side ? [mi('↗️  Open link', () => { closeMenu(); window.open(i.url, '_blank', 'noopener'); })]
      : [mi('📁  Copy to…', () => { closeMenu(); itemTo(i, 'add'); }), mi('➡️  Move to…', () => { closeMenu(); itemTo(i, 'move'); })]),
    mi('✏️  Rename      F2', () => { closeMenu(); renameItem(i); }),
    mi('🔎  Details (snapshots & timestamps)', () => { closeMenu(); open(i.id); }),
    mi('🗑  Delete      Del', () => { closeMenu(); trashSel([i], []); }, 'danger'));
  place();
}
function folderMenu(btn, p, o = {}) {
  const { m, mi, place } = popup(btn), real = p && p !== 'General';
  m.replaceChildren(
    ...(o.where ? [mi('☑️  Select', () => { closeMenu(); selectKey('f:' + p, o.where); })] : []),
    mi('↗️  Open in new tab', () => { closeMenu(); openTab(p); }),
    ...(o.noNew ? [] : [mi('📁＋  New subfolder', async () => { closeMenu(); const n = await createIn(p); if (n) { openF.add(p); saveOpen(); folder = n; load(); } })]),
    ...(o.where === 'main' ? [mi('📁  Copy to…', () => { closeMenu(); folderTo(p, 'copy'); }), ...(real ? [mi('➡️  Move to…', () => { closeMenu(); folderTo(p, 'move'); })] : [])] : []),
    ...(real ? [mi('✏️  Rename      F2', () => { closeMenu(); renameF(p); }), mi('🗑  Delete      Del', () => { closeMenu(); trashSel([], [p]); }, 'danger')] : []));
  place();
}
document.addEventListener('click', e => {
  if (!e.target.closest('.menu')) closeMenu();
  if (sbSel && !e.target.closest('aside')) { sbSel = null; renderTree(); }
});
addEventListener('scroll', closeMenu, true);

function open(id) {
  const i = items.find(x => x.id === id); if (!i) return;
  const d = $('#dlg');
  const redo = async () => { await lib.put(i); await load(); open(id); };
  d.replaceChildren(
    el('div', { class: 'dh' }, el('h2', {}, el('a', { href: i.url, target: '_blank', textContent: i.title })), el('button', { onclick: () => d.close() }, '✕')),
    el('div', { class: 'm' }, '📁 ' + i.folders.join(', ')),
    i.thumb ? el('img', { class: 'big', src: i.thumb }) : null,
    el('label', {}, 'Notes', el('textarea', { value: i.notes, onchange: async e => { i.notes = e.target.value; await lib.put(i); } })),
    el('h3', {}, `⏱ Moments (${i.moments.length})`),
    ...[...i.moments].sort((a, b) => a.start - b.start).map(m => el('div', { class: 'mo' },
      el('a', { href: link(i, m.start), target: '_blank', textContent: fmt(m.start) + (m.end != null ? ' → ' + fmt(m.end) : '') }),
      el('span', {}, m.note || ''),
      el('button', { onclick: () => { i.moments = i.moments.filter(x => x.id !== m.id); redo(); } }, '🗑'))),
    el('h3', {}, `📷 Snapshots (${i.snaps.length})`),
    el('div', { class: 'snaps' }, i.snaps.map(s => el('figure', {},
      el('img', { src: s.img, onclick: e => e.target.classList.toggle('zoom') }),
      el('figcaption', {}, s.t != null ? el('a', { href: link(i, s.t), target: '_blank', textContent: fmt(s.t) }) : 'frame',
        el('button', { onclick: () => { i.snaps = i.snaps.filter(x => x.id !== s.id); redo(); } }, '🗑'))))));
  if (!d.open) d.showModal();
}

let drawnOpen = null;
function renderTree() {
  if (sbSel && !(sbSel[0] === 'i' ? items.some(i => i.id === sbSel.slice(2)) : folders.includes(sbSel.slice(2)))) sbSel = null;
  const kids = p => folders.filter(x => parentOf(x) === p);
  const direct = p => items.filter(i => i.folders.includes(p));
  const nowOpen = new Set();
  // the whole left strip (indent + arrow) is the expand/collapse target, so a stray click there never selects the folder
  const tg = (w, has = false, isOpen = false, toggle = null) => el('span', { class: 'tg', style: `width:${w}px`, onclick: e => { e.stopPropagation(); if (has && toggle) toggle(); } },
    el('span', { class: 'chev' + (isOpen ? ' open' : ''), innerHTML: has ? CHEV : '' }));
  const sub = (isOpen, key, nodes) => {
    const w = el('div', { class: 'sub' }, el('div', { class: 'subi' }, ...nodes));
    if (isOpen) { nowOpen.add(key); if (drawnOpen === null || drawnOpen.has(key)) w.classList.add('open'); else requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('open'))); }
    return w;
  };
  const itemRow = (i, depth) => el('div', { class: 'fr it' + (sbSel === 'i:' + i.id ? ' sel' : '') },
    tg(depth * 16 + 22),
    el('a', { class: 'n', href: i.url, target: '_blank', rel: 'noopener', title: i.title, textContent: i.title }),
    el('button', { class: 'fdots', title: 'Bookmark options', onclick: e => { e.stopPropagation(); menu(e.currentTarget, i, true); } }, '⋮'));
  const out = [el('div', rowProps('', 'fr' + (folder === '' ? ' on' : '')),
    tg(22), nameLink('', '📚 All bookmarks'), el('span', { class: 'c' }, items.length), el('span', { class: 'fd' }))];
  const walk = (p, depth) => {
    const ks = kids(p), ds = direct(p), has = ks.length || ds.length, isOpen = openF.has(p);
    let w = null;
    const row = el('div', {
      ...rowProps(p, 'fr' + (p === folder ? ' on' : '') + (sbSel === 'f:' + p ? ' sel' : '')),
      ondragover: e => e.preventDefault(),
      ondrop: e => { e.preventDefault(); const it = items.find(x => x.id === e.dataTransfer.getData('text/plain')); if (it) dropMove(it, p); },
    }, tg(depth * 16 + 22, has, isOpen, () => {
      const o = !openF.has(p); o ? openF.add(p) : openF.delete(p); saveOpen();
      w.classList.toggle('open', o); row.querySelector('.chev').classList.toggle('open', o);
      if (drawnOpen) o ? drawnOpen.add(p) : drawnOpen.delete(p);
    }), nameLink(p, '📁 ' + leaf(p)), el('span', { class: 'c' }, items.filter(i => inTree(i, p)).length),
      el('button', { class: 'fdots', title: 'Folder options', onclick: e => { e.stopPropagation(); folderMenu(e.currentTarget, p, { where: 'side' }); } }, '⋮'));
    if (!has) return [row];
    w = sub(isOpen, p, [...ks.flatMap(c => walk(c, depth + 1)), ...ds.map(i => itemRow(i, depth + 1))]);
    return [row, w];
  };
  out.push(...kids('').flatMap(t => walk(t, 0)));
  out.push(el('div', {
    ...rowProps(BIN, 'fr binfr' + (folder === BIN ? ' on' : '')),
    ondragover: e => e.preventDefault(),
    ondrop: e => { e.preventDefault(); const it = items.find(x => x.id === e.dataTransfer.getData('text/plain')); if (it) trashSel([it], []); },
  }, tg(22), nameLink(BIN, '🗑 Recycle bin'), el('span', { class: 'c' }, bin.length || ''), el('span', { class: 'fd' })));
  drawnOpen = nowOpen;
  $('#tree').replaceChildren(...out);
}
async function renameF(p) {
  const name = await ask({ title: 'Rename folder', input: { value: leaf(p) }, ok: 'Rename' });
  const n = (name || '').replace(/\//g, '-').trim(); if (!n || n === leaf(p)) return;
  const to = (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) + '/' : '') + n;
  if (folders.some(x => x !== p && x.toLowerCase() === to.toLowerCase())) { await ask({ title: 'Name already used', message: 'A folder with that name already exists here.', cancel: null }); return; }
  await doAct(idsFor([], [p]), [], async () => {
    await lib.moveFolder(p, to);
    openF = new Set([...openF].map(x => inF(x, p) ? to + x.slice(p.length) : x)); saveOpen();
    if (inF(folder, p)) folder = to + folder.slice(p.length);
    return `Folder ${qt(leaf(p))} renamed to ${qt(n)}`;
  });
}
$('#undo').onclick = undo; $('#redo').onclick = redo;
$('#back').onclick = () => { if (folder) goTo(parentOf(folder)); };
$('#fwd').onclick = () => { const t = nextToward(); if (t) goTo(t); };
$('#addf').onclick = async () => { const p = await createIn(folder); if (p) { folder = p; load(); } };
$('#more').onclick = e => { e.stopPropagation(); folderMenu(e.currentTarget, folder, { noNew: true }); };
$('#nf').onclick = async () => { const p = await createIn(folder === BIN ? '' : folder); if (p) { folder = p; load(); } };

$('#dlg').addEventListener('click', e => { if (e.target.id === 'dlg') e.target.close(); });
$('#q').oninput = e => { q = e.target.value.toLowerCase(); render(); };
$('#ty').onchange = e => { type = e.target.value; render(); };
const fingerprint = () => `${items.length}:${items.reduce((n, i) => n + i.snaps.length + i.moments.length, 0)}:${folders.length}`;
async function doExport() {
  const blob = new Blob([JSON.stringify({ version: 4, items: await lib.all(), folders: await lib.folders(), bin: await lib.binAll() })], { type: 'application/json' });
  el('a', { href: URL.createObjectURL(blob), download: `library-backup-${new Date().toISOString().slice(0, 10)}.json` }).click();
  try { localStorage.setItem('lastBackup', Date.now()); localStorage.setItem('backupFp', fingerprint()); localStorage.removeItem('snooze'); } catch {}
  showBanner();
}
$('#ex').onclick = doExport;
function showBanner() {
  const b = $('#banner'); let last = 0, fp = '', snooze = 0;
  try { last = +localStorage.getItem('lastBackup') || 0; fp = localStorage.getItem('backupFp') || ''; snooze = +localStorage.getItem('snooze') || 0; } catch {}
  const days = Math.floor((Date.now() - last) / 864e5);
  let msg = '', btns = [];
  if (!items.length) {
    msg = 'Your library is empty. If you had bookmarks before (for example after reinstalling the extension), restore them from your backup file.';
    btns = [el('button', { class: 'primary', onclick: () => $('#im').click() }, 'Import backup')];
  } else if (Date.now() > snooze && (!last || (fp !== fingerprint() && days >= 3))) {
    msg = (last ? `Last backup was ${days} days ago.` : 'You have never backed up your library.') + ' Removing or reinstalling the extension erases its data, so keep a backup file.';
    btns = [el('button', { class: 'primary', onclick: doExport }, 'Back up now'), el('button', { onclick: () => { try { localStorage.setItem('snooze', Date.now() + 864e5); } catch {} showBanner(); } }, 'Later')];
  }
  b.hidden = !msg; b.replaceChildren(...(msg ? [el('span', { class: 'bm' }, msg), ...btns] : []));
}
$('#im').onclick = () => $('#fi').click();
$('#fi').onchange = async e => {
  try {
    const raw = JSON.parse(await e.target.files[0].text());
    const data = Array.isArray(raw) ? raw : raw.items || [];
    for (const f of raw.folders || []) await lib.addFolder(f);
    for (const b of raw.bin || []) if (b && b.bid) await lib.binPut(b);
    for (const o of data) if (o && o.id) {
      const fs = Array.isArray(o.folders) && o.folders.length ? o.folders : [o.folder || 'General'];
      o.folders = [...new Set(await Promise.all(fs.map(f => lib.addFolder(f))))];
      delete o.folder; delete o.tags; (o.moments || []).forEach(m => delete m.tags);
      await lib.put(o);
    }
    await load(); await ask({ title: 'Import complete', message: `Imported ${data.length} items.`, cancel: null });
  } catch { await ask({ title: 'Import failed', message: 'That file could not be imported.', cancel: null }); }
  e.target.value = '';
};
$('#sel').onclick = () => setSelMode(!selMode);

let sbw = 280, sbOpen = true;
try { sbw = +localStorage.getItem('sbw') || 280; sbOpen = localStorage.getItem('sbOpen') !== '0'; } catch {}
const SB_L = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
const SB_R = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
function applySb() {
  document.documentElement.style.setProperty('--sbw', sbw + 'px');
  document.body.classList.toggle('sbclosed', !sbOpen);
  $('#sbtog').innerHTML = sbOpen ? SB_L : SB_R; $('#sbtog').title = sbOpen ? 'Hide sidebar' : 'Show sidebar';
  try { localStorage.setItem('sbw', sbw); localStorage.setItem('sbOpen', sbOpen ? '1' : '0'); } catch {}
}
$('#sbtog').onclick = e => { e.stopPropagation(); sbOpen = !sbOpen; applySb(); };
$('#sbtog').onpointerdown = e => e.stopPropagation();
$('#divider').ondblclick = () => { sbw = 280; applySb(); };
$('#divider').onpointerdown = e => {
  if (!sbOpen) return;
  e.preventDefault();
  const dv = $('#divider'), sx = e.clientX, sw = sbw;
  dv.setPointerCapture(e.pointerId); document.body.classList.add('resizing');
  const mv = ev => { sbw = Math.max(180, Math.min(560, sw + ev.clientX - sx)); applySb(); };
  const up = () => { document.body.classList.remove('resizing'); dv.removeEventListener('pointermove', mv); dv.removeEventListener('pointerup', up); dv.removeEventListener('pointercancel', up); };
  dv.addEventListener('pointermove', mv); dv.addEventListener('pointerup', up); dv.addEventListener('pointercancel', up);
};
applySb();
load();
