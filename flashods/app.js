'use strict';

/* ══ FLASHODS — flashcards ODS par groupes d'anagrammes (7 & 8 lettres) ══
   Données réutilisées : window.SEQODS_DATA (../data.js), openDef (../blackscrab/dict.js).
   Persistance : localStorage (pas de répétition espacée). */

const LS_KEY = "flashods-v1";
const LS_SYNC = "flashods-sync";
let store = { rate:{}, dku:{}, seen:{}, _ts:0 };   // rate:{key:1} · dku:{word:1} · seen:{"L:g":{key:1}}
let syncId = "flashods-cl";

function normalizeStore(s){ s=s||{}; s.rate=s.rate||{}; s.dku=s.dku||{}; s.seen=s.seen||{}; s._ts=s._ts||0; return s; }
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

/* Infos d'une entrée : forme affichée COMPLÈTE (ex. "RAPPEUR, EUSE") */
function entryInfo(canon){
  const i=CANON_IDX.get(canon); if(i===undefined) return null;
  const D=window.SEQODS_DATA;
  return { disp:D.e[i]||canon, def:D.f[i]||"" };
}

/* ── Résolution des définitions ──
   Objectif : montrer une VRAIE définition, pas juste « (= rappeur) ».
   1) déf ODS avec glose (en suivant les renvois « (= …) ») ;
   2) sinon déf personnalisée (Wiktionnaire) depuis Firestore rech_custom
      — même source que METHODS. */
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
function rawDef(canon){ const i=CANON_IDX.get(canon); return i===undefined?"":(window.SEQODS_DATA.f[i]||""); }
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
// Remplit un élément .sol-def : glose ODS si dispo, sinon custom Firestore.
function fillDef(canon, elDef){
  const ods=bestOdsGloss(canon);
  if(ods){ elDef.textContent=ods; return; }
  elDef.textContent=rawDef(canon)||"…";
  elDef.classList.add("def-loading");
  resolveCustom(canon).then(t=>{ if(t){ elDef.textContent=t; } elDef.classList.remove("def-loading"); });
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

  // Révision : définitions non connues
  const dkuWords=Object.keys(store.dku).filter(w=>w.length===curLen);
  m.appendChild(el("div","home-sep","Révisions"));
  const rb=el("button","grp-btn"); rb.disabled=dkuWords.length===0;
  const rl=el("div"); rl.appendChild(el("div","g-name","Définitions non connues"));
  rl.appendChild(el("div","g-sub","mots que tu as marqués « déf. non connue »"));
  rb.appendChild(rl); rb.appendChild(el("div","g-count",String(dkuWords.length)));
  rb.addEventListener("click",()=>startDku(curLen));
  m.appendChild(rb);

  // Ligne de synchro
  const sync=el("div","sync-line");
  const st=el("span","sync-st"); st.id="sync-status"; st.textContent="✓ synchro";
  const code=el("button","sync-code","code : "+syncId);
  code.addEventListener("click",changeSyncCode);
  sync.appendChild(st); sync.appendChild(code);
  m.appendChild(sync);
}

/* ── Progression par groupe ── */
function seenSet(L,group){ const sk=L+":"+group; return store.seen[sk]||(store.seen[sk]={}); }
function seenCount(L,group){ return Object.keys(seenSet(L,group)).length; }
function rateCount(L,group){ return GROUPS[L][group].filter(k=>store.rate[k]).length; }

function progLabel(){
  if(g.mode==="group") return GROUP_LABELS[g.group].name+" · "+(g.baseDone+g.pos+1)+" / "+g.total;
  if(g.mode==="rate")  return "Ratés · "+(g.pos+1)+" / "+g.queue.length;
  return "Définitions non connues · "+(g.pos+1)+" / "+g.queue.length;
}

