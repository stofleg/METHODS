'use strict';

/* ── dict.js — Système de définitions BlackScrab ──────────
   Fonctions extraites de common.js / themods.js (METHODS).
   Dépendance unique : window.SEQODS_DATA (ods_data.js).
   ───────────────────────────────────────────────────────── */

/* ── Correctif ordre ODS : formes fléchies après formes de base ── */
(function fixOdsOrder(){
  const D = window.SEQODS_DATA; if(!D) return;
  const C=D.c, E=D.e||[], F=D.f||[];
  for(let i=0; i<C.length-1; i++){
    if(C[i]!==C[i+1]) continue;
    const ei=(E[i]||C[i]), ej=(E[i+1]||C[i+1]);
    if(ei.includes(',') && !ej.includes(',')){
      if(E.length){ const t=E[i]; E[i]=E[i+1]; E[i+1]=t; }
    }
  }
})();

function $d(sel){ return document.querySelector(sel); }

function norm(w){
  if(!w) return "";
  return w.toUpperCase()
    .replace(/Œ/g,"OE").replace(/Æ/g,"AE")
    .normalize("NFD").replace(/[̀-ͯ]/g,"")
    .replace(/[^A-Z]/g,"");
}

function getDictArr(){ return window.SEQODS_DATA?.d || window.SEQODS_DATA?.c || []; }

/* ── Résolution forme fléchie : canon + suffixe affiché → canonique fléchi ── */
let _dSet = null;
function _getDSet(){ if(!_dSet) _dSet = new Set(getDictArr()); return _dSet; }
const _dSufCache = new Map();
function resolveInflectedCanon(canon, rawSuffix){
  const suf = norm(rawSuffix.trim());
  if(!suf) return null;
  const simple = canon + suf;
  if(_getDSet().has(simple)) return simple;
  if(!_dSufCache.has(suf)){
    _dSufCache.set(suf, getDictArr().filter(w => w.endsWith(suf)));
  }
  const candidates = _dSufCache.get(suf);
  let best=null, bestLen=0;
  for(const w of candidates){
    let j=0; while(j<canon.length && j<w.length && canon[j]===w[j]) j++;
    if(j>bestLen && j>=Math.ceil(canon.length*0.5)){ bestLen=j; best=w; }
  }
  return best;
}

/* ── Carte inverse formes fléchies → lemme (entrées à virgule de c[]) ── */
let _inflMap = null;
function _getInflMap(){
  if(!_inflMap){
    _inflMap = new Map();
    const {c,e}=window.SEQODS_DATA||{};
    if(c&&e) for(let i=0;i<c.length;i++){
      if(!e[i]?.includes(',')) continue;
      const ic = resolveInflectedCanon(c[i], e[i].split(',')[1]);
      if(ic && !_inflMap.has(ic)) _inflMap.set(ic, c[i]);
    }
  }
  return _inflMap;
}

