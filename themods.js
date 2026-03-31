"use strict";
/* ══════════════════════════════════════════
   THEMODS_NEW.JS — Logique THEMODS
══════════════════════════════════════════ */

/* ── État THEMODS ── */
const LS_THEMODS = () => "THEMODS_STATE_" + (currentUser?.pseudo||"guest");
let tmState = null;
let tmKb = null;

function tmDefault(){ return {updatedAt:0, themes:{}}; }
function tmLoadLocal(){ try{ return JSON.parse(localStorage.getItem(LS_THEMODS())||"null")||tmDefault(); }catch{ return tmDefault(); } }
function tmSaveLocal(){ try{ localStorage.setItem(LS_THEMODS(), JSON.stringify(tmState)); }catch{} }

async function loadThemodsState(){
  tmState = tmLoadLocal();
  if(!currentUser) return;
  const r = await fbGet("themods", currentUser.pseudo.toLowerCase());
  if(r.ok && r.data){
    if((r.data.updatedAt||0)>(tmState.updatedAt||0)) tmState=r.data;
  }
  tmSaveLocal();
}
async function persistThemods(){
  if(!currentUser) return;
  tmState.updatedAt = Date.now();
  tmSaveLocal();
  await fbSet("themods", currentUser.pseudo.toLowerCase(), tmState);
}

function getSt(theme, label){
  if(!tmState.themes[theme]) tmState.themes[theme]={};
  if(!tmState.themes[theme][label]) tmState.themes[theme][label]={seen:false,validated:false,lastResult:"",lastSeen:"",interval:1,due:todayStr()};
  return tmState.themes[theme][label];
}

/* ── Dictionnaire ODS (pour hors-jeu) ── */
let TM_DICT = null;
function getTmDict(){
  if(!TM_DICT){
    const d=window.SEQODS_DATA?.d;
    TM_DICT = d ? new Set(d) : new Set();
  }
  return TM_DICT;
}

/* ── État du jeu courant ── */
let tmTheme=null, tmSession=null;
let tmFound=new Set(), tmSolutions=false, tmNoHelp=true, tmBuf="";
let gmEntryIdx=0, gmFound=new Set();

/* ── Navigation sous-vues THEMODS ── */
function showTmView(id){
  document.querySelectorAll("#v-themods .tmv").forEach(v=>{
    v.classList.toggle("active", v.id===id);
  });
}

/* ── Accueil THEMODS ── */
function renderTmHome(){
  showTmView("tv-home");
  updateTmStats();
}
function renderTmFinales(){
  showTmView("tv-finales");
  updateFinalesStats();
}

function updateTmStats(){
  // GM
  const prog=getGMProgress();
  const gmTotal=getAllGMEntries().length;
  const gmEl=$("#gm-desc");
  if(gmEl) gmEl.textContent="1 808 groupes · "+prog.done+"/"+gmTotal+" résolus";

  // Finales
  const finales=["able","age","ique","oir"];
  let totalSess=0,totalVal=0;
  finales.forEach(th=>{
    const d=window.THEMODS_DATA?.[th]; if(!d) return;
    totalSess+=d.length;
    d.forEach(({label})=>{ if(getSt(th,label).validated) totalVal++; });
  });
  const fEl=$("#finales-desc");
  if(fEl) fEl.textContent="4 finales · 2 488 mots"+(totalVal>0?" · "+totalVal+"/"+totalSess+" validées":"");

  // VI
  const viData=window.THEMODS_DATA?.vi||[];
  let viVal=0;
  viData.forEach(({label})=>{ if(getSt("vi",label).validated) viVal++; });
  const viEl=$("#vi-desc");
  if(viEl) viEl.textContent="575 verbes · 193 sessions"+(viVal>0?" · "+viVal+"/"+viData.length+" val.":"");
}

function updateFinalesStats(){
  ["able","age","ique","oir"].forEach(th=>{
    const d=window.THEMODS_DATA?.[th]; if(!d) return;
    let val=0;
    d.forEach(({label})=>{ if(getSt(th,label).validated) val++; });
    const el=document.getElementById(th+"-desc");
    if(el){
      const base={able:"293 mots · 136 sessions",age:"1 311 mots · 360 sessions",ique:"629 mots · 177 sessions",oir:"253 mots · 99 sessions"};
      el.textContent=base[th]+(val>0?" · "+val+"/"+d.length+" val.":"");
    }
  });
}

