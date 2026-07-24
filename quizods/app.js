'use strict';

/* ══ QUIZODS — deviner le mot à partir de sa définition ODS ══
   Données réutilisées : window.SEQODS_DATA (../data.js), openDef (../blackscrab/dict.js).
   Prérequis : on ne joue qu'avec des mots ayant une VRAIE définition dans l'ODS
   (pas juste une nature seule comme "adj." ou un renvoi). */

const LS_KEY = "quizods-v1";
const LS_SETTINGS = "quizods-settings";
let store = { seen:{}, srs:{} };     // seen[canon]=nb affiché · srs[canon]={retired}|{due}
let settings = { minLen:2, maxLen:8, hints:1 };

function load(){
  try{ store = Object.assign({seen:{},srs:{}}, JSON.parse(localStorage.getItem(LS_KEY)||"{}")); }
  catch{ store = {seen:{},srs:{}}; }
  store.seen = store.seen || {};
  store.srs = store.srs || {};
  // Rétro-compat : entrées créées avant l'ajout du champ `found`
  for(const s of Object.values(store.srs)){ if(s.found===undefined) s.found=true; }
  try{ Object.assign(settings, JSON.parse(localStorage.getItem(LS_SETTINGS)||"{}")); }catch{}
}
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(store)); }catch{} }
function saveSettings(){ try{ localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }catch{} }

/* ── Répétition espacée ──
   0 indice supplémentaire  → retiré (plus jamais revu)
   1 indice supplémentaire  → revu dans 14 jours
   2 indices ou plus        → revu dans 7 jours
   Non trouvé (Passer)      → revu dans 3 jours */
function srsIsEligible(canon){
  const s=store.srs[canon];
  if(!s) return true;
  if(s.retired) return false;
  return Date.now()>=s.due;
}
function srsApply(canon, found, extraHints){
  if(!found){ store.srs[canon]={retired:false, due:Date.now()+3*86400000, found:false}; }
  else if(extraHints<=0){ store.srs[canon]={retired:true, found:true}; }
  else if(extraHints===1){ store.srs[canon]={retired:false, due:Date.now()+14*86400000, found:true}; }
  else{ store.srs[canon]={retired:false, due:Date.now()+7*86400000, found:true}; }
  save();
  // Retire le mot du pool/de la file en cours (n'est plus éligible avant reload/rebuild)
  const pi=pool.indexOf(canon); if(pi>=0) pool.splice(pi,1);
  for(let i=queue.length-1;i>=qpos;i--){ if(queue[i]===canon) queue.splice(i,1); }
}
function inLenRange(canon){ return canon.length>=settings.minLen && canon.length<=settings.maxLen; }
// Trouvés : résolus au moins une fois (maîtrisés ou en attente de révision), dans la plage choisie.
function srsFoundCount(){ let n=0; for(const c in store.srs) if(inLenRange(c) && store.srs[c].found) n++; return n; }
// À revoir : pas encore maîtrisés (reviendront un jour), qu'ils aient été trouvés ou non.
function srsToReviewCount(){ let n=0; for(const c in store.srs) if(inLenRange(c) && !store.srs[c].retired) n++; return n; }

/* ── Détection d'une VRAIE définition (pas juste une nature ou un renvoi) ── */
const _TYPE_PFX = /^(?:(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part|préf|suff|aff|sym|m|f|pl)\.(?:\s+et\s+(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part|préf|suff|aff|sym|m|f|pl)\.)*\s*)+/i;
function cleanDef(d){ return String(d||"").trim().replace(/\s+/g," "); }
function isRealDef(d){
  const c=cleanDef(d); if(!c) return false;
  const s=c.replace(_TYPE_PFX,"").trim();
  return s.length>3
    && /^[A-ZÀ-ÖØ-ÞŒŸ(]/.test(s)
    && !/^\([^)]+\)\.?\s*$/.test(s)
    && !/-->/.test(s)
    && /[A-Za-zÀ-ÿœæŒÆ]{4}/.test(s);
}
// Retire les renvois « (= mot, mot…) » d'une définition affichée (spoiler potentiel).
function stripRenvoi(s){
  return String(s||"")
    .replace(/\[[^\]]*\]\s*/g,"")       // prononciation entre crochets (indice trop fort)
    .replace(/\(=\s*[^)]*\)\s*/g,"")    // renvoi « (= mot) »
    .replace(/\s+/g," ").trim();
}
function normCanon(w){
  return String(w||"").toUpperCase().replace(/Œ/g,"OE").replace(/Æ/g,"AE")
    .normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Z]/g,"");
}
// Graphies alternatives citées en renvoi dans la définition (ex. « (= maïorat) »),
// acceptées comme réponses valides en plus du canon principal.
function altSpellingsOf(def){
  const out=new Set();
  (String(def||"").match(/\(=\s*([^)]*)\)/g)||[]).forEach(seg=>{
    seg.replace(/\(=\s*|\)/g,"").split(/[,;]/).forEach(x=>{ const c=normCanon(x); if(c) out.add(c); });
  });
  return out;
}

