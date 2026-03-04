(function(){
"use strict";
const $ = (s)=>document.querySelector(s);

/* ===========================
   CONFIG DROPBOX
=========================== */
const DROPBOX_APP_KEY = "5r5cxyemzt778me";
const DROPBOX_STATE_PATH = "/state.json";

// Archivage des cartes vues (un fichier texte par fiche)
const DROPBOX_ARCHIVE_DIR = "/cartes_vues";

// stockage tokens + pkce
const LS_TOKENS = "SEQODS_DBX_TOKENS_V5";
const LS_PKCE   = "SEQODS_DBX_PKCE_V4";

// état local
const STORE_LOCAL = "SEQODS_LOCAL_STATE_V5";

/* ===========================
   UTIL
=========================== */
function normalizeWord(s){
  return (s||"").toString().trim().toUpperCase()
    .replace(/\s+/g,"")
    .replace(/[’'`´]/g,"'");
}
function todayStr(){
  return new Intl.DateTimeFormat("fr-CA",{year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function addDays(ymd, days){
  const [y,m,d]=ymd.split("-").map(Number);
  const dt=new Date(y,m-1,d);
  dt.setDate(dt.getDate()+days);
  return new Intl.DateTimeFormat("fr-CA",{year:"numeric",month:"2-digit",day:"2-digit"}).format(dt);
}
function cmpDate(a,b){ return a.localeCompare(b); }
function tirageFromC(c){
  const n = normalizeWord(c);
  return n.split("").sort((a,b)=>a.localeCompare(b,"fr")).join("");
}
function setMessage(t,cls){
  const el=$("#msg");
  if(!el) return;
  el.textContent = t || "";
  el.className = cls ? `msg ${cls}` : "msg";
}
function currentRedirectUri(){
  const u = new URL(window.location.href);
  u.search = "";
  u.hash = "";
  return u.toString();
}
function pad4(n){ return String(n).padStart(4, "0"); }

/* ===========================
   LOCAL STATE
=========================== */
function defaultState(){
  return {
    updatedAt: Date.now(),
    dbxRev: null,
    lists: {},           // seqIndex -> { due, interval, seen, validated, lastResult, lastSeen }

    // Archivage Dropbox des cartes vues
    archiveNext: 1,      // prochain numéro à attribuer
    archiveBySeq: {}     // seqIndex -> numéro attribué
  };
}
function mergeDefaults(obj){
  const base = defaultState();
  if(!obj || typeof obj !== "object") return base;

  // Merge simple, en conservant les objets existants
  const out = Object.assign(base, obj);
  out.lists = Object.assign({}, base.lists, obj.lists || {});
  out.archiveBySeq = Object.assign({}, base.archiveBySeq, obj.archiveBySeq || {});
  if(typeof out.archiveNext !== "number" || !Number.isFinite(out.archiveNext) || out.archiveNext < 1){
    out.archiveNext = base.archiveNext;
  }
  return out;
}
function loadLocal(){
  try{
    const o = JSON.parse(localStorage.getItem(STORE_LOCAL)||"null");
    return mergeDefaults(o);
  }catch{
    return defaultState();
  }
}
function saveLocal(st){
  try{ localStorage.setItem(STORE_LOCAL, JSON.stringify(st)); }catch{}
}

/* ===========================
   SRS
=========================== */
const INTERVALS=[1,3,7,14,30,60,120];
function nextInterval(cur){
  const i=INTERVALS.indexOf(cur);
  if(i<0) return 3;
  return INTERVALS[Math.min(INTERVALS.length-1,i+1)];
}
function ensureListState(st, seqIndex){
  const k=String(seqIndex);
  if(!st.lists[k]){
    st.lists[k] = { due: todayStr(), interval: 1, seen:false, validated:false, lastResult:"", lastSeen:"" };
  }
  return st.lists[k];
}

/* ===========================
   DROPBOX TOKENS
=========================== */
function saveTokens(t){ try{ localStorage.setItem(LS_TOKENS, JSON.stringify(t)); }catch{} }
function loadTokens(){ try{ return JSON.parse(localStorage.getItem(LS_TOKENS)||"null"); }catch{ return null; } }
function hasValidAccessToken(t){
  return t && t.access_token && t.expires_at && Date.now() < (t.expires_at - 30_000);
}

/* ===========================
   PKCE (SYNC)
=========================== */
function base64urlFromBytes(bytes){
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function randomVerifier(len=64){
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return base64urlFromBytes(arr);
}
function sha256Sync(ascii){
  function rightRotate(v, a){ return (v>>>a) | (v<<(32-a)); }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);

  const words = [];
  const bitLen = ascii.length * 8;

  const hash = sha256Sync.h = sha256Sync.h || [];
  const k = sha256Sync.k = sha256Sync.k || [];
  let pc = k.length;

  const isComp = {};
  for (let c = 2; pc < 64; c++) {
    if (!isComp[c]) {
      for (let i = 0; i < 313; i += c) isComp[i] = c;
      hash[pc] = (mathPow(c, .5) * maxWord) | 0;
      k[pc++]  = (mathPow(c, 1/3) * maxWord) | 0;
    }
  }

  ascii += "\x80";
  while (ascii.length % 64 - 56) ascii += "\x00";
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i>>2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = (bitLen / maxWord) | 0;
  words[words.length] = (bitLen) | 0;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, j += 16);
    const old = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];

      const t1 = (hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0)
      ) | 0;

      const t2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))
      ) | 0;

      hash.unshift((t1 + t2) | 0);
      hash[4] = (hash[4] + t1) | 0;
      hash.pop();
    }

    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++){
    out[i*4+0] = (hash[i] >>> 24) & 0xff;
    out[i*4+1] = (hash[i] >>> 16) & 0xff;
    out[i*4+2] = (hash[i] >>> 8) & 0xff;
    out[i*4+3] = (hash[i] >>> 0) & 0xff;
  }
  return out;
}
function codeChallengeFromVerifier(verifier){
  return base64urlFromBytes(sha256Sync(verifier));
}

