'use strict';

/* ══ FLASHODS — flashcards ODS par groupes d'anagrammes (7 & 8 lettres) ══
   Données réutilisées : window.SEQODS_DATA (../data.js), openDef (../blackscrab/dict.js).
   Persistance : localStorage (pas de répétition espacée). */

const LS_KEY = "flashods-v1";
let store = { rate:{}, dku:{}, seen:{} };   // rate:{key:1} · dku:{word:1} · seen:{"L:g":{key:1}}

function load(){
  try{ store = Object.assign({rate:{},dku:{},seen:{}}, JSON.parse(localStorage.getItem(LS_KEY)||"{}")); }
  catch{ store = {rate:{},dku:{},seen:{}}; }
  store.rate=store.rate||{}; store.dku=store.dku||{}; store.seen=store.seen||{};
}
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(store)); }catch{} }

/* ── Données ── */
let ENTRIES;                 // Set des entrées (canoniques)
let CANON_IDX;               // canon -> index dans e/f
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
  CANON_IDX=new Map(); D.c.forEach((c,i)=>{ if(!CANON_IDX.has(c)) CANON_IDX.set(c,i); });
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

/* Infos d'une entrée : forme affichée + définition */
function entryInfo(canon){
  const i=CANON_IDX.get(canon); if(i===undefined) return null;
  const D=window.SEQODS_DATA;
  return { disp:(D.e[i]||canon).split(",")[0].trim(), def:D.f[i]||"" };
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
function renderHome(){
  const m=$home(); m.innerHTML="";

  const seg=el("div","seg");
  [7,8].forEach(L=>{
    const b=el("button",(L===curLen?"active":""),L+" lettres");
    b.addEventListener("click",()=>{ curLen=L; renderHome(); });
    seg.appendChild(b);
  });
  m.appendChild(seg);

  for(const gid of [1,2,3,4]){
    const keys=GROUPS[curLen][gid];
    const b=el("button","grp-btn"); b.disabled=keys.length===0;
    const left=el("div");
    left.appendChild(el("div","g-name",GROUP_LABELS[gid].name));
    left.appendChild(el("div","g-sub",GROUP_LABELS[gid].sub));
    b.appendChild(left);
    b.appendChild(el("div","g-count",String(keys.length)));
    b.addEventListener("click",()=>startPlay(curLen,gid,"group"));
    m.appendChild(b);
  }

  // Révision : définitions non connues
  const dkuWords=Object.keys(store.dku).filter(w=>w.length===curLen);
  m.appendChild(el("div","home-sep","Révisions"));
  const rb=el("button","grp-btn"); rb.disabled=dkuWords.length===0;
  const rl=el("div"); rl.appendChild(el("div","g-name","Définitions non connues"));
  rl.appendChild(el("div","g-sub","mots que tu as marqués « déf. non connue »"));
  rb.appendChild(rl); rb.appendChild(el("div","g-count",String(dkuWords.length)));
  rb.addEventListener("click",()=>startDku(curLen));
  m.appendChild(rb);
}

/* ── Lancer une session de tirages ── */
function startPlay(L,group,mode){
  let keys;
  if(mode==="rate") keys=GROUPS[L][group].filter(k=>store.rate[k]);
  else keys=GROUPS[L][group].slice();
  if(!keys.length){ showHome(); return; }
  g={ L, group, mode, queue:shuffle(keys), pos:0 };
  showGame(); renderCard();
}

/* Construit la vue jeu : zone défilante + pied fixe. Renvoie {scroll,foot}. */
function gameScreen(){
  const m=$game(); m.innerHTML="";
  const scroll=el("div","g-scroll");
  const foot=el("div","g-foot");
  m.appendChild(scroll); m.appendChild(foot);
  return {scroll,foot};
}

function renderCard(){
  const {scroll,foot}=gameScreen();
  const key=g.queue[g.pos]; g.key=key; g.revealed=false;
  const words=RACKS[g.L].get(key)||[];
  const nSol=words.length;

  const wrap=el("div","card-wrap");
  const modeLabel = g.mode==="rate" ? "Ratés · " : "";
  wrap.appendChild(el("div","prog", modeLabel + GROUP_LABELS[g.group].name + " · " + (g.pos+1) + " / " + g.queue.length));

  const tir=el("div","tirage");
  key.split("").forEach(c=> tir.appendChild(el("div","tile",c)) );
  wrap.appendChild(tir);

  wrap.appendChild(el("div","hint", nSol>1 ? (nSol+" solutions à trouver") : "1 solution"));
  scroll.appendChild(wrap);

  const act=el("div","actions");
  const bGive=el("button","btn-give","Abandon");
  const bFound=el("button","btn-found","Trouvé");
  bGive.addEventListener("click",()=>reveal(false));
  bFound.addEventListener("click",()=>reveal(true));
  act.appendChild(bGive); act.appendChild(bFound);
  foot.appendChild(act);
}

function reveal(found){
  g.revealed=true; g.found=found;
  const key=g.key;
  if(!found){ store.rate[key]=1; save(); }          // Abandon → raté auto
  // marquer comme vu
  const sk=g.L+":"+g.group; (store.seen[sk]||(store.seen[sk]={}))[key]=1; save();

  const {scroll,foot}=gameScreen();
  const wrap=el("div","card-wrap");
  wrap.appendChild(el("div","prog", GROUP_LABELS[g.group].name + " · " + (g.pos+1) + " / " + g.queue.length));

  const tir=el("div","tirage");
  key.split("").forEach(c=> tir.appendChild(el("div","tile",c)) );
  wrap.appendChild(tir);

  const status=el("div","hint");
  status.style.display="flex"; status.style.justifyContent="center";
  if(store.rate[key]) status.appendChild(el("span","rate-badge","raté"));
  else status.appendChild(el("span",null,"trouvé ✓"));
  wrap.appendChild(status);

  // Solutions : entrées d'abord, puis formes
  const words=(RACKS[g.L].get(key)||[]).slice()
    .sort((a,b)=> (ENTRIES.has(b)?1:0)-(ENTRIES.has(a)?1:0) || (a<b?-1:1));
  for(const w of words) wrap.appendChild(renderSolution(w));
  scroll.appendChild(wrap);

  const rv=el("div","rv-actions");
  if(found){
    const bR=el("button","btn-markrate","Marquer comme raté");
    bR.addEventListener("click",()=>{ store.rate[key]=1; save(); renderReveal2(bR); });
    rv.appendChild(bR);
  }
  const bN=el("button","btn-next", g.pos+1>=g.queue.length ? "Terminer" : "Suivant");
  bN.addEventListener("click",next);
  rv.appendChild(bN);
  foot.appendChild(rv);
}
function renderReveal2(btn){ // après "marquer comme raté"
  btn.textContent="✓ raté"; btn.disabled=true; btn.style.opacity=".5";
  const badge=$game().querySelector(".rate-badge");
  const status=$game().querySelector(".card-wrap .hint");
  if(status && !badge){ status.innerHTML=""; status.appendChild(el("span","rate-badge","raté")); }
}

function renderSolution(w){
  const isEntry=ENTRIES.has(w);
  const box=el("div","sol"+(isEntry?"":" form"));
  const top=el("div","sol-top");
  const info=isEntry?entryInfo(w):null;
  const word=el("span","sol-word", info?info.disp:w);
  word.addEventListener("click",()=>{ try{ openDef(w); }catch(e){} });
  top.appendChild(word);
  if(!isEntry) top.appendChild(el("span","sol-tag","forme"));
  box.appendChild(top);

  if(isEntry && info && info.def) box.appendChild(el("div","sol-def", info.def));
  else if(!isEntry) box.appendChild(el("div","sol-def","Forme fléchie — touche le mot pour la fiche."));

  const btns=el("div","sol-btns");
  const img=el("a","mini","🔍 Image"); img.href=gImgUrl(w); img.target="_blank"; img.rel="noopener";
  const wk=el("a","mini","📖 Wiktionnaire"); wk.href=wiktUrl(w); wk.target="_blank"; wk.rel="noopener";
  btns.appendChild(img); btns.appendChild(wk);
  const dku=el("button","mini dku"+(store.dku[w]?" on":""), store.dku[w]?"définition non connue ✓":"définition non connue");
  dku.addEventListener("click",()=>{
    if(store.dku[w]){ delete store.dku[w]; dku.classList.remove("on"); dku.textContent="définition non connue"; }
    else { store.dku[w]=1; dku.classList.add("on"); dku.textContent="définition non connue ✓"; }
    save();
  });
  btns.appendChild(dku);
  box.appendChild(btns);
  return box;
}

function next(){
  g.pos++;
  if(g.pos>=g.queue.length) endScreen();
  else renderCard();
}

function endScreen(){
  const m=$game(); m.innerHTML="";
  const e=el("div","end");
  e.appendChild(el("h2","Groupe terminé !"));
  const rateKeys = GROUPS[g.L][g.group].filter(k=>store.rate[k]);
  e.appendChild(el("div","hint", g.queue.length+" tirage(s) revu(s). Ratés dans ce groupe : "+rateKeys.length));
  const box=el("div"); box.style.marginTop="18px";
  if(rateKeys.length){
    const b=el("button","start-btn","↻ Rejouer les ratés ("+rateKeys.length+")");
    b.addEventListener("click",()=>startPlay(g.L,g.group,"rate"));
    box.appendChild(b);
  }
  const again=el("button","start-btn sec","Recommencer le groupe");
  again.addEventListener("click",()=>startPlay(g.L,g.group,"group"));
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
  (entryInfo(w)?entryInfo(w).disp:w).split("").forEach(c=> tir.appendChild(el("div","tile",c)) );
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

/* ── Init ── */
function init(){
  if(!window.SEQODS_DATA){ $home().innerHTML="<p style='color:var(--red);padding:20px'>Données ODS introuvables.</p>"; return; }
  load();
  buildData();
  if(typeof wireDefModal==="function") wireDefModal();
  document.getElementById("btn-home").addEventListener("click",showHome);
  showHome();
}
document.addEventListener("DOMContentLoaded", init);
