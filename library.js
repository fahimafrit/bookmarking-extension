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
function setSelMode(on) { selMode = on; if (!on) sel.clear(); render(); }
function toggleSel(k) { if (sel.has(k)) sel.delete(k); else sel.add(k); render(); }
const cbx = k => el('input', { type: 'checkbox', class: 'cbx', checked: sel.has(k), onclick: e => { e.stopPropagation(); toggleSel(k); } });
const CHEV = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const fHref = p => p ? 'library.html?f=' + encodeURIComponent(p) : 'library.html';
const plain = e => !(e.ctrlKey || e.metaKey || e.shiftKey);
const nav = p => e => { if (plain(e)) { e.preventDefault(); folder = p; render(); } };
const openTab = (p, active = true) => chrome.tabs.create({ url: chrome.runtime.getURL(fHref(p)), active });
const rowProps = (p, cls) => ({
  class: cls,
  onclick: e => { if (plain(e)) { folder = p; render(); } },
  onauxclick: e => { if (e.button === 1 && !e.target.closest('a')) { e.preventDefault(); openTab(p, false); } },
  onmousedown: e => { if (e.button === 1 && !e.target.closest('a')) e.preventDefault(); },
});
const nameLink = (p, text) => el('a', { class: 'n', href: fHref(p), onclick: e => { if (!e.shiftKey) e.preventDefault(); } }, text);
const lbl = p => { const s = p.split('/'); return '\u2003'.repeat(s.length - 1) + s[s.length - 1]; };

async function load() {
  items = await lib.all(); folders = await lib.folders();
  if (folder && !folders.includes(folder)) folder = '';
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
async function addTo(i, p) { i.folders = normF([...i.folders, p]); await lib.put(i); load(); }
async function moveTo(i, p) {
  i.folders = moveFolders(i, p); await lib.put(i); load();
}
async function createIn(parent) {
  const name = await ask({ title: 'New folder', message: parent ? `Inside "${parent}". Start with / for a top-level folder, or use / to nest further.` : 'Use / to create nested folders.', input: { placeholder: 'Folder name' }, ok: 'Create' });
  if (!name || !name.trim()) return null;
  const raw = name.split('/').map(x => x.trim()).filter(Boolean).join('/'); if (!raw) return null;
  return lib.addFolder(parent && !name.trim().startsWith('/') ? parent + '/' + raw : raw);
}

function render() {
  if (folder !== lastF) { trackFwd(lastF, folder); lastF = folder; try { history.replaceState(null, '', fHref(folder)); } catch {} const s = folder.split('/'); s.slice(0, -1).forEach((_, i) => openF.add(s.slice(0, i + 1).join('/'))); }
  renderTree(); renderSel();
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
    return el('a', { class: 'fcard' + (sel.has('f:' + p) ? ' sel' : ''), href: fHref(p), onclick: e => { if (picking(e)) { e.preventDefault(); toggleSel('f:' + p); } else nav(p)(e); } },
      cbx('f:' + p),
      el('div', { class: 'fgrid' }, ...[0, 1, 2, 3].map(k => { const u = prev[k] && th(prev[k]); return el('div', { class: 'fc' }, u ? el('img', { src: u, loading: 'lazy', onerror: e => e.target.remove() }) : null); })),
      el('div', { class: 'fname' }, p.split('/').pop()), el('div', { class: 'fcount' }, `${n} item${n === 1 ? '' : 's'}`));
  }));
  $('#grid').replaceChildren(...(f.length ? f.map(i => el('div', { class: 'card' + (sel.has('i:' + i.id) ? ' sel' : '') }, cbx('i:' + i.id),
    el('a', { class: 'cl', href: i.url, target: '_blank', rel: 'noopener', onclick: e => { if (picking(e)) { e.preventDefault(); toggleSel('i:' + i.id); } }, ondragstart: e => e.dataTransfer.setData('text/plain', i.id) },
      el('div', { class: 'th' }, th(i) ? el('img', { src: th(i), loading: 'lazy', onerror: e => e.target.replaceWith(ICON[i.type]) }) : ICON[i.type]),
      el('div', { class: 'cb' }, el('div', { class: 't' }, i.title),
        el('div', { class: 'm' }, `${ICON[i.type]} ${new URL(i.url).hostname}` + (i.snaps.length ? ` · 📷 ${i.snaps.length}` : '') + (i.moments.length ? ` · ⏱ ${i.moments.length}` : '') + (!folder || searching ? ` · 📁 ${i.folders.join(', ')}` : '')))),
    el('button', { class: 'dots', title: 'More', onclick: e => { e.preventDefault(); e.stopPropagation(); menu(e.currentTarget, i); } }, '⋮'))) :
    (subs.length ? [] : [el('div', { class: 'empty' }, items.length ? (folder ? 'Nothing here.' : 'Nothing matches.') : 'Empty library. Open any page and press Alt+B, or right-click → "Save to my library".')])));
}

