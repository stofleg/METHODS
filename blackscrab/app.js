'use strict';

/* ── State ────────────────────────────────────────────────────────────── */
let settings = { minLen: 5, maxLen: 8, maxWords: 5, joker: false, chrono: false, chronoMin: 10 };
let pool      = [];
let jokerPool = [];
let bsAllMap  = null;
let srsData   = {};
let seance    = [];
let score     = 0;
let target    = 21;
let kbBuf     = '';
let msgTimer  = null;
let chronoTimer     = null;
let chronoRemaining = 0;
let gameActive      = false;

const SETTINGS_KEY  = 'bs-settings';
const SRS_KEY       = 'bs-srs';
const SRS_DONE_DAYS = 30;
const SRS_INTERVALS = [3, 7, 14, 30, 60, 90, 180];
const PRESETS_KEY   = 'bs-presets';

/* ── Settings persistence ─────────────────────────────────── */

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    settings.minLen    = Math.max(2, Math.min(15, +s.minLen    || 5));
    settings.maxLen    = Math.max(2, Math.min(15, +s.maxLen    || 8));
    settings.maxWords  = Math.max(1, Math.min(21, +s.maxWords  || 5));
    settings.joker     = !!s.joker;
    settings.chrono    = !!s.chrono;
    settings.chronoMin = Math.max(1, Math.min(21, +s.chronoMin || 10));
    if (settings.minLen > settings.maxLen) settings.maxLen = settings.minLen;
  } catch(e) {
    settings = { minLen: 5, maxLen: 8, maxWords: 5, joker: false, chrono: false, chronoMin: 10 };
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e) {}
}

/* ── SRS ─────────────────────────────────────────────────────────────────── */

function loadSRS() {
  try { srsData = JSON.parse(localStorage.getItem(SRS_KEY) || '{}'); } catch(e) { srsData = {}; }
}

function saveSRS() {
  try { localStorage.setItem(SRS_KEY, JSON.stringify(srsData)); } catch(e) {}
}

function srsMarkDone(key) {
  srsData[key] = { due: Date.now() + SRS_DONE_DAYS * 86400000, interval: -1 };
}

function srsMarkPartial(key) {
  const cur = srsData[key];
  let idx = 0;
  if (cur?.interval > 0) {
    const i = SRS_INTERVALS.indexOf(cur.interval);
    idx = Math.min(i < 0 ? 0 : i + 1, SRS_INTERVALS.length - 1);
  }
  const days = SRS_INTERVALS[idx];
  srsData[key] = { due: Date.now() + days * 86400000, interval: days };
}

/* ── Profils (presets de critères) ─────────────────────────────────────────── */

function loadPresets() {
  try {
    const s = localStorage.getItem(PRESETS_KEY);
    return s ? JSON.parse(s) : [];
  } catch(e) { return []; }
}

function savePresets(presets) {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch(e) {}
}

function presetLabel(p) {
  const len = p.minLen === p.maxLen ? `${p.minLen} L` : `${p.minLen}–${p.maxLen} L`;
  return `${len} · max ${p.maxWords}${p.joker ? ' · joker ♠' : ''}`;
}

/* ── Pool ─────────────────────────────────────────────────────────────────── */

function computeJokerWords(baseSorted) {
  if (!bsAllMap) return [];
  const seen = new Set();
  const words = [];
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const extKey = [...baseSorted, L].sort().join('');
    const group  = bsAllMap.get(extKey);
    if (group) for (const w of group) if (!seen.has(w)) { seen.add(w); words.push(w); }
  }
  return words;
}

function isSubset(base, extended) {
  const cnt = {};
  for (const c of extended) cnt[c] = (cnt[c] || 0) + 1;
  for (const c of base) { if (!cnt[c]) return false; cnt[c]--; }
  return true;
}