/* ── Sélection et lancement session ── */
function playTheme(theme){
  tmTheme=theme;
  if(theme==="gm"){ startGM(); return; }
  const data=window.THEMODS_DATA?.[theme];
  if(!data) return;
  const today=todayStr();
  let pool=data.filter(({label})=>{ const s=getSt(theme,label); return s.seen&&!s.validated&&s.due<=today; });
  if(!pool.length) pool=data.filter(({label})=>!getSt(theme,label).seen);
  if(!pool.length){
    const msg=$("#tm-home-msg");
    if(msg){msg.textContent="Toutes les sessions sont validées !";msg.className="tm-msg ok";}
    return;
  }
  startSession(theme, pool[Math.floor(Math.random()*pool.length)]);
}

function startSession(theme, session){
  tmSession=session; tmFound=new Set(); tmSolutions=false; tmNoHelp=true; tmBuf="";
  const s=getSt(theme, session.label);
  s.seen=true; s.lastSeen=todayStr();
  persistThemods().catch(()=>{});
  showTmView("tv-game");
  renderTmGame();
  updateTmBtn();
  setTmMsg("");
  if(tmKb) tmKb.clear();
  // Focus auto desktop
  setTimeout(()=>{ if(window.matchMedia("(pointer:fine)").matches) $("#tm-saisie")?.focus(); },80);
}

/* ── Rendu jeu ── */
const THEME_NAMES={age:"Finale -AGE",vi:"Intransitifs",oir:"Finale -OIR",able:"Finale -ABLE",ique:"Finale -IQUE",gm:"Graphies multiples"};
const THEME_SFX={age:"AGE",vi:"",oir:"OIR",able:"ABLE",ique:"IQUE",gm:""};

function renderTmGame(){
  if(tmTheme==="gm"){ renderGMGame(); return; }
  const sess=tmSession;

  const title=$("#tm-gtitle");
  if(title) title.textContent=sess.label+(THEME_SFX[tmTheme]?"…"+THEME_SFX[tmTheme]:"");
  const theme=$("#tm-gtheme"); if(theme) theme.textContent=THEME_NAMES[tmTheme]||tmTheme;
  const total=$("#tm-gtotal"); if(total) total.textContent=sess.words.length+" mot"+(sess.words.length>1?"s":"")+" à trouver";
  const ctr=$("#tm-counter"); if(ctr) ctr.textContent=tmFound.size+" / "+sess.words.length;

  const list=$("#tm-wlist"); if(!list) return;
  list.innerHTML="";
  sess.words.forEach((word,i)=>{
    const li=document.createElement("li");
    li.dataset.idx=i; li.className="slot";
    if(tmFound.has(i)){
      const n=norm(word);
      li.classList.add("found","clickable");
      li.textContent=word;
      li.addEventListener("click",()=>openDef(n,word));
    } else if(tmSolutions){
      li.classList.add("revealed"); li.textContent=word;
      li.classList.add("clickable");
      li.addEventListener("click",()=>openDef(norm(word),word));
    }
    list.appendChild(li);
  });
}

function validateTmWord(raw){
  if(tmTheme==="gm"){ validateGMWord(norm(raw)); return; }
  if(tmSolutions) return;
  const n=norm(raw); if(!n) return;
  const sess=tmSession;
  const matched=[];
  sess.words.forEach((w,i)=>{ if(!tmFound.has(i)&&norm(w)===n) matched.push(i); });

  if(!matched.length){
    if(getTmDict().has(n)){
      setTmMsg("Hors-jeu — mot valide mais pas dans cette liste.","warn");
    } else {
      setTmMsg("Mot inconnu — la partie s'arrête.","err");
      setTimeout(()=>showTmSolutions(),800);
    }
    return;
  }
  matched.forEach(i=>{
    tmFound.add(i);
    const li=document.querySelector("#tm-wlist li[data-idx='"+i+"']");
    if(li){
      const word=sess.words[i];
      li.className="slot found clickable";
      li.textContent=word;
      li.addEventListener("click",()=>openDef(norm(word),word));
      li.scrollIntoView({behavior:"smooth",block:"nearest"});
    }
  });
  setTmMsg("");
  const ctr=$("#tm-counter"); if(ctr) ctr.textContent=tmFound.size+" / "+sess.words.length;
  if(tmFound.size===sess.words.length) finalizeTm(tmNoHelp);
  persistThemods().catch(()=>{});
}

