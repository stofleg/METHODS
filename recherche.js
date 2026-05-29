"use strict";
/* ══ RECHERCHE.JS — panneau admin stof2 ══ */

const FINALE_THEMES = ["able","age","ail","ais","al","ant","ard","ase","eau","erie",
  "et","ette","eur","eux","ide","ien","ier","if","in","ique","isme","iste","ite",
  "oir","ois","ose","ot","um","ure"];

let _rechCurrentCanon = null;
const _rechCache = {}; // canon → {custom:{def?}, excl:[], loaded:bool}
window._rechCache = _rechCache; // exposé pour openDef() / dictSelectWord()

const _rechModExclCache = {}; // moduleId → {loaded:bool, words:Set<canon>}

function _isAdm(){ const p=currentUser?.pseudo?.toLowerCase(); return p==="stof2"||p==="stofleg"; }

async function _rechLoad(canon){
  if(_rechCache[canon]?.loaded) return;
  const [r1,r2] = await Promise.all([
    fbGet("rech_custom", canon),
    fbGet("rech_excl",   canon)
  ]);
  _rechCache[canon] = {
    custom: r1.ok && r1.data ? r1.data : {},
    excl:   r2.ok && r2.data?.modules ? r2.data.modules : [],
    loaded: true
  };
}

async function _rechLoadModExcl(moduleId){
  if(_rechModExclCache[moduleId]?.loaded) return _rechModExclCache[moduleId].words;
  const r = await fbGet("rech_modexcl", moduleId);
  _rechModExclCache[moduleId] = {
    loaded: true,
    words: new Set(r.ok && r.data?.words ? r.data.words : [])
  };
  return _rechModExclCache[moduleId].words;
}

/* ── Détection des modules contenant ce mot ── */
function rechFindModules(canon){
  const out = [];
  const D = window.THEMODS_DATA; if(!D) return out;

  for(const th of FINALE_THEMES){
    for(const s of D[th]||[]){
      if(s.words?.some(w=>norm(w)===canon)){ out.push({id:th,label:"-"+th.toUpperCase()}); break; }
    }
  }
  for(const s of D.gm||[]){
    if(s.entries?.some(e=>e.forms?.some(f=>norm(f)===canon))){ out.push({id:"gm",label:"Graphies multiples"}); break; }
  }
  for(const [th,lbl] of [["vi","Intransitifs"],["vt","Transitifs"],["vd","Défectifs"]]){
    for(const s of D[th]||[]){
      if(s.words?.some(w=>norm(w)===canon)){ out.push({id:th,label:"V. "+lbl.toLowerCase()}); break; }
    }
  }
  for(let v=1;v<=9;v++){
    for(const s of D["ods"+v]||[]){
      if(s.entries?.some(e=>e.forms?.some(f=>norm(f)===canon))){ out.push({id:"ods"+v,label:"ODS "+v}); break; }
    }
  }
  return out;
}

/* ── Onglet actif dans le bloc définition ── */
let _rechDefActiveTab = "def"; // "def" | "quiz"

function _rechSwitchDefTab(tab){
  _rechDefActiveTab = tab;
  document.getElementById("rech-def-tab-def")?.classList.toggle("active", tab==="def");
  document.getElementById("rech-def-tab-quiz")?.classList.toggle("active", tab==="quiz");
  document.getElementById("rech-edit-def").style.display    = tab==="def"  ? "" : "none";
  document.getElementById("rech-edit-defquiz").style.display = tab==="quiz" ? "" : "none";
  const cache = _rechCache[_rechCurrentCanon];
  const saveBtn = document.getElementById("rech-save-def");
  if(saveBtn){
    const hasVal = tab==="def" ? cache?.custom?.def!==undefined : cache?.custom?.defQuiz!==undefined;
    saveBtn.textContent = hasVal ? "Mettre à jour" : "Sauvegarder";
  }
}