function buildPool() {
  const src = window.BS_ALL;
  if (!src?.length) { pool = []; jokerPool = []; bsAllMap = null; return; }

  if (!bsAllMap) {
    bsAllMap = new Map();
    for (const t of src) bsAllMap.set(t[0], t.slice(1));
  }

  const now = Date.now();

  pool = src.filter(t => {
    if (t[0].length < settings.minLen || t[0].length > settings.maxLen) return false;
    if (t.length - 1 > settings.maxWords) return false;
    const srs = srsData[t[0]];
    return !(srs && srs.due > now);
  }).map(t => ({ sorted: t[0], words: t.slice(1) }));

  jokerPool = [];
  if (settings.joker) {
    for (const t of src) {
      const sLen = t[0].length;
      if (sLen + 1 < settings.minLen || sLen + 1 > settings.maxLen) continue;
      const jokerKey = t[0] + '?';
      const srs = srsData[jokerKey];
      if (srs && srs.due > now) continue;
      const words = computeJokerWords(t[0]);
      if (words.length >= 2 && words.length <= settings.maxWords) {
        jokerPool.push({ sorted: t[0], words, isJoker: true });
      }
    }
  }
}

/* ── Game ─────────────────────────────────────────────────────────────────── */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildSeance() {
  // joker activé = 100 % tirages joker ; sinon tirages normaux uniquement
  const src = settings.joker ? jokerPool : pool;
  if (!src.length) return [];

  const groups = {};
  for (const t of src) { const n = t.words.length; (groups[n] || (groups[n] = [])).push(t); }
  const shuffled = {};
  for (const n in groups) shuffled[n] = shuffle(groups[n]);

  const chosen = [];
  let remaining = 21;

  while (remaining > 0) {
    const available = Object.keys(shuffled).map(Number)
      .filter(n => n <= remaining && shuffled[n].length > 0);
    if (!available.length) break;
    const n = available[Math.floor(Math.random() * available.length)];
    chosen.push(shuffled[n].pop());
    remaining -= n;
  }

  return shuffle(chosen).map(t => ({
    sorted:     t.sorted,
    words:      t.words,
    foundWords: [],
    done:       false,
    isJoker:    t.isJoker || false,
  }));
}

function tirageSortedDisplay(t) {
  return t.isJoker ? t.sorted + '?' : t.sorted;
}

/* ── Chrono ─────────────────────────────────────────────────────────────────── */

function startChrono() {
  if (!settings.chrono) return;
  clearInterval(chronoTimer);
  chronoRemaining = settings.chronoMin * 60;
  document.getElementById('chrono-display').classList.remove('hidden');
  updateChronoDisplay();
  chronoTimer = setInterval(() => {
    chronoRemaining--;
    updateChronoDisplay();
    if (chronoRemaining <= 0) {
      clearInterval(chronoTimer); chronoTimer = null;
      showRecap(true);
    }
  }, 1000);
}

function stopChrono() {
  clearInterval(chronoTimer); chronoTimer = null;
  document.getElementById('chrono-display')?.classList.add('hidden');
}

function updateChronoDisplay() {
  const el = document.getElementById('chrono-display');
  if (!el) return;
  const m = Math.floor(chronoRemaining / 60);
  const s = chronoRemaining % 60;
  el.textContent = m + ':' + String(s).padStart(2, '0');
  el.classList.toggle('chrono-warn', chronoRemaining <= 60);
}

/* ── Desktop focus ───────────────────────────────────────────────────────── */

function focusDesktopInput() {
  if (window.matchMedia('(min-width: 641px)').matches) {
    const inp = document.getElementById('dt-input');
    if (inp) inp.focus();
  }
}

/* ── Écran d'accueil ───────────────────────────────────────────────────────── */