/* ── Table des formes irrégulières → infinitif ── */
let _irregMap = null;
function _getIrregMap(){
  if(_irregMap) return _irregMap;
  _irregMap = new Map();
  const add = (inf, forms) => { for(const f of forms) _irregMap.set(f, inf); };

  add('ETRE',['SUIS','SOMMES','ETES','SONT',
    'ETAIS','ETAIT','ETIONS','ETIEZ','ETAIENT',
    'FUS','FUT','FUMES','FUTES','FURENT',
    'SERAI','SERAS','SERA','SERONS','SEREZ','SERONT',
    'SERAIS','SERAIT','SERIONS','SERIEZ','SERAIENT',
    'SOIS','SOIT','SOYONS','SOYEZ','SOIENT',
    'FUSSE','FUSSES','FUSSIONS','FUSSIEZ','FUSSENT','ETANT']);

  add('AVOIR',['AVONS','AVEZ','ONT',
    'AVAIS','AVAIT','AVIONS','AVIEZ','AVAIENT',
    'EUS','EUT','EUMES','EUTES','EURENT',
    'AURAI','AURAS','AURA','AURONS','AUREZ','AURONT',
    'AURAIS','AURAIT','AURIONS','AURIEZ','AURAIENT',
    'AIE','AIES','AIT','AYONS','AYEZ','AIENT',
    'EUSSE','EUSSES','EUSSIONS','EUSSIEZ','EUSSENT','AYANT']);

  add('ALLER',['VAIS','VAS','ALLONS','ALLEZ','VONT',
    'ALLAIS','ALLAIT','ALLIONS','ALLIEZ','ALLAIENT',
    'ALLAI','ALLAS','ALLA','ALLAMES','ALLATES','ALLERENT',
    'IRAI','IRAS','IRA','IRONS','IREZ','IRONT',
    'IRAIS','IRAIT','IRIONS','IRIEZ','IRAIENT',
    'AILLE','AILLES','AILLENT',
    'ALLASSE','ALLASSES','ALLAT','ALLASSIONS','ALLASSIEZ','ALLASSENT',
    'ALLANT','ALLE']);

  add('FAIRE',['FAIS','FAIT','FAISONS','FAITES','FONT',
    'FAISAIS','FAISAIT','FAISIONS','FAISIEZ','FAISAIENT',
    'FIS','FIT','FIMES','FITES','FIRENT',
    'FERAI','FERAS','FERA','FERONS','FEREZ','FERONT',
    'FERAIS','FERAIT','FERIONS','FERIEZ','FERAIENT',
    'FASSE','FASSES','FASSIONS','FASSIEZ','FASSENT',
    'FISSE','FISSES','FISSIONS','FISSIEZ','FISSENT','FAISANT']);

  add('VOULOIR',['VEUX','VEUT','VEULENT',
    'VOULAIS','VOULAIT','VOULIONS','VOULIEZ','VOULAIENT',
    'VOULUS','VOULUT','VOULUMES','VOULUTES','VOULURENT',
    'VOUDRAI','VOUDRAS','VOUDRA','VOUDRONS','VOUDREZ','VOUDRONT',
    'VOUDRAIS','VOUDRAIT','VOUDRIONS','VOUDRIEZ','VOUDRAIENT',
    'VEUILLE','VEUILLES','VEUILLONS','VEUILLEZ','VEUILLENT',
    'VOULUSSE','VOULU','VOULANT']);

  add('POUVOIR',['PEUX','PEUT','PEUVENT',
    'POUVAIS','POUVAIT','POUVIONS','POUVIEZ','POUVAIENT',
    'PUS','PUT','PUMES','PUTES','PURENT',
    'POURRAI','POURRAS','POURRA','POURRONS','POURREZ','POURRONT',
    'POURRAIS','POURRAIT','POURRIONS','POURRIEZ','POURRAIENT',
    'PUISSE','PUISSES','PUISSIONS','PUISSIEZ','PUISSENT',
    'PUSSE','PU','POUVANT']);

  add('SAVOIR',['SAIS','SAIT','SAVONS','SAVEZ','SAVENT',
    'SAVAIS','SAVAIT','SAVIONS','SAVIEZ','SAVAIENT',
    'SUS','SUT','SUMES','SUTES','SURENT',
    'SAURAI','SAURAS','SAURA','SAURONS','SAUREZ','SAURONT',
    'SAURAIS','SAURAIT','SAURIONS','SAURIEZ','SAURAIENT',
    'SACHE','SACHES','SACHONS','SACHEZ','SACHENT',
    'SUSSE','SU','SACHANT']);

  add('VOIR',['VOIS','VOIT','VOYONS','VOYEZ','VOIENT',
    'VOYAIS','VOYAIT','VOYIONS','VOYIEZ','VOYAIENT',
    'VIMES','VITES','VIRENT',
    'VERRAI','VERRAS','VERRA','VERRONS','VERREZ','VERRONT',
    'VERRAIS','VERRAIT','VERRIONS','VERRIEZ','VERRAIENT',
    'VOIE','VOIES','VOIENT',
    'VISSE','VU','VOYANT']);

  add('DEVOIR',['DOIS','DOIT','DEVONS','DEVEZ','DOIVENT',
    'DEVAIS','DEVAIT','DEVIONS','DEVIEZ','DEVAIENT',
    'DUS','DUT','DUMES','DUTES','DURENT',
    'DEVRAI','DEVRAS','DEVRA','DEVRONS','DEVREZ','DEVRONT',
    'DEVRAIS','DEVRAIT','DEVRIONS','DEVRIEZ','DEVRAIENT',
    'DOIVE','DOIVES','DOIVENT',
    'DUSSE','DU','DEVANT']);

  add('VENIR',['VIENS','VIENT','VENONS','VENEZ','VIENNENT',
    'VENAIS','VENAIT','VENIONS','VENIEZ','VENAIENT',
    'VINS','VINT','VINMES','VINTES','VINRENT',
    'VIENDRAI','VIENDRAS','VIENDRA','VIENDRONS','VIENDREZ','VIENDRONT',
    'VIENDRAIS','VIENDRAIT','VIENDRIONS','VIENDRIEZ','VIENDRAIENT',
    'VIENNE','VIENNES','VIENNENT',
    'VINSSE','VENU','VENANT']);

  add('TENIR',['TIENS','TIENT','TENONS','TENEZ','TIENNENT',
    'TENAIS','TENAIT','TENIONS','TENIEZ','TENAIENT',
    'TINS','TINT','TINMES','TINTES','TINRENT',
    'TIENDRAI','TIENDRAS','TIENDRA','TIENDRONS','TIENDREZ','TIENDRONT',
    'TIENDRAIS','TIENDRAIT','TIENDRIONS','TIENDRIEZ','TIENDRAIENT',
    'TIENNE','TIENNES','TIENNENT',
    'TINSSE','TENU','TENANT']);

  add('PRENDRE',['PRENDS','PREND','PRENONS','PRENEZ','PRENNENT',
    'PRENAIS','PRENAIT','PRENIONS','PRENIEZ','PRENAIENT',
    'PRIT','PRIMES','PRITES','PRIRENT',
    'PRENDRAI','PRENDRAS','PRENDRA','PRENDRONS','PRENDREZ','PRENDRONT',
    'PRENDRAIS','PRENDRAIT','PRENDRIONS','PRENDRIEZ','PRENDRAIENT',
    'PRENNE','PRENNES','PRENNENT',
    'PRISSE','PRENANT']);

  add('METTRE',['METS','MET','METTONS','METTEZ','METTENT',
    'METTAIS','METTAIT','METTIONS','METTIEZ','METTAIENT',
    'MIS','MIT','MIMES','MITES','MIRENT',
    'METTRAI','METTRAS','METTRA','METTRONS','METTREZ','METTRONT',
    'METTRAIS','METTRAIT','METTRIONS','METTRIEZ','METTRAIENT',
    'METTE','METTES','METTENT',
    'MISSE','METTANT']);

  add('DIRE',['DISONS','DITES','DISENT',
    'DISAIS','DISAIT','DISIONS','DISIEZ','DISAIENT',
    'DIRAI','DIRAS','DIRA','DIRONS','DIREZ','DIRONT',
    'DIRAIS','DIRAIT','DIRIONS','DIRIEZ','DIRAIENT',
    'DISE','DISES','DISENT',
    'DISSE','DISANT']);

  add('LIRE',['LISONS','LISEZ','LISENT',
    'LISAIS','LISAIT','LISIONS','LISIEZ','LISAIENT',
    'LUS','LUT','LUMES','LUTES','LURENT',
    'LIRAI','LIRAS','LIRA','LIRONS','LIREZ','LIRONT',
    'LIRAIS','LIRAIT','LIRIONS','LIRIEZ','LIRAIENT',
    'LISE','LISES','LISENT',
    'LUSSE','LU','LISANT']);

  add('ECRIRE',['ECRIS','ECRIT','ECRIVONS','ECRIVEZ','ECRIVENT',
    'ECRIVAIS','ECRIVAIT','ECRIVIONS','ECRIVIEZ','ECRIVAIENT',
    'ECRIVIS','ECRIVIT','ECRIVIMES','ECRIVITES','ECRIVIRENT',
    'ECRIRAI','ECRIRAS','ECRIRA','ECRIRONS','ECRIREZ','ECRIRONT',
    'ECRIRAIS','ECRIRAIT','ECRIRIONS','ECRIRIEZ','ECRIRAIENT',
    'ECRIVE','ECRIVES','ECRIVENT',
    'ECRIVISSE','ECRIVANT']);

  add('BOIRE',['BOIS','BOIT','BUVONS','BUVEZ','BOIVENT',
    'BUVAIS','BUVAIT','BUVIONS','BUVIEZ','BUVAIENT',
    'BUS','BUT','BUMES','BUTES','BURENT',
    'BOIRAI','BOIRAS','BOIRA','BOIRONS','BOIREZ','BOIRONT',
    'BOIRAIS','BOIRAIT','BOIRIONS','BOIRIEZ','BOIRAIENT',
    'BOIVE','BOIVES','BOIVENT',
    'BUSSE','BU','BUVANT']);

  add('CROIRE',['CROIS','CROIT','CROYONS','CROYEZ','CROIENT',
    'CROYAIS','CROYAIT','CROYIONS','CROYIEZ','CROYAIENT',
    'CRUS','CRUT','CRUMES','CRUTES','CRURENT',
    'CROIRAI','CROIRAS','CROIRA','CROIRONS','CROIREZ','CROIRONT',
    'CROIRAIS','CROIRAIT','CROIRIONS','CROIRIEZ','CROIRAIENT',
    'CROIE','CROIES','CROIENT',
    'CRUSSE','CRU','CROYANT']);

  add('MOURIR',['MEURS','MEURT','MOURONS','MOUREZ','MEURENT',
    'MOURAIS','MOURAIT','MOURIONS','MOURIEZ','MOURAIENT',
    'MOURUS','MOURUT','MOURUMES','MOURUTES','MOURURENT',
    'MOURRAI','MOURRAS','MOURRA','MOURRONS','MOURREZ','MOURRONT',
    'MOURRAIS','MOURRAIT','MOURRIONS','MOURRIEZ','MOURRAIENT',
    'MEURE','MEURES','MEURENT',
    'MOURUSSE','MOURANT']);

  add('COURIR',['COURS','COURT','COURONS','COUREZ','COURENT',
    'COURAIS','COURAIT','COURIONS','COURIEZ','COURAIENT',
    'COURUS','COURUT','COURUMES','COURUTES','COURURENT',
    'COURRAI','COURRAS','COURRA','COURRONS','COURREZ','COURRONT',
    'COURRAIS','COURRAIT','COURRIONS','COURRIEZ','COURRAIENT',
    'COURE','COURES','COURENT',
    'COURUSSE','COURU','COURANT']);

  add('RECEVOIR',['RECOIS','RECOIT','RECEVONS','RECEVEZ','RECOIVENT',
    'RECEVAIS','RECEVAIT','RECEVIONS','RECEVIEZ','RECEVAIENT',
    'RECUS','RECUT','RECUMES','RECUTES','RECURENT',
    'RECEVRAI','RECEVRAS','RECEVRA','RECEVRONS','RECEVREZ','RECEVRONT',
    'RECEVRAIS','RECEVRAIT','RECEVRIONS','RECEVRIEZ','RECEVRAIENT',
    'RECOIVE','RECOIVES','RECOIVENT',
    'RECUSSE','RECU','RECEVANT']);

  add('VALOIR',['VAUX','VAUT','VALONS','VALEZ','VALENT',
    'VALAIS','VALAIT','VALIONS','VALIEZ','VALAIENT',
    'VALUS','VALUT','VALUMES','VALUTES','VALURENT',
    'VAUDRAI','VAUDRAS','VAUDRA','VAUDRONS','VAUDREZ','VAUDRONT',
    'VAUDRAIS','VAUDRAIT','VAUDRIONS','VOUDRIEZ','VAUDRAIENT',
    'VAILLE','VAILLES','VAILLENT',
    'VALUSSE','VALU','VALANT']);

  add('FALLOIR',['FAUT','FALLAIT','FALLUT','FAUDRA','FAUDRAIT','FAILLE','FALLU']);
  add('PLEUVOIR',['PLEUT','PLEUVAIT','PLEUVAIENT','PLUT','PLUSSENT','PLEUVRA','PLEUVRAIT','PLEUVRAIENT','PLEUVRONT','PLEUVE','PLEUVENT','PLEUVANT','PLU']);
  add('GESIR',['GIT','GISAIT','GISAIENT','GISONS','GISEZ','GISIEZ','GISIONS']);
  add('SEOIR',['SIEE','SIEENT','SIERAIT','SIERAIENT','SIERONT','SEYAIT']);
  add('MESSEOIR',['MESSIEENT','MESSIERAIT','MESSIERAIENT','MESSIERONT','MESSEYAIT']);
  add('SOURDRE',['SOURDAIT','SOURDAIENT','SOURDENT']);
  add('SAILLIR',['SAILLE','SAILLI','SAILLIRONT']);
  add('TRAIRE',['TRAYAIT','TRAYAIENT','TRAYANT','TRAYONS','TRAYIEZ','TRAYIONS','TRAIENT']);
  add('PAITRE',['PAISSAIT','PAISSAIENT','PAISSAIS','PAISSONS','PAISSEZ','PAISSENT','PAISSIONS','PAISSIEZ']);
  add('ABSOUDRE',['ABSOLVAIT','ABSOLVAIENT','ABSOLVAIS','ABSOLVANT','ABSOLVE','ABSOLVENT',
    'ABSOLVES','ABSOLVEZ','ABSOLVIEZ','ABSOLVIONS','ABSOLVONS','ABSOUTES','ABSOUTS']);
  add('RESOUDRE',['RESOLVAIT','RESOLVAIENT','RESOLVAIS','RESOLVANT','RESOLVE','RESOLVENT',
    'RESOLVES','RESOLVEZ','RESOLVIEZ','RESOLVIONS','RESOLVONS','RESOUTE','RESOUTES']);
  add('ECHOIR',['ECHOIE','ECHOIENT','ECHOYAIT','ECHOYAIENT','ECHOYANT']);
  add('BRAIRE',['BRAIENT']);
  add('FOUTRE',['FOUT']);

  add('VIVRE',['VIVONS','VIVEZ','VIVENT',
    'VIVAIS','VIVAIT','VIVIONS','VIVIEZ','VIVAIENT',
    'VECUS','VECUT','VECUMES','VECUTES','VECURENT',
    'VIVRAI','VIVRAS','VIVRA','VIVRONS','VIVREZ','VIVRONT',
    'VIVRAIS','VIVRAIT','VIVRIONS','VIVRIEZ','VIVRAIENT',
    'VIVE','VIVES','VIVENT',
    'VECUSSE','VECU','VIVANT']);

  add('SUIVRE',['SUIT','SUIVONS','SUIVEZ','SUIVENT',
    'SUIVAIS','SUIVAIT','SUIVIONS','SUIVIEZ','SUIVAIENT',
    'SUIVIS','SUIVIT','SUIVIMES','SUIVITES','SUIVIRENT',
    'SUIVRAI','SUIVRAS','SUIVRA','SUIVRONS','SUIVREZ','SUIVRONT',
    'SUIVRAIS','SUIVRAIT','SUIVRIONS','SUIVRIEZ','SUIVRAIENT',
    'SUIVE','SUIVES','SUIVENT',
    'SUIVISSE','SUIVI','SUIVANT']);

  add('CONNAITRE',['CONNAIS','CONNAIT',
    'CONNUS','CONNUT','CONNUMES','CONNUTES','CONNURENT',
    'CONNAITRAI','CONNAITRAS','CONNAITRA','CONNAITRONS','CONNAITREZ','CONNAITRONT',
    'CONNAITRAIS','CONNAITRAIT','CONNAITRIONS','CONNAITRIEZ','CONNAITRAIENT',
    'CONNU','CONNAISSANT']);

  add('NAITRE',['NAIS','NAIT',
    'NAQUIS','NAQUIT','NAQUIMES','NAQUITES','NAQUIRENT',
    'NAITRAI','NAITRAS','NAITRA','NAITRONS','NAITREZ','NAITRONT',
    'NAITRAIS','NAITRAIT','NAITRIONS','NAITRIEZ','NAITRAIENT',
    'NAISSE','NAISSES','NAISSENT','NE','NAISSANT']);

  add('SURSEOIR',['SURSISE']);

  return _irregMap;
}