/* ── Afficher / masquer le panneau ── */
async function rechShowAdmin(canon){
  const panel = document.getElementById("rech-admin"); if(!panel) return;
  if(!_isAdm()){ panel.style.display="none"; return; }

  _rechCurrentCanon = canon;
  panel.style.display = "";

  const modEl   = document.getElementById("rech-modules");
  const defEl   = document.getElementById("rech-edit-def");
  const quizEl  = document.getElementById("rech-edit-defquiz");
  if(modEl) modEl.innerHTML = "<span class='rech-loading'>Chargement…</span>";
  if(defEl) defEl.value = "";
  if(quizEl) quizEl.value = "";

  // Réinitialiser l'onglet sur "def" à chaque nouveau mot
  _rechSwitchDefTab("def");

  await _rechLoad(canon);
  const cache = _rechCache[canon];

  // Modules
  if(modEl){
    modEl.innerHTML = "";
    const mods = rechFindModules(canon);
    if(!mods.length){
      const p = document.createElement("span");
      p.style.cssText = "font-size:12px;color:var(--muted);";
      p.textContent = "Absent de tous les modules THEMODS";
      modEl.appendChild(p);
    } else {
      mods.forEach(({id,label})=>{
        const excl = cache.excl.includes(id);
        const btn = document.createElement("button");
        btn.className = "btn rech-mod-btn "+(excl?"btn-danger":"btn-ok");
        btn.textContent = (excl?"✕ ":"✓ ")+label;
        btn.dataset.mod = id; btn.dataset.label = label;
        modEl.appendChild(btn);
      });
    }
  }

  // Définition
  const baseDef = cache.custom.def !== undefined ? cache.custom.def : (getNormToF()[canon] || "");
  if(defEl) defEl.value = baseDef;

  // Définition quiz — défaut = baseDef si pas de defQuiz stocké
  if(quizEl) quizEl.value = cache.custom.defQuiz !== undefined ? cache.custom.defQuiz : baseDef;

  // Mettre à jour le bloc dict-def avec la définition personnalisée si elle existe
  if(cache.custom.def !== undefined){
    const dictDefEl = document.getElementById("dict-def");
    if(dictDefEl) dictDefEl.textContent = cache.custom.def || "(définition absente)";
  }

  const saveBtn = document.getElementById("rech-save-def");
  if(saveBtn) saveBtn.textContent = cache.custom.def!==undefined ? "Mettre à jour" : "Sauvegarder";
}

/* ── Toggle exclusion module ── */
async function rechToggleExclusion(canon, moduleId, label, btn){
  const c = _rechCache[canon]; if(!c) return;
  const wasExcl = c.excl.includes(moduleId);
  c.excl = wasExcl ? c.excl.filter(x=>x!==moduleId) : [...c.excl, moduleId];
  const excl = c.excl.includes(moduleId);
  btn.className = "btn rech-mod-btn "+(excl?"btn-danger":"btn-ok");
  btn.textContent = (excl?"✕ ":"✓ ")+label;
  btn.disabled = true;

  // Écriture parallèle : rech_excl/{canon} ET rech_modexcl/{moduleId}
  const modWords = await _rechLoadModExcl(moduleId);
  if(excl) modWords.add(canon); else modWords.delete(canon);

  await Promise.all([
    fbSet("rech_excl", canon, {modules:c.excl}),
    fbSet("rech_modexcl", moduleId, {words:[...modWords]})
  ]).catch(()=>{});

  // Synchroniser la session live THEMODS si le module est actif
  window.tmNotifyExclusion?.(moduleId, canon, excl);

  btn.disabled = false;
}

/* ── Sauvegarder définition ── */
async function rechSaveDef(){
  if(_rechDefActiveTab === "quiz"){ await _rechSaveDefQuiz(); return; }
  const canon = _rechCurrentCanon; if(!canon) return;
  const defEl  = document.getElementById("rech-edit-def");
  const saveBtn = document.getElementById("rech-save-def");
  const newDef = defEl?.value?.trim()||"";
  if(!_rechCache[canon]) _rechCache[canon]={custom:{},excl:[],loaded:true};
  _rechCache[canon].custom.def = newDef;
  if(saveBtn){ saveBtn.textContent="…"; saveBtn.disabled=true; }
  await fbSet("rech_custom", canon, _rechCache[canon].custom).catch(()=>{});

  // Mettre à jour le bloc dict-def visible
  const dictDefEl = document.getElementById("dict-def");
  if(dictDefEl) dictDefEl.textContent = newDef || "(définition absente)";

  if(saveBtn){ saveBtn.textContent="Sauvegardé ✓"; saveBtn.disabled=false; setTimeout(()=>{ saveBtn.textContent="Mettre à jour"; },2000); }
}