function showStartScreen() {
  gameActive = false;
  stopChrono();
  document.getElementById('solution-view').classList.add('hidden');
  document.getElementById('input-area').classList.add('hidden');
  document.getElementById('score').textContent = '';
  const grid = document.getElementById('grid');
  grid.classList.remove('hidden');
  grid.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'home-wrap';
  grid.appendChild(wrap); // dans le DOM dès maintenant pour que getElementById fonctionne

  // ── Réglages inline (tous sauf chrono) ──
  const settBox = document.createElement('div');
  settBox.className = 'home-settings';
  settBox.innerHTML = `
    <div class="sett-row">
      <span class="sett-label">Joker</span>
      <button class="sett-btn${settings.joker ? ' active' : ''}" id="hs-joker">${settings.joker ? 'Activé' : 'Désactivé'}</button>
    </div>
    <div class="sett-row">
      <span class="sett-label">Lettres min</span>
      <div class="sett-stepper">
        <button class="sett-step" id="hs-dec-min">−</button>
        <span class="sett-val" id="hs-val-min">${settings.minLen}</span>
        <button class="sett-step" id="hs-inc-min">+</button>
      </div>
    </div>
    <div class="sett-row">
      <span class="sett-label">Lettres max</span>
      <div class="sett-stepper">
        <button class="sett-step" id="hs-dec-max">−</button>
        <span class="sett-val" id="hs-val-max">${settings.maxLen}</span>
        <button class="sett-step" id="hs-inc-max">+</button>
      </div>
    </div>
    <div class="sett-row">
      <span class="sett-label">Solutions max</span>
      <div class="sett-stepper">
        <button class="sett-step" id="hs-dec-mw">−</button>
        <span class="sett-val" id="hs-val-mw">${settings.maxWords}</span>
        <button class="sett-step" id="hs-inc-mw">+</button>
      </div>
    </div>
  `;
  wrap.appendChild(settBox);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Les éléments sont maintenant dans le DOM (via wrap > grid)
  document.getElementById('hs-joker').addEventListener('click', () => {
    settings.joker = !settings.joker;
    const btn = document.getElementById('hs-joker');
    btn.textContent = settings.joker ? 'Activé' : 'Désactivé';
    btn.classList.toggle('active', settings.joker);
  });
  document.getElementById('hs-dec-min').addEventListener('click', () => {
    settings.minLen = clamp(settings.minLen - 1, 2, settings.maxLen);
    document.getElementById('hs-val-min').textContent = settings.minLen;
  });
  document.getElementById('hs-inc-min').addEventListener('click', () => {
    settings.minLen = clamp(settings.minLen + 1, 2, 15);
    if (settings.minLen > settings.maxLen) {
      settings.maxLen = settings.minLen;
      document.getElementById('hs-val-max').textContent = settings.maxLen;
    }
    document.getElementById('hs-val-min').textContent = settings.minLen;
  });
  document.getElementById('hs-dec-max').addEventListener('click', () => {
    settings.maxLen = clamp(settings.maxLen - 1, settings.minLen, 15);
    document.getElementById('hs-val-max').textContent = settings.maxLen;
  });
  document.getElementById('hs-inc-max').addEventListener('click', () => {
    settings.maxLen = clamp(settings.maxLen + 1, 2, 15);
    document.getElementById('hs-val-max').textContent = settings.maxLen;
  });
  document.getElementById('hs-dec-mw').addEventListener('click', () => {
    settings.maxWords = clamp(settings.maxWords - 1, 1, 21);
    document.getElementById('hs-val-mw').textContent = settings.maxWords;
  });
  document.getElementById('hs-inc-mw').addEventListener('click', () => {
    settings.maxWords = clamp(settings.maxWords + 1, 1, 21);
    document.getElementById('hs-val-mw').textContent = settings.maxWords;
  });

  // ── Boutons action ──
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'width:100%;max-width:360px;display:flex;gap:8px;';

  const btnNew = document.createElement('button');
  btnNew.className = 'start-btn';
  btnNew.style.cssText = 'flex:1;';
  btnNew.textContent = '♠ Jouer';
  btnNew.addEventListener('click', () => {
    saveSettings();
    bsAllMap = null;
    buildPool();
    newGame();
  });
  btnRow.appendChild(btnNew);

  const btnSave = document.createElement('button');
  btnSave.className = 'start-btn-secondary';
  btnSave.style.cssText = 'flex-shrink:0;padding:10px 14px;font-size:18px;';
  btnSave.textContent = '＋';
  btnSave.title = 'Enregistrer ces critères comme profil';
  btnSave.addEventListener('click', () => {
    saveSettings();
    const preset = {
      id: Date.now(),
      minLen: settings.minLen, maxLen: settings.maxLen,
      maxWords: settings.maxWords, joker: settings.joker,
    };
    const presets = loadPresets();
    const dup = presets.some(p =>
      p.minLen === preset.minLen && p.maxLen === preset.maxLen &&
      p.maxWords === preset.maxWords && p.joker === preset.joker
    );
    if (!dup) { presets.push(preset); savePresets(presets); }
    showStartScreen();
  });
  btnRow.appendChild(btnSave);
  wrap.appendChild(btnRow);

  // ── Profils sauvegardés ──
  const presets = loadPresets();
  if (presets.length) {
    const sep = document.createElement('p');
    sep.className = 'home-sep';
    sep.textContent = 'Mes profils';
    wrap.appendChild(sep);

    for (const preset of [...presets].reverse()) {
      const card = document.createElement('div');
      card.className = 'session-card';

      const info = document.createElement('div');
      info.className = 'session-info';
      info.innerHTML = `<span class="preset-label">${presetLabel(preset)}</span>`;
      card.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'session-actions';

      const btnPlay = document.createElement('button');
      btnPlay.className = 'start-btn-secondary';
      btnPlay.textContent = '▶ Jouer';
      btnPlay.addEventListener('click', () => {
        settings.minLen   = preset.minLen;
        settings.maxLen   = preset.maxLen;
        settings.maxWords = preset.maxWords;
        settings.joker    = preset.joker;
        saveSettings();
        bsAllMap = null;
        buildPool();
        newGame();
      });
      actions.appendChild(btnPlay);

      const btnDel = document.createElement('button');
      btnDel.className = 'session-del-btn';
      btnDel.textContent = '✕';
      btnDel.title = 'Supprimer ce profil';
      btnDel.addEventListener('click', () => {
        savePresets(loadPresets().filter(p => p.id !== preset.id));
        showStartScreen();
      });
      actions.appendChild(btnDel);

      card.appendChild(actions);
      wrap.appendChild(card);
    }
  }
}

