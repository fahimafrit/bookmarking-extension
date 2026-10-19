importScripts('db.js');
const LIB = chrome.runtime.getURL('library.html');

const STAR = '★', OUTLINE = '☆';
const tfmt = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s).replace(/&/g, '&&');
let menuTimer = 0, menuChain = Promise.resolve();
function refresh() { clearTimeout(menuTimer); menuTimer = setTimeout(() => { menuChain = menuChain.then(buildMenu).catch(console.error); }, 120); }

async function buildMenu() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const it = tab && /^https?:/.test(tab.url || '') ? await lib.get(norm(tab.url)) : null;
  const snaps = [...(it ? it.snaps : [])].sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9));
  const mos = [...(it ? it.moments : [])].sort((a, b) => a.start - b.start);
  await new Promise(r => chrome.contextMenus.removeAll(r));
  const ctx = ['page', 'video'], c = o => chrome.contextMenus.create(o);
  c({ id: 'save', title: 'Save to my library ' + (it ? STAR : OUTLINE), contexts: ctx });
  c({ id: 'saveimg', title: 'Save image to my library ' + OUTLINE, contexts: ['image'] });
  const group = (key, title, action, list, label, time) => {
    if (!list.length) return c({ id: action, title: `${title} (0)`, contexts: ctx });
    c({ id: key, title: `${title} (${list.length})`, contexts: ctx });
    c({ id: action, parentId: key, title: key === 'snapg' ? '📷  Take snapshot now' : '⏱  Mark timestamp now', contexts: ctx });
    c({ id: key + ':sep', parentId: key, type: 'separator', contexts: ctx });
    list.slice(0, 15).forEach(e => c({ id: `go:${key === 'snapg' ? 's' : 'm'}:${e.id}`, parentId: key, title: label(e), enabled: time(e) != null, contexts: ctx }));
    if (list.length > 15) c({ id: 'more:' + key, parentId: key, title: `…${list.length - 15} more in the library`, contexts: ctx });
  };
  group('snapg', 'Take video snapshot', 'snap', snaps, e => e.t != null ? '📷  ' + tfmt(e.t) : '📷  screenshot (no time)', e => e.t);
  group('momg', 'Mark timestamp', 'moment', mos, e => `${tfmt(e.start)}${e.end != null ? '–' + tfmt(e.end) : ''}${e.note ? '      ' + cut(e.note, 40) : ''}`, e => e.start);
  c({ id: 'lib', title: 'Open my library', contexts: ['action'] });
}
chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(refresh);
chrome.tabs.onActivated.addListener(refresh);
chrome.windows.onFocusChanged.addListener(refresh);
chrome.tabs.onUpdated.addListener((id, ch, tab) => { if (tab.active && (ch.url || ch.status === 'complete')) refresh(); });

function seek(t) {
  const v = [...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  if (v) v.currentTime = t;
}
async function goTo(id, tab) {
  try {
    const [, kind, eid] = id.split(':');
    const [{ result: p }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageInfo });
    const it = await lib.get(norm(p.url)); if (!it) return;
    const e = (kind === 's' ? it.snaps : it.moments).find(x => x.id === eid); if (!e) return;
    const t = kind === 's' ? e.t : e.start; if (t == null) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: seek, args: [t] });
  } catch (e) { console.error(e); flash(tab && tab.id, false); }
}

chrome.action.onClicked.addListener(openLib);
chrome.contextMenus.onClicked.addListener((i, tab) => {
  const id = String(i.menuItemId);
  if (id.startsWith('go:')) return goTo(id, tab);
  if (id.startsWith('more:')) return openLib();
  run(id === 'saveimg' ? 'save' : id, tab, i);
});
chrome.commands.onCommand.addListener((c, tab) =>
  run({ 'save-bookmark': 'save', 'take-snapshot': 'snap', 'mark-timestamp': 'moment' }[c], tab));

async function openLib() {
  const [t] = await chrome.tabs.query({ url: LIB });
  if (t) { chrome.tabs.update(t.id, { active: true }); chrome.windows.update(t.windowId, { focused: true }); }
  else chrome.tabs.create({ url: LIB });
}

