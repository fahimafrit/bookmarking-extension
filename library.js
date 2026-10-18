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
let items = [], folders = [], q = '', type = '', folder = '';
const co = new Set(); let coFor = '';
const inF = (f, p) => f === p || f.startsWith(p + '/');
const inTree = (i, p) => i.folders.some(f => inF(f, p));
const parentOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
const lbl = p => { const s = p.split('/'); return '\u2003'.repeat(s.length - 1) + s[s.length - 1]; };

async function load() {
  items = await lib.all(); folders = await lib.folders();
  for (const i of items) if (!Array.isArray(i.folders) || 'tags' in i) {
    if (!Array.isArray(i.folders)) i.folders = [i.folder || 'General'];
    delete i.folder; delete i.tags; (i.moments || []).forEach(m => delete m.tags); await lib.put(i);
  }
  items.sort((a, b) => b.saved - a.saved); render();
}

async function addTo(i, p) { i.folders = [...new Set([...i.folders, p])]; await lib.put(i); load(); }
async function moveTo(i, p) {
  const from = folder && i.folders.includes(folder) ? folder : null;
  i.folders = [...new Set([...(from ? i.folders.filter(f => f !== from) : []), p])]; await lib.put(i); load();
}
async function newFolderPrompt() {
  const name = prompt('New folder name (use / for nested folders)'); if (!name) return null;
  const raw = name.split('/').map(x => x.trim()).filter(Boolean).join('/'); return raw ? lib.addFolder(raw) : null;
}

function render() {
  renderTree();
  const searching = !!q;
  const ok = i => (!type || i.type === type) && (!folder || (searching ? inTree(i, folder) : i.folders.includes(folder))) &&
    (!q || (i.title + ' ' + i.url + ' ' + i.notes + ' ' + i.moments.map(m => m.note).join(' ')).toLowerCase().includes(q));
  if (coFor !== folder) { co.clear(); coFor = folder; }
  const base = items.filter(ok);
  const seen = new Set(base.flatMap(i => i.folders).filter(p => !inF(p, folder)));
  const avail = folder ? folders.filter(p => seen.has(p)) : [];
  for (const p of [...co]) if (!avail.includes(p)) co.delete(p);
  const f = base.filter(i => [...co].every(p => i.folders.includes(p)));
  $('#chips').replaceChildren(...(avail.length ? [el('span', { class: 'm', style: 'align-self:center' }, 'Also in:'),
    ...avail.map(p => el('span', { class: 'chip' + (co.has(p) ? ' on' : ''), onclick: () => { co.has(p) ? co.delete(p) : co.add(p); render(); } },
      '📁 ' + p, ' ', el('small', {}, base.filter(i => i.folders.includes(p)).length)))] : []));
  const subs = searching ? [] : folders.filter(p => parentOf(p) === folder);
  $('#subs').replaceChildren(
    ...(folder && !searching ? [el('div', { class: 'ftile', onclick: () => { folder = parentOf(folder); render(); } }, '⬆', parentOf(folder) || 'All bookmarks')] : []),
    ...subs.map(p => el('div', { class: 'ftile', onclick: () => { folder = p; render(); } }, '📁', p.split('/').pop(), el('span', { class: 'c' }, items.filter(i => inTree(i, p)).length))));
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
function menu(btn, i) {
  closeMenu();
  const m = el('div', { class: 'menu', id: 'menu' });
  const mi = (t, fn, c = '') => el('button', { class: 'mi ' + c, onclick: e => { e.stopPropagation(); fn(); } }, t);
  const place = () => {
    const r = btn.getBoundingClientRect();
    m.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8)) + 'px';
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px';
  };
  const main = () => { m.replaceChildren(
    mi('📁  Add to…', () => pick('add')), mi('➡️  Move to…', () => pick('move')),
    mi('🔎  Details (snapshots & timestamps)', () => { closeMenu(); open(i.id); }),
    mi('🗑  Delete', async () => { closeMenu(); if (confirm(i.folders.length > 1 ? 'Delete this bookmark from ALL its folders?' : 'Delete this bookmark?')) { await lib.del(i.id); load(); } }, 'danger')); place(); };
  const pick = mode => {
    const from = folder && i.folders.includes(folder) ? folder : (i.folders.length === 1 ? i.folders[0] : null);
    const opts = folders.filter(p => mode === 'add' ? !i.folders.includes(p) : p !== from);
    const go = p => { closeMenu(); mode === 'add' ? addTo(i, p) : moveTo(i, p); };
    m.replaceChildren(mi('←  Back', main), el('div', { class: 'mt' }, mode === 'add' ? 'ADD TO FOLDER' : 'MOVE TO FOLDER'),
      ...opts.map(p => mi(lbl(p), () => go(p))), mi('➕  New folder…', async () => { const p = await newFolderPrompt(); if (p) go(p); })); place();
  };
  document.body.append(m); main();
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
  const row = (p, name, depth) => {
    const n = p ? items.filter(i => inTree(i, p)).length : items.length, on = p === folder;
    return el('div', {
      class: 'fr' + (on ? ' on' : ''), style: `padding-left:${8 + depth * 16}px`, onclick: () => { folder = p; render(); },
      ondragover: e => e.preventDefault(),
      ondrop: e => { e.preventDefault(); const it = items.find(x => x.id === e.dataTransfer.getData('text/plain')); if (it && p) moveTo(it, p); },
    }, el('span', {}, p ? (depth ? '↳' : '📁') : '📚'), el('span', { class: 'n' }, name), el('span', { class: 'c' }, n),
      on && p && p !== 'General' ? [el('button', { title: 'Rename', onclick: e => { e.stopPropagation(); renameF(p); } }, '✏️'), el('button', { title: 'Delete', onclick: e => { e.stopPropagation(); deleteF(p); } }, '🗑')] : null);
  };
  $('#tree').replaceChildren(row('', 'All bookmarks', 0), ...folders.map(p => row(p, p.split('/').pop(), p.split('/').length - 1)));
}
async function renameF(p) {
  const name = prompt('Rename folder', p.split('/').pop()); if (name == null) return;
  const n = name.replace(/\//g, '-').trim(); if (!n) return;
  const to = (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) + '/' : '') + n;
  if (folders.some(x => x !== p && x.toLowerCase() === to.toLowerCase())) { alert('A folder with that name already exists here.'); return; }
  await lib.moveFolder(p, to); if (inF(folder, p)) folder = to + folder.slice(p.length); load();
}
async function deleteF(p) {
  const par = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : 'General';
  if (!confirm(`Delete folder "${p}"? Its bookmarks (and those in its subfolders) move to "${par}".`)) return;
  await lib.removeFolder(p); if (inF(folder, p)) folder = par; load();
}
$('#nf').onclick = async () => {
  const name = prompt('New folder name' + (folder ? ` (inside "${folder}")` : '') + '. Use / for nested folders.'); if (!name) return;
  const raw = name.split('/').map(x => x.trim()).filter(Boolean).join('/'); if (!raw) return;
  folder = await lib.addFolder(folder ? folder + '/' + raw : raw); load();
};

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
    await load(); alert(`Imported ${data.length} items.`);
  } catch { alert('That file could not be imported.'); }
  e.target.value = '';
};
load();
