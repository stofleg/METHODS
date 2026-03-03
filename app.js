(function(){
"use strict";

const $ = (s)=>document.querySelector(s);

/* ===========================
   CONFIG DROPBOX
=========================== */

const DROPBOX_APP_KEY = "5r5cxyemzt778me";
const DROPBOX_STATE_PATH = "/state.json";

const LS_TOKENS = "SEQODS_DBX_TOKENS_V1";
const STORE_LOCAL = "SEQODS_LOCAL_STATE_V3";
const SS_REDIRECT_URI = "SEQODS_DBX_REDIRECT_URI_V1"; // IMPORTANT

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
function setMessage(t,cls){
  const el=$("#msg");
  if(!el) return;
  el.textContent=t||"";
  el.className=cls?`msg ${cls}`:"msg";
}

/* ===========================
   LOCAL STATE
=========================== */

function defaultState(){
  return { updatedAt: Date.now(), lists:{} };
}
function loadLocal(){
  try{ return JSON.parse(localStorage.getItem(STORE_LOCAL)||"null")||defaultState(); }
  catch{ return defaultState(); }
}
function saveLocal(st){
  localStorage.setItem(STORE_LOCAL, JSON.stringify(st));
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

/* ===========================
   DROPBOX TOKENS
=========================== */

function saveTokens(t){ localStorage.setItem(LS_TOKENS,JSON.stringify(t)); }
function loadTokens(){ try{return JSON.parse(localStorage.getItem(LS_TOKENS)||"null");}catch{return null;} }

/* ===========================
   DROPBOX OAUTH (redirect_uri robuste)
=========================== */

function currentRedirectUri(){
  // Conserve exactement le chemin actuel, iOS compris
  // ex: https://stofleg.github.io/seqods/  OU  https://stofleg.github.io/seqods
  const u = new URL(window.location.href);
  u.search = "";
  u.hash = "";
  return u.toString();
}

function oauthStart(){
  const redirectUri = currentRedirectUri();
  sessionStorage.setItem(SS_REDIRECT_URI, redirectUri);

  const params=new URLSearchParams({
    response_type:"code",
    client_id:DROPBOX_APP_KEY,
    redirect_uri: redirectUri,
    token_access_type:"offline"
  });
  window.location.href="https://www.dropbox.com/oauth2/authorize?"+params.toString();
}

async function handleOAuth(){
  const url=new URL(window.location.href);
  const code=url.searchParams.get("code");
  if(!code) return false;

  const redirectUri = sessionStorage.getItem(SS_REDIRECT_URI) || currentRedirectUri();
  sessionStorage.removeItem(SS_REDIRECT_URI);

  const body=new URLSearchParams({
    code,
    grant_type:"authorization_code",
    client_id:DROPBOX_APP_KEY,
    redirect_uri: redirectUri
  });

  const r=await fetch("https://api.dropboxapi.com/oauth2/token",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:body.toString()
  });

  if(!r.ok){
    // Debug minimal (utile si ça re-bloque sur iPhone)
    let details = "";
    try{ details = await r.text(); }catch{}
    console.error("Dropbox token error", r.status, details);
    setMessage("Erreur OAuth Dropbox", "err");
    return false;
  }

  const tok=await r.json();
  saveTokens(tok);

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.toString());

  setMessage("Dropbox connecté", "ok");
  return true;
}

/* ===========================
   DROPBOX FILES API
=========================== */

async function dbxUpload(obj){
  const tok=loadTokens();
  if(!tok||!tok.access_token) return;

  await fetch("https://content.dropboxapi.com/2/files/upload",{
    method:"POST",
    headers:{
      "Authorization":"Bearer "+tok.access_token,
      "Content-Type":"application/octet-stream",
      "Dropbox-API-Arg":JSON.stringify({ path:DROPBOX_STATE_PATH, mode:"overwrite" })
    },
    body:JSON.stringify(obj)
  });
}

async function dbxDownload(){
  const tok=loadTokens();
  if(!tok||!tok.access_token) return null;

  const r=await fetch("https://content.dropboxapi.com/2/files/download",{
    method:"POST",
    headers:{
      "Authorization":"Bearer "+tok.access_token,
      "Dropbox-API-Arg":JSON.stringify({path:DROPBOX_STATE_PATH})
    }
  });

  if(!r.ok) return null;
  return JSON.parse(await r.text());
}

/* ===========================
   GAME (version minimale stable)
=========================== */

const DATA=window.SEQODS_DATA;
const C=DATA.c, E=DATA.e;

const sequences=[];
for(let i=0;i+11<C.length;i+=12){ sequences.push({start:i}); }
const TOTAL=sequences.length;

let state=loadLocal();
let current=-1;
let targets=[];
let found=new Set();
let noHelp=true;

function pick(){
  current=Math.floor(Math.random()*TOTAL);
  const seq=sequences[current];
  targets=[];
  for(let i=seq.start+1;i<=seq.start+10;i++){
    targets.push({c:C[i],e:E[i]});
  }
  found=new Set();
  noHelp=true;
}

function render(){
  const a=$("#borneA"), b=$("#borneB"), list=$("#liste");
  if(!a||!b||!list) return;

  const seq=sequences[current];
  a.textContent=E[seq.start];
  b.textContent=E[seq.start+11];

  list.innerHTML="";
  targets.forEach((t,i)=>{
    const li=document.createElement("li");
    li.textContent=found.has(i)?t.e:"";
    list.appendChild(li);
  });

  const c=$("#compteur");
  if(c) c.textContent=`${found.size}/10`;
}

function validate(){
  const input=$("#saisie");
  if(!input) return;
  const val=normalizeWord(input.value);
  if(!val) return;

  targets.forEach((t,i)=>{
    if(normalizeWord(t.c)===val){ found.add(i); }
  });

  input.value="";
  render();

  if(found.size===10){
    const s=state.lists[current]||{interval:1};
    if(noHelp){ s.interval=nextInterval(s.interval||1); }
    else{ s.interval=1; }
    s.due=addDays(todayStr(),s.interval);
    state.lists[current]=s;
    state.updatedAt=Date.now();
    saveLocal(state);
    dbxUpload(state);
  }
}

/* ===========================
   WIRE
=========================== */

function wire(){
  const n=$("#btnNouveau");
  if(n) n.addEventListener("click",()=>{ pick(); render(); });

  const v=$("#btnValider");
  if(v) v.addEventListener("click",validate);

  const s=$("#saisie");
  if(s) s.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); validate(); } });

  const d=$("#btnDropbox");
  if(d) d.addEventListener("click",oauthStart);
}

/* ===========================
   START
=========================== */

async function start(){
  wire();
  await handleOAuth();

  const remote=await dbxDownload();
  if(remote){ state=remote; saveLocal(state); }

  pick();
  render();
}

document.addEventListener("DOMContentLoaded",start);

})();