function flash(tabId, ok = true) {
  if (tabId == null) return;
  chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? '#16a34a' : '#dc2626' });
  chrome.action.setBadgeText({ tabId, text: ok ? '✓' : '!' });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 2000);
}

function pageInfo() {
  const m = n => document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.content || '';
  const v = [...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  return { title: document.title, url: location.href, og: m('og:image') || m('twitter:image'), t: v ? v.currentTime : null, ct: document.contentType || '' };
}

function ui(mode, d) {
  const old = document.getElementById('vl-host');
  if (mode === 'cap' && old && old._api && old.dataset.id === d.id) { old._api.run(d.auto); return; }
  if (old) old.remove();
  const host = document.createElement('div'); host.id = 'vl-host'; host.dataset.id = d.id;
  host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647';
  const r = host.attachShadow({ mode: 'open' }), cap = mode === 'cap';
  const fmt = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const bySize = (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight;
  const vid = () => [...document.querySelectorAll('video')].sort(bySize)[0];
  const p = x => { x = x.trim(); if (!x) return null; const a = x.split(':').map(Number); return a.some(isNaN) ? NaN : a.reduce((t, v) => t * 60 + v, 0); };
  const BM = `<b>🔖 Save bookmark</b>
  <label>Note<input type=text id=n></label>
  <div class=lab>Folders (click to select one or more)</div><div class=fl id=fl></div><button type=button id=nfb>＋ New folder…</button>
  <div id=nr style="display:none;flex-direction:column;gap:6px"><input type=text id=fn placeholder="New folder name"><div class=row><select id=fp></select><button type=button id=na>Add</button></div></div>
  <div class=row><button id=ok>Save</button><button id=no>Cancel</button></div>`;
  const CAP = `<div class=hd><b>🎬 Capture</b><span class=m id=cnt></span><button id=x title="Close">✕</button></div>
  <button id=snap>📷 Take snapshot</button>
  <div class=lab>Mark a moment</div>
  <div class=row><label>Start<input type=text id=s></label><button id=ns title="Start = current time">now</button><label>End (optional)<input type=text id=e placeholder="e.g. 2:10"></label><button id=ne title="End = current time">now</button></div>
  <label>Note<input type=text id=n></label>
  <button id=ok>＋ Add moment</button><div class=log id=log></div>`;
  r.innerHTML = `<style>
  .b{font:14px system-ui,sans-serif;background:#1f2430;color:#eee;padding:14px;border-radius:12px;width:340px;box-shadow:0 8px 30px #0008;display:flex;flex-direction:column;gap:8px}
  label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#aab;flex:1}
  input[type=text],select{background:#12151c;border:1px solid #3a4152;color:#fff;border-radius:6px;padding:6px 8px;font-size:14px;width:100%;box-sizing:border-box}
  .bad{border-color:#f55!important}.row{display:flex;gap:8px;align-items:flex-end}
  button{border:0;border-radius:6px;padding:7px 12px;cursor:pointer;background:#3a4152;color:#fff}#ok{background:#6366f1}
  .lab,.m{font-size:12px;color:#aab}.hd{display:flex;align-items:center;gap:8px}.hd b{flex:1}#x{background:transparent;padding:2px 8px}
  .log{max-height:110px;overflow:auto;font-size:12px;color:#aab;display:flex;flex-direction:column;gap:2px}.log:empty{display:none}
  .fl{min-height:200px;max-height:min(380px,55vh);overflow:auto;background:#12151c;border:1px solid #3a4152;border-radius:6px;padding:4px}
  .fr{display:flex;align-items:center;gap:0;padding:3px 4px 3px 0;border-radius:8px;cursor:pointer;font-size:13px;color:#eee;user-select:none}.fr:hover{background:#2a3040}
  .fr.on{background:#6366f1;color:#fff}.tg{display:flex;align-items:center;justify-content:flex-end;align-self:stretch;flex:none;padding-right:4px;box-sizing:border-box;cursor:pointer}
  .chev{display:flex;align-items:center;justify-content:center;width:18px;flex:none;opacity:.8}.chev svg{width:16px;height:16px;transition:transform .22s ease}.chev.open svg{transform:rotate(90deg)}
  .fr .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 4px 0 0}.fr .c{font-size:11px;opacity:.7;padding-right:4px}
  .sub{display:grid;grid-template-rows:0fr;transition:grid-template-rows .22s ease}.sub.open{grid-template-rows:1fr}.subi{overflow:hidden;min-height:0}
  #nr{animation:fin .18s ease-out}@keyframes fin{from{opacity:0;transform:translateY(-4px)}}
  </style><div class=b>${cap ? CAP : BM}</div>`;
  const g = i => r.getElementById(i);
  const close = () => host.remove();
  let save, addF = () => {};

  if (cap) {
    let snaps = d.snapCount || 0, mos = d.moCount || 0;
    const cnt = () => { g('cnt').textContent = `📷 ${snaps} · ⏱ ${mos}`; };
    const log = t => { const l = document.createElement('div'); l.textContent = t; g('log').prepend(l); while (g('log').children.length > 8) g('log').lastChild.remove(); };
    const nowT = () => { const v = vid(); return v ? v.currentTime : null; };
    const setNow = id => { const t = nowT(); if (t != null) g(id).value = fmt(t); };
    const grab = () => {
      try {
        const v = [...document.querySelectorAll('video')].filter(v => v.readyState > 1 && v.videoWidth).sort(bySize)[0]; if (!v) return null;
        const c = document.createElement('canvas'), k = Math.min(1, 1280 / v.videoWidth);
        c.width = v.videoWidth * k; c.height = v.videoHeight * k;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        return { img: c.toDataURL('image/jpeg', 0.85), t: v.currentTime };
      } catch (e) { return null; }
    };
    const snap = async () => {
      const r0 = grab();
      if (r0) { chrome.runtime.sendMessage({ k: 'sn', id: d.id, t: r0.t, img: r0.img }); snaps++; cnt(); log('📷 ' + fmt(r0.t)); return; }
      const t = nowT();
      host.style.visibility = 'hidden';
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 60))));
      let ok = false; try { ok = (await chrome.runtime.sendMessage({ k: 'snv', id: d.id, t })).ok; } catch (e) {}
      host.style.visibility = 'visible';
      if (ok) { snaps++; cnt(); log('📷 ' + (t != null ? fmt(t) : 'screenshot')); } else log('⚠ Snapshot failed');
    };
    const mark = () => { setNow('s'); g('n').focus(); };
    save = () => {
      const s = p(g('s').value), e = p(g('e').value), note = g('n').value.trim();
      const badS = s == null || isNaN(s), badE = isNaN(e);
      g('s').classList.toggle('bad', badS); g('e').classList.toggle('bad', badE);
      if (badS || badE) return;
      chrome.runtime.sendMessage({ k: 'mo', id: d.id, start: s, end: e, note });
      mos++; cnt(); log(`⏱ ${fmt(s)}${e != null ? ' → ' + fmt(e) : ''}${note ? '   ' + note : ''}`);
      g('e').value = ''; g('n').value = ''; setNow('s'); g('n').focus();
    };
    host._api = { run: a => { if (a === 'snap') snap(); else mark(); } };
    g('snap').onclick = snap; g('ns').onclick = () => setNow('s'); g('ne').onclick = () => setNow('e');
    g('ok').onclick = save; g('x').onclick = close;
    cnt(); setNow('s');
    if (d.auto === 'snap') snap(); else g('n').focus();
  } else {
    const picked = new Set(d.folderSel || []), allF = [...d.folders], cnts = d.counts || {}, openS = new Set();
    const cmp = (x, y) => { const p = x.split('/'), q = y.split('/'); for (let i = 0; i < Math.min(p.length, q.length); i++) if (p[i] !== q[i]) { if (!i && p[0] === 'General') return -1; if (!i && q[0] === 'General') return 1; return p[i].localeCompare(q[i]); } return p.length - q.length; };
    const parOf = x => x.includes('/') ? x.slice(0, x.lastIndexOf('/')) : '';
    const openAnc = x => { const s = x.split('/'); s.slice(0, -1).forEach((_, i) => openS.add(s.slice(0, i + 1).join('/'))); };
    [...picked, ...(d.lastFolders || [])].forEach(openAnc);
    const CHEV = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const mk = (t, c, x = {}) => Object.assign(document.createElement(t), { className: c }, x);
    const drawF = () => {
      const box = g('fl'), st = box.scrollTop, out = [];
      const walk = (p, depth) => {
        const kids = allF.filter(x => parOf(x) === p);
        let w = null;
        const row = mk('div', 'fr' + (picked.has(p) ? ' on' : ''));
        row.onclick = () => { if (picked.has(p)) picked.delete(p); else picked.add(p); drawF(); };
        const tg = mk('span', 'tg'); tg.style.width = depth * 16 + 22 + 'px';
        tg.append(mk('span', 'chev' + (openS.has(p) ? ' open' : ''), { innerHTML: kids.length ? CHEV : '' }));
        tg.onclick = e => { e.stopPropagation(); if (!kids.length) return; const o = !openS.has(p); if (o) openS.add(p); else openS.delete(p); w.classList.toggle('open', o); tg.firstChild.classList.toggle('open', o); };
        row.append(tg, mk('span', 'n', { textContent: '📁 ' + p.split('/').pop() }), mk('span', 'c', { textContent: cnts[p] || 0 }));
        out.push(row);
        if (kids.length) {
          const inner = mk('div', 'subi'); w = mk('div', 'sub' + (openS.has(p) ? ' open' : '')); w.append(inner);
          const saved = out.length; kids.forEach(c => walk(c, depth + 1));
          inner.append(...out.splice(saved)); out.push(w);
        }
      };
      allF.filter(x => !x.includes('/')).forEach(t => walk(t, 0));
      box.replaceChildren(...out); box.scrollTop = st;
    };
    g('n').value = d.notes || '';
    drawF();
    const fp = g('fp'), t0 = document.createElement('option'); t0.value = ''; t0.textContent = '— at top level —'; fp.append(t0);
    for (const z of d.folders) { const o = document.createElement('option'); o.value = z; o.textContent = 'inside: ' + z; fp.append(o); }
    g('nfb').onclick = () => { g('nr').style.display = 'flex'; g('nfb').style.display = 'none'; g('fn').focus(); };
    addF = () => {
      const t = g('fn').value.trim(), par = g('fp').value; if (!t) return;
      const path = (par && !t.startsWith('/') ? par + '/' + t : t).split('/').map(x => x.trim()).filter(Boolean).join('/'); if (!path) return;
      const ex = allF.find(x => x.toLowerCase() === path.toLowerCase()), use = ex || path;
      if (!ex) {
        const sg = use.split('/');
        sg.forEach((_, i) => { const a = sg.slice(0, i + 1).join('/'); if (!allF.includes(a)) { allF.push(a); const o = document.createElement('option'); o.value = a; o.textContent = 'inside: ' + a; fp.append(o); } });
        allF.sort(cmp);
      }
      openAnc(use); picked.add(use); g('fn').value = ''; drawF();
      const rows = g('fl').querySelectorAll('.fr.on'); if (rows.length) rows[rows.length - 1].scrollIntoView({ block: 'nearest' });
    };
    g('na').onclick = addF;
    save = () => {
      if (g('fn').value.trim()) addF();
      chrome.runtime.sendMessage({ k: 'bm', id: d.id, notes: g('n').value.trim(), folders: [...picked] }); close();
    };
    g('ok').onclick = save; g('no').onclick = close;
  }
  for (const ev of ['keydown', 'keyup', 'keypress']) host.addEventListener(ev, x => {
    x.stopPropagation();
    if (ev !== 'keydown') return;
    const act = r.activeElement;
    if (x.key === 'Enter' && !(act && act.tagName === 'BUTTON')) { if (act && act.id === 'fn') addF(); else save(); }
    if (x.key === 'Escape') close();
  });
  document.documentElement.append(host);
  if (cap) { if (d.auto !== 'snap') g('n').focus(); } else g('n').focus();
}