function newGame() {
  gameActive = true;
  score = 0;
  kbBuf = '';
  clearTimeout(msgTimer);
  stopChrono();
  document.getElementById('solution-view').classList.add('hidden');
  document.getElementById('grid').classList.remove('hidden');
  document.getElementById('input-area').classList.remove('hidden');
  seance = buildSeance();
  target = seance.reduce((s, t) => s + t.words.length, 0);
  renderGrid();
  updateScore();
  setMsg('');
  updateWordDisplay();
  startChrono();
  focusDesktopInput();
  if (!target) {
    document.getElementById('grid').innerHTML =
      '<p class="no-pool-msg">Aucun tirage disponible.<br>Modifiez les réglages ou attendez que des tirages redeviennent disponibles (répétition espacée).</p>';
  }
}

/* ── Rendering ─────────────────────────────────────────────────────────────────── */

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  seance.filter(t => !t.done).forEach(t => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.sorted = t.sorted;

    const tokWrap = document.createElement('div');
    tokWrap.className = 'card-main';

    const tokens = document.createElement('div');
    tokens.className = 'card-tokens';
    tirageSortedDisplay(t).split('').forEach(l => {
      const sp = document.createElement('span');
      sp.className = 'token' + (l === '?' ? ' token-joker' : '');
      sp.textContent = l;
      tokens.appendChild(sp);
    });
    tokWrap.appendChild(tokens);

    const info = document.createElement('div');
    info.className = 'card-info';
    if (t.foundWords.length) {
      [...t.foundWords].sort().forEach(w => {
        const wd = document.createElement('span');
        wd.className = 'found-word';
        wd.textContent = w;
        wd.addEventListener('click', e => { e.stopPropagation(); openDef(w); });
        info.appendChild(wd);
      });
    } else {
      const dots = document.createElement('span');
      dots.className = 'card-dots';
      dots.textContent = '· '.repeat(Math.min(t.words[0].length, 8)).trimEnd();
      info.appendChild(dots);
    }
    tokWrap.appendChild(info);
    card.appendChild(tokWrap);

    const badge = document.createElement('div');
    badge.className = t.foundWords.length > 0 ? 'card-badge' : 'card-circle';
    if (t.foundWords.length > 0) badge.textContent = t.foundWords.length;
    card.appendChild(badge);

    grid.appendChild(card);
  });
}

