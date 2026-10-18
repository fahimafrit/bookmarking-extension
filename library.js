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
const nameLink = (p, text) => el('a', { class: 'n', href: fHref(p), onclick: e => { if (plain(e)) e.preventDefault(); } }, text);
const lbl = p => { const s = p.split('/'); return '\u2003'.repeat(s.length - 1) + s[s.length - 1]; };

async function load() {
  items = await lib.all(); folders = await lib.folders();
  if (folder && !folders.includes(folder)) folder = '';
  for (const i of items) if (!Array.isArray(i.folders) || 'tags' in i) {
    if (!Array.isArray(i.folders)) i.folders = [i.folder || 'General'];
    delete i.folder; delete i.tags; (i.moments || []).forEach(m => delete m.tags); await lib.put(i);
  }
  items.sort((a, b) => b.saved - a.saved); render();
}

const normF = a => [...new Set(a)].filter(f => !a.some(g => g !== f && g.startsWith(f + '/')));
async function addTo(i, p) { i.folders = normF([...i.folders, p]); await lib.put(i); load(); }
async function moveTo(i, p) {
  i.folders = normF([...(folder ? i.folders.filter(f => !inF(f, folder)) : []), p]); await lib.put(i); load();
}
async function createIn(parent) {
  const name = await ask({ title: 'New folder', message: parent ? `Inside "${parent}". Start with / for a top-level folder, or use / to nest further.` : 'Use / to create nested folders.', input: { placeholder: 'Folder name' }, ok: 'Create' });
  if (!name || !name.trim()) return null;
  const raw = name.split('/').map(x => x.trim()).filter(Boolean).join('/'); if (!raw) return null;
  return lib.addFolder(parent && !name.trim().startsWith('/') ? parent + '/' + raw : raw);
}

function render() {
  if (folder !== lastF) { trackFwd(lastF, folder); lastF = folder; try { history.replaceState(null, '', fHref(folder)); } catch {} const s = folder.split('/'); s.slice(0, -1).forEach((_, i) => openF.add(s.slice(0, i + 1).join('/'))); }
  renderTree();
  const searching = !!q;
  const ok = i => (!type || i.type === type) && (!folder || inTree(i, folder)) &&
    (!q || (i.title + ' ' + i.url + ' ' + i.notes + ' ' + i.moments.map(m => m.note).join(' ')).toLowerCase().includes(q));
  if (coFor !== folder) { co.clear(); coFor = folder; }
  const base = items.filter(ok);
  const rel = p => p === folder || inF(p, folder) || inF(folder, p);
  const avail = folder ? folders.filter(p => !rel(p) && base.some(i => inTree(i, p))) : [];
  for (const p of [...co]) if (!avail.includes(p)) co.delete(p);
  const f = base.filter(i => [...co].every(p => inTree(i, p)));
  $('#chips').replaceChildren(...(avail.length ? [el('span', { class: 'm', style: 'align-self:center' }, 'Also in:'),
    ...avail.map(p => el('span', { class: 'chip' + (co.has(p) ? ' on' : ''), onclick: () => { co.has(p) ? co.delete(p) : co.add(p); render(); } },
      '📁 ' + p, ' ', el('small', {}, base.filter(i => inTree(i, p)).length)))] : []));
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
  $('#subs').replaceChildren(
    ...subs.map(p => el('a', { class: 'ftile', href: fHref(p), onclick: nav(p) }, el('span', { class: 'ico' }, '📁'), el('span', { class: 'nm' }, p.split('/').pop()), el('span', { class: 'c' }, items.filter(i => inTree(i, p)).length))));
  const th = i => i.thumb || (i.snaps[0] && i.snaps[0].img);
  $('#grid').replaceChildren(...(f.length ? f.map(i => el('div', { class: 'card' },
    el('a', { class: 'cl', href: i.url, target: '_blank', rel: 'noopener', ondragstart: e => e.dataTransfer.setData('text/plain', i.id) },
      el('div', { class: 'th' }, th(i) ? el('img', { src: th(i), loading: 'lazy', onerror: e => e.target.replaceWith(ICON[i.type]) }) : ICON[i.type]),
      el('div', { class: 'cb' }, el('div', { class: 't' }, i.title),
        el('div', { class: 'm' }, `${ICON[i.type]} ${new URL(i.url).hostname}` + (i.snaps.length ? ` · 📷 ${i.snaps.length}` : '') + (i.moments.length ? ` · ⏱ ${i.moments.length}` : '') + (!folder || searching ? ` · 📁 ${i.folders.join(', ')}` : '')))),
    el('button', { class: 'dots', title: 'More', onclick: e => { e.preventDefault(); e.stopPropagation(); menu(e.currentTarget, i); } }, '⋮'))) :
    (subs.length ? [] : [el('div', { class: 'empty' }, items.length ? (folder ? 'Nothing here.' : 'Nothing matches.') : 'Empty library. Open any page and press Alt+B, or right-click → "Save to my library".')])));
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
      ...rowProps(p, 'fr' + (p === folder ? ' on' : '')),
      ondragover: e => e.preventDefault(),
      ondrop: e => { e.preventDefault(); const it = items.find(x => x.id === e.dataTransfer.getData('text/plain')); if (it) moveTo(it, p); },
    }, el('span', { class: 'ind', style: `width:${depth * 16}px` }),
      el('span', { class: 'chev' + (isOpen ? ' open' : ''), innerHTML: has ? CHEV : '', onclick: e => { e.stopPropagation(); if (!has) return; isOpen ? openF.delete(p) : openF.add(p); saveOpen(); renderTree(); } }),
      nameLink(p, '📁 ' + p.split('/').pop()), el('span', { class: 'c' }, items.filter(i => inTree(i, p)).length), el('button', { class: 'fdots', title: 'Folder options', onclick: e => { e.stopPropagation(); folderMenu(e.currentTarget, p); } }, '⋮')));
    if (isOpen) {
      kids(p).forEach(c => walk(c, depth + 1));
      direct(p).forEach(i => out.push(el('div', { class: 'fr it' },
        el('span', { class: 'ind', style: `width:${(depth + 1) * 16}px` }), el('span', { class: 'chev' }),
        el('a', { class: 'n', href: i.url, target: '_blank', rel: 'noopener', title: i.title, textContent: i.title }))));
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
$('#ex').onclick = async () => {
  const blob = new Blob([JSON.stringify({ version: 3, items: await lib.all(), folders: await lib.folders() })], { type: 'application/json' });
  el('a', { href: URL.createObjectURL(blob), download: `library-backup-${new Date().toISOString().slice(0, 10)}.json` }).click();
};
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
load();