const abs = (o, b) => { try { return o ? new URL(o, b).href : ''; } catch { return ''; } };
function norm(u) {
  try {
    const x = new URL(u);
    if (/(^|\.)youtube\.com$/.test(x.hostname) && x.pathname === '/watch' && x.searchParams.get('v')) return 'https://www.youtube.com/watch?v=' + x.searchParams.get('v');
    if (x.hostname === 'youtu.be' && x.pathname.length > 1) return 'https://www.youtube.com/watch?v=' + x.pathname.slice(1);
    x.hash = ''; return x.href;
  } catch { return u; }
}

async function ensure(p, info) {
  const img = info.mediaType === 'image' && info.srcUrl;
  const url = norm(img || p.url);
  let it = await lib.get(url);
  ensure.created = !it;
  if (!it) {
    const yt = url.startsWith('https://www.youtube.com/watch?v=') ? url.split('v=')[1] : null;
    const isImg = img || p.ct.startsWith('image/');
    const gif = /\.gif(\?|$)/i.test(url) || /gif/.test(p.ct);
    it = {
      id: url, url, title: p.title || url, source: img ? p.url : '',
      type: isImg ? (gif ? 'gif' : 'image') : (p.t != null || yt ? 'video' : 'page'),
      thumb: img || (p.ct.startsWith('image/') ? url : yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : abs(p.og, p.url)),
      notes: '', folders: ['General'], saved: Date.now(), snaps: [], moments: [],
    };
    await lib.put(it); await lib.addFolder('General');
  }
  return it;
}

