importScripts('db.js');
const LIB = chrome.runtime.getURL('library.html');

chrome.runtime.onInstalled.addListener(() => chrome.contextMenus.removeAll(() => {
  const m = (id, title, contexts) => chrome.contextMenus.create({ id, title, contexts });
  m('save', 'Save to my library', ['page', 'image', 'video']);
  m('snap', 'Take video snapshot', ['page', 'video']);
  m('moment', 'Mark timestamp', ['page', 'video']);
  m('lib', 'Open my library', ['action']);
}));

chrome.action.onClicked.addListener(openLib);
chrome.contextMenus.onClicked.addListener((i, tab) => run(i.menuItemId, tab, i));
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

function grab() {
  try {
    const v = [...document.querySelectorAll('video')].filter(v => v.readyState > 1 && v.videoWidth)
      .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    if (!v) return null;
    const c = document.createElement('canvas'), k = Math.min(1, 1280 / v.videoWidth);
    c.width = v.videoWidth * k; c.height = v.videoHeight * k;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return { img: c.toDataURL('image/jpeg', 0.85), t: v.currentTime };
  } catch (e) { return null; }
}

function ui(mode, d) {
  document.getElementById('vl-host')?.remove();
  const host = document.createElement('div'); host.id = 'vl-host';
  host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647';
  const r = host.attachShadow({ mode: 'open' }), mo = mode === 'mo';
  const fmt = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const vid = () => [...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  const p = x => { x = x.trim(); if (!x) return null; const a = x.split(':').map(Number); return a.some(isNaN) ? NaN : a.reduce((t, v) => t * 60 + v, 0); };
  r.innerHTML = `<style>
  .b{font:14px system-ui,sans-serif;background:#1f2430;color:#eee;padding:14px;border-radius:12px;width:320px;box-shadow:0 8px 30px #0008;display:flex;flex-direction:column;gap:8px}
  label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#aab;flex:1}
  input[type=text],select{background:#12151c;border:1px solid #3a4152;color:#fff;border-radius:6px;padding:6px 8px;font-size:14px;width:100%;box-sizing:border-box}
  .bad{border-color:#f55!important}.row{display:flex;gap:8px;align-items:flex-end}
  button{border:0;border-radius:6px;padding:7px 12px;cursor:pointer;background:#3a4152;color:#fff}#ok{background:#6366f1}
  </style><div class=b><b>${mo ? '⏱ Mark timestamp' : '🔖 Save bookmark'}</b>
  ${mo ? '<div class=row><label>Start<input type=text id=s></label><label>End (optional)<input type=text id=e placeholder="e.g. 2:10"></label><button id=now title="End = current time">now</button></div>' : ''}
  <label>Note<input type=text id=n></label>
  ${mo ? '' : '<label>Folder<select id=f></select></label><input type=text id=fn placeholder="e.g. Music/Rock (use / for a subfolder)" style="display:none">'}
  <div class=row><button id=ok>Save</button><button id=no>Cancel</button></div></div>`;
  const g = i => r.getElementById(i);
  if (mo && d.t != null) g('s').value = fmt(d.t);
  if (!mo) {
    g('n').value = d.notes || '';
    const sel = g('f');
    for (const q of d.folders) { const o = document.createElement('option'), s = q.split('/'); o.value = q; o.textContent = '\u2003'.repeat(s.length - 1) + (s.length > 1 ? '↳ ' : '📁 ') + s[s.length - 1]; sel.append(o); }
    const nw = document.createElement('option'); nw.value = '__new'; nw.textContent = '➕ New folder…'; sel.append(nw);
    sel.value = d.folder;
    sel.onchange = () => { g('fn').style.display = sel.value === '__new' ? '' : 'none'; if (sel.value === '__new') g('fn').focus(); };
  }
  const close = () => host.remove();
  if (mo) g('now').onclick = () => { const v = vid(); if (v) g('e').value = fmt(v.currentTime); };
  g('no').onclick = close;
  const save = () => {
    const note = g('n').value.trim();
    if (!mo) {
      const folder = g('f').value === '__new' ? (g('fn').value.trim() || 'General') : g('f').value;
      chrome.runtime.sendMessage({ k: 'bm', id: d.id, notes: note, folder, from: d.folder }); return close();
    }
    const s = p(g('s').value), e = p(g('e').value);
    const badS = s == null || isNaN(s), badE = isNaN(e);
    g('s').classList.toggle('bad', badS); g('e').classList.toggle('bad', badE);
    if (badS || badE) return;
    chrome.runtime.sendMessage({ k: 'mo', id: d.id, start: s, end: e, note }); close();
  };
  g('ok').onclick = save;
  for (const ev of ['keydown', 'keyup', 'keypress']) host.addEventListener(ev, x => {
    x.stopPropagation();
    if (ev === 'keydown') { if (x.key === 'Enter') save(); if (x.key === 'Escape') close(); }
  });
  document.documentElement.append(host);
  g(mo ? (d.t != null ? 'n' : 's') : 'n').focus();
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
    if (cmd === 'save') await show('bm', { id: it.id, notes: it.notes, folders: await lib.folders(), folder: it.folders[0] });
    if (cmd === 'moment') await show('mo', { id: it.id, t: p.t });
    if (cmd === 'snap') {
      const [{ result: r0 }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: grab });
      const r = r0 || { img: await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 }), t: null };
      it.snaps.push({ id: crypto.randomUUID(), t: r.t, img: r.img, at: Date.now() });
      await lib.put(it); flash(tab.id);
    }
  } catch (e) { console.error(e); flash(tab && tab.id, false); }
}

chrome.runtime.onMessage.addListener((m, s) => {
  (async () => {
    const it = await lib.get(m.id); if (!it) return;
    if (!Array.isArray(it.folders)) { it.folders = [it.folder || 'General']; delete it.folder; }
    if (m.k === 'bm') {
      it.notes = m.notes;
      const f = await lib.addFolder(m.folder), i = it.folders.indexOf(m.from);
      if (!it.folders.includes(f)) { if (i >= 0) it.folders[i] = f; else it.folders.push(f); }
    }
    if (m.k === 'mo') it.moments.push({ id: crypto.randomUUID(), start: m.start, end: m.end, note: m.note });
    await lib.put(it); flash(s.tab && s.tab.id);
  })();
});