async function _rechSaveDefQuiz(){
  const canon = _rechCurrentCanon; if(!canon) return;
  const quizEl  = document.getElementById("rech-edit-defquiz");
  const saveBtn = document.getElementById("rech-save-def");
  const newDef  = quizEl?.value?.trim() || "";
  if(!_rechCache[canon]) _rechCache[canon]={custom:{},excl:[],loaded:true};
  // Stocker null si vide (le jeu retombera sur def)
  if(newDef) _rechCache[canon].custom.defQuiz = newDef;
  else delete _rechCache[canon].custom.defQuiz;
  if(saveBtn){ saveBtn.textContent="…"; saveBtn.disabled=true; }
  await fbSet("rech_custom", canon, _rechCache[canon].custom).catch(()=>{});
  if(saveBtn){ saveBtn.textContent="Sauvegardé ✓"; saveBtn.disabled=false; setTimeout(()=>{ saveBtn.textContent="Mettre à jour"; },2000); }
}

/* ── Générer depuis Wiktionnaire ── */
async function rechFetchWikt(){
  const canon = _rechCurrentCanon; if(!canon) return;
  const btn = document.getElementById("rech-wikt-btn");
  if(btn){ btn.textContent="Chargement…"; btn.disabled=true; }

  const normToE = getNormToE();
  const lemma = findLemma(canon);
  const base = (lemma && lemma!==canon) ? lemma : canon;
  const display = (normToE[base]||base).split(",")[0].trim().toLowerCase().replace(/\*/g,"");

  try{
    const url = "https://fr.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*&titles="+encodeURIComponent(display);
    const resp = await fetch(url);
    const data = await resp.json();
    const page = Object.values(data.query?.pages||{})[0];
    const wikitext = page?.revisions?.[0]?.slots?.main?.["*"]
                  || page?.revisions?.[0]?.["*"] || "";
    const activeEl = document.getElementById(_rechDefActiveTab==="quiz" ? "rech-edit-defquiz" : "rech-edit-def");
    if(activeEl){
      const wiktDef = _rechParseWikt(wikitext);
      if(wiktDef){
        const existing = activeEl.value.trim();
        activeEl.value = existing ? existing + " " + wiktDef : wiktDef;
      }
    }
  }catch{
    // Erreur réseau silencieuse — le texte en cours reste intact
  }
  if(btn){ btn.textContent="Générer depuis Wiktionnaire"; btn.disabled=false; }
}