/* ── Construction du pool de candidats (une fois au démarrage) ── */
let CAND_BY_LEN = {};      // longueur -> [canon,...]
let WORD_DEF_IDX = new Map(); // canon -> index e[]/f[] choisi (a une vraie déf)
let CANON_IDX = new Map();    // canon -> premier index dans c[]/e[]/f[]
let CANON_ALL = new Map();    // canon -> tous les index (entrées multiples)
let ENTRIES;                  // Set des entrées (canoniques)

function buildData(){
  const D=window.SEQODS_DATA;
  ENTRIES=new Set(D.c);
  const byCanon=new Map();
  D.c.forEach((c,i)=>{ (byCanon.get(c)||byCanon.set(c,[]).get(c)).push(i); });
  CANON_ALL=byCanon;
  for(const [canon, idxs] of byCanon){
    CANON_IDX.set(canon, idxs[0]);
    let chosen=-1;
    for(const i of idxs){ if(isRealDef(stripRenvoi(D.f[i]))){ chosen=i; break; } }
    if(chosen<0) continue;
    WORD_DEF_IDX.set(canon, chosen);
    const L=canon.length;
    (CAND_BY_LEN[L]=CAND_BY_LEN[L]||[]).push(canon);
  }
}

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
// Choisit une position cachée à révéler, en évitant si possible d'être
// immédiatement à côté d'une lettre déjà en place (sinon, repli sur
// n'importe quelle position cachée).
function pickHintIndex(revealed){
  const hidden=[]; revealed.forEach((r,i)=>{ if(!r) hidden.push(i); });
  if(!hidden.length) return -1;
  const nonAdjacent=hidden.filter(i=>!revealed[i-1] && !revealed[i+1]);
  const pool=nonAdjacent.length?nonAdjacent:hidden;
  return pool[Math.floor(Math.random()*pool.length)];
}
const el=(tag,cls,txt)=>{ const e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; };
const gImgUrl = w => "https://www.google.com/search?tbm=isch&q="+encodeURIComponent(w.toLowerCase());
const wiktUrl = w => "https://fr.wiktionary.org/wiki/"+encodeURIComponent(w.toLowerCase());