async function run(cmd, tab, info = {}) {
  try {
    if (cmd === 'lib') return openLib();
    if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: p }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageInfo });
    const it = await ensure(p, info);
    if (!Array.isArray(it.folders)) { it.folders = [it.folder || 'General']; delete it.folder; await lib.put(it); }
    const show = (mode, d) => chrome.scripting.executeScript({ target: { tabId: tab.id }, func: ui, args: [mode, d] });
    if (cmd === 'save') {
      const all = await lib.all(), inT = (i, q) => (i.folders || [i.folder || 'General']).some(f => f === q || f.startsWith(q + '/'));
      const folders = await lib.folders(), counted = all.filter(i => !(ensure.created && i.id === it.id)), counts = {};
      for (const q of folders) counts[q] = counted.filter(i => inT(i, q)).length;
      const prev = all.filter(i => i.id !== it.id).sort((a, b) => (b.bmAt || b.saved || 0) - (a.bmAt || a.saved || 0))[0];
      const lastFolders = prev ? (prev.folders || [prev.folder || 'General']) : [];
      await show('bm', { id: it.id, notes: it.notes, folders, folderSel: it.folders, counts, lastFolders });
    }
    if (cmd === 'moment' || cmd === 'snap') await show('cap', { id: it.id, t: p.t, auto: cmd === 'snap' ? 'snap' : 'mark', snapCount: it.snaps.length, moCount: it.moments.length });
  } catch (e) { console.error(e); flash(tab && tab.id, false); }
}