/* ===========================
   PKCE STORE (window.name + localStorage)
=========================== */
function pkceSave(payload){
  try{ window.name = "SEQODS_PKCE::" + JSON.stringify(payload); }catch{}
  try{ localStorage.setItem(LS_PKCE, JSON.stringify(payload)); }catch{}
}
function pkceLoad(){
  try{
    if(typeof window.name === "string" && window.name.startsWith("SEQODS_PKCE::")){
      return JSON.parse(window.name.slice("SEQODS_PKCE::".length));
    }
  }catch{}
  try{ return JSON.parse(localStorage.getItem(LS_PKCE)||"null"); }catch{ return null; }
}
function pkceClear(){
  try{ if(typeof window.name==="string" && window.name.startsWith("SEQODS_PKCE::")) window.name=""; }catch{}
  try{ localStorage.removeItem(LS_PKCE); }catch{}
}

/* ===========================
   OAUTH DROPBOX (PKCE)
=========================== */
function oauthStart(){
  const redirectUri = currentRedirectUri();
  const verifier = randomVerifier(64);
  const challenge = codeChallengeFromVerifier(verifier);

  pkceSave({ verifier, redirectUri, ts: Date.now() });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: DROPBOX_APP_KEY,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    token_access_type: "offline",
    scope: "files.content.read files.content.write"
  });

  window.location.href = "https://www.dropbox.com/oauth2/authorize?" + params.toString();
}

async function oauthHandleRedirectIfNeeded(){
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if(!code) return false;

  const pk = pkceLoad();
  pkceClear();

  if(!pk || !pk.verifier || !pk.redirectUri){
    setMessage("Erreur OAuth Dropbox : PKCE introuvable après retour.", "err");
    return false;
  }

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: DROPBOX_APP_KEY,
    redirect_uri: pk.redirectUri,
    code_verifier: pk.verifier
  });

  const r = await fetch("https://api.dropboxapi.com/oauth2/token",{
    method:"POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if(!r.ok){
    let details="";
    try{ details = await r.text(); }catch{}
    console.error("Dropbox /token error", r.status, details);
    setMessage("Erreur OAuth Dropbox : " + (details || ("HTTP "+r.status)), "err");
    return false;
  }

  const tok = await r.json();
  const expiresAt = Date.now() + (tok.expires_in ? tok.expires_in*1000 : 3_600_000);

  saveTokens({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: expiresAt
  });

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.toString());

  setMessage("Dropbox connecté.", "ok");
  return true;
}