/* ── Résolution des définitions (glose ODS via renvois, sinon Wiktionnaire Firestore) ── */
function rawDef(canon){ const i=CANON_IDX.get(canon); return i===undefined?"":(window.SEQODS_DATA.f[i]||""); }
function isPpinv(w){ const m=(rawDef(w)||"").match(/\(p\.p\.inv\.?[^)]*\)/i); return !!m && !/mais/i.test(m[0]); }
function _gloss(def){
  let s=String(def||"");
  s=s.replace(/\[[^\]]*\]/g," ")
     .replace(/\(=\s*[^)]*\)/g," ")
     .replace(/-->[^.]*\.?/g," ")
     .replace(/-\s*Féminin accepté\.?\s*\(\d+\)/gi," ")
     .replace(/^\s*\/\s*\S+/,"")
     .replace(_TYPE_PFX,"")
     .replace(/\b\d+\.?/g," ");
  return s.replace(/\s+/g," ").trim();
}
const _isGloss = def => { const gg=_gloss(def); return gg.length>3 && /[A-Za-zÀ-ÿ]{4}/.test(gg); };
function refsOf(def){
  const out=[]; const s=String(def||"");
  (s.match(/\(=\s*([^)]*)\)/g)||[]).forEach(seg=>{
    seg.replace(/\(=\s*|\)/g,"").split(/[,;]/).forEach(x=>{ const c=x.trim().toUpperCase().replace(/[^A-ZÀ-Ÿ]/g,""); if(c) out.push(c); });
  });
  let r=/\/\s*([A-Za-zà-ÿ]+)/.exec(s); if(r){ const c=r[1].toUpperCase(); if(c) out.push(c); }
  r=/-->\s*([A-Za-zà-ÿ]+)/.exec(s);   if(r){ const c=r[1].toUpperCase(); if(c) out.push(c); }
  return out;
}
function bestOdsGlossDef(startDef){
  if(_isGloss(startDef)) return startDef;
  const seen=new Set(); const q=refsOf(startDef).slice(); let n=0;
  while(q.length && n<8){ const c=q.shift(); if(seen.has(c))continue; seen.add(c); n++;
    const d=rawDef(c); if(!d) continue;
    if(_isGloss(d)) return d;
    refsOf(d).forEach(x=>{ if(!seen.has(x)) q.push(x); });
  }
  return null;
}
const FB_BASE = "https://firestore.googleapis.com/v1/projects/methods-8e4b1/databases/(default)/documents";
const _customCache=new Map();
async function _fbGetDef(canon){
  try{
    const r=await fetch(FB_BASE+"/rech_custom/"+encodeURIComponent(canon));
    if(!r.ok) return null;
    const f=(await r.json()).fields||{};
    return (f.defQuiz&&f.defQuiz.stringValue) || (f.def&&f.def.stringValue) || null;
  }catch{ return null; }
}
async function resolveCustom(canon){
  if(_customCache.has(canon)) return _customCache.get(canon);
  const cands=[canon, ...refsOf(rawDef(canon))];
  let res=null;
  for(const c of cands){ const t=await _fbGetDef(c); if(t){ res=t; break; } }
  _customCache.set(canon,res); return res;
}
function fillDefLine(def, canon, line){
  const g=bestOdsGlossDef(def);
  if(g){ line.textContent=stripRenvoi(g); return; }
  line.textContent=stripRenvoi(def)||"…"; line.classList.add("def-loading");
  resolveCustom(canon).then(t=>{
    if(t){
      const m=String(def||"").match(_TYPE_PFX);
      line.textContent = (m ? m[0].trim()+" " : "")+stripRenvoi(t);
    }
    line.classList.remove("def-loading");
  });
}
// .q-def-block : une déf par entrée (mots à entrées multiples : PALPER, SON…), empilées,
// chaque entrée précédée de sa forme affichée.
function fillDef(canon, elDef){
  const idxs=CANON_ALL.get(canon)||[];
  const D=window.SEQODS_DATA;
  if(idxs.length<=1){ fillDefLine(rawDef(canon), canon, elDef); return; }
  elDef.textContent="";
  idxs.forEach(i=>{
    const line=el("div","def-line");
    line.appendChild(el("div","def-entry", D.e[i]||canon));
    const dd=el("div"); line.appendChild(dd);
    fillDefLine(D.f[i]||"", canon, dd);
    elDef.appendChild(line);
  });
}

/* ── Lemme(s) dont le mot est une forme fléchie (verbe conjugué / autre entrée) ── */
function flechieDe(w){
  const out=new Set();
  if(typeof _findConjLemma==="function"){ const v=_findConjLemma(w); if(v && v!==w) out.add(v); }
  if(typeof findLemma==="function"){ const l=findLemma(w); if(l && l!==w && ENTRIES.has(l)) out.add(l); }
  return [...out];
}

