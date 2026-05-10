'use strict';

/* ── State ─────────────────────────────────────────────── */
let bsData  = [];   // [{sorted, words:[]}]  — chargé depuis BS_TIRAGES
let seance  = [];   // [{sorted, words, foundWords[], done}]
let score   = 0;    // total mots trouvés
let kbBuf   = '';
let msgTimer = null;

/* ── Init ──────────────────────────────────────────────── */

async function init() {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('./sw.js');
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data === 'update') location.reload();
    });
  }

  // BS_TIRAGES est injecté par data.js (chargé avant app.js)
  if (!window.BS_TIRAGES || !window.BS_TIRAGES.length) {
    document.getElementById('grid').innerHTML =
      '<p style="color:var(--red);padding:20px">Données introuvables.</p>';
    return;
  }
  bsData = window.BS_TIRAGES.map(arr => ({ sorted: arr[0], words: arr.slice(1) }));

  wireKeyboard();
  wireDesktopInput();
  document.getElementById('btn-new').addEventListener('click', onNewGame);
  document.getElementById('btn-abandon').addEventListener('click', onAbandon);
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

function buildSeance() {
  const n3 = shuffle(bsData.filter(t => t.words.length === 3));
  const n2 = shuffle(bsData.filter(t => t.words.length === 2));
  const n1 = shuffle(bsData.filter(t => t.words.length === 1));

  // Choisir aléatoirement le nombre de tirages à 3, 2 et 1 solutions
  const use3 = Math.min(Math.floor(Math.random() * 5), n3.length); // 0-4 tirages × 3
  const rem  = 21 - use3 * 3;
  const max2 = Math.min(Math.floor(rem / 2), n2.length);
  const use2 = Math.floor(Math.random() * (max2 + 1));
  const use1 = rem - use2 * 2;

  return shuffle([
    ...n3.slice(0, use3),
    ...n2.slice(0, use2),
    ...n1.slice(0, use1),
  ]).map(t => ({ sorted: t.sorted, words: t.words, foundWords: [], done: false }));
}

function newGame() {
  score = 0;
  kbBuf = '';
  clearTimeout(msgTimer);
  seance = buildSeance();
  renderGrid();
  updateScore();
  setMsg('');
  updateWordDisplay();
}

function onNewGame() {
  if (score === 0 || confirm('Recommencer une nouvelle partie ?')) newGame();
}

function onAbandon() {
  if (confirm('Abandonner et voir le récapitulatif ?')) showRecap(true);
}

/* ── Rendering ─────────────────────────────────────────── */

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  seance.filter(t => !t.done).forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.sorted = t.sorted;

    /* tokens (lettres en ordre alphabétique) */
    const tokWrap = document.createElement('div');
    tokWrap.className = 'card-main';

    const tokens = document.createElement('div');
    tokens.className = 'card-tokens';
    t.sorted.split('').forEach(l => {
      const sp = document.createElement('span');
      sp.className = 'token';
      sp.textContent = l;
      tokens.appendChild(sp);
    });
    tokWrap.appendChild(tokens);

    /* mots trouvés / placeholder */
    const info = document.createElement('div');
    info.className = 'card-info';
    if (t.foundWords.length) {
      t.foundWords.forEach(w => {
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

    /* badge */
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

  const wordSorted = word.split('').sort().join('');

  // Chercher un tirage non terminé avec cette clé triée
  const tirage = seance.find(t => !t.done && t.sorted === wordSorted);

  if (tirage) {
    if (tirage.foundWords.includes(word)) {
      setMsg('déjà trouvé', 'warn');
      kbBuf = ''; updateWordDisplay();
      return;
    }
    if (!tirage.words.includes(word)) {
      // Bonnes lettres mais mot non reconnu dans notre base
      setMsg('mot hors jeu', 'error');
      kbBuf = ''; updateWordDisplay();
      return;
    }

    tirage.foundWords.push(word);
    score++;
    kbBuf = '';
    updateWordDisplay();
    setMsg('');
    updateScore();

    if (tirage.foundWords.length === tirage.words.length) {
      // Tirage complet → flash vert puis disparaît
      tirage.done = true;
      renderGrid(); // re-render pour afficher le badge final avant le flash
      setTimeout(() => flashAndRemove(tirage.sorted), 50);
      if (score === 21) { setTimeout(showRecap, 700); }
    } else {
      renderGrid();
    }
    return;
  }

  // Tirage déjà terminé avec ces lettres ?
  const doneTirage = seance.find(t => t.done && t.sorted === wordSorted);
  if (doneTirage) {
    setMsg('déjà terminé', 'warn');
  } else {
    setMsg('mot hors jeu', 'error');
  }
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
  const modal = document.getElementById('victory-modal');
  const title = document.getElementById('victory-title');
  const list  = document.getElementById('victory-list');

  title.textContent = abandoned
    ? `♠ BlackScrab · ${score} / 21 — Abandon`
    : '♠ BlackScrab · 21 / 21';

  list.innerHTML = '';

  seance.forEach(t => {
    const item = document.createElement('div');
    item.className = 'v-item' + (t.done ? '' : ' v-item-open');

    // Lettres du tirage
    const header = document.createElement('div');
    header.className = 'v-header';
    t.sorted.split('').forEach(l => {
      const sp = document.createElement('span');
      sp.className = 'v-token';
      sp.textContent = l;
      header.appendChild(sp);
    });
    item.appendChild(header);

    // Solutions
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

/* ── Start ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