async function refreshAccessTokenIfNeeded(){
  const t = loadTokens();
  if(hasValidAccessToken(t)) return t;
  if(!t || !t.refresh_token) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: t.refresh_token,
    client_id: DROPBOX_APP_KEY
  });

  const r = await fetch("https://api.dropboxapi.com/oauth2/token",{
    method:"POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if(!r.ok) return null;

  const tok = await r.json();
  const expiresAt = Date.now() + (tok.expires_in ? tok.expires_in*1000 : 3_600_000);

  const merged = {
    access_token: tok.access_token,
    refresh_token: t.refresh_token,
    expires_at: expiresAt
  };
  saveTokens(merged);
  return merged;
}

/* ===========================
   DROPBOX FILES API (JSON + TEXT + DOSSIERS)
=========================== */
async function dbxDownloadJson(path){
  const t = await refreshAccessTokenIfNeeded();
  if(!t) return { ok:false, err:"not_connected" };

  const r = await fetch("https://content.dropboxapi.com/2/files/download",{
    method:"POST",
    headers:{
      "Authorization": "Bearer " + t.access_token,
      "Dropbox-API-Arg": JSON.stringify({ path })
    }
  });

  if(r.status === 409) return { ok:false, err:"not_found" };
  if(!r.ok) return { ok:false, err:"download_failed" };

  let rev=null;
  try{
    const meta = JSON.parse(r.headers.get("Dropbox-API-Result") || "null");
    rev = meta && meta.rev ? meta.rev : null;
  }catch{}

  const text = await r.text();
  try{
    return { ok:true, data: JSON.parse(text), rev };
  }catch{
    return { ok:false, err:"bad_json" };
  }
}

async function dbxUploadJson(path, obj, rev){
  const t = await refreshAccessTokenIfNeeded();
  if(!t) return { ok:false, err:"not_connected" };

  const mode = rev ? { ".tag":"update", "update": rev } : { ".tag":"overwrite" };
  const content = JSON.stringify(obj);

  const r = await fetch("https://content.dropboxapi.com/2/files/upload",{
    method:"POST",
    headers:{
      "Authorization":"Bearer " + t.access_token,
      "Content-Type":"application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path,
        mode,
        autorename:false,
        mute:true,
        strict_conflict:true
      })
    },
    body: content
  });

  if(!r.ok) return { ok:false, err: r.status===409 ? "conflict" : "upload_failed" };

  let meta=null;
  try{ meta = await r.json(); }catch{}
  return { ok:true, rev: meta && meta.rev ? meta.rev : null };
}

async function dbxCreateFolder(path){
  const t = await refreshAccessTokenIfNeeded();
  if(!t) return { ok:false, err:"not_connected" };

  const r = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2",{
    method:"POST",
    headers:{
      "Authorization":"Bearer " + t.access_token,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({ path, autorename: false })
  });

  if(r.ok) return { ok:true };
  if(r.status === 409) return { ok:true }; // déjà existant
  return { ok:false, err:"create_folder_failed" };
}

async function dbxUploadText(path, text){
  const t = await refreshAccessTokenIfNeeded();
  if(!t) return { ok:false, err:"not_connected" };

  const r = await fetch("https://content.dropboxapi.com/2/files/upload",{
    method:"POST",
    headers:{
      "Authorization":"Bearer " + t.access_token,
      "Content-Type":"application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path,
        mode: { ".tag":"add" },     // n’écrase pas
        autorename: false,
        mute: true,
        strict_conflict: true
      })
    },
    body: text
  });

  if(r.ok) return { ok:true };
  if(r.status === 409) return { ok:true }; // fichier déjà créé
  return { ok:false, err:"upload_text_failed" };
}