/* ── Conjugation entries that should redirect to their infinitive ── */
let _conjMap = null;
function _getConjMap(){
  if(_conjMap) return _conjMap;
  _conjMap = new Map();
  const irr = _getIrregMap();
  const add = (inf, forms) => { for(const f of forms){ _conjMap.set(f, inf); irr.set(f, inf); } };
  add('ABSOUDRE',['ABSOUT']);
  add('BOIRE',['BUMES','BURENT','BUSSE','BUSSIEZ']);
  add('BOUILLIR',['BOUS']);
  add('BRAIRE',['BRAIT']);
  add('CHOIR',['CHERRONT','CHU','CHUMES']);
  add('COMPLAIRE',['COMPLUMES']);
  add('CONCEVOIR',['CONCUMES','CONCURENT','CONCUSSE','CONCUT']);
  add('COUDRE',['COUSE','COUSIMES','COUSIRENT']);
  add('DEBOUILLIR',['DEBOUS']);
  add('DECEVOIR',['DECUMES','DECURENT','DECUSSE','DECUT']);
  add('DECHOIR',['DECHERRA','DECHET','DECHUMES']);
  add('DECOUDRE',['DECOUSE','DECOUSIMES','DECOUSIRENT']);
  add('DEMENTIR',['DEMENS']);
  add('DEPLAIRE',['DEPLURENT']);
  add('DEPRENDRE',['DEPRIRENT','DEPRISSE']);
  add('DISSOUDRE',['DISSOUT']);
  add('ECHOIR',['ECHEENT','ECHERRA','ECHET','ECHU']);
  add('ELIRE',['ELUMES','ELUSSE']);
  add('EMBOIRE',['EMBUMES','EMBUSSE']);
  add('EMOUDRE',['EMOULE','EMOULUMES']);
  add('EMOUVOIR',['EMEUT','EMEUVE','EMUMES']);
  add('FLEURIR',['FLORISSAIS','FLORISSIEZ']);
  add('LIRE',['LUMES','LURENT','LUSSE']);
  add('MENTIR',['MENS']);
  add('MOUDRE',['MOULUMES','MOULUSSE']);
  add('MOUVOIR',['MEUS','MEUT','MEUVE','MUMES','MUT']);
  add('NAITRE',['NAQUIMES']);
  add('OINDRE',['OIGNE']);
  add('OUIR',['OIENT','OIS','OIT','OYAIENT','OYEZ']);
  add('PAITRE',['PAIS','PAISSE','PAIT']);
  add('PERCEVOIR',['PERCUMES','PERCUT']);
  add('PLAIRE',['PLURENT','PLUSSE']);
  add('PROMOUVOIR',['PROMEUS','PROMUMES']);
  add('RAIRE',['RAIT']);
  add('REBOIRE',['REBUMES','REBUSSE']);
  add('RECEVOIR',['RECUMES','RECUSSE']);
  add('RECOUDRE',['RECOUSE','RECOUSIMES','RECOUSIRENT']);
  add('REDEVOIR',['REDU','REDUMES','REDURENT']);
  add('RELIRE',['RELUMES','RELURENT']);
  add('REMOUDRE',['REMOULUT']);
  add('RENAITRE',['RENAQUIS','RENE']);
  add('REPAITRE',['REPAIS','REPUMES']);
  add('RESOUDRE',['RESOUT']);
  add('RETRAIRE',['RETRAIE','RETRAYAIS','RETRAYEZ']);
  add('REVALOIR',['REVAILLE']);
  add('SAVOIR',['SUMES','SURENT','SUSSE','SUTES']);
  add('TAIRE',['TUMES','TURENT','TUSSE','TUSSIONS','TUT','TUTES']);
  add('TRAIRE',['TRAIE','TRAYAIS','TRAYEZ']);
  add('VALOIR',['VAILLE']);
  return _conjMap;
}