function showTmSolutions(){
  tmNoHelp=false;
  if(tmTheme==="gm"){ tmSolutions=true; renderGMGame(); updateTmBtn(); return; }
  const sess=tmSession;
  sess.words.forEach((w,i)=>{
    if(!tmFound.has(i)){
      tmFound.add(i);
      const li=document.querySelector("#tm-wlist li[data-idx='"+i+"']");
      if(li){
        li.className="slot revealed clickable";
        li.textContent=w;
        li.addEventListener("click",()=>openDef(norm(w),w));
      }
    }
  });
  const ctr=$("#tm-counter"); if(ctr) ctr.textContent=tmFound.size+" / "+sess.words.length;
  finalizeTm(false);
}

function finalizeTm(ok){
  tmSolutions=true;
  updateTmBtn();
  const s=getSt(tmTheme, tmSession?.label||"");
  if(ok){
    s.validated=true; s.lastResult="ok";
    s.interval=nextInterval(s.interval||1); s.due=addDays(todayStr(),s.interval);
    setTmMsg("Validée sans aide ✓","ok");
  } else {
    s.validated=false; s.lastResult="help";
    s.interval=3; s.due=addDays(todayStr(),3);
    setTmMsg("Session terminée.","warn");
  }
  persistThemods().catch(()=>{});
}

function updateTmBtn(){
  const btns=[$("#tm-btn-sol"),$("#tm-btn-sol-kb")];
  if(tmSolutions||tmTheme==="gm"){
    btns.forEach(b=>{if(b){b.textContent="Jouer";b.classList.remove("btn-danger");b.classList.add("btn-primary");}});
    if(tmTheme==="gm") btns.forEach(b=>{if(b) b.style.display="none";});
  } else {
    btns.forEach(b=>{if(b){b.textContent="Solutions";b.classList.add("btn-danger");b.classList.remove("btn-primary");b.style.display="";}});
  }
}

function setTmMsg(t,c){
  const m=$("#tm-msg"); if(m){m.textContent=t;m.className="msg"+(c?" "+c:"");}
  if(tmKb) tmKb.setMsg(t,c);
}

function tmReplay(){
  if(tmTheme) playTheme(tmTheme);
}

/* ── Graphies multiples ── */
function getAllGMEntries(){
  const data=window.THEMODS_DATA?.gm||[];
  const all=[];
  data.forEach(s=>{ (s.entries||[]).forEach(e=>all.push(e)); });
  return all;
}
function shuffleArray(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function getGMProgress(){
  if(!tmState.themes) tmState.themes={};
  if(!tmState.themes.gm) tmState.themes.gm={};
  if(!tmState.themes.gm._p) tmState.themes.gm._p={idx:0,done:0,order:null};
  return tmState.themes.gm._p;
}
function currentGMEntry(){
  const all=getAllGMEntries(), prog=getGMProgress();
  const realIdx=prog.order?.[gmEntryIdx];
  return realIdx!==undefined ? all[realIdx] : null;
}
function cleanDef(d){
  if(!d) return "";
  d=d.replace(/^(?:ou\s+)?\[[^\]]*\]\s*/i,"");
  d=d.replace(/^\([^)]*\)\s*/,"");
  if(d.startsWith("->")) return "";
  return d.trim();
}
function letterCount(w){ return w.replace(/[^A-Za-zÀ-ÿ]/g,"").length; }

function startGM(){
  const all=getAllGMEntries();
  const prog=getGMProgress();
  if(!prog.order||prog.order.length!==all.length){
    prog.order=shuffleArray(all.map((_,i)=>i));
    prog.idx=0; prog.done=0;
  }
  gmEntryIdx=prog.idx;
  gmFound=new Set();
  tmSolutions=false;
  tmNoHelp=true;
  showTmView("tv-game");
  const title=$("#tm-gtitle"); if(title) title.textContent="";
  const theme=$("#tm-gtheme"); if(theme) theme.textContent="Graphies multiples";
  const total=$("#tm-gtotal"); if(total) total.textContent="";
  updateTmBtn();
  setTmMsg("");
  renderGMGame();
  if(tmKb) tmKb.clear();
  setTimeout(()=>{ if(window.matchMedia("(pointer:fine)").matches) $("#tm-saisie")?.focus(); },80);
}