/* ===========================
   DATA (data.js)
=========================== */
const DATA = window.SEQODS_DATA;
if(!DATA){
  console.error("SEQODS_DATA absent. Vérifie data.js.");
}
const C = DATA?.c || [];
const E = DATA?.e || [];
const F = DATA?.f || [];
const A = DATA?.a || {}; // anagrammes : tirage -> liste

const sequences = [];
for(let start=0; start+11<C.length; start+=12){
  sequences.push({ startIdx:start, endIdx:start+11 });
}
const TOTAL = sequences.length;

/* ===========================
   GAME STATE
=========================== */
let state = loadLocal();
let currentSeqIndex = -1;
let seq = null;
let targets = [];
let found = new Set();
let hintMode = Array(10).fill("none");
let noHelpRun = true;

/* ===========================
   DEFINITIONS / ANAGRAMMES
=========================== */
function openDef(defText, titleWord, canonForAnagrams){
  const tEl=$("#defTitle"), bEl=$("#defBody"), mEl=$("#defModal");
  if(!tEl || !bEl || !mEl) return;

  tEl.textContent = titleWord || "";
  bEl.textContent = defText || "(définition absente)";

  const anaWrap=$("#anaWrap"), ana=$("#defAna");
  if(anaWrap && ana){
    const base=normalizeWord(canonForAnagrams || titleWord || "");
    const tir = base ? base.split("").sort((a,b)=>a.localeCompare(b,"fr")).join("") : "";
    const lst = (tir && A[tir]) ? A[tir].slice() : [];
    const filtered = base ? lst.filter(x=>normalizeWord(x)!==base) : lst;

    if(!tir || filtered.length===0){
      anaWrap.style.display="none";
      ana.textContent="";
    }else{
      anaWrap.style.display="block";
      const shown = filtered.slice(0,60);
      ana.textContent = shown.join(" • ") + (filtered.length>60 ? ` … (+${filtered.length-60})` : "");
    }
  }

  mEl.classList.add("open");
}
function closeDef(){
  const mEl=$("#defModal");
  if(mEl) mEl.classList.remove("open");
}

/* ===========================
   PROGRESSION UI
=========================== */
function computeStats(){
  const seenBar=$("#seenBar"), valBar=$("#valBar"), seenCount=$("#seenCount"), valCount=$("#valCount");
  if(!seenBar || !valBar || !seenCount || !valCount) return;

  let seen=0, validated=0;
  for(const k in state.lists){
    if(state.lists[k]?.seen) seen++;
    if(state.lists[k]?.validated) validated++;
  }

  seenCount.textContent = `${seen}/${TOTAL}`;
  valCount.textContent  = `${validated}/${TOTAL}`;
  seenBar.style.width = `${Math.round((seen/TOTAL)*100)}%`;
  valBar.style.width  = `${Math.round((validated/TOTAL)*100)}%`;
}

/* ===========================
   ARCHIVAGE DROBOX (cartes vues)
=========================== */
async function archiveCardIfFirstSeen(seqIndex){
  const key = String(seqIndex);
  if(!state.archiveBySeq) state.archiveBySeq = {};
  if(state.archiveBySeq[key]) return; // déjà archivée

  // Assure dossier
  await dbxCreateFolder(DROPBOX_ARCHIVE_DIR);

  // Alloue un numéro
  if(!state.archiveNext || !Number.isFinite(state.archiveNext) || state.archiveNext < 1){
    state.archiveNext = 1;
  }
  const num = state.archiveNext;
  state.archiveNext = num + 1;
  state.archiveBySeq[key] = num;
  state.updatedAt = Date.now();
  saveLocal(state);

  // Persiste immédiatement l’état (pour que l’index reste cohérent entre appareils)
  persistState().catch(()=>{});

  // Construit le texte
  const s = sequences[seqIndex];
  if(!s) return;

  const borneA = E[s.startIdx] || "";
  const borneB = E[s.endIdx] || "";
  const date = todayStr();

  const lines = [];
  lines.push(`Fiche ${pad4(num)}`);
  lines.push(`Date : ${date}`);
  lines.push("");
  lines.push(`Borne A : ${borneA}`);
  lines.push(`Borne B : ${borneB}`);
  lines.push("");
  lines.push("Solutions :");
  for(let i=s.startIdx+1, k=1; i<=s.startIdx+10; i++, k++){
    const sol = E[i] || "";
    lines.push(`${k}. ${sol}`);
  }
  lines.push("");
  lines.push("—");

  const text = lines.join("\n");
  const filePath = `${DROPBOX_ARCHIVE_DIR}/${pad4(num)}.txt`;
  await dbxUploadText(filePath, text);
}