function renderSel() {
  for (const k of [...sel]) if (k[0] === 'i' ? !items.some(i => i.id === k.slice(2)) : !folders.includes(k.slice(2))) sel.delete(k);
  document.body.classList.toggle('selmode', selMode); $('#sel').classList.toggle('on', selMode);
  const bar = $('#selbar'); bar.hidden = sel.size === 0; if (!sel.size) return;
  bar.replaceChildren(el('span', { class: 'sc' }, `${sel.size} selected`),
    el('button', { onclick: () => bulk('copy') }, '📋 Copy to…'), el('button', { onclick: () => bulk('move') }, '➡️ Move to…'),
    el('button', { class: 'warnb', onclick: bulkDelete }, '🗑 Delete'), el('button', { title: 'Exit select mode', onclick: () => setSelMode(false) }, 'Done'));
}
const selItems = () => [...sel].filter(k => k[0] === 'i').map(k => items.find(i => i.id === k.slice(2))).filter(Boolean);
const selFolders = () => { const fs = [...sel].filter(k => k[0] === 'f').map(k => k.slice(2)); return fs.filter(p => !fs.some(o => o !== p && inF(p, o))); };

function pickFolder({ title, ok, rootOption = false, exclude = () => false }) {
  return new Promise(res => {
    const d = $('#modal'); let done = false, choice = null, adding = false, st = 0;
    const fin = v => { if (done) return; done = true; d.close(); res(v); };
    const row = (p, text, depth) => el('div', { class: 'pk' + (choice === p ? ' on' : ''), style: `padding-left:${10 + depth * 16}px`, onclick: () => { choice = p; draw(); } }, text);
    const draw = () => {
      const old = d.querySelector('.pkl'); st = old ? old.scrollTop : 0;
      const list = el('div', { class: 'pkl' }, ...(rootOption ? [row('', '📚 Top level', 0)] : []),
        ...folders.filter(p => !exclude(p)).map(p => row(p, '📁 ' + p.split('/').pop(), p.split('/').length - 1)));
      let foot;
      if (adding) {
        const inp = el('input', { type: 'text', placeholder: choice ? `New folder inside "${choice}"` : 'New top-level folder' });
        const create = async () => {
          const n = inp.value.split('/').map(x => x.trim()).filter(Boolean).join('/'); if (!n) return;
          choice = await lib.addFolder(choice ? choice + '/' + n : n); folders = await lib.folders(); adding = false; draw();
        };
        inp.onkeydown = e => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); create(); } };
        foot = [inp, el('div', { class: 'mb' }, el('button', { onclick: () => { adding = false; draw(); } }, 'Back'), el('button', { class: 'primary', onclick: create }, 'Create'))];
        setTimeout(() => inp.focus());
      } else foot = [el('div', { class: 'mb' }, el('button', { onclick: () => { adding = true; draw(); } }, '➕ New folder'), el('span', { class: 'grow' }),
        el('button', { onclick: () => fin(null) }, 'Cancel'), el('button', { class: 'primary', disabled: choice === null, onclick: () => fin(choice) }, ok))];
      d.replaceChildren(el('h3', {}, title), list, ...foot); list.scrollTop = st;
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
  if (!ids.length && !fl.length) { await ask({ title: 'Nothing to move', message: '"General" can\'t be moved.', cancel: null }); return; }
  const n = ids.length + fl.length;
  const target = await pickFolder({ title: `${kind === 'copy' ? 'Copy' : 'Move'} ${n} item${n > 1 ? 's' : ''} to…`, ok: kind === 'copy' ? 'Copy here' : 'Move here', rootOption: !ids.length, exclude: p => fl.some(f => inF(p, f)) });
  if (target === null) return;
  const skipped = [];
  for (const f of fl) { if (kind === 'copy') await copyFolder(f, target); else if (await moveFolderTo(f, target) === 'exists') skipped.push(f); }
  items = await lib.all(); folders = await lib.folders();
  for (const id of ids) {
    const it = items.find(x => x.id === id); if (!it) continue;
    it.folders = kind === 'copy' ? normF([...it.folders, target]) : moveFolders(it, target); await lib.put(it);
  }
  sel.clear(); await load();
  if (skipped.length) await ask({ title: 'Some folders were skipped', message: `Not moved, because a folder with the same name already exists there: ${skipped.join(', ')}.`, cancel: null });
}
async function bulkDelete() {
  const its = selItems(), fl = selFolders().filter(p => p !== 'General'), parts = [];
  if (its.length) parts.push(`${its.length} bookmark${its.length > 1 ? 's' : ''}`);
  if (fl.length) parts.push(`${fl.length} folder${fl.length > 1 ? 's' : ''} (their bookmarks move up to the parent folder)`);
  if (!parts.length) return;
  if (!await ask({ title: 'Delete selection', message: `Delete ${parts.join(' and ')}?`, ok: 'Delete', warn: true })) return;
  for (const f of fl) await lib.removeFolder(f);
  for (const i of its) await lib.del(i.id);
  sel.clear(); await load();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && selMode && !document.querySelector('dialog[open]')) setSelMode(false); });

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
function menu(btn, i) {
  const { m, mi, place } = popup(btn);
  const main = () => { m.replaceChildren(
    mi('📁  Add to…', () => pick('add')), mi('➡️  Move to…', () => pick('move')),
    mi('🔎  Details (snapshots & timestamps)', () => { closeMenu(); open(i.id); }),
    mi('🗑  Delete', async () => {
      closeMenu();
      const ok = await ask({ title: 'Delete bookmark', message: i.folders.length > 1 ? 'This bookmark is in several folders and will be deleted from all of them.' : `"${i.title}" will be deleted.`, ok: 'Delete', warn: true });
      if (ok) { await lib.del(i.id); load(); }
    }, 'danger')); place(); };
  const pick = mode => {
    const from = folder || (i.folders.length === 1 ? i.folders[0] : null);
    const opts = folders.filter(p => mode === 'add' ? !i.folders.some(f => inF(f, p)) : p !== from);
    const go = p => { closeMenu(); mode === 'add' ? addTo(i, p) : moveTo(i, p); };
    m.replaceChildren(mi('←  Back', main), el('div', { class: 'mt' }, mode === 'add' ? 'ADD TO FOLDER' : 'MOVE TO FOLDER'),
      ...opts.map(p => mi(lbl(p), () => go(p))), mi('➕  New folder…', async () => { const p = await createIn(folder); if (p) go(p); })); place();
  };
  main();
}
function folderMenu(btn, p, noNew = false) {
  const { m, mi, place } = popup(btn);
  m.replaceChildren(
    mi('↗️  Open in new tab', () => { closeMenu(); openTab(p); }),
    ...(noNew ? [] : [mi('📁＋  New subfolder', async () => { closeMenu(); const n = await createIn(p); if (n) { openF.add(p); saveOpen(); folder = n; load(); } })]),
    ...(p && p !== 'General' ? [mi('✏️  Rename', () => { closeMenu(); renameF(p); }), mi('🗑  Delete', () => { closeMenu(); deleteF(p); }, 'danger')] : []));
  place();
}
document.addEventListener('click', e => { if (!e.target.closest('.menu')) closeMenu(); });
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

