"use strict";
/* ══════════════════════════════════════════
   METHODS.JS — Logique du jeu METHODS
══════════════════════════════════════════ */

/* ── Données ODS ── */
const DATA = window.SEQODS_DATA || {};
const C = DATA.c || [];
const E = DATA.e || [];
const F = DATA.f || [];
const A = DATA.a || {};
const D = DATA.d || [];
const R = DATA.r || {};

// Dictionnaire complet pour hors-jeu
let DICT = new Set();

// Séquences : groupes de 12 mots consécutifs
const sequences = [];
for(let i=0; i+11<C.length; i+=12){
  sequences.push({startIdx:i, endIdx:i+11});
}
const TOTAL_SEQ = sequences.length;

/* ── État METHODS ── */
const LS_METHODS = () => "METHODS_STATE_" + (currentUser?.pseudo||"guest");
let mState = null;
let seq = null;
let targets = [];
let found = new Set();
let hintMode = Array(10).fill("none");
let hintUsed = Array(10).fill(false);
let mNoHelp = true;
let mSolutionsShown = true;
let mKb = null;

function mDefaultState(){ return {updatedAt:0, lists:{}, currentRun:null}; }
function mLoadLocal(){ try{ return JSON.parse(localStorage.getItem(LS_METHODS())||"null")||mDefaultState(); }catch{ return mDefaultState(); } }
function mSaveLocal(){ try{ localStorage.setItem(LS_METHODS(), JSON.stringify(mState)); }catch{} }

async function loadMethodsState(){
  mState = mLoadLocal();
  if(!currentUser) return;
  const r = await fbGet("states", currentUser.pseudo.toLowerCase());
  if(r.ok && r.data){
    const remote = r.data;
    if((remote.updatedAt||0) > (mState.updatedAt||0)) mState = remote;
  }
  mSaveLocal();
}
async function persistMethodsState(){
  if(!currentUser) return;
  mState.updatedAt = Date.now();
  mSaveLocal();
  await fbSet("states", currentUser.pseudo.toLowerCase(), mState);
}

function ensureListState(idx){
  const k = String(idx);
  if(!mState.lists[k]) mState.lists[k]={seen:false,validated:false,lastResult:"",lastSeen:"",interval:1,due:todayStr()};
  return mState.lists[k];
}

/* ── SRS METHODS ── */
function getDueIdx(){
  const today = todayStr();
  const due = [];
  for(let i=0;i<TOTAL_SEQ;i++){
    const s=mState.lists[String(i)];
    if(s?.seen && !s.validated && s.due<=today) due.push(i);
  }
  return due;
}
function getNewIdx(){
  const out=[];
  for(let i=0;i<TOTAL_SEQ;i++){
    if(!mState.lists[String(i)]?.seen) out.push(i);
  }
  return out;
}
function pickNext(){
  let pool = getDueIdx();
  if(!pool.length) pool = getNewIdx();
  if(!pool.length) return null;
  return pool[Math.floor(Math.random()*pool.length)];
}

/* ── Chrono ── */
let chronoInterval = null;
let chronoRem = 0;

function chronoFmt(s){ return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); }
function chronoStop(){ if(chronoInterval){clearInterval(chronoInterval);chronoInterval=null;} }
function chronoStart(){
  chronoStop();
  const el = $("#chrono");
  if(!el) return;
  if(!settings.chronoEnabled){ el.textContent=""; el.className="chrono"; return; }
  chronoRem = settings.chronoDur*60;
  el.textContent = chronoFmt(chronoRem);
  el.className = "chrono running";
  chronoInterval = setInterval(()=>{
    if(chronoRem>0) chronoRem--;
    el.textContent = chronoFmt(chronoRem);
    if(chronoRem===0){
      el.className="chrono expired";
      chronoStop();
      if(!mSolutionsShown) showSolutions();
    }
  },1000);
}