function renderGMGame(){
  const all=getAllGMEntries(), prog=getGMProgress();
  const entry=currentGMEntry();
  const list=$("#tm-wlist"); if(!list) return;
  list.innerHTML="";
  if(!entry){ setTmMsg("Toutes les entrées terminées !","ok"); return; }

  const sortedForms=[...entry.forms].sort((a,b)=>letterCount(a)-letterCount(b));
  const allFormsFound=sortedForms.every(f=>gmFound.has(norm(f)));

  // Définition
  const defDiv=document.createElement("div");
  defDiv.className="gm-def";
  defDiv.textContent=cleanDef(entry.def)||"…";
  list.appendChild(defDiv);

  // Tuiles
  const tilesDiv=document.createElement("div");
  tilesDiv.className="gm-tiles";
  sortedForms.forEach(form=>{
    const isFound=gmFound.has(norm(form))||allFormsFound;
    const revealed=isFound||tmSolutions;
    const letters=form.replace(/[^A-Za-zÀ-ÿ]/g,"");
    const row=document.createElement("div"); row.className="gm-row";
    for(let i=0;i<letters.length;i++){
      const t=document.createElement("span");
      if(revealed){
        t.className="gt "+(isFound?"ok":"miss");
        t.textContent=letters[i].toUpperCase();
      } else if(i===0){
        t.className="gt init"; t.textContent=letters[0].toUpperCase();
      } else {
        t.className="gt empty";
      }
      row.appendChild(t);
    }
    tilesDiv.appendChild(row);
  });
  list.appendChild(tilesDiv);

  // Navigation si résolu ou solutions
  if(allFormsFound||tmSolutions){
    const nav=document.createElement("div"); nav.className="gm-nav";
    const pos=document.createElement("span"); pos.className="gm-pos";
    pos.textContent=(gmEntryIdx+1)+" / "+all.length;
    nav.appendChild(pos);
    const nextBtn=document.createElement("button"); nextBtn.className="btn btn-primary";
    nextBtn.textContent="Entrée suivante →";
    nextBtn.addEventListener("click",()=>{
      gmEntryIdx++; prog.idx=gmEntryIdx;
      gmFound=new Set(); tmSolutions=false;
      updateTmBtn(); setTmMsg(""); renderGMGame();
      persistThemods().catch(()=>{});
    });
    nav.appendChild(nextBtn);
    list.appendChild(nav);
  }
}

function validateGMWord(n){
  const entry=currentGMEntry(); if(!entry) return;
  const matched=entry.forms.find(f=>norm(f)===n);
  if(!matched){
    if(getTmDict().has(n)){ setTmMsg("Hors-jeu — mot valide mais pas dans cette liste.","warn"); }
    else { setTmMsg("Mot non valide.","err"); }
    return;
  }
  gmFound.add(n);
  setTmMsg("");
  const allFound=entry.forms.every(f=>gmFound.has(norm(f)));
  if(allFound){
    const prog=getGMProgress();
    prog.done=(prog.done||0)+1;
    prog.idx=gmEntryIdx+1;
    setTmMsg("✓ Toutes les graphies trouvées !","ok");
    persistThemods().catch(()=>{});
  }
  renderGMGame();
}

/* ── Init THEMODS ── */
function initThemods(){
  // Clavier mobile
  tmKb = wireKeyboard("tm-kb","tm-kb-disp","tm-kb-msg", w=>{
    validateTmWord(w);
  });

  // Saisie desktop
  $("#tm-saisie")?.addEventListener("keydown",e=>{
    if(e.key==="Enter"&&!e.isComposing){
      e.preventDefault(); validateTmWord(e.target.value); e.target.value="";
    }
  });

  // Boutons solutions
  const onSol=()=>{
    if(tmSolutions) playTheme(tmTheme);
    else showTmSolutions();
  };
  $("#tm-btn-sol")?.addEventListener("click",onSol);
  $("#tm-btn-sol-kb")?.addEventListener("click",onSol);

  // Retour vers thèmes
  const backToHome=()=>{
    renderTmHome();
    updateTmBtn();
    // Réafficher le bouton solutions
    [$("#tm-btn-sol"),$("#tm-btn-sol-kb")].forEach(b=>{if(b) b.style.display="";});
  };
  $("#btn-back-game")?.addEventListener("click",backToHome);
  $("#btn-back-game-kb")?.addEventListener("click",backToHome);

  // Finales
  $("#btn-finales")?.addEventListener("click",renderTmFinales);
  $("#btn-back-finales")?.addEventListener("click",renderTmHome);

  // Cartes thèmes
  document.querySelectorAll("#v-themods .tc[data-theme]").forEach(card=>{
    card.addEventListener("click",()=>playTheme(card.dataset.theme));
  });

  // Afficher l'accueil
  renderTmHome();
}
