'use strict';

/* ── State ─────────────────────────────────────────────── */
let settings = { minLen: 5, maxLen: 8, joker: false };
let pool     = [];
let seance   = [];
let score    = 0;
let target   = 21;
let gameOver = false;
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

function buildPool() {
  const src = window.BS_ALL;
  if (!src?.length) { pool = []; return; }
  pool = src
    .filter(t => t[0].length >= settings.minLen && t[0].length <= settings.maxLen)
    .map(t => ({ sorted: t[0], words: t.slice(1) }));
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

  const chosen = [];
  let remaining = 21;
  while (remaining > 0) {
    const available = Object.keys(shuffled)
      .map(Number)
      .filter(n => n <= remaining && shuffled[n].length > 0);
    if (!available.length) break;
    const n = available[Math.floor(Math.random() * available.length)];
    chosen.push(shuffled[n].pop());
    remaining -= n;
  }

  // Joker : ~1/3 des tirages ont une lettre cachée
  if (settings.joker) {
    chosen.forEach(t => {
      if (Math.random() < 1 / 3) {
        const letters = t.sorted.split('');
        t.joker = letters[Math.floor(Math.random() * letters.length)];
      }
    });
  }

  return shuffle(chosen).map(t => ({
    sorted: t.sorted,
    words:  t.words,
    foundWords: [],
    done:   false,
    joker:  t.joker || null,
  }));
}

function tirageSortedDisplay(t) {
  if (!t.joker) return t.sorted;
  return t.sorted.replace(t.joker, '') + '?';
}

function setAbandonBtn(over) {
  gameOver = over;
  const btn = document.getElementById('btn-abandon');
  if (!btn) return;
  if (over) {
    btn.textContent = '↺ Rejouer';
    btn.classList.add('replay');
  } else {
    btn.textContent = '⚑ Abandon';
    btn.classList.remove('replay');
  }
}

function newGame() {
  score = 0;
  kbBuf = '';
  clearTimeout(msgTimer);
  setAbandonBtn(false);
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

function onNewGame() {
  if (gameOver || score === 0 || confirm('Recommencer une nouvelle partie ?')) newGame();
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

function submit() {
  const word = kbBuf.trim().toUpperCase();
  if (!word) return;

  const wordSorted = word.split('').sort().join('');
  const tirage = seance.find(t => !t.done && t.sorted === wordSorted);

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

  const doneTirage = seance.find(t => t.done && t.sorted === wordSorted);
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

/* ── Récapitulatif ─────────────────────────────────────── */

function findDef(word) {
  const TD = window.THEMODS_DATA;
  if (!TD) return '';
  for (let n = 9; n >= 1; n--) {
    const ed = TD[`ods${n}`];
    if (!ed) continue;
    for (const g of ed)
      for (const e of (g.entries || []))
        if (e.forms?.includes(word)) return e.def || '';
  }
  return '';
}

function showRecap(abandoned = false) {
  setAbandonBtn(true);
  const modal = document.getElementById('victory-modal');
  const title = document.getElementById('victory-title');
  const list  = document.getElementById('victory-list');

  title.textContent = abandoned
    ? `♠ BlackScrab · ${score} / ${target} — Abandon`
    : `♠ BlackScrab · ${target} / ${target}`;

  list.innerHTML = '';
  seance.forEach(t => {
    const item = document.createElement('div');
    item.className = 'v-item' + (t.done ? '' : ' v-item-open');

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
    t.words.forEach(w => {
      const found = t.foundWords.includes(w);
      const def = found ? findDef(w) : '';
      const row = document.createElement('div');
      row.className = 'v-word-row' + (found ? ' v-found' : ' v-missed');
      row.innerHTML = `<span class="v-word">${w}</span>` +
        (def ? `<span class="v-def">${def}</span>` : '');
      sols.appendChild(row);
    });
    item.appendChild(sols);
    list.appendChild(item);
  });

  modal.classList.remove('hidden');
}

document.getElementById('victory-close')?.addEventListener('click', () => {
  document.getElementById('victory-modal').classList.add('hidden');
});

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

  document.getElementById('btn-new').addEventListener('click', onNewGame);
  document.getElementById('btn-abandon').addEventListener('click', () => {
    if (gameOver) { newGame(); }
    else if (confirm('Abandonner et voir le récapitulatif ?')) showRecap(true);
  });

  newGame();
}

document.addEventListener('DOMContentLoaded', init);
