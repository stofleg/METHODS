'use strict';

/* ══ FLASHODS — flashcards ODS par groupes d'anagrammes (7 & 8 lettres) ══
   Données réutilisées : window.SEQODS_DATA (../data.js), openDef (../blackscrab/dict.js).
   Persistance : localStorage (pas de répétition espacée). */

const LS_KEY = "flashods-v1";
const LS_SYNC = "flashods-sync";
let store = { rate:{}, dku:{}, douteux:{}, remarq:{}, seen:{}, _ts:0 };   // rate · dku · douteux · remarq (word:1) · seen:{"L:g":{key:1}}
let syncId = "flashods-cl";

function normalizeStore(s){ s=s||{}; s.rate=s.rate||{}; s.dku=s.dku||{}; s.douteux=s.douteux||{}; s.remarq=s.remarq||{}; s.seen=s.seen||{}; s._ts=s._ts||0; return s; }
function load(){
  try{ store = normalizeStore(JSON.parse(localStorage.getItem(LS_KEY)||"{}")); }
  catch{ store = normalizeStore({}); }
  try{ syncId = localStorage.getItem(LS_SYNC) || syncId; }catch{}
}
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(store)); }catch{} }
function save(){ store._ts = Date.now(); saveLocal(); schedulePush(); }

/* ── Synchro Firestore (dernière écriture gagnante par horodatage) ── */
function setSyncStatus(txt){ const el=document.getElementById("sync-status"); if(el) el.textContent=txt; }
async function fbLoadStore(){
  try{
    const r=await fetch(FB_BASE+"/flashods/"+encodeURIComponent(syncId));
    if(!r.ok) return null;
    const f=(await r.json()).fields||{};
    if(!f.data) return null;
    return { store:normalizeStore(JSON.parse(f.data.stringValue)), ts:parseInt(f.ts&&f.ts.integerValue||"0") };
  }catch{ return null; }
}
async function fbSaveStore(){
  const body={ fields:{ data:{stringValue:JSON.stringify(store)}, ts:{integerValue:String(store._ts||0)} } };
  const r=await fetch(FB_BASE+"/flashods/"+encodeURIComponent(syncId),
    {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  if(!r.ok) throw new Error("save "+r.status);
}
let _pushT=null;
function schedulePush(){
  clearTimeout(_pushT); setSyncStatus("… synchro");
  _pushT=setTimeout(()=>{ fbSaveStore().then(()=>setSyncStatus("✓ synchro")).catch(()=>setSyncStatus("⚠︎ hors ligne")); }, 1500);
}
async function syncPull(){
  setSyncStatus("… synchro");
  const remote=await fbLoadStore();
  if(remote && remote.store && (remote.ts||0) > (store._ts||0)){
    store=remote.store; saveLocal();
    if(!g) renderHome();
  }
  setSyncStatus("✓ synchro");
}
function changeSyncCode(){
  const cur=syncId;
  const v=prompt("Code de synchro (identique sur tous tes appareils) :", cur);
  if(v===null) return;
  const code=v.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"") || "flashods-cl";
  syncId=code; try{ localStorage.setItem(LS_SYNC, code); }catch{}
  syncPull();
  renderHome();
}

/* ── Données ── */
let ENTRIES;                 // Set des entrées (canoniques)
let CANON_IDX;               // canon -> premier index dans e/f
let CANON_ALL;               // canon -> tous les index (entrées multiples)
let GROUPS = {7:{1:[],2:[],3:[],4:[]}, 8:{1:[],2:[],3:[],4:[]}};
let RACKS  = {7:new Map(),   8:new Map()};   // clé triée -> [mots]

const GROUP_LABELS = {
  1:{name:"Sans anagramme",              sub:"une entrée, aucun anagramme"},
  2:{name:"+ 1 anagramme (entrée)",      sub:"2 entrées à trouver"},
  3:{name:"+ 2 anagrammes et plus",      sub:"3 entrées ou davantage"},
  4:{name:"Avec forme(s) non-entrée",    sub:"entrée(s) + forme(s) fléchie(s)"},
};

function classifyRack(words){
  let nE=0; for(const w of words) if(ENTRIES.has(w)) nE++;
  const nN=words.length-nE;
  if(nE===0) return 0;         // pas de carte
  if(nN>=1) return 4;
  if(nE===1) return 1;
  if(nE===2) return 2;
  return 3;
}

function buildData(){
  const D=window.SEQODS_DATA;
  ENTRIES=new Set(D.c);
  CANON_IDX=new Map(); CANON_ALL=new Map();
  D.c.forEach((c,i)=>{ if(!CANON_IDX.has(c)) CANON_IDX.set(c,i); (CANON_ALL.get(c)||CANON_ALL.set(c,[]).get(c)).push(i); });
  for(const w of D.d){
    const L=w.length; if(L!==7 && L!==8) continue;
    const k=w.split("").sort().join("");
    let a=RACKS[L].get(k); if(!a){ a=[]; RACKS[L].set(k,a); }
    a.push(w);
  }
  for(const L of [7,8]){
    for(const [k,words] of RACKS[L]){
      const g=classifyRack(words); if(g) GROUPS[L][g].push(k);
    }
  }
}

/* Infos d'une entrée : forme affichée COMPLÈTE (ex. "RAPPEUR, EUSE") */
function entryInfo(canon){
  const i=CANON_IDX.get(canon); if(i===undefined) return null;
  const D=window.SEQODS_DATA;
  return { disp:D.e[i]||canon, def:D.f[i]||"" };
}

/* Forme accentuée d'un mot pour les liens externes (Wiktionnaire, Image) —
   ex. MAZEAGE → mazéage, sans quoi Wiktionnaire ne trouve pas la page.
   Pour une forme fléchie (pas une entrée), on tente de reconstituer
   l'accent depuis l'entrée dont elle dérive par simple suffixe. */
function accentedForm(w){
  const info=entryInfo(w);
  if(info) return info.disp.split(",")[0].trim().replace(/\*/g,"");
  for(const lemma of flechieDe(w)){
    if(!w.startsWith(lemma)) continue;
    const li=entryInfo(lemma); if(!li) continue;
    return li.disp.split(",")[0].trim().replace(/\*/g,"") + w.slice(lemma.length);
  }
  return w;
}

/* ── Résolution des définitions ──
   Objectif : montrer une VRAIE définition, pas juste « (= rappeur) ».
   Uniquement la glose ODS, en suivant ses renvois « (= …) » — plus de
   repli sur les définitions personnalisées Wiktionnaire (rech_custom). */
const FB_BASE = "https://firestore.googleapis.com/v1/projects/methods-8e4b1/databases/(default)/documents";
const _fnorm = w => (w||"").toUpperCase().replace(/Œ/g,"OE").replace(/Æ/g,"AE").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Z]/g,"");
const _POS_PFX = /^(?:(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part|préf|suff|aff|sym|m|f|pl)\.(?:\s+et\s+(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part|préf|suff|aff|sym|m|f|pl)\.)*\s*)+/i;
function _gloss(def){
  let s=String(def||"");
  s=s.replace(/\[[^\]]*\]/g," ")                    // prononciation [..]
     .replace(/\(=\s*[^)]*\)/g," ")                 // renvois (= ..)
     .replace(/-->[^.]*\.?/g," ")                   // redirections
     .replace(/-\s*Féminin accepté\.?\s*\(\d+\)/gi," ")
     .replace(/^\s*\/\s*\S+/,"")                    // "/ aiguiller" en tête
     .replace(_POS_PFX,"")                          // nature
     .replace(/\b\d+\.?/g," ");                     // numéros / renvois conj
  return s.replace(/\s+/g," ").trim();
}
const _isGloss = def => { const gg=_gloss(def); return gg.length>3 && /[A-Za-zÀ-ÿ]{4}/.test(gg); };