/* ===========================
   SRS PICK
=========================== */
function eligibleDueSeqIndexes(){
  const today=todayStr();
  const due=[];
  let soonest=null;

  for(let i=0;i<TOTAL;i++){
    const st = ensureListState(state, i);
    if(st.validated) continue;

    const d = st.due || today;
    if(cmpDate(d, today) <= 0) due.push(i);
    else if(!soonest || cmpDate(d, soonest.date) < 0) soonest = { index:i, date:d };
  }
  return { due, soonest };
}

function pickSequence(){
  const { due, soonest } = eligibleDueSeqIndexes();

  if(due.length>0){
    currentSeqIndex = due[Math.floor(Math.random()*due.length)];
  }else if(soonest){
    currentSeqIndex = soonest.index;
    setMessage(`Aucune liste due aujourd’hui. Prochaine échéance : ${soonest.date}.`, "warn");
  }else{
    setMessage("Jeu terminé : toutes les listes sont validées.", "ok");
    return false;
  }

  seq = sequences[currentSeqIndex];

  targets=[];
  for(let i=seq.startIdx+1;i<=seq.startIdx+10;i++){
    const c=C[i];
    targets.push({
      c,
      e:E[i],
      f:F[i] || "",
      len: normalizeWord(c).length,
      t: tirageFromC(c)
    });
  }

  found=new Set();
  hintMode=Array(10).fill("none");
  noHelpRun=true;

  const st = ensureListState(state, currentSeqIndex);
  const firstTimeSeen = !st.seen;

  st.seen = true;
  st.lastSeen = todayStr();
  state.updatedAt = Date.now();

  // Archive une fois, au moment de la première vue
  if(firstTimeSeen){
    archiveCardIfFirstSeen(currentSeqIndex).catch(()=>{});
  }

  return true;
}

/* ===========================
   RENDER
=========================== */
function renderBounds(){
  const a=$("#borneA"), b=$("#borneB");
  if(!a || !b) return;

  const aE=E[seq.startIdx] || "";
  const bE=E[seq.endIdx] || "";
  const aF=F[seq.startIdx] || "";
  const bF=F[seq.endIdx] || "";

  a.textContent = aE;
  b.textContent = bE;

  a.onclick = ()=>openDef(aF, aE, C[seq.startIdx]);
  b.onclick = ()=>openDef(bF, bE, C[seq.endIdx]);
}

function renderSlots(){
  const list=$("#liste");
  if(!list) return;

  list.innerHTML="";
  for(let i=0;i<10;i++){
    const li=document.createElement("li");
    li.className="slot";
    li.dataset.slot=String(i);
    li.innerHTML=`
      <div class="slotMain">
        <button type="button" class="slotWordBtn">
          <span class="slotText"></span>
          <span class="slotHint"></span>
        </button>
      </div>
      <div class="slotTools">
        <button class="toolBtn" data-tool="len" title="Longueur">123</button>
        <button class="toolBtn" data-tool="tirage" title="Tirage">ABC</button>
        <button class="toolBtn" data-tool="def" title="Définition">📖</button>
      </div>`;
    list.appendChild(li);
  }
  applyHintsAll();
}

function applyHint(i){
  const li=$("#liste")?.querySelector(`li[data-slot="${i}"]`);
  if(!li) return;

  const hint=li.querySelector(".slotHint");
  if(!hint) return;

  if(found.has(i)){
    hint.style.display="none";
    li.querySelectorAll(".toolBtn").forEach(b=>b.disabled=true);
    return;
  }

  li.querySelectorAll(".toolBtn").forEach(b=>b.disabled=false);

  if(hintMode[i]==="len"){
    hint.textContent = String(targets[i].len);
    hint.style.display="flex";
  }else if(hintMode[i]==="tirage"){
    hint.textContent = targets[i].t;
    hint.style.display="flex";
  }else{
    hint.style.display="none";
  }
}
function applyHintsAll(){ for(let i=0;i<10;i++) applyHint(i); }