/* ── Map lazy : canonique → index dans c[] ── */
let _cMap = null;
function _getCMap(){
  if(!_cMap){
    _cMap = new Map();
    const c = window.SEQODS_DATA?.c;
    if(c) c.forEach((w,i) => _cMap.set(w,i));
  }
  return _cMap;
}

/* ── Set lazy des canons qui affichent "/" ── */
let _wantsSlashSet = null;
function _getWantsSlashSet(){
  if(_wantsSlashSet) return _wantsSlashSet;
  _wantsSlashSet = new Set();
  const DATA = window.SEQODS_DATA; if(!DATA) return _wantsSlashSet;
  const {c:C,e:E,f:F} = DATA;
  const _INVAR = /\binterj\b|\bloc\b|\badv\b/;
  const _VAR   = /\bn\.[mf]\b|\bn\.\s|\bn\.\)|\badj\b|\bv\.|\bpron\b|\bnum\b/;
  const byCanon = new Map();
  for(let i=0;i<C.length;i++){
    const c=C[i]; if(!byCanon.has(c)) byCanon.set(c,[i]); else byCanon.get(c).push(i);
  }
  for(const [canon,idxs] of byCanon){
    if(canon.endsWith('MENT')) continue;
    if(idxs.some(i=>(E[i]||'').includes('/'))) continue;
    let hasInvar=false, hasVar=false;
    for(const i of idxs){
      const f=F[i]||'';
      if(_INVAR.test(f)) hasInvar=true;
      if(_VAR.test(f)) hasVar=true;
    }
    if(hasInvar && !hasVar) _wantsSlashSet.add(canon);
  }
  return _wantsSlashSet;
}
function _wantsSlash(canon){ return _getWantsSlashSet().has(canon); }