/* ── Correction des renvois ODS asymétriques (ex. CRITHME manquait le
   renvoi vers CRITHMUM alors que CRITHMUM renvoie vers CRITHME) ──
   Chargée une fois depuis Firestore config/renvoi_corrections — SEUL
   accès Firestore de FLASHODS pour les définitions (le repli
   Wiktionnaire général a été retiré, cf. version précédente) ;
   pas de modification de data.js (cf. CLAUDE.md). */
let _renvoiCorrections=null;
async function loadRenvoiCorrections(){
  try{
    const r=await fetch(FB_BASE+"/config/renvoi_corrections");
    if(!r.ok){ _renvoiCorrections={}; return; }
    const f=(await r.json()).fields||{};
    _renvoiCorrections = f.data ? JSON.parse(f.data.stringValue) : {};
  }catch{ _renvoiCorrections={}; }
}
function injectRenvoi(text, canon){
  const add=_renvoiCorrections && _renvoiCorrections[canon];
  if(!add || !add.length) return text;
  const s=String(text||"");
  const m=s.match(_POS_PFX);
  const renvoiTxt="(= "+add.map(w=>w.toLowerCase()).join(", ")+")";
  if(m){
    const pfx=m[0].replace(/\s+$/,"");
    const rest=s.slice(m[0].length).trim();
    return pfx+" "+renvoiTxt+(rest?" "+rest:"");
  }
  return renvoiTxt+" "+s;
}
function rawDef(canon){ const i=CANON_IDX.get(canon); return i===undefined?"":injectRenvoi(window.SEQODS_DATA.f[i]||"", canon); }
// Verbe à participe passé invariable (hors « (p.p.inv. mais …) »)
function isPpinv(w){ const m=(rawDef(w)||"").match(/\(p\.p\.inv\.?[^)]*\)/i); return !!m && !/mais/i.test(m[0]); }
function refsOf(def){
  const out=[]; const s=String(def||"");
  (s.match(/\(=\s*([^)]*)\)/g)||[]).forEach(seg=>{
    seg.replace(/\(=\s*|\)/g,"").split(/[,;]/).forEach(x=>{ const c=_fnorm(x); if(c) out.push(c); });
  });
  let r=/\/\s*([A-Za-zà-ÿ]+)/.exec(s); if(r){ const c=_fnorm(r[1]); if(c) out.push(c); }
  r=/-->\s*([A-Za-zà-ÿ]+)/.exec(s);   if(r){ const c=_fnorm(r[1]); if(c) out.push(c); }
  return out;
}
function bestOdsGloss(canon){
  const seen=new Set(); const q=[canon]; let n=0;
  while(q.length && n<8){ const c=q.shift(); if(seen.has(c))continue; seen.add(c); n++;
    const d=rawDef(c); if(!d) continue;
    if(_isGloss(d)) return d;
    refsOf(d).forEach(x=>{ if(!seen.has(x)) q.push(x); });
  }
  return null;
}
// Glose en partant d'une déf précise (suit ses renvois). null si aucune.
// {from} = canon dont le texte a été emprunté (null si c'est startDef lui-même).
function bestOdsGlossDef(startDef){
  if(_isGloss(startDef)) return {text:startDef, from:null};
  const seen=new Set(); const q=refsOf(startDef).slice(); let n=0;
  while(q.length && n<8){ const c=q.shift(); if(seen.has(c))continue; seen.add(c); n++;
    const d=rawDef(c); if(!d) continue;
    if(_isGloss(d)) return {text:d, from:c};
    refsOf(d).forEach(x=>{ if(!seen.has(x)) q.push(x); });
  }
  return null;
}
// Remplit une ligne à partir d'une déf : glose ODS uniquement (plus de repli
// Wiktionnaire Firestore — FLASHODS ne consulte plus rech_custom).
function fillDefLine(def, canon, line){
  const g=bestOdsGlossDef(def);
  let text = g ? g.text : (def || "…");
  if(g && g.from) text=_fixSelfRenvoi(text, canon, g.from, entryInfo(g.from)?.disp);
  line.textContent = text;
}
// .sol-def : une déf par entrée (mots à entrées multiples : AMPOULE/AMPOULÉ…),
// chaque entrée précédée de sa forme affichée.
function fillDef(canon, elDef){
  const idxs=CANON_ALL.get(canon)||[];
  if(idxs.length<=1){ fillDefLine(rawDef(canon), canon, elDef); return; }
  elDef.textContent="";
  const D=window.SEQODS_DATA;
  idxs.forEach(i=>{
    const line=el("div","def-line");
    line.appendChild(el("div","def-entry", D.e[i]||canon));
    const dd=el("div"); line.appendChild(dd);
    fillDefLine(D.f[i]||"", canon, dd);
    elDef.appendChild(line);
  });
}