/* ── Lancer une session de tirages ── */
function startPlay(L,group,mode){
  if(mode==="rate"){
    const keys=GROUPS[L][group].filter(k=>store.rate[k]);
    if(!keys.length){ showHome(); return; }
    g={ L, group, mode, queue:shuffle(keys), pos:0, total:keys.length, baseDone:0 };
    showGame(); renderCard(); return;
  }
  // mode "group" : reprendre sur les tirages non encore vus
  const seen=seenSet(L,group);
  const total=GROUPS[L][group].length;
  const unseen=GROUPS[L][group].filter(k=>!seen[k]);
  g={ L, group, mode:"group", queue:shuffle(unseen), pos:0, total, baseDone:total-unseen.length };
  showGame();
  if(!unseen.length) endScreen();   // tout vu → écran de fin (rejeu / ratés / reset)
  else renderCard();
}
function resetGroup(L,group){ delete store.seen[L+":"+group]; save(); }

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
  wrap.appendChild(el("div","prog", progLabel()));

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
  if(found) delete store.rate[key];                 // Trouvé → plus raté
  else store.rate[key]=1;                            // Abandon → raté auto
  seenSet(g.L,g.group)[key]=1;                        // marquer comme vu
  save();

  const {scroll,foot}=gameScreen();
  const wrap=el("div","card-wrap");
  wrap.appendChild(el("div","prog", progLabel()));

  const tir=el("div","tirage");
  key.split("").forEach(c=> tir.appendChild(el("div","tile",c)) );
  wrap.appendChild(tir);

  // Solutions : entrées d'abord, puis formes
  const words=(RACKS[g.L].get(key)||[]).slice()
    .sort((a,b)=> (ENTRIES.has(b)?1:0)-(ENTRIES.has(a)?1:0) || (a<b?-1:1));
  for(const w of words) wrap.appendChild(renderSolution(w));
  scroll.appendChild(wrap);

  const rv=el("div","rv-actions");
  if(found){
    const bR=el("button","btn-markrate","Marquer comme raté");
    bR.addEventListener("click",()=>{ store.rate[key]=1; save(); bR.textContent="✓ raté"; bR.disabled=true; bR.style.opacity=".5"; });
    rv.appendChild(bR);
  }
  const bN=el("button","btn-next", g.pos+1>=g.queue.length ? "Terminer" : "Suivant");
  bN.addEventListener("click",next);
  rv.appendChild(bN);
  foot.appendChild(rv);
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

  if(isEntry){ const d=el("div","sol-def","…"); box.appendChild(d); fillDef(w, d); }
  else box.appendChild(el("div","sol-def","Forme fléchie — touche le mot pour la fiche."));

  const btns=el("div","sol-btns");
  const img=el("a","mini","🔍 Image"); img.href=gImgUrl(w); img.target="_blank"; img.rel="noopener";
  const wk=el("a","mini","📖 Wikt"); wk.href=wiktUrl(w); wk.target="_blank"; wk.rel="noopener";
  btns.appendChild(img); btns.appendChild(wk);
  const dku=el("button","mini dku"+(store.dku[w]?" on":""),"❓ Déf inconnue");
  dku.addEventListener("click",()=>{
    if(store.dku[w]){ delete store.dku[w]; dku.classList.remove("on"); }
    else { store.dku[w]=1; dku.classList.add("on"); }
    save();
  });
  btns.appendChild(dku);
  box.appendChild(btns);

  const ral=wordChips("Rallonges (devant)", rallongesOf(w)); if(ral) box.appendChild(ral);
  const cou=wordChips("Cousins", cousinsOf(w)); if(cou) box.appendChild(cou);
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
}

/* ── Rallonges (avant) & cousins (1 lettre de différence) ── */
const _AZ="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function rallongesOf(w){ return ((window.SEQODS_DATA.r||{})[w]||[]).filter(x=>x.endsWith(w)); }
function cousinsOf(w){
  const D=dictSet(); const out=[];
  for(let i=0;i<w.length;i++){ const a=w.slice(0,i), b=w.slice(i+1);
    for(const c of _AZ){ if(c===w[i]) continue; const v=a+c+b; if(D.has(v)) out.push(v); } }
  return out;
}
function wordChips(title, words){
  if(!words || !words.length) return null;
  const sec=el("div","sol-extra");
  sec.appendChild(el("span","sol-extra-t", title+" ("+words.length+") : "));
  words.slice(0,80).forEach(x=>{
    const a=el("a","chip",x); a.href="#";
    a.addEventListener("click",ev=>{ ev.preventDefault(); try{ openDef(x); }catch(e){} });
    sec.appendChild(a);
  });
  return sec;
}

/* ── Init ── */
function init(){
  if(!window.SEQODS_DATA){ $home().innerHTML="<p style='color:var(--red);padding:20px'>Données ODS introuvables.</p>"; return; }
  load();
  buildData();
  if(typeof wireDefModal==="function") wireDefModal();
  document.getElementById("btn-home").addEventListener("click",showHome);
  wireSearch();
  showHome();
  syncPull();
}
document.addEventListener("DOMContentLoaded", init);