/* ── Formes fléchies (normalisé → e[] de data.js) ── */
let _normToE = null;
function getNormToE(){
  if(!_normToE){
    _normToE = {};
    const d = window.SEQODS_DATA;
    if(d?.c) d.c.forEach((c,i) => { _normToE[c] = d.e[i]; });
  }
  return _normToE;
}

/* ── Préfixes de verbes composés ── */
const _VERB_PREFIXES = ['ENTRE','CONTRE','INTER','TRANS','SOUS','TRES','SATIS','PAR','SUR','CON','COM','PRE','PRO','DIS','MES','RE','DE','EN','AD','AB'];

/* ── Lemme parent pour une forme fléchie ou conjuguée ── */
function findLemma(w){
  if(!w) return null;
  const cm = _getCMap();
  if(cm.has(w)) return w;
  const im = _getInflMap();
  if(im.has(w)) return im.get(w);

  const irr = _getIrregMap();
  if(irr.has(w)){
    const inf = irr.get(w); if(cm.has(inf)) return inf;
  }

  for(const pfx of _VERB_PREFIXES){
    if(!w.startsWith(pfx) || w.length <= pfx.length+3) continue;
    const rest = w.slice(pfx.length);
    if(irr.has(rest)){
      const baseInf = irr.get(rest);
      const compound = pfx + baseInf;
      if(cm.has(compound)) return compound;
    }
  }

  for(const [sfx,vs] of [['EES',['ER']],['EE',['ER']],['IES',['IR','ER']],['IE',['IR','ER']]]){
    if(w.endsWith(sfx) && w.length > sfx.length+2){
      const st = w.slice(0,-sfx.length);
      for(const v of vs){ if(cm.has(st+v)) return st+v; }
    }
  }

  if(w.endsWith('S') && w.length>2){ const bare=w.slice(0,-1); if(cm.has(bare)) return bare; }

  const ER_FUTURE = new Set(['ERAI','ERAS','ERA','ERONT','EREZ','ERONS','ERAIT','ERAIS','ERENT']);
  const VERB_SFXS = new Set([
    'ASSENT','ASSIEZ','ASSIONS','ASSES','ASSE',
    'USSENT','USSIEZ','USSIONS','USSES','USSE',
    'ISSAIENT','ISSAIT','ISSANT','ISSONS','ISSEZ','ISSENT','ISSIEZ','ISSIONS','ISSES','ISSE',
    'AIENT','ERENT','ATES','AMES','AT','AIT','AIS','IONS','IEZ',
    'ANT','ONS','ENT','EZ','IT','AI','AS','A',
  ]);
  const strips = [
    'ASSENT','ASSIEZ','ASSIONS','ASSES','ASSE',
    'USSENT','USSIEZ','USSIONS','USSES','USSE',
    'ISSAIENT','ISSAIT','ISSANT','ISSONS','ISSEZ','ISSENT','ISSIEZ','ISSIONS','ISSES','ISSE',
    'AIENT','ANT','ERENT','ERONT','EREZ','ERONS','ERAIT','ERAIS','ERAI',
    'ATES','AMES','AT',
    'AIT','AIS','IONS','IEZ','ONS','ONT','ENT','EZ','AI',
    'IT','EAUX','AUX',
    'AS','A','ERA','ERAS','ES','S','X'];
  for(const s of strips){
    if(!w.endsWith(s)) continue;
    const stem = w.slice(0,-s.length);
    if(stem.length<2) continue;
    if(ER_FUTURE.has(s)){
      if(cm.has(stem+'ER')) return stem+'ER';
      if(cm.has(stem+'IR')) return stem+'IR';
      if(cm.has(stem+'RE')) return stem+'RE';
      if(cm.has(stem+'E'))  return stem+'E';
    }
    if(VERB_SFXS.has(s)){
      if(cm.has(stem+'ER')) return stem+'ER';
      if(cm.has(stem+'IR')) return stem+'IR';
      if(cm.has(stem+'RE')) return stem+'RE';
    }
    if(cm.has(stem)) return stem;
    if(im.has(stem)) return im.get(stem);
    if(s==='AUX' && cm.has(stem+'AL')) return stem+'AL';
    if(s==='EAUX' && cm.has(stem+'EAU')) return stem+'EAU';
    if(cm.has(stem+'ER')) return stem+'ER';
    if(cm.has(stem+'IR')) return stem+'IR';
    if(cm.has(stem+'RE')) return stem+'RE';
    if(cm.has(stem+'E'))  return stem+'E';
  }

  if(w.endsWith('E') && w.length > 3){
    const st = w.slice(0,-1);
    if(cm.has(st))        return st;
    if(cm.has(st+'ER'))   return st+'ER';
    if(cm.has(st+'RE'))   return st+'RE';
  }

  if(w.endsWith('U') && w.length > 3){
    const st = w.slice(0,-1);
    if(cm.has(st+'IR')) return st+'IR';
    if(cm.has(st+'RE')) return st+'RE';
    if(cm.has(st+'ER')) return st+'ER';
  }

  if(w.endsWith('I') && w.length > 3){
    const st = w.slice(0,-1);
    if(cm.has(st+'IR')) return st+'IR';
  }

  return null;
}