function flashAndRemove(sorted) {
  const card = document.querySelector(`.card[data-sorted="${sorted}"]`);
  if (!card) return;
  card.classList.add('completing');
  setTimeout(() => renderGrid(), 600);
}

function updateScore() {
  document.getElementById('score').textContent = score + ' / ' + target;
}

function updateWordDisplay() {
  document.getElementById('word-display').textContent = kbBuf;
}

function setMsg(text, cls) {
  clearTimeout(msgTimer);
  const el = document.getElementById('word-msg');
  el.textContent = text;
  el.className = 'word-msg' + (cls ? ' ' + cls : '');
  if (text) msgTimer = setTimeout(() => { el.textContent = ''; el.className = 'word-msg'; }, 2000);
}

/* ── Submission ─────────────────────────────────────────────────────────────────── */

function findTirage(done, wordSorted) {
  for (const t of seance) {
    if (t.done !== done) continue;
    if (!t.isJoker && t.sorted === wordSorted) return t;
    if (t.isJoker && wordSorted.length === t.sorted.length + 1 && isSubset(t.sorted, wordSorted)) return t;
  }
  return null;
}

function submit() {
  const word = kbBuf.trim().toUpperCase();
  if (!word) return;

  const wordSorted = word.split('').sort().join('');
  const tirage = findTirage(false, wordSorted);

  if (tirage) {
    if (tirage.foundWords.includes(word)) {
      setMsg('déjà trouvé', 'warn');
      kbBuf = ''; updateWordDisplay(); return;
    }
    if (!tirage.words.includes(word)) {
      setMsg('mot invalide', 'error');
      kbBuf = ''; updateWordDisplay(); return;
    }

    tirage.foundWords.push(word);
    score++;
    kbBuf = '';
    updateWordDisplay();
    setMsg('');
    updateScore();

    if (tirage.foundWords.length === tirage.words.length) {
      tirage.done = true;
      renderGrid();
      setTimeout(() => flashAndRemove(tirage.sorted), 50);
      if (score === target) { setTimeout(() => showRecap(false), 700); }
    } else {
      renderGrid();
    }
    return;
  }

  const doneTirage = findTirage(true, wordSorted);
  setMsg(doneTirage ? 'déjà terminé' : 'mot hors jeu', doneTirage ? 'warn' : 'error');
  kbBuf = ''; updateWordDisplay();
}

/* ── Keyboard ─────────────────────────────────────────────────────────────────── */

function wireKeyboard() {
  const kb = document.getElementById('bs-kb');
  if (!kb) return;
  const press = k => {
    if (k === 'CLR')      { kbBuf = ''; }
    else if (k === 'DEL') { kbBuf = kbBuf.slice(0, -1); }
    else if (k === 'OK')  { submit(); return; }
    else                  { kbBuf += k; setMsg(''); }
    updateWordDisplay();
  };
  kb.addEventListener('mousedown', e => {
    const key = e.target.closest('.kk'); if (!key) return;
    e.preventDefault(); press(key.dataset.k);
  });
  kb.addEventListener('touchstart', e => {
    const key = e.target.closest('.kk'); if (!key) return;
    e.preventDefault(); press(key.dataset.k);
  }, { passive: false });
  kb.addEventListener('click', e => { if (e.target.closest('.kk')) e.preventDefault(); });
}

