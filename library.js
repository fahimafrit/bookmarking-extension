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
const split = v => [...new Set(v.split(/[,#]/).map(x => x.trim()).filter(Boolean))];
const tagsOf = i => [...i.tags, ...i.moments.flatMap(m => m.tags)];
const ICON = { video: '🎬', image: '🖼️', gif: '🎞️', page: '🌐' };
let items = [], folders = [], q = '', tag = '', type = '', folder = '';
const inF = (f, p) => f === p || f.startsWith(p + '/');
const lbl = p => { const s = p.split('/'); return '\u2003'.repeat(s.length - 1) + s[s.length - 1]; };

async function load() {
  items = await lib.all(); folders = await lib.folders();
  for (const i of items) if (!i.folder) { i.folder = 'General'; await lib.put(i); }
  items.sort((a, b) => b.saved - a.saved); render();
}

function render() {
  renderTree();
  const all = [...new Set(items.flatMap(tagsOf))].sort();
  $('#chips').replaceChildren(...all.map(t => el('span', { class: 'chip' + (t === tag ? ' on' : ''), onclick: () => { tag = tag === t ? '' : t; render(); } }, '#' + t)));
  const f = items.filter(i => (!folder || inF(i.folder, folder)) && (!tag || tagsOf(i).includes(tag)) && (!type || i.type === type) &&
    (!q || (i.title + ' ' + i.url + ' ' + i.notes + ' ' + tagsOf(i).join(' ') + ' ' + i.moments.map(m => m.note).join(' ')).toLowerCase().includes(q)));
  const th = i => i.thumb || (i.snaps[0] && i.snaps[0].img);
  $('#grid').replaceChildren(...(f.length ? f.map(i => el('div', { class: 'card', draggable: true, ondragstart: e => e.dataTransfer.setData('text/plain', i.id), onclick: () => open(i.id) },
    el('div', { class: 'th' }, th(i) ? el('img', { src: th(i), loading: 'lazy', onerror: e => e.target.replaceWith(ICON[i.type]) }) : ICON[i.type]),
    el('div', { class: 'cb' }, el('div', { class: 't' }, i.title),
      el('div', { class: 'm' }, `${ICON[i.type]} ${new URL(i.url).hostname} · 📁 ${i.folder}` + (i.snaps.length ? ` · 📷 ${i.snaps.length}` : '') + (i.moments.length ? ` · ⏱ ${i.moments.length}` : '')),
      el('div', { class: 'tags' }, i.tags.map(t => el('span', { class: 'chip sm' }, '#' + t)))))) :
    [el('div', { class: 'empty' }, items.length ? 'Nothing matches.' : 'Empty library. Open any page and press Alt+B, or right-click → "Save to my library".')]));
}

function open(id) {
  const i = items.find(x => x.id === id); if (!i) return;
  const d = $('#dlg');
  const sv = async () => { await lib.put(i); render(); };
  const redo = async () => { await sv(); open(id); };
  d.replaceChildren(
    el('div', { class: 'dh' }, el('h2', {}, el('a', { href: i.url, target: '_blank', textContent: i.title })), el('button', { onclick: () => d.close() }, '✕')),
    i.thumb ? el('img', { class: 'big', src: i.thumb }) : null,
    el('label', {}, 'Folder', el('select', { onchange: e => { i.folder = e.target.value; sv(); } }, folders.map(p => el('option', { value: p, selected: p === i.folder, textContent: lbl(p) })))),
    el('label', {}, 'Tags (comma separated)', el('input', { value: i.tags.join(', '), onchange: e => { i.tags = split(e.target.value); sv(); } })),
    el('label', {}, 'Notes', el('textarea', { value: i.notes, onchange: e => { i.notes = e.target.value; sv(); } })),
    el('h3', {}, `⏱ Moments (${i.moments.length})`),
    ...[...i.moments].sort((a, b) => a.start - b.start).map(m => el('div', { class: 'mo' },
      el('a', { href: link(i, m.start), target: '_blank', textContent: fmt(m.start) + (m.end != null ? ' → ' + fmt(m.end) : '') }),
      el('span', {}, m.note || ''), ...m.tags.map(t => el('span', { class: 'chip sm' }, '#' + t)),
      el('button', { onclick: () => { i.moments = i.moments.filter(x => x.id !== m.id); redo(); } }, '🗑'))),
    el('h3', {}, `📷 Snapshots (${i.snaps.length})`),
    el('div', { class: 'snaps' }, i.snaps.map(s => el('figure', {},
      el('img', { src: s.img, onclick: e => e.target.classList.toggle('zoom') }),
      el('figcaption', {}, s.t != null ? el('a', { href: link(i, s.t), target: '_blank', textContent: fmt(s.t) }) : 'frame',
        el('button', { onclick: () => { i.snaps = i.snaps.filter(x => x.id !== s.id); redo(); } }, '🗑'))))),
    el('button', { class: 'danger', onclick: async () => { if (confirm('Delete this bookmark and all its snapshots/moments?')) { await lib.del(i.id); d.close(); load(); } } }, 'Delete bookmark'));
  if (!d.open) d.showModal();
}

$('#dlg').addEventListener('click', e => { if (e.target.id === 'dlg') e.target.close(); });
$('#q').oninput = e => { q = e.target.value.toLowerCase(); render(); };
$('#ty').onchange = e => { type = e.target.value; render(); };
$('#ex').onclick = async () => {
  const blob = new Blob([JSON.stringify({ version: 2, items: await lib.all(), folders: await lib.folders() })], { type: 'application/json' });
  el('a', { href: URL.createObjectURL(blob), download: `library-backup-${new Date().toISOString().slice(0, 10)}.json` }).click();
};
$('#im').onclick = () => $('#fi').click();
$('#fi').onchange = async e => {
  try {
    const raw = JSON.parse(await e.target.files[0].text());
    const data = Array.isArray(raw) ? raw : raw.items || [];
    for (const f of raw.folders || []) await lib.addFolder(f);
    for (const o of data) if (o && o.id) { o.folder = await lib.addFolder(o.folder || 'General'); await lib.put(o); }
    await load(); alert(`Imported ${data.length} items.`);
  } catch { alert('That file could not be imported.'); }
  e.target.value = '';
};

function renderTree() {
  const row = (p, name, depth) => {
    const n = p ? items.filter(i => inF(i.folder, p)).length : items.length, on = p === folder;
    return el('div', {
      class: 'fr' + (on ? ' on' : ''), style: `padding-left:${8 + depth * 16}px`, onclick: () => { folder = p; render(); },
      ondragover: e => e.preventDefault(),
      ondrop: async e => { e.preventDefault(); const it = items.find(x => x.id === e.dataTransfer.getData('text/plain')); if (it && p) { it.folder = p; await lib.put(it); render(); } },
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
load();