/* ── Progression ── */
function computeStats(){
  let seen=0, validated=0;
  for(let i=0;i<TOTAL_SEQ;i++){
    const s=mState.lists[String(i)];
    if(s?.seen) seen++;
    if(s?.validated) validated++;
  }
  const progRow = $("#m-prog-row");
  if(!progRow) return;
  const sPct=Math.round(seen/TOTAL_SEQ*100);
  const vPct=Math.round(validated/TOTAL_SEQ*100);
  progRow.innerHTML=`
    <div class="prog"><label><span>Listes vues</span><span>${seen}/${TOTAL_SEQ}</span></label><div class="prog-bar"><div class="prog-fill" style="width:${sPct}%"></div></div></div>
    <div class="prog"><label><span>Listes validées</span><span>${validated}/${TOTAL_SEQ}</span></label><div class="prog-bar"><div class="prog-fill" style="width:${vPct}%"></div></div></div>`;
}

/* ── Rendu ── */
function renderBounds(){
  if(!seq) return;
  const a=C[seq.startIdx], b=C[seq.endIdx];
  const ea=E[seq.startIdx]?.split(",")[0], eb=E[seq.endIdx]?.split(",")[0];
  const btnA=$("#borne-a"), btnB=$("#borne-b");
  if(btnA){ btnA.textContent=ea||a; btnA.onclick=()=>openDef(a,ea); }
  if(btnB){ btnB.textContent=eb||b; btnB.onclick=()=>openDef(b,eb); }
}

function renderSlots(){
  const list = $("#word-list"); if(!list) return;
  list.innerHTML="";
  for(let i=0;i<10;i++){
    const t=targets[i];
    const li=document.createElement("li");
    li.dataset.slot=i;
    li.className="slot";
    if(found.has(i)){
      li.classList.add(hintUsed[i]?"found-helped":"found");
      li.classList.add("clickable");
      const word=E[t.eIdx]?.split(",")[0]||t.c;
      const btn=document.createElement("button");
      btn.className="slot-word-btn";
      btn.style.cssText="background:none;border:none;font:inherit;color:inherit;font-weight:900;letter-spacing:.07em;cursor:pointer;padding:0;";
      btn.textContent=word;
      btn.dataset.canon=t.c;
      btn.addEventListener("click",()=>openDef(t.c, word));
      li.appendChild(btn);
    } else {
      applyHintDOM(li, i, t);
    }
    // Outils (uniquement si pas trouvé)
    if(!found.has(i)){
      const tools=document.createElement("div");
      tools.className="slot-tools";
      if(settings.showAbc){
        const b=document.createElement("button"); b.className="tool-btn"; b.dataset.tool="tirage"; b.textContent="ABC";
        b.addEventListener("click",()=>applyHint(i,"tirage"));
        tools.appendChild(b);
      }
      if(settings.showDef){
        const b=document.createElement("button"); b.className="tool-btn"; b.dataset.tool="def"; b.textContent="📖";
        b.addEventListener("click",()=>{markAidUsed(i); openDef(t.c,"");});
        tools.appendChild(b);
      }
      if(settings.showLen){
        const b=document.createElement("button"); b.className="tool-btn"; b.dataset.tool="len"; b.textContent="123";
        b.addEventListener("click",()=>applyHint(i,"len"));
        tools.appendChild(b);
      }
      if(tools.children.length) li.appendChild(tools);
    }
    list.appendChild(li);
  }
}

function applyHintDOM(li, i, t){
  if(hintMode[i]==="tirage"){
    li.textContent=tirageOf(t.c);
    li.style.fontStyle="italic";
    li.style.color="var(--muted)";
  } else if(hintMode[i]==="len"){
    li.textContent="·".repeat(t.c.length);
    li.style.color="var(--muted)";
    li.style.letterSpacing="4px";
  }
}
function tirageOf(c){ return c.split("").sort((a,b)=>a.localeCompare(b,"fr")).join(""); }

function applyHint(i, mode){
  markAidUsed(i);
  hintMode[i] = (hintMode[i]===mode) ? "none" : mode;
  hintUsed[i] = true;
  renderSlots();
  persistMethodsState().catch(()=>{});
}
function markAidUsed(i){
  mNoHelp=false;
  if(i!==undefined) hintUsed[i]=true;
}

function updateCounter(){
  const c=$("#compteur"); if(c) c.textContent=found.size+"/10";
  if(mKb) mKb.setMsg("","");
}