/* ── Utilitaires ── */
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
const gImgUrl = w => "https://www.google.com/search?tbm=isch&q="+encodeURIComponent(w.toLowerCase());
const wiktUrl = w => "https://fr.wiktionary.org/wiki/"+encodeURIComponent(w.toLowerCase());
const el = (tag,cls,txt)=>{ const e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; };

/* ── État de jeu ── */
let g = null;   // {L, group, mode, queue, pos, key, revealed, found}

const $home = ()=>document.getElementById("view-home");
const $game = ()=>document.getElementById("view-game");
function showHome(){ g=null; $game().classList.add("hidden"); $home().classList.remove("hidden");
  document.getElementById("btn-home").classList.add("hidden"); renderHome(); }
function showGame(){ $home().classList.add("hidden"); $game().classList.remove("hidden");
  document.getElementById("btn-home").classList.remove("hidden"); }

/* ── Accueil ── */
let curLen = 7;
let memoList = null;   // null | 'douteux' | 'dku' | 'remarq'
function renderHome(){
  const m=$home(); m.innerHTML="";
  if(memoList){ renderMemoList(m, memoList); appendSync(m); return; }

  const seg=el("div","seg");
  [7,8].forEach(L=>{
    const b=el("button",(L===curLen?"active":""),L+" lettres");
    b.addEventListener("click",()=>{ curLen=L; renderHome(); });
    seg.appendChild(b);
  });
  m.appendChild(seg);

  for(const gid of [1,2,3,4]){
    const total=GROUPS[curLen][gid].length;
    const done=seenCount(curLen,gid);
    const rk=rateCount(curLen,gid);
    const b=el("button","grp-btn"); b.disabled=total===0;
    const left=el("div");
    left.appendChild(el("div","g-name",GROUP_LABELS[gid].name));
    left.appendChild(el("div","g-sub",GROUP_LABELS[gid].sub));
    let prog = "vus "+done+" / "+total + (done>=total&&total>0 ? " ✓" : "");
    if(rk) prog += " · "+rk+" raté"+(rk>1?"s":"");
    left.appendChild(el("div","g-prog",prog));
    b.appendChild(left);
    b.appendChild(el("div","g-count",String(total)));
    b.addEventListener("click",()=>startPlay(curLen,gid,"group"));
    m.appendChild(b);
  }

  // Mémo : douteux / définitions non connues / remarquables (listes)
  m.appendChild(el("div","home-sep","Mémo"));
  const addMemo=(key,label,map)=>{
    const b=el("button","grp-btn");
    const l=el("div"); l.appendChild(el("div","g-name",label));
    b.appendChild(l); b.appendChild(el("div","g-count",String(Object.keys(map).length)));
    b.addEventListener("click",()=>{ memoList=key; renderHome(); });
    m.appendChild(b);
  };
  addMemo("douteux","🤔 Douteux",store.douteux);
  addMemo("dku","🧐 Définitions non connues",store.dku);
  addMemo("remarq","😲 Remarquables",store.remarq);

  appendSync(m);
}
function appendSync(m){
  const sync=el("div","sync-line");
  const st=el("span","sync-st"); st.id="sync-status"; st.textContent="✓ synchro";
  const code=el("button","sync-code","code : "+syncId);
  code.addEventListener("click",changeSyncCode);
  sync.appendChild(st); sync.appendChild(code);
  m.appendChild(sync);
}
function renderMemoList(m, key){
  const maps={douteux:store.douteux, dku:store.dku, remarq:store.remarq};
  const labels={douteux:"🤔 Douteux", dku:"🧐 Définitions non connues", remarq:"😲 Remarquables"};
  const map=maps[key];
  const back=el("button","memo-back","← Mémo"); back.addEventListener("click",()=>{ memoList=null; renderHome(); });
  m.appendChild(back);
  const words=Object.keys(map).sort();
  m.appendChild(el("div","home-sep", labels[key]+" ("+words.length+")"));
  if(!words.length){ m.appendChild(el("p",null,"Liste vide.")); return; }
  words.forEach(w=>{
    const row=el("div","dou-row");
    const name=el("span","dou-word", entryInfo(w)?entryInfo(w).disp:w);
    name.addEventListener("click",()=>openCard(w));
    const rm=el("button","dou-rm","✕");
    rm.addEventListener("click",()=>{ delete map[w]; save(); renderHome(); });
    row.appendChild(name); row.appendChild(rm);
    m.appendChild(row);
  });
}