/* ── Helpers modale ── */
function _findAllIdxs(canon){
  const C = window.SEQODS_DATA?.c; if(!C) return [];
  const out = [];
  for(let i=0;i<C.length;i++) if(C[i]===canon) out.push(i);
  return out;
}

function _findConjLemma(w){
  const cm = _getCMap();
  if(w.endsWith('E') && w.length>3){
    const st=w.slice(0,-1);
    if(cm.has(st+'ER') && st+'ER'!==w) return st+'ER';
    if(cm.has(st+'RE') && st+'RE'!==w) return st+'RE';
  }
  if(w.endsWith('ES') && w.length>4){
    const st=w.slice(0,-2);
    if(cm.has(st+'ER') && st+'ER'!==w) return st+'ER';
  }
  return null;
}

function _renderWordLinks(container, list, label){
  if(!list || !list.length) return;
  const lbl = document.createElement("strong"); lbl.textContent = label;
  container.appendChild(lbl);
  const sp = document.createElement("span");
  list.forEach((w,i)=>{
    if(i) sp.appendChild(document.createTextNode(" • "));
    const a = document.createElement("a"); a.href="#"; a.className="def-link";
    a.textContent = w;
    a.addEventListener("click", e=>{ e.preventDefault(); openDef(norm(w), w); });
    sp.appendChild(a);
  });
  container.appendChild(sp);
}