function wireDesktopInput() {
  const input = document.getElementById('dt-input');
  const btn   = document.getElementById('dt-ok');
  if (!input) return;
  input.addEventListener('input', e => {
    kbBuf = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
    e.target.value = kbBuf;
    setMsg('');
    updateWordDisplay();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
      e.target.value = kbBuf; // kbBuf est '' après submit
      e.target.focus();
    }
  });
  btn?.addEventListener('click', () => {
    submit();
    input.value = kbBuf;
    input.focus();
  });
}

/* ── Settings UI ─────────────────────────────────────────────────────────────────── */

function refreshSettingsUI() {
  document.getElementById('val-min').textContent    = settings.minLen;
  document.getElementById('val-max').textContent    = settings.maxLen;
  document.getElementById('val-mw').textContent     = settings.maxWords;
  document.getElementById('val-chrono').textContent = settings.chronoMin + ' min';

  const jokerBtn = document.getElementById('sett-joker');
  if (jokerBtn) {
    jokerBtn.textContent = settings.joker ? 'Activé' : 'Désactivé';
    jokerBtn.classList.toggle('active', settings.joker);
  }
  const chronoBtn = document.getElementById('sett-chrono');
  if (chronoBtn) {
    chronoBtn.textContent = settings.chrono ? 'Activé' : 'Désactivé';
    chronoBtn.classList.toggle('active', settings.chrono);
  }
  document.getElementById('row-chrono-dur')?.classList.toggle('hidden', !settings.chrono);
}

function openSettingsPanel(anchorEl, e) {
  e.stopPropagation();
  const panel = document.getElementById('settings-panel');
  if (panel.classList.contains('hidden')) {
    refreshSettingsUI();
    const bottom = anchorEl.getBoundingClientRect().bottom;
    panel.style.top = (bottom + 6) + 'px';
    panel.classList.remove('hidden');
  } else {
    panel.classList.add('hidden');
  }
}

function wireSettings() {
  const panel = document.getElementById('settings-panel');

  document.getElementById('btn-settings').addEventListener('click', e =>
    openSettingsPanel(document.getElementById('header'), e));
  document.getElementById('btn-settings-sol')?.addEventListener('click', e =>
    openSettingsPanel(document.getElementById('solution-header'), e));

  document.addEventListener('click', e => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target))
      panel.classList.add('hidden');
  });

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  document.getElementById('dec-min').addEventListener('click', () => {
    settings.minLen = clamp(settings.minLen - 1, 2, settings.maxLen); refreshSettingsUI();
  });
  document.getElementById('inc-min').addEventListener('click', () => {
    settings.minLen = clamp(settings.minLen + 1, 2, 15);
    if (settings.minLen > settings.maxLen) settings.maxLen = settings.minLen;
    refreshSettingsUI();
  });
  document.getElementById('dec-max').addEventListener('click', () => {
    settings.maxLen = clamp(settings.maxLen - 1, settings.minLen, 15); refreshSettingsUI();
  });
  document.getElementById('inc-max').addEventListener('click', () => {
    settings.maxLen = clamp(settings.maxLen + 1, 2, 15); refreshSettingsUI();
  });
  document.getElementById('dec-mw').addEventListener('click', () => {
    settings.maxWords = clamp(settings.maxWords - 1, 1, 21); refreshSettingsUI();
  });
  document.getElementById('inc-mw').addEventListener('click', () => {
    settings.maxWords = clamp(settings.maxWords + 1, 1, 21); refreshSettingsUI();
  });
  document.getElementById('dec-chrono').addEventListener('click', () => {
    settings.chronoMin = clamp(settings.chronoMin - 1, 1, 21); refreshSettingsUI();
  });
  document.getElementById('inc-chrono').addEventListener('click', () => {
    settings.chronoMin = clamp(settings.chronoMin + 1, 1, 21); refreshSettingsUI();
  });
  document.getElementById('sett-joker')?.addEventListener('click', () => {
    settings.joker = !settings.joker; refreshSettingsUI();
  });
  document.getElementById('sett-chrono')?.addEventListener('click', () => {
    settings.chrono = !settings.chrono; refreshSettingsUI();
  });

  document.getElementById('btn-sett-apply').addEventListener('click', () => {
    saveSettings();
    bsAllMap = null;
    buildPool();
    panel.classList.add('hidden');
    if (gameActive) newGame(); else showStartScreen();
  });
}

