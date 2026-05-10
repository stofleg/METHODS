'use strict';

/* ── State ─────────────────────────────────────────────── */
let allTirages = [];   // [{sorted, word}]
let seance     = [];   // [{sorted, word, letters[], foundOrder}]  0 = pas trouvé
let score = 0;
let kbBuf = '';
let msgTimer = null;

/* ── Init ──────────────────────────────────────────────── */

async function init() {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('./sw.js');
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
      '<p style="color:var(--red);padding:20px">Erreur de chargement des données.</p>';
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
  kbBuf = '';
  clearTimeout(msgTimer);

  seance = shuffle(allTirages).slice(0, 21).map(t => ({
    sorted: t.sorted,
    word: t.word,
    letters: shuffle(t.sorted.split('')),
    foundOrder: 0,
  }));

  renderGrid();
  updateScore();
  setMsg('');
  updateWordDisplay();
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
    card.className = 'card' + (t.foundOrder ? ' found' : '');

    /* left: tokens + found word */
    const main = document.createElement('div');
    main.className = 'card-main';

    const tokens = document.createElement('div');
    tokens.className = 'card-tokens';
    t.letters.forEach(l => {
      const sp = document.createElement('span');
      sp.className = 'token';
      sp.textContent = l;
      tokens.appendChild(sp);
    });
    main.appendChild(tokens);

    const sub = document.createElement('div');
    if (t.foundOrder) {
      sub.className = 'card-word';
      sub.textContent = t.word;
    } else {
      sub.className = 'card-dots';
      sub.textContent = '· '.repeat(Math.min(t.word.length, 8)).trimEnd();
    }
    main.appendChild(sub);
    card.appendChild(main);

    /* right: ordinal badge or empty circle */
    const badge = document.createElement('div');
    if (t.foundOrder) {
      badge.className = 'card-badge';
      badge.textContent = t.foundOrder;
    } else {
      badge.className = 'card-circle';
    }
    card.appendChild(badge);

    grid.appendChild(card);
  });
}

function updateScore() {
  document.getElementById('score').textContent = score + ' / 21';
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

  /* check against all unfound tirages */
  const hit = seance.find(t => !t.foundOrder && t.word === word);

  if (hit) {
    score++;
    hit.foundOrder = score;
    kbBuf = '';
    updateWordDisplay();
    setMsg('');
    renderGrid();
    updateScore();

    /* scroll found card into view */
    const cards = document.querySelectorAll('.card');
    const idx = seance.indexOf(hit);
    cards[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (score === 21) setTimeout(showVictory, 400);
    return;
  }

  /* already found ? */
  const already = seance.find(t => t.foundOrder && t.word === word);
  if (already) {
    setMsg('déjà trouvé', 'warn');
  } else {
    setMsg('mot hors jeu', 'error');
  }
  kbBuf = '';
  updateWordDisplay();
}

/* ── Keyboard (mobile) ─────────────────────────────────── */

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

  /* sort by discovery order */
  [...seance].sort((a, b) => a.foundOrder - b.foundOrder).forEach(t => {
    const def  = findDef(t.word);
    const item = document.createElement('div');
    item.className = 'v-item';
    item.innerHTML =
      `<div class="v-head"><span class="v-num">${t.foundOrder}</span><span class="v-word">${t.word}</span></div>` +
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