/* ── Relations lexicales (rallonges, cousins, aphérèse/apocope, anagrammes) ── */
let _DICT=null;
function dictSet(){ if(!_DICT) _DICT=new Set(window.SEQODS_DATA.d||[]); return _DICT; }
let _SORTED=null;
function sortedDict(){ if(!_SORTED) _SORTED=(window.SEQODS_DATA.d||[]).slice().sort(); return _SORTED; }
const _AZ="ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function rallongesOf(w){ return ((window.SEQODS_DATA.r||{})[w]||[]).filter(x=>x.endsWith(w)); }
// Rallonges finales : mots commençant par w, entrées seulement, hors formes fléchies de w.
function rallongesFinOf(w){
  const arr=sortedDict(); const out=[];
  let lo=0,hi=arr.length; while(lo<hi){ const m=(lo+hi)>>1; if(arr[m]<w) lo=m+1; else hi=m; }
  for(let i=lo;i<arr.length && arr[i].startsWith(w) && out.length<200;i++){
    const v=arr[i]; if(v.length<=w.length) continue;
    if(!ENTRIES.has(v)) continue;
    if(typeof findLemma==="function" && findLemma(v)===w) continue;
    out.push(v);
  }
  return out;
}
function cousinsOf(w){
  const D=dictSet(); const out=[];
  for(let i=0;i<w.length;i++){ const a=w.slice(0,i), b=w.slice(i+1);
    for(const c of _AZ){ if(c===w[i]) continue; const v=a+c+b; if(D.has(v)) out.push(v); } }
  return out;
}
function apheresesOf(w){ const D=dictSet(); if(w.length>=3){ const v=w.slice(1); if(D.has(v)) return [v]; } return []; }
function apocopesOf(w){ const D=dictSet(); if(w.length>=3){ const v=w.slice(0,-1); if(D.has(v)) return [v]; } return []; }
function anagrammesOf(w){
  const D=window.SEQODS_DATA;
  const key=w.split("").sort().join("");
  return (D.a[key]||[]).filter(x=>x!==w);
}

function wordChips(title, words, navFn){
  if(!words || !words.length) return null;
  const sec=el("div","sol-extra");
  sec.appendChild(el("span","sol-extra-t", title+" ("+words.length+") : "));
  words.slice(0,80).forEach(x=>{
    const a=el("a","chip"+(ENTRIES.has(x)?"":" form")+(isPpinv(x)?" ppinv":""),x); a.href="#";
    a.addEventListener("click",ev=>{ ev.preventDefault(); (navFn||(y=>{ try{ openDef(y); }catch(e){} }))(x); });
    sec.appendChild(a);
  });
  return sec;
}

/* ── Compteur global de progression ── */
// Bornés par les réglages de longueur actifs (ex. 7 lettres → total = entrées
// de 7 lettres avec une vraie définition, pas le total global de l'app).
function seenCountTotal(){ let n=0; for(const c in store.seen) if(inLenRange(c)) n++; return n; }
function totalCandidates(){
  let n=0;
  for(let L=settings.minLen; L<=settings.maxLen; L++) if(CAND_BY_LEN[L]) n+=CAND_BY_LEN[L].length;
  return n;
}
function progressLine(){
  const wrap=el("div","subline q-stats");
  wrap.appendChild(el("span","q-stat", seenCountTotal()+" / "+totalCandidates()+" vus"));
  wrap.appendChild(el("span","q-stat q-stat-found", "✓ "+srsFoundCount()+" trouvés"));
  wrap.appendChild(el("span","q-stat q-stat-review", "↻ "+srsToReviewCount()+" à revoir"));
  return wrap;
}


/* ── Pool + file de mots ── */
let pool=[], queue=[], qpos=0;
function buildPool(){
  pool=[];
  for(let L=settings.minLen; L<=settings.maxLen; L++) if(CAND_BY_LEN[L]) pool=pool.concat(CAND_BY_LEN[L].filter(srsIsEligible));
  queue=shuffle(pool); qpos=0;
}
function nextFromQueue(){
  if(qpos>=queue.length){ queue=shuffle(pool); qpos=0; }
  return queue[qpos++];
}

/* ── État de la carte en cours ── */
let cur=null; // {canon, revealed:[bool], solved, buf}

function newCard(){
  if(!pool.length){ renderEmpty(); return; }
  const canon=nextFromQueue();
  const seenBefore=store.seen[canon]||0;
  store.seen[canon]=seenBefore+1; save();
  const revealed=new Array(canon.length).fill(false);
  const nHint=Math.min(settings.hints, canon.length>1?canon.length-1:0);
  // Le 1er indice est toujours la 1re lettre ; les suivants sont aléatoires.
  if(nHint>0){
    revealed[0]=true;
    for(let k=1;k<nHint;k++){
      const idx=pickHintIndex(revealed);
      if(idx<0) break;
      revealed[idx]=true;
    }
  }
  const chosenDef=window.SEQODS_DATA.f[WORD_DEF_IDX.get(canon)]||"";
  const accepted=new Set([canon, ...altSpellingsOf(chosenDef)]);
  cur={ canon, revealed, solved:false, buf:"", seenBefore, extraHints:0, accepted };
  renderCard();
}