/* Modale « fiche complète » d'une entrée (carte hors jeu) */
const rackKey = w => w.split("").sort().join("");
function tirageEl(key, onClick){
  const t=el("div","tirage"+(onClick?" clickable":""));
  key.split("").forEach(c=> t.appendChild(el("div","tile",c)) );
  if(onClick) t.addEventListener("click",onClick);
  return t;
}
function rackWords(key){
  return ((window.SEQODS_DATA.a||{})[key]||[key]).slice()
    .sort((a,b)=> (ENTRIES.has(b)?1:0)-(ENTRIES.has(a)?1:0) || (a<b?-1:1));
}
function openCard(w){
  const body=document.getElementById("card-modal-body"); if(!body) return;
  const key=rackKey(w);
  body.innerHTML="";
  const t=document.getElementById("card-title"); if(t) t.textContent=(entryInfo(w)?entryInfo(w).disp:w);
  const content=el("div");
  let navFn;
  const showRack=()=>{ content.innerHTML=""; rackWords(key).forEach(x=> content.appendChild(renderSolution(x, navFn))); };
  navFn=(word)=>{ content.innerHTML=""; content.appendChild(renderSolution(word, navFn)); const p=document.getElementById("card-panel"); if(p) p.scrollTop=0; };
  body.appendChild(tirageEl(key, showRack));
  body.appendChild(content);
  navFn(w);   // fiche du mot cliqué
  document.getElementById("card-modal").classList.add("open");
}
function closeCard(){ document.getElementById("card-modal")?.classList.remove("open"); }

/* ── Progression par groupe ── */
function seenSet(L,group){ const sk=L+":"+group; return store.seen[sk]||(store.seen[sk]={}); }
function seenCount(L,group){ return Object.keys(seenSet(L,group)).length; }
function rateCount(L,group){ return GROUPS[L][group].filter(k=>store.rate[k]).length; }

// Compteur in-game (grand). Le nombre est cliquable → liste des mots déjà vus.
function progEl(){
  const d=el("div","prog");
  if(g.mode==="rate") d.appendChild(document.createTextNode("Ratés · "));
  const cur=(g.baseDone||0)+g.pos+1;
  const n=el("span","prog-num", String(cur));
  n.addEventListener("click",showSeenList);
  d.appendChild(n);
  d.appendChild(document.createTextNode(" / "+(g.total||g.queue.length)));
  return d;
}

/* ── Lancer une session de tirages ── */
function startPlay(L,group,mode){
  if(mode==="rate"){
    const keys=GROUPS[L][group].filter(k=>store.rate[k]);
    if(!keys.length){ showHome(); return; }
    g={ L, group, mode, queue:shuffle(keys), pos:0, max:0, total:keys.length, baseDone:0, done:new Set() };
    showGame(); renderCard(); return;
  }
  // mode "group" : reprendre sur les tirages non encore vus
  const seen=seenSet(L,group);
  const total=GROUPS[L][group].length;
  const unseen=GROUPS[L][group].filter(k=>!seen[k]);
  g={ L, group, mode:"group", queue:shuffle(unseen), pos:0, max:0, total, baseDone:total-unseen.length, done:new Set() };
  showGame();
  if(!unseen.length) endScreen();   // tout vu → écran de fin (rejeu / ratés / reset)
  else renderCard();
}
function resetGroup(L,group){ delete store.seen[L+":"+group]; save(); }

/* Construit la vue jeu : zone défilante + pied fixe. Renvoie {scroll,foot}. */
// Navigation entre les solutions d'un même tirage (swipe sur la carte solution).
// Renseignée par reveal() ; remise à null par gameScreen() à chaque changement
// d'écran, pour que le swipe retombe sur la navigation entre tirages.
let solNav = null;

function gameScreen(){
  const m=$game(); m.innerHTML="";
  solNav=null;
  const scroll=el("div","g-scroll");
  const foot=el("div","g-foot");
  m.appendChild(scroll); m.appendChild(foot);
  return {scroll,foot};
}

// Indicateur « 2 / 3 » + flèches, quand un tirage a plusieurs solutions.
// Les flèches doublent le swipe (indispensable sur ordinateur).
function solPagerEl(idx, total, onPrev, onNext){
  const p=el("div","sol-pager");
  const bP=el("button","sol-pager-b","‹"); bP.disabled=idx<=0;
  bP.addEventListener("click",onPrev);
  const bN=el("button","sol-pager-b","›"); bN.disabled=idx>=total-1;
  bN.addEventListener("click",onNext);
  p.appendChild(bP);
  p.appendChild(el("span","sol-pager-n",(idx+1)+" / "+total));
  p.appendChild(bN);
  return p;
}

function renderCard(){
  const {scroll,foot}=gameScreen();
  const key=g.queue[g.pos]; g.key=key; g.revealed=false;
  const words=RACKS[g.L].get(key)||[];
  const nSol=words.length;

  const wrap=el("div","card-wrap");
  wrap.appendChild(progEl());

  const tir=el("div","tirage");
  key.split("").forEach(c=> tir.appendChild(el("div","tile",c)) );
  wrap.appendChild(tir);

  if(nSol>1) wrap.appendChild(el("div","hint", nSol+" solutions à trouver"));
  scroll.appendChild(wrap);

  const act=el("div","actions");
  const bGive=el("button","btn-give","Abandon");
  const bFound=el("button","btn-found","Trouvé");
  bGive.addEventListener("click",()=>reveal(false));
  bFound.addEventListener("click",()=>reveal(true));
  act.appendChild(bGive); act.appendChild(bFound);
  foot.appendChild(act);
}