function _rechParseWikt(wikitext){
  if(!wikitext) return null;
  const frIdx = wikitext.indexOf("{{langue|fr}}");
  if(frIdx<0) return null;
  const after = wikitext.slice(frIdx);
  const nextLang = after.slice(15).search(/\n==\s*\{\{langue\|(?!fr)/);
  const fr = nextLang>0 ? after.slice(0, nextLang+15) : after;

  for(const line of fr.split("\n")){
    if(!line.startsWith("# ")||line.startsWith("## ")) continue;
    const d = line.slice(2)
      .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g,"$1")
      .replace(/\{\{[^}]+\}\}/g,"")
      .replace(/'''([^']+)'''/g,"$1")
      .replace(/''([^']+)''/g,"$1")
      .replace(/\s+/g," ").trim();
    if(d) return d;
  }
  return null;
}

/* ── Batch GM → Wiktionnaire ── */
let _gmBatchRunning = false;

async function gmBatchWikt(){
  if(!_isAdm() || _gmBatchRunning) return;

  const entries = typeof getAllGMEntries === "function" ? getAllGMEntries() : [];
  if(!entries.length){ return; }

  const btn = document.getElementById("gm-batch-wikt-btn");
  const prog = document.getElementById("gm-batch-progress");
  _gmBatchRunning = true;
  if(btn){ btn.disabled=true; btn.textContent="En cours…"; }
  if(prog){ prog.style.display=""; prog.textContent="Démarrage…"; }

  // Dédoublonner par canon ; conserver toutes les graphies comme candidats Wikt
  const seenCanons = new Set();
  const items = [];
  for(const entry of entries){
    const sortedForms = [...entry.forms].filter(f=>f&&f.trim())
      .sort((a,b)=>norm(a)<norm(b)?-1:norm(a)>norm(b)?1:0);
    if(!sortedForms.length) continue;
    const canon = norm(sortedForms[0]);
    if(seenCanons.has(canon)) continue;
    seenCanons.add(canon);
    // Toutes les graphies comme candidats Wikt (sans doublon de display)
    const seenDisp = new Set();
    const allDisplays = [];
    for(const f of sortedForms){
      const d = f.split(",")[0].trim().toLowerCase().replace(/\*/g,"");
      if(d && !seenDisp.has(d)){ seenDisp.add(d); allDisplays.push(d); }
    }
    items.push({canon, allDisplays});
  }

  let processed=0, added=0, skipped=0, failed=0;
  const total = items.length;

  const updateProg = () => {
    if(prog) prog.textContent =
      `${processed} / ${total}  —  ✓ ${added} ajoutées  ·  ⊘ ${skipped} existantes  ·  ✕ ${failed} sans déf`;
  };

  async function fetchWiktAny(displays){
    for(const display of displays){
      try{
        const url = "https://fr.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*&titles="+encodeURIComponent(display);
        const resp = await fetch(url);
        const data = await resp.json();
        const page = Object.values(data.query?.pages||{})[0];
        const wikitext = page?.revisions?.[0]?.slots?.main?.["*"] || page?.revisions?.[0]?.["*"] || "";
        const def = _rechParseWikt(wikitext);
        if(def) return def;
      }catch{}
    }
    return null;
  }

  async function processOne({canon, allDisplays}){
    // Déjà en cache avec une def → skip
    const cached = _rechCache[canon];
    if(cached?.loaded && cached.custom.def !== undefined){ skipped++; processed++; return; }

    // Vérifier Firestore
    const r = await fbGet("rech_custom", canon);
    if(r.ok && r.data?.def !== undefined){
      if(!_rechCache[canon]) _rechCache[canon]={custom:r.data, excl:[], loaded:true};
      skipped++; processed++; return;
    }

    // Essayer toutes les graphies sur Wiktionnaire
    const wiktDef = await fetchWiktAny(allDisplays);

    if(wiktDef){
      const existing = r.ok && r.data ? r.data : {};
      await fbSet("rech_custom", canon, {...existing, def: wiktDef}).catch(()=>{});
      if(!_rechCache[canon]) _rechCache[canon]={custom:{}, excl:[], loaded:true};
      _rechCache[canon].custom.def = wiktDef;
      added++;
    } else {
      failed++;
    }
    processed++;
  }

  // Traitement par groupes de 4 en parallèle
  const CONCURRENCY = 4;
  for(let i=0; i<items.length; i+=CONCURRENCY){
    await Promise.all(items.slice(i, i+CONCURRENCY).map(processOne));
    updateProg();
  }

  if(prog) prog.textContent =
    `Terminé  —  ✓ ${added} ajoutées  ·  ⊘ ${skipped} existantes  ·  ✕ ${failed} sans déf Wiktionnaire`;
  if(btn){ btn.disabled=false; btn.textContent="Batch GM → Wiktionnaire"; }
  _gmBatchRunning = false;
}

/* ── Batch ODS → Wiktionnaire ── */
let _odsBatchRunning = false;

async function odsBatchWikt(){
  if(!_isAdm() || _odsBatchRunning) return;
  const DATA = window.SEQODS_DATA;
  if(!DATA) return;

  const btn  = document.getElementById("ods-batch-wikt-btn");
  const prog = document.getElementById("ods-batch-progress");
  _odsBatchRunning = true;
  if(btn){ btn.disabled=true; btn.textContent="En cours…"; }
  if(prog){ prog.style.display=""; prog.textContent="Démarrage…"; }

  function isOdsEmpty(fv){
    if(!fv) return true;
    if(fv.includes("(= ")||fv.includes("-->")) return false;
    let s = fv.replace(/\[[^\]]*\]/g,"").replace(/\([^)]+\)/g,"");
    s = s.replace(/\b(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part|préf|suff|aff|sym|m|f|pl)\b\.?/gi,"");
    s = s.replace(/\b(?:Vx|Fam|Arg|Litt|Poét)\b\.?/gi,"");
    s = s.replace(/[0-9.,:;!?\-/\s]/g,"");
    return s.length < 3;
  }

  const seenCanons = new Set();
  const items = [];
  for(let i=0; i<DATA.e.length; i++){
    if(!isOdsEmpty(DATA.f[i])) continue;
    const canon = DATA.c[i];
    if(!canon||seenCanons.has(canon)) continue;
    seenCanons.add(canon);
    const w = DATA.e[i].split(",")[0].split("/")[0].replace(/^\(SE\)\s*/i,"").trim().toLowerCase();
    if(w) items.push({canon, display:w});
  }

  let processed=0, added=0, skipped=0, failed=0;
  const total = items.length;
  const updateProg = ()=>{
    if(prog) prog.textContent=`${processed}/${total}  —  ✓ ${added}  ·  ⊘ ${skipped}  ·  ✕ ${failed}`;
  };

  async function processOne({canon, display}){
    if(_rechCache[canon]?.loaded && _rechCache[canon].custom.def!==undefined){ skipped++; processed++; return; }
    const r = await fbGet("rech_custom", canon);
    if(r.ok && r.data?.def!==undefined){ skipped++; processed++; return; }
    if(r.err==="network"){ processed++; return; }
    try{
      const url = "https://fr.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*&titles="+encodeURIComponent(display);
      const data = await (await fetch(url)).json();
      const page = Object.values(data.query?.pages||{})[0];
      const wikitext = page?.revisions?.[0]?.slots?.main?.["*"]||page?.revisions?.[0]?.["*"]||"";
      const def = _rechParseWikt(wikitext);
      if(def){
        const existing = r.ok&&r.data ? r.data : {};
        await fbSet("rech_custom", canon, {...existing, def}).catch(()=>{});
        if(!_rechCache[canon]) _rechCache[canon]={custom:{},excl:[],loaded:true};
        _rechCache[canon].custom.def = def;
        added++;
      } else { failed++; }
    } catch { failed++; }
    processed++;
  }

  const CONCURRENCY = 4;
  for(let i=0; i<items.length; i+=CONCURRENCY){
    await Promise.all(items.slice(i,i+CONCURRENCY).map(processOne));
    updateProg();
  }
  if(prog) prog.textContent=`Terminé  —  ✓ ${added}  ·  ⊘ ${skipped} existantes  ·  ✕ ${failed} sans déf`;
  if(btn){ btn.disabled=false; btn.textContent="Batch ODS → Wiktionnaire"; }
  _odsBatchRunning = false;
}

/* ── Wiring ── */
function wireRechercheAdmin(){
  document.getElementById("rech-modules")?.addEventListener("click", e=>{
    const btn = e.target.closest(".rech-mod-btn"); if(!btn) return;
    rechToggleExclusion(_rechCurrentCanon, btn.dataset.mod, btn.dataset.label, btn);
  });
  document.getElementById("rech-save-def")?.addEventListener("click", rechSaveDef);
  document.getElementById("rech-wikt-btn")?.addEventListener("click", rechFetchWikt);
  document.getElementById("gm-batch-wikt-btn")?.addEventListener("click", gmBatchWikt);
  document.getElementById("ods-batch-wikt-btn")?.addEventListener("click", odsBatchWikt);

  // Onglets définition / quiz
  document.getElementById("rech-def-tab-def")?.addEventListener("click", ()=>_rechSwitchDefTab("def"));
  document.getElementById("rech-def-tab-quiz")?.addEventListener("click", ()=>_rechSwitchDefTab("quiz"));

  // Masquer le clavier app quand une zone de texte est active (évite le double clavier)
  const rechKb = document.getElementById("rech-kb");
  ["rech-edit-def","rech-edit-defquiz"].forEach(id=>{
    document.getElementById(id)?.addEventListener("focus", ()=>{ if(rechKb) rechKb.style.display="none"; });
    document.getElementById(id)?.addEventListener("blur",  ()=>{ if(rechKb) rechKb.style.display=""; });
  });

  window._onDictOpen = ()=>{
    const el = document.getElementById("rech-admin-global");
    if(el) el.style.display = _isAdm() ? "" : "none";
  };
}

window._onDictSelect = rechShowAdmin;