/* ── Modale définition ── */
let _openDefCanon = null;

function openDef(canon, displayWord, defText, flechie){
  const DATA = window.SEQODS_DATA;
  if(!DATA) return;
  const C=DATA.c, E=DATA.e, F=DATA.f, A=DATA.a, R=DATA.r;

  let allIdxs = _findAllIdxs(canon);
  if(allIdxs.length === 0 && defText === undefined){
    const lemma = findLemma(canon);
    if(lemma && lemma !== canon){ openDef(lemma, null, undefined, canon); return; }
  }
  {
    const conjM = _getConjMap();
    if(conjM.has(canon) && defText===undefined){
      const _POS  = /^(n\.|adj\.|v\.|loc\.|adv\.|interj\.|pron\.|num\.|art\.)/;
      const _CONJ = /-->\s+\S+\s+\d{2,}\./;
      const real = allIdxs.filter(i=>{ const f=F[i]||''; return _POS.test(f)||!_CONJ.test(f); });
      if(real.length>0) allIdxs=real;
      else{ openDef(conjM.get(canon)); return; }
    }
  }
  const idx = allIdxs[0] ?? -1;
  const title = ((displayWord || (idx>=0 ? E[idx] : canon)).split(",")[0].trim()).replace(/\*/g,"");

  const _CP = /^-->\s+([A-Z]+)\s+\d+\./;
  const defs = defText !== undefined
    ? [{label:null, text:defText}]
    : allIdxs.map(i=>{ const f=F?.[i]||''; const m=f.match(_CP); if(m){ const ci=_getCMap().get(m[1]); return {label:m[1], text:ci!==undefined?(F?.[ci]||''):''}; } return {label:null, text:f}; });

  if(allIdxs.length>0 && defText===undefined){
    const cl = _getConjMap().get(canon) || _findConjLemma(canon);
    if(cl){ const ci=_getCMap().get(cl); if(ci!==undefined) defs.push({label:cl, text:F?.[ci]||""}); }
  }

  const wSlash = _wantsSlash(canon) && !title.includes('/');
  $d("#def-title").textContent = wSlash ? title+' /' : title;
  const bodyEl = $d("#def-body");
  if(defs.length <= 1){
    bodyEl.textContent = defs[0]?.text || "(définition absente)";
  } else {
    bodyEl.innerHTML = "";
    defs.forEach((d,i)=>{
      if(i>0){
        const hr=document.createElement("hr");
        hr.style.cssText="border:none;border-top:1px solid var(--border);margin:8px 0 4px";
        bodyEl.appendChild(hr);
      }
      if(d.label){
        const lnk=document.createElement("a"); lnk.href="#"; lnk.className="def-link";
        lnk.textContent=d.label;
        lnk.addEventListener("click",ev=>{ev.preventDefault();openDef(d.label,d.label);});
        bodyEl.appendChild(lnk);
        bodyEl.appendChild(document.createTextNode(" "));
      }
      const p=document.createElement("p"); p.style.margin="0";
      p.textContent=d.text||(d.label?"":"(définition absente)");
      bodyEl.appendChild(p);
    });
  }

  const raw = title.split(",")[0].trim().toLowerCase();
  $d("#def-wikt").href  = "https://fr.wiktionary.org/wiki/" + encodeURIComponent(raw);
  $d("#def-img").href   = "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(raw);
  $d("#def-links").style.display = "flex";

  const rallEl = $d("#def-rall"); if(rallEl) rallEl.innerHTML="";
  if(R && rallEl){
    const lst = R[canon]||[];
    if(lst.length){ _renderWordLinks(rallEl, lst, "Rallonges"); }
  }

  let flechieToShow = flechie || null;
  if(!flechieToShow && idx >= 0 && E?.[idx]?.includes(',')){
    const resolved = resolveInflectedCanon(canon, E[idx].split(',')[1]);
    if(resolved && resolved !== canon) flechieToShow = resolved;
  }
  const flechieEl = $d("#def-flechie"); if(flechieEl) flechieEl.innerHTML="";
  if(flechieToShow && flechieToShow !== canon && flechieEl){
    const fRal = R ? (R[flechieToShow]||[]) : [];
    if(fRal.length){
      const sep = document.createElement("hr");
      sep.style.cssText = "border:none;border-top:1px solid var(--border);margin:12px 0 4px";
      flechieEl.appendChild(sep);
      const sub = document.createElement("p");
      sub.style.cssText = "font-size:11px;color:var(--text-dim);margin:0 0 2px";
      sub.appendChild(document.createTextNode("Forme : "));
      const fLink = document.createElement("a"); fLink.href="#"; fLink.className="def-link";
      fLink.style.cssText = "font-size:11px;";
      fLink.textContent = flechieToShow;
      fLink.addEventListener("click", e=>{ e.preventDefault(); openDef(flechieToShow, flechieToShow); });
      sub.appendChild(fLink);
      flechieEl.appendChild(sub);
      const sec = document.createElement("div"); sec.className="modal-sec";
      _renderWordLinks(sec, fRal, "Rallonges"); flechieEl.appendChild(sec);
    }
  }

  _openDefCanon = canon;
  $d("#def-modal").classList.add("open");
}

function closeDef(){
  $d("#def-modal")?.classList.remove("open");
}

function wireDefModal(){
  $d("#def-close")?.addEventListener("click", closeDef);
  $d("#def-bd")?.addEventListener("click", closeDef);
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeDef(); });
}