function reveal(found, review){
  g.revealed=true; g.found=found;
  const key=g.queue[g.pos]; g.key=key;
  if(!review){
    if(found) delete store.rate[key];                 // Trouvé → plus raté
    else store.rate[key]=1;                            // Abandon → raté auto
    seenSet(g.L,g.group)[key]=1;                        // marquer comme vu
    if(g.done) g.done.add(g.pos);                       // fiche révélée (mémorise son état)
    save();
  }

  const {scroll,foot}=gameScreen();
  const wrap=el("div","card-wrap");
  wrap.appendChild(progEl());

  // Tirage-quiz épinglé (cliquable → revenir aux solutions d'origine)
  const solWords=(RACKS[g.L].get(key)||[]).slice()
    .sort((a,b)=> (ENTRIES.has(b)?1:0)-(ENTRIES.has(a)?1:0) || (a<b?-1:1));
  // Une seule solution affichée à la fois : on navigue par swipe sur la carte
  // (ou via les flèches du pager) au lieu de faire défiler une longue liste.
  // solList = solutions du tirage ; en détour (clic sur un mot lié) elle se
  // réduit au mot visité, le clic sur le tirage ramenant aux solutions.
  const content=el("div");
  let navFn, nav, solList=solWords, solIdx=0;
  const renderSol=()=>{
    content.innerHTML="";
    if(solList.length>1)
      content.appendChild(solPagerEl(solIdx, solList.length, ()=>nav.prev(), ()=>nav.next()));
    content.appendChild(renderSolution(solList[solIdx], navFn));
    scroll.scrollTop=0;
  };
  const showOriginal=()=>{ solList=solWords; solIdx=0; renderSol(); };
  navFn=(word)=>{ solList=[word]; solIdx=0; renderSol(); };
  nav={
    prev(){ if(solIdx>0){ solIdx--; renderSol(); } },
    next(){ if(solIdx<solList.length-1){ solIdx++; renderSol(); } }
  };
  solNav=nav;
  wrap.appendChild(tirageEl(key, showOriginal));
  wrap.appendChild(content);
  scroll.appendChild(wrap);
  showOriginal();

  const rv=el("div","rv-actions");
  const bR=el("button","btn-markrate"+(store.rate[key]?" on":""), store.rate[key]?"✓ raté":"Raté");
  bR.addEventListener("click",()=>{
    if(store.rate[key]) delete store.rate[key]; else store.rate[key]=1;
    save();
    bR.textContent=store.rate[key]?"✓ raté":"Raté"; bR.classList.toggle("on", !!store.rate[key]);
  });
  rv.appendChild(bR);
  const _atEnd = (g.max||0)+1>=g.queue.length;
  const bN=el("button","btn-next", _atEnd ? "Terminer" : "Suivant");
  bN.addEventListener("click",next);
  rv.appendChild(bN);
  foot.appendChild(rv);
}

function renderSolution(w, navFn){
  const isEntry=ENTRIES.has(w);
  const box=el("div","sol"+(isEntry?"":" form"));
  const top=el("div","sol-top");
  const info=isEntry?entryInfo(w):null;
  const word=el("span","sol-word"+(isPpinv(w)?" ppinv":""), info?info.disp:w);
  word.addEventListener("click",()=>{ try{ openDef(w); }catch(e){} });
  top.appendChild(word);
  if(!isEntry) top.appendChild(el("span","sol-tag","forme"));
  box.appendChild(top);

  if(isEntry){ const d=el("div","sol-def","…"); box.appendChild(d); fillDef(w, d); }
  const fdl=flechieDe(w);
  if(fdl.length){
    const fd=el("div","sol-flechie");
    fd.appendChild(document.createTextNode("forme fléchie de "));
    fdl.forEach(x=>{ const a=el("a","chip"+(isPpinv(x)?" ppinv":""),x); a.href="#";
      a.addEventListener("click",ev=>{ ev.preventDefault(); (navFn||openCard)(x); }); fd.appendChild(a); });
    box.appendChild(fd);
  } else if(!isEntry){
    box.appendChild(el("div","sol-def","Forme fléchie — touche le mot pour la fiche."));
  }

  const btns=el("div","sol-btns");
  const disp=accentedForm(w);
  const img=el("a","mini","🔍 Image"); img.href=gImgUrl(disp); img.target="_blank"; img.rel="noopener";
  const wk=el("a","mini","📖 Wikt"); wk.href=wiktUrl(disp); wk.target="_blank"; wk.rel="noopener";
  btns.appendChild(img); btns.appendChild(wk);
  const tagBtn=(map,cls,emoji)=>{
    const b=el("button","mini tag "+cls+(map[w]?" on":""),emoji);
    b.addEventListener("click",()=>{ if(map[w]){ delete map[w]; b.classList.remove("on"); } else { map[w]=1; b.classList.add("on"); } save(); });
    btns.appendChild(b);
  };
  tagBtn(store.douteux,"dou","🤔");
  tagBtn(store.dku,"dku","🧐");
  tagBtn(store.remarq,"rem","😲");
  box.appendChild(btns);

  const ana=wordChips("Anagrammes", anagrammesOf(w), navFn); if(ana) box.appendChild(ana);
  const app=wordChips("Appuis", appuisOf(w), navFn); if(app) box.appendChild(app);
  const ral=wordChips("Rallonges initiales", rallongesOf(w), navFn); if(ral) box.appendChild(ral);
  const ralF=wordChips("Rallonges finales", rallongesFinOf(w), navFn); if(ralF) box.appendChild(ralF);
  const cou=wordChips("Cousins", cousinsOf(w), navFn); if(cou) box.appendChild(cou);
  const aph=wordChips("Aphérèse", apheresesOf(w), navFn); if(aph) box.appendChild(aph);
  const apo=wordChips("Apocope", apocopesOf(w), navFn); if(apo) box.appendChild(apo);
  return box;
}