function renderEmpty(){
  const m=document.getElementById("view-quiz"); m.innerHTML="";
  m.appendChild(el("p", null, "Aucun mot disponible pour cette plage de longueurs."));
}

function updateDisplay(){ document.getElementById("word-display").textContent=cur?cur.buf:""; }
function setMsg(text, cls){
  const m=document.getElementById("view-quiz").querySelector(".q-msg");
  if(!m) return;
  m.textContent=text||""; m.className="q-msg"+(cls?" "+cls:"");
}

function renderCard(){
  const m=document.getElementById("view-quiz"); m.innerHTML="";
  const wrap=el("div","q-wrap");

  wrap.appendChild(progressLine());
  if(cur.seenBefore>0) wrap.appendChild(el("div","q-seen","Déjà vu ("+cur.seenBefore+" fois)"));

  const i=WORD_DEF_IDX.get(cur.canon);
  const D=window.SEQODS_DATA;
  wrap.appendChild(el("div","q-def", stripRenvoi(cleanDef(D.f[i]))));

  const tiles=el("div","q-tiles");
  cur.canon.split("").forEach((ch,idx)=>{
    tiles.appendChild(el("div", cur.revealed[idx]?"q-tile revealed":"q-tile hidden-t", cur.revealed[idx]?ch:""));
  });
  wrap.appendChild(tiles);

  const hasHidden=cur.revealed.some(r=>!r);
  const bHint=el("button","btn-hint","💡 Nouvel indice");
  bHint.disabled=!hasHidden;
  bHint.addEventListener("click", revealRandomHint);
  wrap.appendChild(bHint);

  wrap.appendChild(el("div","q-msg"));

  const nr=el("div","q-next-row");
  const bP=el("button","btn-pass","Passer");
  bP.addEventListener("click", passCard);
  nr.appendChild(bP);
  wrap.appendChild(nr);

  m.appendChild(wrap);
  updateDisplay();
}

function revealRandomHint(){
  if(!cur || cur.solved) return;
  const idx=pickHintIndex(cur.revealed);
  if(idx<0) return;
  cur.revealed[idx]=true;
  cur.extraHints++;
  renderCard();
}

function submitGuess(){
  if(!cur || cur.solved) return;
  const guess=cur.buf.trim();
  if(!guess) return;
  if(cur.accepted.has(guess)){ solveCard(); }
  else{ setMsg("Mot incorrect","error"); }
  cur.buf=""; updateDisplay();
}

function solveCard(){
  cur.solved=true;
  setMsg("");
  cur.revealed=cur.revealed.map(()=>true);
  srsApply(cur.canon, true, cur.extraHints);
  renderReveal();
}

function passCard(){
  if(!cur || cur.solved) return;
  cur.solved=true;
  cur.revealed=cur.revealed.map(()=>true);
  srsApply(cur.canon, false, cur.extraHints);
  renderReveal();
}

function srsStatusText(canon){
  const s=store.srs[canon];
  if(!s) return "";
  if(s.retired) return "✓ Maîtrisé — ne reviendra plus";
  const days=Math.max(1, Math.round((s.due-Date.now())/86400000));
  return "↻ Revu dans "+days+" jour"+(days>1?"s":"");
}