chrome.runtime.onMessage.addListener((m, s, send) => {
  if (m.k === 'changed') { refresh(); return; }
  (async () => {
    const it = await lib.get(m.id); if (!it) return send({ ok: false });
    if (!Array.isArray(it.folders)) { it.folders = [it.folder || 'General']; delete it.folder; }
    if (m.k === 'bm') {
      it.notes = m.notes; it.bmAt = Date.now();
      const fs = []; for (const f of m.folders || []) fs.push(await lib.addFolder(f));
      const set = [...new Set(fs.length ? fs : ['General'])];
      it.folders = set.filter(f => !set.some(g => g !== f && g.startsWith(f + '/')));
    }
    if (m.k === 'mo') it.moments.push({ id: crypto.randomUUID(), start: m.start, end: m.end, note: m.note });
    if (m.k === 'sn') it.snaps.push({ id: crypto.randomUUID(), t: m.t, img: m.img, at: Date.now() });
    if (m.k === 'snv') {
      try {
        const img = await chrome.tabs.captureVisibleTab(s.tab.windowId, { format: 'jpeg', quality: 80 });
        it.snaps.push({ id: crypto.randomUUID(), t: m.t, img, at: Date.now() });
      } catch (e) { console.error(e); return send({ ok: false }); }
    }
    await lib.put(it); flash(s.tab && s.tab.id); refresh();
    if (m.k === 'snv') send({ ok: true });
  })();
  return m.k === 'snv';
});
