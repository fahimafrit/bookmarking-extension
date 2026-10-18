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
let items = [], q = '', tag = '', type = '';

async function load() { items = (await lib.all()).sort((a, b) => b.saved - a.saved); render(); }

function render() {
  const all = [...new Set(items.flatMap(tagsOf))].sort();
  $('#chips').replaceChildren(...all.map(t => el('span', { class: 'chip' + (t === tag ? ' on' : ''), onclick: () => { tag = tag === t ? '' : t; render(); } }, '#' + t)));
  const f = items.filter(i => (!tag || tagsOf(i).includes(tag)) && (!type || i.type === type) &&
    (!q || (i.title + ' ' + i.url + ' ' + i.notes + ' ' + tagsOf(i).join(' ') + ' ' + i.moments.map(m => m.note).join(' ')).toLowerCase().includes(q)));
  const th = i => i.thumb || (i.snaps[0] && i.snaps[0].img);
  $('#grid').replaceChildren(...(f.length ? f.map(i => el('div', { class: 'card', onclick: () => open(i.id) },
    el('div', { class: 'th' }, th(i) ? el('img', { src: th(i), loading: 'lazy', onerror: e => e.target.replaceWith(ICON[i.type]) }) : ICON[i.type]),
    el('div', { class: 'cb' }, el('div', { class: 't' }, i.title),
      el('div', { class: 'm' }, `${ICON[i.type]} ${new URL(i.url).hostname}` + (i.snaps.length ? ` · 📷 ${i.snaps.length}` : '') + (i.moments.length ? ` · ⏱ ${i.moments.length}` : '')),
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
  const blob = new Blob([JSON.stringify(await lib.all())], { type: 'application/json' });
  el('a', { href: URL.createObjectURL(blob), download: `library-backup-${new Date().toISOString().slice(0, 10)}.json` }).click();
};
$('#im').onclick = () => $('#fi').click();
$('#fi').onchange = async e => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    for (const o of data) if (o && o.id) await lib.put(o);
    await load(); alert(`Imported ${data.length} items.`);
  } catch { alert('That file could not be imported.'); }
  e.target.value = '';
};
load();