function renderTree() {
  const kids = p => folders.filter(x => parentOf(x) === p);
  const direct = p => items.filter(i => i.folders.includes(p));
  const out = [el('div', rowProps('', 'fr' + (folder === '' ? ' on' : '')),
    el('span', { class: 'chev' }), nameLink('', '📚 All bookmarks'), el('span', { class: 'c' }, items.length), el('span', { class: 'fd' }))];
  const walk = (p, depth) => {
    const has = kids(p).length || direct(p).length, isOpen = openF.has(p);
    out.push(el('div', {
      ...rowProps(p, 'fr' + (p === folder ? ' on' : '') + (sel.has('f:' + p) ? ' sel' : '')),
      ondragover: e => e.preventDefault(),
      ondrop: e => { e.preventDefault(); const it = items.find(x => x.id === e.dataTransfer.getData('text/plain')); if (it) moveTo(it, p); },
    }, el('span', { class: 'ind', style: `width:${depth * 16}px` }),
      el('span', { class: 'chev' + (isOpen ? ' open' : ''), innerHTML: has ? CHEV : '', onclick: e => { e.stopPropagation(); if (!has) return; isOpen ? openF.delete(p) : openF.add(p); saveOpen(); renderTree(); } }),
      cbx('f:' + p), nameLink(p, '📁 ' + p.split('/').pop()), el('span', { class: 'c' }, items.filter(i => inTree(i, p)).length), el('button', { class: 'fdots', title: 'Folder options', onclick: e => { e.stopPropagation(); folderMenu(e.currentTarget, p); } }, '⋮')));
    if (isOpen) {
      kids(p).forEach(c => walk(c, depth + 1));
      direct(p).forEach(i => out.push(el('div', { class: 'fr it' + (sel.has('i:' + i.id) ? ' sel' : '') },
        el('span', { class: 'ind', style: `width:${(depth + 1) * 16}px` }), el('span', { class: 'chev' }),
        cbx('i:' + i.id), el('a', { class: 'n', href: i.url, target: '_blank', rel: 'noopener', title: i.title, onclick: e => { if (picking(e)) { e.preventDefault(); toggleSel('i:' + i.id); } }, textContent: i.title }))));
    }
  };
  kids('').forEach(t => walk(t, 0));
  $('#tree').replaceChildren(...out);
}
async function renameF(p) {
  const name = await ask({ title: 'Rename folder', input: { value: p.split('/').pop() }, ok: 'Rename' });
  const n = (name || '').replace(/\//g, '-').trim(); if (!n) return;
  const to = (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) + '/' : '') + n;
  if (folders.some(x => x !== p && x.toLowerCase() === to.toLowerCase())) { await ask({ title: 'Name already used', message: 'A folder with that name already exists here.', cancel: null }); return; }
  await lib.moveFolder(p, to);
  openF = new Set([...openF].map(x => inF(x, p) ? to + x.slice(p.length) : x)); saveOpen();
  if (inF(folder, p)) folder = to + folder.slice(p.length); load();
}
async function deleteF(p) {
  const par = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : 'General';
  const ok = await ask({ title: 'Delete folder', message: `Delete "${p}"? Its bookmarks (and those in its subfolders) move to "${par}".`, ok: 'Delete', warn: true });
  if (!ok) return;
  await lib.removeFolder(p); if (inF(folder, p)) folder = par; load();
}
$('#back').onclick = () => { if (folder) { folder = parentOf(folder); render(); } };
$('#fwd').onclick = () => { const t = nextToward(); if (t) { folder = t; render(); } };
$('#addf').onclick = async () => { const p = await createIn(folder); if (p) { folder = p; load(); } };
$('#more').onclick = e => { e.stopPropagation(); folderMenu(e.currentTarget, folder, true); };
$('#nf').onclick = async () => { const p = await createIn(folder); if (p) { folder = p; load(); } };

$('#dlg').addEventListener('click', e => { if (e.target.id === 'dlg') e.target.close(); });
$('#q').oninput = e => { q = e.target.value.toLowerCase(); render(); };
$('#ty').onchange = e => { type = e.target.value; render(); };
const fingerprint = () => `${items.length}:${items.reduce((n, i) => n + i.snaps.length + i.moments.length, 0)}:${folders.length}`;
async function doExport() {
  const blob = new Blob([JSON.stringify({ version: 3, items: await lib.all(), folders: await lib.folders() })], { type: 'application/json' });
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
