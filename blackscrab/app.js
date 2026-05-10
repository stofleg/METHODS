'use strict';

/* ── State ─────────────────────────────────────────────── */
let settings = { minLen: 5, maxLen: 8, joker: false };
let pool     = [];
let jokerPool = [];
let bsAllMap  = null;
let seance   = [];
let score    = 0;
let target   = 21;
let kbBuf    = '';
let msgTimer = null;

const SETTINGS_KEY = 'bs-settings';

/* ── Settings persistence ──────────────────────────────── */

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    settings.minLen = Math.max(2, Math.min(15, +s.minLen || 5));
    settings.maxLen = Math.max(2, Math.min(15, +s.maxLen || 8));
    if (settings.minLen > settings.maxLen) settings.maxLen = settings.minLen;
    settings.joker = !!s.joker;
  } catch(e) {
    settings = { minLen: 5, maxLen: 8, joker: false };
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e) {}
}

/* ── Pool ──────────────────────────────────────────────── */

function computeJokerWords(baseSorted) {
  if (!bsAllMap) return [];
  const seen = new Set();
  const words = [];
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const extKey = [...baseSorted, L].sort().join('');
    const group = bsAllMap.get(extKey);
    if (group) {
      for (const w of group) {
        if (!seen.has(w)) { seen.add(w); words.push(w); }
      }
    }
  }
  return words;
}

function isSubset(base, extended) {
  const cnt = {};
  for (const c of extended) cnt[c] = (cnt[c] || 0) + 1;
  for (const c of base) {
    if (!cnt[c]) return false;
    cnt[c]--;
  }
  return true;
}

function buildPool() {
  const src = window.BS_ALL;
  if (!src?.length) { pool = []; jokerPool = []; bsAllMap = null; return; }

  bsAllMap = new Map();
  for (const t of src) bsAllMap.set(t[0], t.slice(1));

  pool = src
    .filter(t => t[0].length >= settings.minLen && t[0].length <= settings.maxLen)
    .map(t => ({ sorted: t[0], words: t.slice(1) }));

  jokerPool = [];
  if (settings.joker) {
    for (const entry of pool) {
      const words = computeJokerWords(entry.sorted);
      if (words.length >= 2 && words.length <= 8) {
        jokerPool.push({ sorted: entry.sorted, words, isJoker: true });
      }
    }
  }
}