function renderReveal(){
  const m=document.getElementById("view-quiz"); m.innerHTML="";
  const wrap=el("div","q-wrap");

  wrap.appendChild(progressLine());

  // Mot-quiz épinglé (cliquable → revenir à sa propre fiche) ; le contenu
  // en dessous se remplace en place quand on explore une rallonge/un
  // cousin/une anagramme, sans jamais ouvrir de modale.
  const content=el("div");
  let navFn;
  const showOriginal=()=>{ content.innerHTML=""; content.appendChild(renderWordCard(cur.canon, navFn)); };
  navFn=(word)=>{ content.innerHTML=""; content.appendChild(renderWordCard(word, navFn)); };

  const tiles=el("div","q-tiles clickable");
  cur.canon.split("").forEach(ch=> tiles.appendChild(el("div","q-tile revealed",ch)) );
  tiles.addEventListener("click", showOriginal);
  wrap.appendChild(tiles);

  wrap.appendChild(el("div","q-srs", srsStatusText(cur.canon)));

  wrap.appendChild(content);
  showOriginal();

  m.appendChild(wrap);
}

/* Fiche complète d'un mot (définition + relations lexicales), sans les
   boutons de tag de FLASHODS (douteux/déf-inconnue/remarquable). */
function renderWordCard(w, navFn){
  const D=window.SEQODS_DATA;
  const box=el("div","q-reveal");

  const h3=el("h3","q-reveal-word"+(isPpinv(w)?" ppinv":""), D.e[CANON_IDX.get(w)]||w);
  h3.addEventListener("click",()=>{ try{ openDef(w); }catch(e){} });
  box.appendChild(h3);

  const defDiv=el("div","q-def-block");
  fillDef(w, defDiv);
  box.appendChild(defDiv);

  const fdl=flechieDe(w);
  if(fdl.length){
    const fd=el("div","sol-flechie");
    fd.appendChild(document.createTextNode("forme fléchie de "));
    fdl.forEach(x=>{ const a=el("a","chip",x); a.href="#";
      a.addEventListener("click",ev=>{ ev.preventDefault(); (navFn||(y=>{ try{ openDef(y); }catch(e){} }))(x); }); fd.appendChild(a); });
    box.appendChild(fd);
  }

  const links=el("div","q-linkrow");
  const img=el("a","mini","🔍 Image"); img.href=gImgUrl(w); img.target="_blank"; img.rel="noopener";
  const wk=el("a","mini","📖 Wikt"); wk.href=wiktUrl(w); wk.target="_blank"; wk.rel="noopener";
  links.appendChild(img); links.appendChild(wk);
  box.appendChild(links);

  const ana=wordChips("Anagrammes", anagrammesOf(w), navFn); if(ana) box.appendChild(ana);
  const ral=wordChips("Rallonges initiales", rallongesOf(w), navFn); if(ral) box.appendChild(ral);
  const ralF=wordChips("Rallonges finales", rallongesFinOf(w), navFn); if(ralF) box.appendChild(ralF);
  const cou=wordChips("Cousins", cousinsOf(w), navFn); if(cou) box.appendChild(cou);
  const aph=wordChips("Aphérèse", apheresesOf(w), navFn); if(aph) box.appendChild(aph);
  const apo=wordChips("Apocope", apocopesOf(w), navFn); if(apo) box.appendChild(apo);

  return box;
}

/* ── Clavier virtuel ── */
function press(k){
  if(!cur) return;
  if(cur.solved){
    if(k==="OK") newCard();
    return;
  }
  if(k==="CLR") cur.buf="";
  else if(k==="DEL") cur.buf=cur.buf.slice(0,-1);
  else if(k==="OK") { submitGuess(); return; }
  else cur.buf+=k;
  updateDisplay();
}
function wireKeyboard(){
  const kb=document.getElementById("qz-kb"); if(!kb) return;
  kb.addEventListener("touchstart",e=>{ const b=e.target.closest(".kk"); if(!b) return; e.preventDefault(); press(b.dataset.k); },{passive:false});
  kb.addEventListener("mousedown",e=>{ const b=e.target.closest(".kk"); if(!b) return; press(b.dataset.k); });
  kb.addEventListener("click",e=>{ if(e.target.closest(".kk")) e.preventDefault(); });
}
/* Clavier physique (ordinateur) : lettres, Entrée = valider, Retour = effacer. */
function wirePhysicalKeyboard(){
  document.addEventListener("keydown", e=>{
    if(document.getElementById("settings-panel")?.classList.contains("open")) return;
    if(e.key==="Enter"){ e.preventDefault(); press("OK"); return; }
    if(e.key==="Backspace"){ e.preventDefault(); press("DEL"); return; }
    if(/^[a-zA-Z]$/.test(e.key)){ press(e.key.toUpperCase()); }
  });
}

