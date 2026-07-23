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
  if(!found){ store.srs[canon]={retired:false, due:Date.now()+3*86400000}; }
  else if(extraHints<=0){ store.srs[canon]={retired:true}; }
  else if(extraHints===1){ store.srs[canon]={retired:false, due:Date.now()+14*86400000}; }
  else{ store.srs[canon]={retired:false, due:Date.now()+7*86400000}; }
  save();
  // Retire le mot du pool/de la file en cours (n'est plus éligible avant reload/rebuild)
  const pi=pool.indexOf(canon); if(pi>=0) pool.splice(pi,1);
  for(let i=queue.length-1;i>=qpos;i--){ if(queue[i]===canon) queue.splice(i,1); }
}

/* ── Détection d'une VRAIE définition (pas juste une nature ou un renvoi) ── */
const _TYPE_PFX = /^(?:(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part|préf|suff|aff|sym|m|f|pl)\.(?:\s+et\s+(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part|préf|suff|aff|sym|m|f|pl)\.)*\s*)+/i;
function cleanDef(d){ return String(d||"").trim().replace(/\s+/g," "); }
function isRealDef(d){
  const c=cleanDef(d); if(!c) return false;
  const s=c.replace(_TYPE_PFX,"").trim();
  return s.length>3
    && /^[A-ZÀ-ÖØ-ÞŒŸ(]/.test(s)
    && !/^\([^)]+\)\.?\s*$/.test(s)
    && !/^-->/.test(s)
    && /[A-Za-zÀ-ÿœæŒÆ]{4}/.test(s);
}

/* ── Construction du pool de candidats (une fois au démarrage) ── */
let CAND_BY_LEN = {};      // longueur -> [canon,...]
let WORD_DEF_IDX = new Map(); // canon -> index e[]/f[] choisi (a une vraie déf)

function buildData(){
  const D=window.SEQODS_DATA;
  const byCanon=new Map();
  D.c.forEach((c,i)=>{ (byCanon.get(c)||byCanon.set(c,[]).get(c)).push(i); });
  for(const [canon, idxs] of byCanon){
    let chosen=-1;
    for(const i of idxs){ if(isRealDef(D.f[i])){ chosen=i; break; } }
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
const el=(tag,cls,txt)=>{ const e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; };
const gImgUrl = w => "https://www.google.com/search?tbm=isch&q="+encodeURIComponent(w.toLowerCase());
const wiktUrl = w => "https://fr.wiktionary.org/wiki/"+encodeURIComponent(w.toLowerCase());


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
  shuffle([...Array(canon.length).keys()]).slice(0,nHint).forEach(i=>revealed[i]=true);
  cur={ canon, revealed, solved:false, buf:"", seenBefore, extraHints:0 };
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

  if(cur.seenBefore>0) wrap.appendChild(el("div","q-seen","Déjà vu ("+cur.seenBefore+" fois)"));

  const i=WORD_DEF_IDX.get(cur.canon);
  const D=window.SEQODS_DATA;
  wrap.appendChild(el("div","q-def", cleanDef(D.f[i])));

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
  const bI=el("a","btn-img","🖼 Image"); bI.href=gImgUrl(cur.canon); bI.target="_blank"; bI.rel="noopener";
  const bP=el("button","btn-pass","Passer");
  bP.addEventListener("click", passCard);
  nr.appendChild(bI); nr.appendChild(bP);
  wrap.appendChild(nr);

  m.appendChild(wrap);
  updateDisplay();
}

function revealRandomHint(){
  if(!cur || cur.solved) return;
  const hidden=[]; cur.revealed.forEach((r,idx)=>{ if(!r) hidden.push(idx); });
  if(!hidden.length) return;
  const idx=hidden[Math.floor(Math.random()*hidden.length)];
  cur.revealed[idx]=true;
  cur.extraHints++;
  renderCard();
}

function submitGuess(){
  if(!cur || cur.solved) return;
  const guess=cur.buf.trim();
  if(!guess) return;
  if(guess===cur.canon){ solveCard(); }
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

  const tiles=el("div","q-tiles");
  cur.canon.split("").forEach(ch=> tiles.appendChild(el("div","q-tile revealed",ch)) );
  wrap.appendChild(tiles);

  const D=window.SEQODS_DATA;
  const idxs=[]; D.c.forEach((c,i)=>{ if(c===cur.canon) idxs.push(i); });

  const rev=el("div","q-reveal");
  const h3=el("h3",null, D.e[WORD_DEF_IDX.get(cur.canon)]||cur.canon);
  h3.style.cursor="pointer";
  h3.addEventListener("click",()=>{ try{ openDef(cur.canon); }catch(e){} });
  rev.appendChild(h3);
  rev.appendChild(el("div","q-srs", srsStatusText(cur.canon)));
  idxs.forEach(i=>{
    const line=el("div","q-def-line");
    if(idxs.length>1) line.appendChild(el("div","q-entry", D.e[i]||cur.canon));
    line.appendChild(document.createTextNode(cleanDef(D.f[i])));
    rev.appendChild(line);
  });

  const links=el("div","q-linkrow");
  const img=el("a","mini","🔍 Image"); img.href=gImgUrl(cur.canon); img.target="_blank"; img.rel="noopener";
  const wk=el("a","mini","📖 Wikt"); wk.href=wiktUrl(cur.canon); wk.target="_blank"; wk.rel="noopener";
  links.appendChild(img); links.appendChild(wk);
  rev.appendChild(links);

  wrap.appendChild(rev);

  const nr=el("div","q-next-row");
  const bN=el("button","btn-next","Suivant →");
  bN.addEventListener("click", newCard);
  nr.appendChild(bN);
  wrap.appendChild(nr);

  m.appendChild(wrap);
}

/* ── Clavier virtuel ── */
function press(k){
  if(!cur || cur.solved) return;
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