// Affiche la fiche à la position pos, dans son dernier état
// (solution si déjà révélée, sinon quiz).
function showCardAt(pos){
  g.pos=pos;
  if(g.done && g.done.has(pos)) reveal(true, true);
  else renderCard();
}
// Swipe droite → fiche précédente
function goBack(){
  if(!g) return;
  if(g.mode==="dku"){ if(g.pos>0){ g.pos--; revealDku(g.queue[g.pos]); } return; }
  if(g.pos>0) showCardAt(g.pos-1);
}
// Swipe gauche → revient vers la fiche en cours (borné à la position atteinte),
// dans son dernier état ; ne crée pas de nouveau quiz.
function returnForward(){
  if(!g) return;
  if(g.mode==="dku"){ if(g.pos<g.queue.length-1){ g.pos++; revealDku(g.queue[g.pos]); } return; }
  if(g.pos < (g.max||0)) showCardAt(g.pos+1);
}
// Bouton Suivant → quiz suivant (nouvelle fiche, face quiz)
function next(){
  if(!g) return;
  if(g.mode==="dku"){ if(g.pos<g.queue.length-1){ g.pos++; revealDku(g.queue[g.pos]); } else showHome(); return; }
  if((g.max||0)+1 < g.queue.length){ g.max=(g.max||0)+1; showCardAt(g.max); }
  else endScreen();
}
// Liste alphabétique des entrées déjà vues dans le groupe en cours (ne modifie
// pas g : « ← Reprendre » revient exactement où la partie en était).
function showSeenList(){
  const L=g.L, group=g.group;
  const keys=Object.keys(seenSet(L,group));
  const wordsSet=new Set();
  keys.forEach(k=>{ (RACKS[L].get(k)||[]).forEach(w=>{ if(ENTRIES.has(w)) wordsSet.add(w); }); });
  const words=[...wordsSet].sort((a,b)=>a.localeCompare(b,"fr"));

  const {scroll,foot}=gameScreen();
  const wrap=el("div","card-wrap");
  wrap.appendChild(el("div","prog","Mots vus ("+words.length+")"));
  words.forEach(w=>{
    const row=el("div","dou-row");
    const name=el("span","dou-word", entryInfo(w)?entryInfo(w).disp:w);
    name.addEventListener("click",()=>openCard(w));
    row.appendChild(name);
    wrap.appendChild(row);
  });
  scroll.appendChild(wrap);

  const back=el("button","btn-next","← Reprendre");
  back.addEventListener("click",()=>{ if(g.done && g.done.has(g.pos)) reveal(true,true); else renderCard(); });
  foot.appendChild(back);
}

function endScreen(){
  const m=$game(); m.innerHTML="";
  const e=el("div","end");
  const total=GROUPS[g.L][g.group].length;
  e.appendChild(el("h2","Groupe terminé !"));
  const rk=rateCount(g.L,g.group);
  e.appendChild(el("div","hint", total+" tirage(s) vus. Ratés dans ce groupe : "+rk));
  const box=el("div"); box.style.marginTop="18px";
  if(rk){
    const b=el("button","start-btn","↻ Rejouer les ratés ("+rk+")");
    b.addEventListener("click",()=>startPlay(g.L,g.group,"rate"));
    box.appendChild(b);
  }
  const again=el("button","start-btn sec","Recommencer le groupe (remet à zéro)");
  again.addEventListener("click",()=>{ resetGroup(g.L,g.group); startPlay(g.L,g.group,"group"); });
  const home=el("button","start-btn sec","Accueil");
  home.addEventListener("click",showHome);
  box.appendChild(again); box.appendChild(home);
  e.appendChild(box);
  m.appendChild(e);
}

/* ── Révision « définitions non connues » ── */
function startDku(L){
  const words=shuffle(Object.keys(store.dku).filter(w=>w.length===L));
  if(!words.length){ showHome(); return; }
  g={ L, mode:"dku", queue:words, pos:0 };
  showGame(); renderDku();
}
function renderDku(){
  const {scroll,foot}=gameScreen();
  const w=g.queue[g.pos];
  const wrap=el("div","card-wrap");
  wrap.appendChild(el("div","prog","Définitions non connues · "+(g.pos+1)+" / "+g.queue.length));
  const tir=el("div","tirage");
  w.split("").forEach(c=> tir.appendChild(el("div","tile",c)) );
  wrap.appendChild(tir);
  scroll.appendChild(wrap);
  const act=el("div","actions");
  const b=el("button","btn-found","Voir la définition");
  b.addEventListener("click",()=>revealDku(w));
  act.appendChild(b);
  foot.appendChild(act);
}
function revealDku(w){
  const {scroll,foot}=gameScreen();
  const wrap=el("div","card-wrap");
  wrap.appendChild(el("div","prog","Définitions non connues · "+(g.pos+1)+" / "+g.queue.length));
  wrap.appendChild(renderSolution(w));
  scroll.appendChild(wrap);
  const rv=el("div","rv-actions");
  const learned=el("button","btn-markrate","Définition apprise");
  learned.style.color="var(--green)"; learned.style.borderColor="var(--green)";
  learned.addEventListener("click",()=>{ delete store.dku[w]; save(); dkuNext(); });
  const bN=el("button","btn-next", g.pos+1>=g.queue.length?"Terminer":"Suivant");
  bN.addEventListener("click",dkuNext);
  rv.appendChild(learned); rv.appendChild(bN);
  foot.appendChild(rv);
}
function dkuNext(){ g.pos++; if(g.pos>=g.queue.length) showHome(); else renderDku(); }