/* ── Réglages ── */
function refreshSettingsUI(){
  document.getElementById("val-min").textContent=settings.minLen;
  document.getElementById("val-max").textContent=settings.maxLen;
  document.getElementById("val-hint").textContent=settings.hints;
}
function wireSettings(){
  const panel=document.getElementById("settings-panel");
  document.getElementById("btn-settings").addEventListener("click",e=>{
    e.stopPropagation();
    if(panel.classList.contains("open")){ panel.classList.remove("open"); return; }
    refreshSettingsUI(); panel.classList.add("open");
  });
  document.addEventListener("click",e=>{
    if(panel.classList.contains("open") && !panel.contains(e.target) && e.target.id!=="btn-settings") panel.classList.remove("open");
  });
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  document.getElementById("dec-min").addEventListener("click",()=>{ settings.minLen=clamp(settings.minLen-1,2,15); if(settings.minLen>settings.maxLen) settings.maxLen=settings.minLen; refreshSettingsUI(); });
  document.getElementById("inc-min").addEventListener("click",()=>{ settings.minLen=clamp(settings.minLen+1,2,15); if(settings.minLen>settings.maxLen) settings.maxLen=settings.minLen; refreshSettingsUI(); });
  document.getElementById("dec-max").addEventListener("click",()=>{ settings.maxLen=clamp(settings.maxLen-1,settings.minLen,15); refreshSettingsUI(); });
  document.getElementById("inc-max").addEventListener("click",()=>{ settings.maxLen=clamp(settings.maxLen+1,2,15); refreshSettingsUI(); });
  document.getElementById("dec-hint").addEventListener("click",()=>{ settings.hints=clamp(settings.hints-1,0,10); refreshSettingsUI(); });
  document.getElementById("inc-hint").addEventListener("click",()=>{ settings.hints=clamp(settings.hints+1,0,10); refreshSettingsUI(); });
  document.getElementById("btn-sett-apply").addEventListener("click",()=>{
    saveSettings(); panel.classList.remove("open"); buildPool(); newCard();
  });
}

/* ── Pull-to-refresh ── */
function initPTR(){
  const ptr=document.getElementById("ptr"); if(!ptr) return;
  const THRESH=70;
  let startY=0, pulling=false, dy=0;
  const scroller=node=>{
    while(node && node.nodeType===1){
      const s=getComputedStyle(node);
      if(/(auto|scroll)/.test(s.overflowY) && node.scrollHeight>node.clientHeight+2) return node;
      node=node.parentElement;
    }
    return null;
  };
  document.addEventListener("touchstart",e=>{
    if(e.touches.length!==1){ pulling=false; return; }
    const sc=scroller(e.target);
    if(sc && sc.scrollTop>0){ pulling=false; return; }
    startY=e.touches[0].clientY; dy=0; pulling=true;
  },{passive:true});
  document.addEventListener("touchmove",e=>{
    if(!pulling) return;
    dy=e.touches[0].clientY-startY;
    if(dy>4){ ptr.classList.add("show"); ptr.classList.toggle("ready", dy>THRESH); ptr.style.transform="translateY("+Math.min(dy-40, THRESH)+"px)"; }
    else{ ptr.classList.remove("show","ready"); ptr.style.transform=""; }
  },{passive:true});
  document.addEventListener("touchend",()=>{
    if(!pulling) return; pulling=false;
    if(dy>THRESH){ ptr.classList.add("spinning"); ptr.style.transform=""; setTimeout(()=>location.reload(),150); }
    else{ ptr.classList.remove("show","ready"); ptr.style.transform=""; }
  },{passive:true});
}

/* ── Init ── */
function init(){
  if(!window.SEQODS_DATA){ document.getElementById("view-quiz").innerHTML="<p style='color:var(--red);padding:20px'>Données ODS introuvables.</p>"; return; }
  load();
  buildData();
  buildPool();
  if(typeof wireDefModal==="function") wireDefModal();
  wireKeyboard();
  wirePhysicalKeyboard();
  wireSettings();
  initPTR();
  newCard();
}
document.addEventListener("DOMContentLoaded", init);
