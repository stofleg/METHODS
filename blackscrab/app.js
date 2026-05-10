'use strict';

/* ── State ─────────────────────────────────────────────── */
let allTirages = [];   // [{sorted, word}]
let seance     = [];   // [{sorted, word, letters[], found}]
let selectedIdx = null;
let score = 0;
let kbBuf = '';
let msgTimer = null;

/* ── Init ──────────────────────────────────────────────── */

async function init() {
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('./sw.js');
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data === 'update') location.reload();
    });
  }

  try {
    const resp = await fetch('../ODS9.txt');
    const text = await resp.text();
    allTirages = text.trim().split('\n').map(line => {
      const sc = line.indexOf(';');
      if (sc < 0) return null;
      return { sorted: line.slice(0, sc).trim(), word: line.slice(sc + 1).trim() };
    }).filter(Boolean);
  } catch (err) {
    document.getElementById('grid').innerHTML =
      '<p style="color:var(--red);padding:20px;grid-column:1/-1">Erreur de chargement des données.</p>';
    return;
  }

  wireKeyboard();
  wireDesktopInput();
  document.getElementById('btn-new').addEventListener('click', onNewGame);
  newGame();
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

function newGame() {
  score = 0;
  selectedIdx = null;
  kbBuf = '';
  clearTimeout(msgTimer);

  seance = shuffle(allTirages).slice(0, 21).map(t => ({
    sorted: t.sorted,
    word: t.word,
    letters: shuffle(t.sorted.split('')),
    found: false,
  }));

  setInputVisible(false);
  renderGrid();
  updateScore();
  setMsg('');
}

function onNewGame() {
  if (score === 0 || score === 21 || confirm('Recommencer une nouvelle partie ?')) newGame();
}

/* ── Rendering ─────────────────────────────────────────── */

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  seance.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = [
      'card',
      t.found    ? 'found'    : '',
      selectedIdx === i ? 'selected' : '',
    ].filter(Boolean).join(' ');
    card.dataset.idx = i;

    /* letter tokens */
    const tokens = document.createElement('div');
    tokens.className = 'card-tokens';
    t.letters.forEach(l => {
      const sp = document.createElement('span');
      sp.className = 'token';
      sp.textContent = l;
      tokens.appendChild(sp);
    });
    card.appendChild(tokens);

    /* word or placeholder */
    const info = document.createElement('div');
    if (t.found) {
      info.className = 'card-word';
      info.textContent = t.word;
    } else {
      info.className = 'card-dots';
      info.textContent = '· '.repeat(Math.min(t.word.length, 7)).trimEnd();
    }
    card.appendChild(info);

    card.addEventListener('click', () => selectTirage(i));
    grid.appendChild(card);
  });
}

function updateScore() {
  document.getElementById('score').textContent = score + ' / 21';
}

/* ── Selection & input ─────────────────────────────────── */

function selectTirage(idx) {
  if (selectedIdx === idx) {
    selectedIdx = null;
    setInputVisible(false);
  } else {
    selectedIdx = idx;
    kbBuf = '';
    updateWordDisplay();
    setMsg('');
    setInputVisible(true);
    setTimeout(() => {
      document.querySelector(`[data-idx="${idx}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
    /* focus desktop input */
    const dt = document.getElementById('dt-input');
    if (dt && window.innerWidth > 640) { dt.value = ''; dt.focus(); }
  }
  renderGrid();
}

function setInputVisible(v) {
  document.getElementById('input-area').classList.toggle('hidden', !v);
  if (!v) { kbBuf = ''; updateWordDisplay(); }
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
  if (selectedIdx === null) return;
  const tirage = seance[selectedIdx];
  if (tirage.found) return;
  const word = kbBuf.trim().toUpperCase();
  if (!word) return;

  if (word === tirage.word) {
    tirage.found = true;
    score++;
    kbBuf = '';
    updateWordDisplay();
    setMsg('');
    renderGrid();
    updateScore();

    if (score === 21) { setTimeout(showVictory, 400); return; }

    /* advance to next unfound, cycling from current position */
    const n = seance.length;
    for (let d = 1; d < n; d++) {
      const ni = (selectedIdx + d) % n;
      if (!seance[ni].found) { selectedIdx = ni; break; }
    }
    renderGrid();
    setTimeout(() => {
      document.querySelector(`[data-idx="${selectedIdx}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (window.innerWidth > 640) {
        const dt = document.getElementById('dt-input');
        if (dt) { dt.value = ''; dt.focus(); }
      }
    }, 50);
  } else {
    setMsg('mot non valide', 'error');
    kbBuf = '';
    updateWordDisplay();
  }
}

/* ── Keyboard (mobile) ─────────────────────────────────── */

function wireKeyboard() {
  const kb = document.getElementById('bs-kb');
  if (!kb) return;

  const press = k => {
    if (k === 'CLR')     { kbBuf = ''; }
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

/* ── Desktop input ─────────────────────────────────────── */

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

/* ── Victory ───────────────────────────────────────────── */

function findDef(word) {
  const TD = window.THEMODS_DATA;
  if (!TD) return '';
  for (let n = 9; n >= 1; n--) {
    const ed = TD[`ods${n}`];
    if (!ed) continue;
    for (const g of ed) {
      for (const e of (g.entries || [])) {
        if (e.forms?.includes(word)) return e.def || '';
      }
    }
  }
  return '';
}

function showVictory() {
  const modal = document.getElementById('victory-modal');
  const list  = document.getElementById('victory-list');
  list.innerHTML = '';

  seance.forEach(t => {
    const def  = findDef(t.word);
    const item = document.createElement('div');
    item.className = 'v-item';
    item.innerHTML =
      `<span class="v-word">${t.word}</span>` +
      (def ? `<span class="v-def">${def}</span>` : '');
    list.appendChild(item);
  });

  modal.classList.remove('hidden');
}

document.getElementById('victory-close')?.addEventListener('click', () => {
  document.getElementById('victory-modal').classList.add('hidden');
});

/* ── Start ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