function revealSlot(i){
  const li=$("#liste")?.querySelector(`li[data-slot="${i}"]`);
  if(!li) return;

  const btn=li.querySelector(".slotWordBtn");
  const txt=li.querySelector(".slotText");
  if(txt) txt.textContent = targets[i].e; // affichage colonne E

  if(btn){
    btn.dataset.def = targets[i].f || "";
    btn.dataset.word = targets[i].e || "";
    btn.dataset.canon = targets[i].c || "";
  }

  hintMode[i]="none";
  applyHint(i);
}

function markAidUsed(){ noHelpRun=false; }

function updateCounter(){
  const c=$("#compteur");
  if(c) c.textContent = `${found.size}/10`;

  if(found.size !== 10) return;

  const ls = ensureListState(state, currentSeqIndex);

  if(noHelpRun){
    ls.validated = true;
    ls.lastResult = "ok";
    ls.interval = nextInterval(ls.interval || 1);
    ls.due = addDays(todayStr(), ls.interval);
    setMessage("Validée sans aide.", "ok");
  }else{
    ls.validated = false;
    ls.lastResult = "help";
    ls.interval = 1;
    ls.due = addDays(todayStr(), 1);
    setMessage("Liste terminée, mais avec aide.", "warn");
  }

  state.updatedAt = Date.now();
  computeStats();
  persistState().catch(()=>{});
}

function validateWord(raw){
  const norm=normalizeWord(raw);
  if(!norm){ setMessage("Saisie vide.", "warn"); return; }

  const matched=[];
  for(let i=0;i<targets.length;i++){
    if(normalizeWord(targets[i].c)===norm) matched.push(i);
  }

  if(matched.length===0){
    setMessage("Ce mot ne fait pas partie des 10 entrées à trouver.", "warn");
    return;
  }

  let newly=0;
  for(const i of matched){
    if(!found.has(i)){
      found.add(i);
      revealSlot(i);
      newly++;
    }
  }

  if(newly===0) setMessage("Ce mot est déjà validé.", "warn");
  else setMessage(matched.length>1 ? "Validé (doublon)." : "Validé.", "ok");

  updateCounter();
}

function showSolutions(){
  markAidUsed();
  for(let i=0;i<10;i++){
    if(!found.has(i)){
      found.add(i);
      revealSlot(i);
    }
  }
  updateCounter();
  setMessage("Solutions affichées.", "warn");
}

/* ===========================
   PERSISTENCE (Local + Dropbox)
=========================== */
async function persistState(){
  saveLocal(state);

  const t = await refreshAccessTokenIfNeeded();
  const btn=$("#btnDropbox");
  if(!t){
    if(btn) btn.textContent = "Connexion Dropbox";
    return;
  }
  if(btn) btn.textContent = "Dropbox OK";

  const res = await dbxUploadJson(DROPBOX_STATE_PATH, state, state.dbxRev);

  if(res.ok){
    state.dbxRev = res.rev || state.dbxRev;
    state.updatedAt = Date.now();
    saveLocal(state);
    return;
  }

  if(res.err==="conflict"){
    const remote = await dbxDownloadJson(DROPBOX_STATE_PATH);
    if(remote.ok){
      const remoteState = mergeDefaults(remote.data);
      const chooseRemote = (remoteState.updatedAt||0) >= (state.updatedAt||0);
      state = chooseRemote ? remoteState : state;
      state.dbxRev = remote.rev || state.dbxRev || null;

      const res2 = await dbxUploadJson(DROPBOX_STATE_PATH, state, state.dbxRev);
      if(res2.ok){
        state.dbxRev = res2.rev || state.dbxRev;
        saveLocal(state);
        return;
      }
    }
    setMessage("Conflit Dropbox : réessaie.", "warn");
    return;
  }

  setMessage("Synchro Dropbox : échec.", "warn");
}