/* ── Solution view ─────────────────────────────────────────────────────────────────── */

function showRecap(abandoned = false) {
  stopChrono();
  gameActive = false;

  seance.forEach(t => {
    const key = t.isJoker ? t.sorted + '?' : t.sorted;
    if (t.done) srsMarkDone(key);
    else if (t.foundWords.length > 0) srsMarkPartial(key);
  });
  saveSRS();

  const view  = document.getElementById('solution-view');
  const title = document.getElementById('solution-title');
  const list  = document.getElementById('solution-list');

  document.getElementById('grid').classList.add('hidden');
  document.getElementById('input-area').classList.add('hidden');

  title.textContent = abandoned
    ? `♠ BlackScrab · ${score} / ${target} — Abandon`
    : `♠ BlackScrab · ${target} / ${target}`;

  list.innerHTML = '';
  seance.forEach(t => {
    const item = document.createElement('div');
    item.className = 'sol-item';

    const hdr = document.createElement('div');
    hdr.className = 'v-header';
    tirageSortedDisplay(t).split('').forEach(l => {
      const sp = document.createElement('span');
      sp.className = 'v-token' + (l === '?' ? ' v-token-joker' : '');
      sp.textContent = l;
      hdr.appendChild(sp);
    });
    item.appendChild(hdr);

    const sols = document.createElement('div');
    sols.className = 'v-solutions';
    [...t.words].sort().forEach(w => {
      const found = t.foundWords.includes(w);
      const row = document.createElement('div');
      row.className = 'v-word-row' + (found ? ' v-found' : ' v-missed');
      const wSpan = document.createElement('span');
      wSpan.className = 'v-word';
      wSpan.textContent = w;
      wSpan.addEventListener('click', () => openDef(w));
      row.appendChild(wSpan);
      sols.appendChild(row);
    });
    item.appendChild(sols);

    if (t.done) {
      const revoir = document.createElement('button');
      revoir.className = 'revoir-btn';
      revoir.textContent = '↺ Revoir';
      revoir.title = 'Reproposer dans 15 jours';
      revoir.addEventListener('click', () => {
        const key = t.isJoker ? t.sorted + '?' : t.sorted;
        srsData[key] = { due: Date.now() + 15 * 86400000, interval: 15 };
        saveSRS();
        revoir.textContent = '✓ 15j';
        revoir.classList.add('done');
        revoir.disabled = true;
      });
      item.appendChild(revoir);
    }

    list.appendChild(item);
  });

  const replayBottom = document.createElement('button');
  replayBottom.className = 'start-btn';
  replayBottom.style.cssText = 'margin:8px 0 4px;width:100%;';
  replayBottom.textContent = '↺ Rejouer';
  replayBottom.addEventListener('click', () => { buildPool(); newGame(); });
  list.appendChild(replayBottom);

  view.classList.remove('hidden');
}

/* ── Init ─────────────────────────────────────────────────────────────────── */

async function init() {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  }

  if (!window.BS_ALL) {
    document.getElementById('grid').innerHTML =
      '<p style="color:var(--red);padding:20px">Données introuvables.</p>';
    return;
  }

  loadSettings();
  loadSRS();
  buildPool();
  wireKeyboard();
  wireDesktopInput();
  wireSettings();
  wireDefModal();

  document.getElementById('btn-abandon').addEventListener('click', () => {
    if (confirm('Abandonner et voir les solutions ?')) showRecap(true);
  });

  document.getElementById('btn-home').addEventListener('click', () => {
    gameActive = false;
    stopChrono();
    document.getElementById('input-area').classList.add('hidden');
    showStartScreen();
  });

  document.getElementById('solution-replay').addEventListener('click', showStartScreen);

  showStartScreen();
}

document.addEventListener('DOMContentLoaded', init);