function updateSolutionsBtn(){
  const btn=$("#btn-solutions"), kb=$("#btn-solutions-kb");
  if(mSolutionsShown){
    [btn,kb].forEach(b=>{ if(b){b.textContent="Jouer";b.classList.remove("btn-danger");b.classList.add("btn-primary");} });
  } else {
    [btn,kb].forEach(b=>{ if(b){b.textContent="Solutions";b.classList.add("btn-danger");b.classList.remove("btn-primary");} });
  }
}

function setMethodsMsg(t,cls){
  const m=$("#m-msg"); if(m){m.textContent=t;m.className="msg"+(cls?" "+cls:"");}
  if(mKb) mKb.setMsg(t, cls);
}

/* ── Jeu ── */
function buildTargets(s){
  targets=[];
  for(let i=1;i<=10;i++){
    const eIdx=s.startIdx+i;
    targets.push({c:C[eIdx], eIdx, f:F[eIdx]||""});
  }
}

function renderAll(){
  renderBounds();
  renderSlots();
  updateCounter();
  updateSolutionsBtn();
  computeStats();
  chronoStart();
  applyHintSettings();
}

function applyHintSettings(){
  // Rien à faire ici — les boutons sont rendus dans renderSlots
}

function validateWord(raw){
  if(mSolutionsShown) return;
  const n = norm(raw);
  if(!n) return;

  const matched=[];
  targets.forEach((t,i)=>{ if(!found.has(i)&&norm(t.c)===n) matched.push(i); });

  if(!matched.length){
    if(!DICT.has(n)){
      setMethodsMsg("Mot inconnu.","err");
    } else {
      setMethodsMsg("Hors-jeu.","warn");
    }
    return;
  }

  matched.forEach(i=>{ found.add(i); });
  setMethodsMsg("","");
  updateCounter();
  renderSlots();

  if(found.size===10) finalizeList(mNoHelp);
  persistMethodsState().catch(()=>{});
}

function showSolutions(){
  chronoStop();
  mSolutionsShown=true;
  targets.forEach((_,i)=>{ if(!found.has(i)) found.add(i); });
  renderSlots();
  updateCounter();
  finalizeList(false);
}

function finalizeList(ok){
  chronoStop();
  mSolutionsShown=true;
  updateSolutionsBtn();
  const s=ensureListState(seq.seqIndex);
  s.seen=true; s.lastSeen=todayStr();
  if(ok){
    s.validated=true; s.lastResult="ok";
    s.interval=nextInterval(s.interval||1);
    s.due=addDays(todayStr(), s.interval);
    setMethodsMsg("Validée sans aide ✓","ok");
  } else {
    s.validated=false; s.lastResult="help";
    s.interval=3; s.due=addDays(todayStr(),3);
    setMethodsMsg("Session terminée.","warn");
  }
  computeStats();
  persistMethodsState().catch(()=>{});
}

function methodsReplay(){
  if(!mSolutionsShown) return;
  const idx = pickNext();
  if(idx===null){ setMethodsMsg("Toutes les listes sont à jour !","ok"); return; }
  startGame(idx);
}

function startGame(idx){
  seq={...sequences[idx], seqIndex:idx};
  found=new Set(); hintMode=Array(10).fill("none"); hintUsed=Array(10).fill(false);
  mNoHelp=true; mSolutionsShown=false;
  buildTargets(seq);
  renderAll();
  // Focus auto desktop
  setTimeout(()=>{ if(window.matchMedia("(pointer:fine)").matches) $("#saisie")?.focus(); },80);
}

/* ── Init METHODS ── */
function initMethods(){
  if(DICT.size===0){
    DICT = D.length>0 ? new Set(D) : new Set(C.map(w=>norm(w)));
  }

  // Clavier mobile
  mKb = wireKeyboard("m-kb","m-kb-disp","m-kb-msg", w=>{
    validateWord(w);
  });

  // Saisie desktop
  $("#saisie")?.addEventListener("keydown", e=>{
    if(e.key==="Enter"&&!e.isComposing){
      e.preventDefault();
      validateWord(e.target.value);
      e.target.value="";
    }
  });

  // Boutons solutions
  const onSolClick=()=>{ mSolutionsShown ? methodsReplay() : showSolutions(); };
  $("#btn-solutions")?.addEventListener("click", onSolClick);
  $("#btn-solutions-kb")?.addEventListener("click", onSolClick);

  // Bornes cliquables (rendu plus tard dans renderBounds)

  computeStats();
  methodsReplay();
}