/* ── Game ──────────────────────────────────────────────── */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildSeance() {
  if (!pool.length) return [];

  const groups = {};
  for (const t of pool) {
    const n = t.words.length;
    (groups[n] || (groups[n] = [])).push(t);
  }
  const shuffled = {};
  for (const n in groups) shuffled[n] = shuffle(groups[n]);

  const jGroups = {};
  for (const t of jokerPool) {
    const n = t.words.length;
    (jGroups[n] || (jGroups[n] = [])).push(t);
  }
  const jShuffled = {};
  for (const n in jGroups) jShuffled[n] = shuffle(jGroups[n]);

  const chosen = [];
  let remaining = 21;
  let bigCount  = 0; // tirages with > 3 words — max 2 per session

  while (remaining > 0) {
    const maxN = bigCount >= 2 ? 3 : remaining;
    const available = new Set([
      ...Object.keys(shuffled).map(Number).filter(n => n <= maxN && shuffled[n].length > 0),
      ...Object.keys(jShuffled).map(Number).filter(n => n <= maxN && jShuffled[n].length > 0),
    ]);
    if (!available.size) break;
    const keys = [...available];
    const n = keys[Math.floor(Math.random() * keys.length)];

    const canReg   = shuffled[n]?.length  > 0;
    const canJoker = jShuffled[n]?.length > 0;
    let entry;
    if (canReg && canJoker) {
      entry = Math.random() < 0.4 ? jShuffled[n].pop() : shuffled[n].pop();
    } else if (canJoker) {
      entry = jShuffled[n].pop();
    } else {
      entry = shuffled[n].pop();
    }

    if (n > 3) bigCount++;
    chosen.push(entry);
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

function newGame() {
  score = 0;
  kbBuf = '';
  clearTimeout(msgTimer);
  document.getElementById('solution-view').classList.add('hidden');
  document.getElementById('grid').classList.remove('hidden');
  document.getElementById('input-area').classList.remove('hidden');
  seance = buildSeance();
  target = seance.reduce((s, t) => s + t.words.length, 0);
  renderGrid();
  updateScore();
  setMsg('');
  updateWordDisplay();
  if (!target) {
    document.getElementById('grid').innerHTML =
      '<p style="color:var(--red);padding:20px">Aucun tirage pour ces réglages.</p>';
  }
}

/* ── Rendering ─────────────────────────────────────────── */

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
      const ref = t.isJoker ? t.words[0] : t.words[0];
      dots.textContent = '· '.repeat(Math.min(ref.length, 8)).trimEnd();
      info.appendChild(dots);
    }
    tokWrap.appendChild(info);
    card.appendChild(tokWrap);

    const badge = document.createElement('div');
    if (t.foundWords.length > 0) {
      badge.className = 'card-badge';
      badge.textContent = t.foundWords.length;
    } else {
      badge.className = 'card-circle';
    }
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

/* ── Submission ────────────────────────────────────────── */

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

/* ── Keyboard ──────────────────────────────────────────── */

function wireKeyboard() {
  const kb = document.getElementById('bs-kb');
  if (!kb) return;
  const press = k => {
    if (k === 'CLR')      { kbBuf = ''; }
    else if (k === 'DEL') { kbBuf = kbBuf.slice(0, -1); }
    else if (k === 'OK')  { submit(); return; }
    else                  { kbBuf += k; }
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
    updateWordDisplay();
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  btn?.addEventListener('click', submit);
}

/* ── Settings UI ───────────────────────────────────────── */

function refreshSettingsUI() {
  document.getElementById('val-min').textContent = settings.minLen;
  document.getElementById('val-max').textContent = settings.maxLen;
  const jokerBtn = document.getElementById('sett-joker');
  if (jokerBtn) {
    jokerBtn.textContent = settings.joker ? 'Activé' : 'Désactivé';
    jokerBtn.classList.toggle('active', settings.joker);
  }
}

function wireSettings() {
  const panel   = document.getElementById('settings-panel');
  const btnOpen = document.getElementById('btn-settings');

  btnOpen.addEventListener('click', e => {
    e.stopPropagation();
    if (panel.classList.contains('hidden')) {
      refreshSettingsUI();
      const bottom = document.getElementById('header').getBoundingClientRect().bottom;
      panel.style.top = (bottom + 6) + 'px';
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  });

  document.addEventListener('click', e => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target))
      panel.classList.add('hidden');
  });

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  document.getElementById('dec-min').addEventListener('click', () => {
    settings.minLen = clamp(settings.minLen - 1, 2, settings.maxLen);
    refreshSettingsUI();
  });
  document.getElementById('inc-min').addEventListener('click', () => {
    settings.minLen = clamp(settings.minLen + 1, 2, 15);
    if (settings.minLen > settings.maxLen) settings.maxLen = settings.minLen;
    refreshSettingsUI();
  });
  document.getElementById('dec-max').addEventListener('click', () => {
    settings.maxLen = clamp(settings.maxLen - 1, settings.minLen, 15);
    refreshSettingsUI();
  });
  document.getElementById('inc-max').addEventListener('click', () => {
    settings.maxLen = clamp(settings.maxLen + 1, 2, 15);
    refreshSettingsUI();
  });

  document.getElementById('sett-joker')?.addEventListener('click', () => {
    settings.joker = !settings.joker;
    refreshSettingsUI();
  });

  document.getElementById('btn-sett-apply').addEventListener('click', () => {
    saveSettings();
    buildPool();
    panel.classList.add('hidden');
    newGame();
  });
}

/* ── Solution view ─────────────────────────────────────── */

function showRecap(abandoned = false) {
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

    const header = document.createElement('div');
    header.className = 'v-header';
    tirageSortedDisplay(t).split('').forEach(l => {
      const sp = document.createElement('span');
      sp.className = 'v-token' + (l === '?' ? ' v-token-joker' : '');
      sp.textContent = l;
      header.appendChild(sp);
    });
    item.appendChild(header);

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
    list.appendChild(item);
  });

  view.classList.remove('hidden');
}

/* ── Init ──────────────────────────────────────────────── */

async function init() {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('./sw.js');
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data === 'update') location.reload();
    });
  }

  if (!window.BS_ALL) {
    document.getElementById('grid').innerHTML =
      '<p style="color:var(--red);padding:20px">Données introuvables.</p>';
    return;
  }

  loadSettings();
  buildPool();
  wireKeyboard();
  wireDesktopInput();
  wireSettings();
  wireDefModal();

  document.getElementById('btn-abandon').addEventListener('click', () => {
    if (confirm('Abandonner et voir les solutions ?')) showRecap(true);
  });
  document.getElementById('solution-replay').addEventListener('click', newGame);

  newGame();
}

document.addEventListener('DOMContentLoaded', init);