/* ── Recherche dictionnaire (clavier custom, façon METHODS) ── */
let _DICT=null;
function dictSet(){ if(!_DICT) _DICT=new Set(window.SEQODS_DATA.d||[]); return _DICT; }
let _SORTED=null;
function sortedDict(){ if(!_SORTED) _SORTED=(window.SEQODS_DATA.d||[]).slice().sort(); return _SORTED; }
function candidates(prefix, limit){
  if(!prefix) return [];
  const arr=sortedDict();
  let lo=0, hi=arr.length;
  while(lo<hi){ const m=(lo+hi)>>1; if(arr[m]<prefix) lo=m+1; else hi=m; }
  const out=[];
  for(let i=lo;i<arr.length && out.length<limit;i++){
    if(arr[i].startsWith(prefix)) out.push(arr[i]); else break;
  }
  return out;
}
let searchBuf="";
function updateSearchDisp(){ const d=document.getElementById("search-disp"); if(d) d.textContent=searchBuf; }
function openSearch(){
  const ov=document.getElementById("search-ov"); if(!ov) return;
  searchBuf=""; updateSearchDisp();
  document.getElementById("search-res").innerHTML="";
  ov.classList.add("open");
}
function closeSearch(){ document.getElementById("search-ov")?.classList.remove("open"); }
function doSearch(){
  const res=document.getElementById("search-res"); if(!res) return; res.innerHTML="";
  const w=searchBuf; if(!w) return;
  const valid=dictSet().has(w);
  if(valid){
    res.appendChild(el("div","search-msg ok","✓ mot valide"));
    res.appendChild(renderSolution(w));
  }
  // Candidats : mots commençant par la saisie
  const cands=candidates(w,80).filter(x=>x!==w);
  if(cands.length){
    const sec=el("div","sol-extra");
    sec.appendChild(el("span","sol-extra-t","Commençant par "+w+" ("+cands.length+(cands.length>=80?"+":"")+") : "));
    cands.forEach(x=>{
      const a=el("a","chip",x); a.href="#";
      a.addEventListener("click",ev=>{ ev.preventDefault(); searchBuf=x; updateSearchDisp(); doSearch(); res.scrollTop=0; });
      sec.appendChild(a);
    });
    res.appendChild(sec);
  } else if(!valid){
    res.appendChild(el("div","search-msg no","✗ aucun mot"));
  }
}
function searchKey(k){
  if(k==="CLR") searchBuf="";
  else if(k==="DEL") searchBuf=searchBuf.slice(0,-1);
  else if(/^[A-Z]$/.test(k)) searchBuf+=k;
  updateSearchDisp(); doSearch();
}
function wireSearch(){
  document.getElementById("btn-search")?.addEventListener("click",openSearch);
  document.getElementById("search-close")?.addEventListener("click",closeSearch);
  const kb=document.getElementById("search-kb");
  if(kb){
    const press=e=>{ const b=e.target.closest(".skk"); if(!b) return; e.preventDefault(); searchKey(b.dataset.k); };
    kb.addEventListener("touchstart",press,{passive:false});
    kb.addEventListener("mousedown",press);
    kb.addEventListener("click",e=>{ if(e.target.closest(".skk")) e.preventDefault(); });
  }
  // Clavier physique (ordinateur) : lettres, Retour = effacer.
  document.addEventListener("keydown",e=>{
    if(!document.getElementById("search-ov")?.classList.contains("open")) return;
    if(e.key==="Backspace"){ e.preventDefault(); searchKey("DEL"); return; }
    if(e.key==="Escape"){ e.preventDefault(); closeSearch(); return; }
    if(/^[a-zA-Z]$/.test(e.key)){ searchKey(e.key.toUpperCase()); }
  });
}