async function loadStatePreferDropbox(){
  // local d’abord
  state = loadLocal();
  computeStats();

  const t = await refreshAccessTokenIfNeeded();
  const btn=$("#btnDropbox");
  if(!t){
    if(btn) btn.textContent = "Connexion Dropbox";
    return;
  }
  if(btn) btn.textContent = "Dropbox OK";

  const remote = await dbxDownloadJson(DROPBOX_STATE_PATH);
  if(remote.ok){
    const remoteState = mergeDefaults(remote.data);
    const chooseRemote = (remoteState.updatedAt||0) >= (state.updatedAt||0);
    state = chooseRemote ? remoteState : state;
    state.dbxRev = remote.rev || state.dbxRev || null;
    saveLocal(state);
    computeStats();
    return;
  }

  if(remote.err==="not_found"){
    await persistState();
  }
}

/* ===========================
   WIRE
=========================== */
function wire(){
  const btnN=$("#btnNouveau");
  if(btnN) btnN.addEventListener("click", ()=>{
    if(pickSequence()) renderAll();
  });

  const btnV=$("#btnValider");
  if(btnV) btnV.addEventListener("click", ()=>{
    const inp=$("#saisie");
    validateWord(inp ? inp.value : "");
    if(inp){ inp.value=""; inp.focus(); }
  });

  const inp=$("#saisie");
  if(inp) inp.addEventListener("keydown",(e)=>{
    if(e.key==="Enter"){
      e.preventDefault();
      const btn=$("#btnValider");
      if(btn) btn.click();
    }
  });

  const btnS=$("#btnSolutions");
  if(btnS) btnS.addEventListener("click", showSolutions);

  const btnD=$("#btnDropbox");
  if(btnD) btnD.addEventListener("click", async ()=>{
    const t = loadTokens();
    if(t && (t.refresh_token || hasValidAccessToken(t))){
      setMessage("Synchronisation…", "");
      await persistState();
      setMessage("Synchronisation terminée.", "ok");
      return;
    }
    oauthStart();
  });

  const list=$("#liste");
  if(list) list.addEventListener("click",(e)=>{
    const tool = e.target.closest(".toolBtn");
    if(tool){
      const li=tool.closest(".slot");
      const i=Number(li?.dataset?.slot ?? -1);
      if(i<0 || i>9) return;

      const which=tool.dataset.tool;
      if(which==="def"){
        markAidUsed();
        openDef(targets[i].f || "", "", targets[i].c);
        return;
      }

      markAidUsed();
      if(found.has(i)) return;

      hintMode[i] = (hintMode[i]===which) ? "none" : which;
      applyHint(i);
      return;
    }

    const w = e.target.closest(".slotWordBtn");
    if(w){
      const li=w.closest(".slot");
      const i=Number(li?.dataset?.slot ?? -1);
      if(i<0 || i>9) return;
      if(!found.has(i)) return;
      openDef(w.dataset.def||"", w.dataset.word||"", w.dataset.canon||"");
    }
  });

  const defClose=$("#defClose");
  if(defClose) defClose.addEventListener("click", closeDef);
  const defBackdrop=$("#defBackdrop");
  if(defBackdrop) defBackdrop.addEventListener("click", closeDef);
  document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") closeDef(); });

  window.addEventListener("beforeunload", ()=>{ saveLocal(state); });
}

function renderAll(){
  renderBounds();
  renderSlots();
  const c=$("#compteur");
  if(c) c.textContent="0/10";
  setMessage("");
  computeStats();
  const inp=$("#saisie");
  if(inp) inp.value="";
}

/* ===========================
   START
=========================== */
async function start(){
  wire();

  // OAuth retour
  await oauthHandleRedirectIfNeeded();

  // State
  await loadStatePreferDropbox();

  // Séquence
  if(pickSequence()) renderAll();

  // autosync
  setInterval(()=>{ persistState().catch(()=>{}); }, 60_000);
}

document.addEventListener("DOMContentLoaded", start);

})();