/* ── Rallonges (avant) & cousins (1 lettre de différence) ── */
const _AZ="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function rallongesOf(w){ return ((window.SEQODS_DATA.r||{})[w]||[]).filter(x=>x.endsWith(w)); }
// Rallonges finales : mots commençant par w (lettres ajoutées à la fin),
// en excluant les simples formes fléchies de l'entrée (ex. ECUELLE → ECUELLEE, pas ECUELLES).
function rallongesFinOf(w){
  const arr=sortedDict(); const out=[];
  let lo=0,hi=arr.length; while(lo<hi){ const m=(lo+hi)>>1; if(arr[m]<w) lo=m+1; else hi=m; }
  for(let i=lo;i<arr.length && arr[i].startsWith(w) && out.length<200;i++){
    const v=arr[i]; if(v.length<=w.length) continue;
    if(!ENTRIES.has(v)) continue;                                   // seulement des entrées
    if(typeof findLemma==="function" && findLemma(v)===w) continue; // pas une forme fléchie de l'entrée
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
// Aphérèse : mot obtenu en retirant la 1re lettre (ENOUAGE → NOUAGE)
function apheresesOf(w){ const D=dictSet(); if(w.length>=3){ const v=w.slice(1); if(D.has(v)) return [v]; } return []; }
// Apocope : mot obtenu en retirant la dernière lettre
function apocopesOf(w){ const D=dictSet(); if(w.length>=3){ const v=w.slice(0,-1); if(D.has(v)) return [v]; } return []; }

// Index sorted-letters -> [mots] pour une longueur donnée, construit à partir
// de TOUT window.SEQODS_DATA.d (entrées + formes fléchies), une fois par
// longueur puis mis en cache.
const _RACKS_BY_LEN_ALL={};
function racksAllForLen(L){
  if(!_RACKS_BY_LEN_ALL[L]){
    const M=new Map();
    for(const w of window.SEQODS_DATA.d){
      if(w.length!==L) continue;
      const key=w.split("").sort().join("");
      let arr=M.get(key); if(!arr){ arr=[]; M.set(key,arr); }
      arr.push(w);
    }
    _RACKS_BY_LEN_ALL[L]=M;
  }
  return _RACKS_BY_LEN_ALL[L];
}
// Anagrammes : mêmes lettres, ordre différent (entrées + formes fléchies).
function anagrammesOf(w){
  const M=racksAllForLen(w.length);
  const key=w.split("").sort().join("");
  return (M.get(key)||[]).filter(x=>x!==w);
}
// Appuis : mots obtenus en ajoutant UNE lettre n'importe où (réarrangement
// complet autorisé, comme un anagramme + 1 lettre).
function appuisOf(w){
  const M=racksAllForLen(w.length+1);
  const base=w.split("").sort();
  const out=new Set();
  for(const c of _AZ){
    const key=[...base,c].sort().join("");
    (M.get(key)||[]).forEach(x=>{ if(x!==w) out.add(x); });
  }
  return [...out];
}
// Lemme(s) dont le mot est une forme fléchie (verbe conjugué / autre entrée)
function flechieDe(w){
  const out=new Set();
  if(typeof _findConjLemma==="function"){ const v=_findConjLemma(w); if(v && v!==w) out.add(v); }
  if(typeof findLemma==="function"){ const l=findLemma(w); if(l && l!==w && ENTRIES.has(l)) out.add(l); }
  return [...out];
}
function wordChips(title, words, navFn){
  if(!words || !words.length) return null;
  const sec=el("div","sol-extra");
  sec.appendChild(el("span","sol-extra-t", title+" ("+words.length+") : "));
  words.slice(0,80).forEach(x=>{
    const a=el("a","chip"+(ENTRIES.has(x)?"":" form")+(isPpinv(x)?" ppinv":""),x); a.href="#";
    a.addEventListener("click",ev=>{ ev.preventDefault(); (navFn||openCard)(x); });
    sec.appendChild(a);
  });
  return sec;
}

/* ── Pull-to-refresh (PWA : pas de rafraîchissement natif) ── */
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
    if(dy>4){
      ptr.classList.add("show");
      ptr.classList.toggle("ready", dy>THRESH);
      ptr.style.transform="translateY("+Math.min(dy-40, THRESH)+"px)";
    } else { ptr.classList.remove("show","ready"); ptr.style.transform=""; }
  },{passive:true});
  document.addEventListener("touchend",()=>{
    if(!pulling) return; pulling=false;
    if(dy>THRESH){ ptr.classList.add("spinning"); ptr.style.transform=""; setTimeout(()=>location.reload(),150); }
    else { ptr.classList.remove("show","ready"); ptr.style.transform=""; }
  },{passive:true});
}

/* ── Init ── */
async function init(){
  if(!window.SEQODS_DATA){ $home().innerHTML="<p style='color:var(--red);padding:20px'>Données ODS introuvables.</p>"; return; }
  load();
  await loadRenvoiCorrections();
  buildData();
  if(typeof wireDefModal==="function") wireDefModal();
  document.getElementById("btn-home").addEventListener("click",showHome);
  document.getElementById("card-close")?.addEventListener("click",closeCard);
  document.getElementById("card-bd")?.addEventListener("click",closeCard);
  wireSearch();
  initPTR();
  // Swipe : sur une carte solution → solution précédente/suivante du tirage ;
  // partout ailleurs (tirage, progression…) → fiche précédente/suivante.
  // Ignoré si la recherche ou une modale est ouverte.
  let sx=0,sy=0,st=false,sInSol=false;
  const gameActive=()=>{
    const gv=document.getElementById("view-game");
    if(!gv || gv.classList.contains("hidden")) return false;
    if(document.getElementById("search-ov")?.classList.contains("open")) return false;
    if(document.getElementById("card-modal")?.classList.contains("open")) return false;
    return true;
  };
  document.addEventListener("touchstart",e=>{
    if(e.touches.length!==1 || !gameActive()){ st=false; return; }
    sx=e.touches[0].clientX; sy=e.touches[0].clientY; st=true;
    // Mémorisé au départ du geste : le contenu est re-rendu à chaque navigation.
    sInSol = !!(e.target.closest && e.target.closest(".sol"));
  },{passive:true});
  document.addEventListener("touchend",e=>{
    if(!st) return; st=false; if(!gameActive()) return;
    const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy;
    if(Math.abs(dx)<45 || Math.abs(dx)<=Math.abs(dy)*1.2) return;
    if(sInSol && solNav){
      if(dx>0) solNav.prev();  // swipe droite → solution précédente
      else solNav.next();      // swipe gauche → solution suivante
      return;
    }
    if(dx>0) goBack();         // swipe droite → fiche précédente
    else returnForward();      // swipe gauche → retour à la fiche en cours
  },{passive:true});
  showHome();
  syncPull();
}
document.addEventListener("DOMContentLoaded", init);
