"use strict";
/* ══════════════════════════════════════════
   COMMON.JS — Code partagé entre METHODS et THEMODS
══════════════════════════════════════════ */

/* ── Correctif ordre ODS : formes fléchies après formes de base ── */
(function fixOdsOrder(){
  const D = window.SEQODS_DATA; if(!D) return;
  const C=D.c, E=D.e||[], F=D.f||[];
  for(let i=0; i<C.length-1; i++){
    if(C[i]!==C[i+1]) continue;
    const ei=(E[i]||C[i]), ej=(E[i+1]||C[i+1]);
    if(ei.includes(',') && !ej.includes(',')){
      // swap i et i+1
      if(E.length){ const t=E[i]; E[i]=E[i+1]; E[i+1]=t; }
    }
  }
})();

/* ── Dictionnaire complet (toutes formes fléchies) ── */
function getDictArr(){ return window.SEQODS_DATA?.d || window.SEQODS_DATA?.c || []; }

/* ── Index anagrammes ── */
let _anaIdx = null;
function getAnagramCount(canon){
  if(!canon) return 0;
  if(!_anaIdx){
    _anaIdx = new Map();
    for(const w of getDictArr()){
      const key = w.split("").sort().join("");
      _anaIdx.set(key, (_anaIdx.get(key)||0)+1);
    }
  }
  const key = canon.split("").sort().join("");
  return (_anaIdx.get(key)||1)-1;
}

/* ── Rallonges — données précalculées dans DATA.r ── */
function hasHook(canon){
  return (window.SEQODS_DATA?.r?.[canon]?.length || 0) > 0;
}

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
    'VAUDRAIS','VAUDRAIT','VAUDRIONS','VAUDRIEZ','VAUDRAIENT',
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

/* ── Conjugation entries in c[] that should redirect to their infinitive ── */
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

/* ── Préfixes de verbes composés ── */
const _VERB_PREFIXES = ['ENTRE','CONTRE','INTER','TRANS','SOUS','TRES','SATIS','PAR','SUR','CON','COM','PRE','PRO','DIS','MES','RE','DE','EN','AD','AB'];

/* ── Lemme parent pour une forme fléchie ou conjuguée ── */
function findLemma(w){
  if(!w) return null;
  const cm = _getCMap();
  if(cm.has(w)) return w;
  const im = _getInflMap();
  if(im.has(w)) return im.get(w);

  // Table des irréguliers (base + composés via préfixe)
  const irr = _getIrregMap();
  if(irr.has(w)){
    const inf = irr.get(w); if(cm.has(inf)) return inf;
  }
  // Verbes composés : essayer de détacher un préfixe et chercher le reste
  for(const pfx of _VERB_PREFIXES){
    if(!w.startsWith(pfx) || w.length <= pfx.length+3) continue;
    const rest = w.slice(pfx.length);
    if(irr.has(rest)){
      const baseInf = irr.get(rest);
      const compound = pfx + baseInf;
      if(cm.has(compound)) return compound;
    }
  }

  // Participes passés féminins : -EES/-EE (verbes -ER), -IES/-IE (verbes -IR)
  for(const [sfx,vs] of [['EES',['ER']],['EE',['ER']],['IES',['IR','ER']],['IE',['IR','ER']]]){
    if(w.endsWith(sfx) && w.length > sfx.length+2){
      const st = w.slice(0,-sfx.length);
      for(const v of vs){ if(cm.has(st+v)) return st+v; }
    }
  }

  // Pluriel simple en -S : ARAS→ARA avant de tomber dans les strips
  if(w.endsWith('S') && w.length>2){ const bare=w.slice(0,-1); if(cm.has(bare)) return bare; }

  // Strips
  const ER_FUTURE = new Set(['ERAI','ERAS','ERA','ERONT','EREZ','ERONS','ERAIT','ERAIS','ERENT']);
  const VERB_SFXS = new Set([
    'ASSENT','ASSIEZ','ASSIONS','ASSES','ASSE',
    'USSENT','USSIEZ','USSIONS','USSES','USSE',
    'ISSAIENT','ISSAIT','ISSANT','ISSONS','ISSEZ','ISSENT','ISSIEZ','ISSIONS','ISSES','ISSE',
    'AIENT','ERENT','ATES','AMES','AT','AIT','AIS','IONS','IEZ',
    'ANT','ONS','ENT','EZ','IT','AI','AS','A','ES',
  ]);
  const strips = [
    // Subjonctif imparfait
    'ASSENT','ASSIEZ','ASSIONS','ASSES','ASSE',
    'USSENT','USSIEZ','USSIONS','USSES','USSE',
    // Imparfait/formes en -ISS
    'ISSAIENT','ISSAIT','ISSANT','ISSONS','ISSEZ','ISSENT','ISSIEZ','ISSIONS','ISSES','ISSE',
    // Conditionnel / futur
    'AIENT','ANT','ERENT','ERONT','EREZ','ERONS','ERAIT','ERAIS','ERAI',
    // Passé simple manquants + subj. imp. 3s
    'ATES','AMES','AT',
    // Présent / imparfait courant
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

  // Présent 1s/3s -ER et futurs -RE (CHANTE→CHANTER, COMMETTRA→COMMETTRE)
  if(w.endsWith('E') && w.length > 3){
    const st = w.slice(0,-1);
    if(cm.has(st+'ER'))   return st+'ER';
    if(cm.has(st+'RE'))   return st+'RE';
    if(cm.has(st))        return st;
  }

  // Participes passés masc. en -U (ABSTENU→ABSTENIR, VAINCU→VAINCRE, VENDU→VENDRE)
  if(w.endsWith('U') && w.length > 3){
    const st = w.slice(0,-1);
    if(cm.has(st+'IR')) return st+'IR';
    if(cm.has(st+'RE')) return st+'RE';
    if(cm.has(st+'ER')) return st+'ER';
  }

  // Participes passés masc. en -I (ABOLI→ABOLIR, ADOUCI→ADOUCIR)
  if(w.endsWith('I') && w.length > 3){
    const st = w.slice(0,-1);
    if(cm.has(st+'IR')) return st+'IR';
  }

  return null;
}

/* ── Affichage mot + puce + exposant ── */
function _mkHook(ch){ const d=document.createElement("span"); d.className="hook"; d.textContent=ch; return d; }
function _mkSup(n){ const s=document.createElement("sup"); s.className="ana"; s.textContent=n; return s; }
function _mkWt(t){ const s=document.createElement("span"); s.className="wt"; s.textContent=t; return s; }

function setElWord(el, display, canon, suffix="", cousinCanon=null){
  el.textContent = "";
  if(!display || !canon) return;
  const w = document.createElement("span");
  w.style.letterSpacing = "0";
  const commaIdx = display.indexOf(',');
  if(commaIdx === -1){
    if(hasHook(canon)) w.appendChild(_mkHook("•"));
    w.appendChild(_mkWt(display));
    const n = getAnagramCount(canon);
    if(n>0) w.appendChild(_mkSup(n));
  } else {
    const mainDisp = display.substring(0, commaIdx).trim();
    const inflDisp = display.substring(commaIdx+1).trim();
    const inflCanon = resolveInflectedCanon(canon, inflDisp);
    const mainHook = hasHook(canon);
    const inflHook = inflCanon ? hasHook(inflCanon) : false;
    if(mainHook && inflHook)       w.appendChild(_mkHook("•"));
    else if(mainHook)              w.appendChild(_mkHook("◦"));
    w.appendChild(_mkWt(mainDisp));
    const n = getAnagramCount(canon);
    if(n>0) w.appendChild(_mkSup(n));
    w.appendChild(document.createTextNode(", "));
    if(!mainHook && inflHook)      w.appendChild(_mkHook("◦"));
    w.appendChild(_mkWt(inflDisp));
    if(inflCanon){ const ni=getAnagramCount(inflCanon); if(ni>0) w.appendChild(_mkSup(ni)); }
  }
  el.appendChild(w);
  if(cousinCanon){
    const cousinDisp=getNormToE()[cousinCanon]||cousinCanon;
    el.appendChild(document.createTextNode(" "));
    const lnk=document.createElement("span");
    lnk.className="cousin-link";
    lnk.textContent="(→ "+cousinDisp+")";
    lnk.addEventListener("click",e=>{e.stopPropagation();openDef(cousinCanon);});
    el.appendChild(lnk);
  } else if(suffix){
    el.appendChild(document.createTextNode(suffix));
  }
}

/* ── Sélecteur ── */
const $ = s => document.querySelector(s);

/* ── Firebase ── */
const FB_BASE    = "https://firestore.googleapis.com/v1/projects/methods-8e4b1/databases/(default)/documents";
const FB_STORAGE = "https://firebasestorage.googleapis.com/v0/b/methods-8e4b1.appspot.com/o";

async function fbStorageUpload(path, blob){
  const r = await fetch(`${FB_STORAGE}?uploadType=media&name=${encodeURIComponent(path)}`,
    {method:"POST", headers:{"Content-Type":"image/jpeg"}, body:blob});
  if(!r.ok) throw new Error("Storage " + r.status);
  const {downloadTokens} = await r.json();
  return `${FB_STORAGE}/${encodeURIComponent(path)}?alt=media&token=${downloadTokens}`;
}
async function fbStorageDelete(path){
  await fetch(`${FB_STORAGE}/${encodeURIComponent(path)}`, {method:"DELETE"}).catch(()=>{});
}

function _cv_to(val){
  if(val===null||val===undefined) return {nullValue:null};
  if(typeof val==="boolean") return {booleanValue:val};
  if(typeof val==="number") return Number.isInteger(val)?{integerValue:String(val)}:{doubleValue:val};
  if(typeof val==="string") return {stringValue:val};
  if(Array.isArray(val)) return {arrayValue:{values:val.map(_cv_to)}};
  if(typeof val==="object") return {mapValue:{fields:Object.fromEntries(Object.entries(val).map(([k,v])=>[k,_cv_to(v)]))}};
  return {stringValue:String(val)};
}
function _cv_from(val){
  if(val.nullValue!==undefined) return null;
  if(val.booleanValue!==undefined) return val.booleanValue;
  if(val.integerValue!==undefined) return parseInt(val.integerValue);
  if(val.doubleValue!==undefined) return val.doubleValue;
  if(val.stringValue!==undefined) return val.stringValue;
  if(val.arrayValue) return (val.arrayValue.values||[]).map(_cv_from);
  if(val.mapValue) return Object.fromEntries(Object.entries(val.mapValue.fields||{}).map(([k,v])=>[k,_cv_from(v)]));
  return null;
}
function toFs(obj){ return {fields:Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,_cv_to(v)]))}; }
function fromFs(doc){ if(!doc?.fields) return null; return Object.fromEntries(Object.entries(doc.fields).map(([k,v])=>[k,_cv_from(v)])); }

async function fbGet(col, id){
  try{
    const ctrl=new AbortController();
    const tid=setTimeout(()=>ctrl.abort(), 8000);
    const r = await fetch(`${FB_BASE}/${col}/${id}`, {signal:ctrl.signal});
    clearTimeout(tid);
    if(r.status===404) return {ok:false, err:"not_found"};
    if(!r.ok) return {ok:false, err:"error"};
    return {ok:true, data:fromFs(await r.json())};
  }catch{ return {ok:false, err:"network"}; }
}
async function fbSet(col, id, obj){
  try{
    const r = await fetch(`${FB_BASE}/${col}/${id}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(toFs(obj))
    });
    return r.ok ? {ok:true} : {ok:false, err:"error"};
  }catch{ return {ok:false, err:"network"}; }
}

/* ── Session utilisateur ── */
const LS_SESSION = "METHODS_SESSION_V1";
let currentUser = null;

function loadSession(){ try{ return JSON.parse(localStorage.getItem(LS_SESSION)||"null"); }catch{ return null; } }
function saveSession(u){ try{ localStorage.setItem(LS_SESSION, JSON.stringify(u)); }catch{} }
function clearSession(){ try{ localStorage.removeItem(LS_SESSION); }catch{} currentUser=null; }

/* ── Auth ── */
async function sha256(str){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function randomToken(){
  return Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function authLogin(pseudo, pass){
  const p = pseudo.trim().toLowerCase();
  if(!p || !pass) return {ok:false, err:"Remplis tous les champs."};
  const r = await fbGet("users", p);
  if(!r.ok) return {ok:false, err:"Pseudo introuvable."};
  const hash = await sha256(pass + (r.data.salt||""));
  if(hash !== r.data.hash) return {ok:false, err:"Mot de passe incorrect."};
  const token = randomToken();
  await fbSet("users", p, {...r.data, token, lastLogin:new Date().toISOString()});
  return {ok:true, pseudo:p, token};
}
async function authRegister(pseudo, pass, pass2, secretQ, secretA){
  const p = pseudo.trim().toLowerCase();
  if(!p||!pass) return {ok:false, err:"Remplis tous les champs."};
  if(pass !== pass2) return {ok:false, err:"Les mots de passe ne correspondent pas."};
  if(!secretQ||!secretA?.trim()) return {ok:false, err:"Choisis une question secrète et saisis ta réponse."};
  if(p.length < 3) return {ok:false, err:"Pseudo trop court (3 caractères min)."};
  const exists = await fbGet("users", p);
  if(exists.ok) return {ok:false, err:"Pseudo déjà utilisé."};
  const salt = randomToken();
  const hash = await sha256(pass + salt);
  const secretASalt = randomToken();
  const secretAHash = await sha256(secretA.trim().toLowerCase() + secretASalt);
  const token = randomToken();
  await fbSet("users", p, {hash, salt, token, secretQ, secretAHash, secretASalt, createdAt:new Date().toISOString()});
  return {ok:true, pseudo:p, token};
}
async function authGetQuestion(pseudo){
  const p = pseudo.trim().toLowerCase();
  if(!p) return {ok:false, err:"Saisis ton pseudo."};
  const r = await fbGet("users", p);
  if(!r.ok) return {ok:false, err:"Pseudo introuvable."};
  if(!r.data.secretQ) return {ok:false, err:"Pas de question secrète enregistrée pour ce compte."};
  return {ok:true, question:r.data.secretQ};
}
async function authRecover(pseudo, answer, newPass){
  const p = pseudo.trim().toLowerCase();
  if(!p||!answer||!newPass) return {ok:false, err:"Remplis tous les champs."};
  const r = await fbGet("users", p);
  if(!r.ok) return {ok:false, err:"Pseudo introuvable."};
  if(!r.data.secretQ) return {ok:false, err:"Pas de question secrète. Contacte l'admin."};
  const ansHash = await sha256(answer.trim().toLowerCase() + (r.data.secretASalt||""));
  if(ansHash !== r.data.secretAHash) return {ok:false, err:"Réponse incorrecte."};
  const newHash = await sha256(newPass + (r.data.salt||""));
  const token = randomToken();
  await fbSet("users", p, {...r.data, hash:newHash, token});
  return {ok:true, pseudo:p, token};
}

/* ── Utilitaires ── */
function todayStr(){
  return new Intl.DateTimeFormat("fr-CA",{year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function addDays(ymd, n){
  const [y,m,d] = ymd.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate() + n);
  return new Intl.DateTimeFormat("fr-CA",{year:"numeric",month:"2-digit",day:"2-digit"}).format(dt);
}

function norm(w){
  if(!w) return "";
  return w.toUpperCase()
    .replace(/Œ/g,"OE").replace(/Æ/g,"AE")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^A-Z]/g,"");
}

/* ── SRS ── */
const SRS_INTERVALS = [1,3,7,14,30,60,120];
function nextInterval(cur){
  const i = SRS_INTERVALS.indexOf(cur);
  return SRS_INTERVALS[Math.min(SRS_INTERVALS.length-1, i<0?0:i+1)];
}

/* ── Vue système ── */
// Une seule fonction pour afficher une vue — garantit qu'il n'y en a qu'une active
function showView(id){
  document.querySelectorAll(".view").forEach(v=>{
    v.classList.toggle("active", v.id===id);
  });
}

/* ── Modale définition ── */
let _openDefCanon = null; // canon affiché dans la modale (pour mise à jour async)

/* ── Modale définition simple (indice 📖) ── */
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

function openDefSimple(defText){
  // Nettoyer la prononciation [xxx] en début
  let d = (defText||"").replace(/^(?:ou\s+)?\[[^\]]*\]\s*/i,"").trim();
  const tEl=$("#def-title"), bEl=$("#def-body"), mEl=$("#def-modal");
  if(!tEl||!bEl||!mEl) return;
  tEl.textContent="Définition";
  bEl.textContent=d||"(définition absente)";
  // Masquer les liens et sections extra
  const linksDiv=$("#def-links"); if(linksDiv) linksDiv.style.display="none";
  const anaEl=$("#def-ana"); if(anaEl) anaEl.innerHTML="";
  const rallEl=$("#def-rall"); if(rallEl) rallEl.innerHTML="";
  mEl.classList.add("open");
}

// Returns every index in c[] where c[i] === canon (handles homographs like CHOPPER x2).
function _findAllIdxs(canon){
  const C=window.SEQODS_DATA?.c; if(!C) return [];
  const out=[];
  for(let i=0;i<C.length;i++) if(C[i]===canon) out.push(i);
  return out;
}

// If w is also a conjugated form of a *different* verb in c[], return that verb.
// Handles cases like BRASQUE (noun) also being je/il brasque → BRASQUER.
function _findConjLemma(w){
  const cm=_getCMap();
  if(w.endsWith('E')&&w.length>3){
    const st=w.slice(0,-1);
    if(cm.has(st+'ER')&&st+'ER'!==w) return st+'ER';
    if(cm.has(st+'RE')&&st+'RE'!==w) return st+'RE';
  }
  if(w.endsWith('ES')&&w.length>4){
    const st=w.slice(0,-2);
    if(cm.has(st+'ER')&&st+'ER'!==w) return st+'ER';
  }
  return null;
}

function openDef(canon, displayWord, defText, flechie){
  const DATA = window.SEQODS_DATA;
  if(!DATA) return;
  const C=DATA.c, E=DATA.e, F=DATA.f, A=DATA.a, R=DATA.r;

  let allIdxs = _findAllIdxs(canon);
  if(allIdxs.length === 0 && defText === undefined){
    const lemma = findLemma(canon);
    if(lemma && lemma !== canon){ openDef(lemma, null, undefined, canon); return; }
  }
  // Redirect pure conjugation-form entries to their infinitive
  {
    const conjM=_getConjMap();
    if(conjM.has(canon) && defText===undefined){
      const _POS=/^(n\.|adj\.|v\.|loc\.|adv\.|interj\.|pron\.|num\.|art\.)/;
      const _CONJ=/-->\s+\S+\s+\d{2,}\./;
      const real=allIdxs.filter(i=>{const f=F[i]||'';return _POS.test(f)||!_CONJ.test(f);});
      if(real.length>0) allIdxs=real;
      else{ openDef(conjM.get(canon)); return; }
    }
  }
  const _CP = /^-->\s+([A-Z]+)\s+\d+\./;
  // Prefer non-redirect entry for title (dual-nature words like FEUTRANT: adj FEUTRANT,E over participle redirect)
  const titleIdx = allIdxs.find(i => !_CP.test(F?.[i]||'')) ?? (allIdxs[0] ?? -1);
  const rawDisplay = (displayWord || (titleIdx>=0 ? E[titleIdx] : canon)).replace(/\*/g,"").trim();
  const title = rawDisplay.split(",")[0].trim(); // base form, pour les liens externes

  // Build list of {label, entryLabel, text} for each definition to display.
  const defs = defText !== undefined
    ? [{label:null, entryLabel:null, text:defText}]
    : allIdxs.map(i=>{ const f=F?.[i]||''; const m=f.match(_CP); if(m){ const ci=_getCMap().get(m[1]); return {label:m[1], entryLabel:null, text:ci!==undefined?(F?.[ci]||''):''}; } const el=E?.[i]; return {label:null, entryLabel:(el?.includes(',') ? el.replace(/\*/g,'') : null), text:f}; });
  // Utiliser la définition personnalisée admin si disponible en cache
  if(defs.length>0 && defText===undefined){
    const cd = window._rechCache?.[canon]?.loaded ? window._rechCache[canon].custom?.def : undefined;
    if(cd !== undefined) defs[0] = {label:null, entryLabel:null, text:cd};
  }
  if(allIdxs.length>0 && defText===undefined){
    const cl=_findConjLemma(canon);
    if(cl){ const ci=_getCMap().get(cl); if(ci!==undefined) defs.push({label:cl, entryLabel:null, text:F?.[ci]||""}); }
  }

  const wSlash=_wantsSlash(canon)&&!rawDisplay.includes('/');
  $("#def-title").textContent = wSlash ? rawDisplay+' /' : rawDisplay;
  const bodyEl=$("#def-body");
  if(defs.length<=1){
    bodyEl.textContent = defs[0]?.text||"(définition absente)";
  } else {
    bodyEl.innerHTML="";
    defs.forEach((d,i)=>{
      if(i>0){
        const hr=document.createElement("hr");
        hr.style.cssText="border:none;border-top:1px solid var(--stroke);margin:8px 0 4px";
        bodyEl.appendChild(hr);
      }
      if(d.label){
        const lnk=document.createElement("a"); lnk.href="#"; lnk.className="def-link";
        lnk.textContent=d.label;
        lnk.addEventListener("click",ev=>{ev.preventDefault();openDef(d.label,d.label);});
        bodyEl.appendChild(lnk);
        bodyEl.appendChild(document.createTextNode(" "));
      } else if(d.entryLabel){
        const lbl=document.createElement("span");
        lbl.style.cssText="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:1px";
        lbl.textContent=d.entryLabel;
        bodyEl.appendChild(lbl);
      }
      const p=document.createElement("p"); p.style.margin="0";
      p.textContent=d.text||(d.label?"":"(définition absente)");
      bodyEl.appendChild(p);
    });
  }

  const raw = title.toLowerCase();
  $("#def-wikt").href = "https://fr.wiktionary.org/wiki/" + encodeURIComponent(raw);
  $("#def-img").href = "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(raw);
  $("#def-links").style.display = "flex";

  // Anagrammes du lemme
  const anaEl = $("#def-ana"); if(anaEl) anaEl.innerHTML="";
  if(A && anaEl){
    const tir = canon.split("").sort((a,b)=>a.localeCompare(b,"fr")).join("");
    const lst = (A[tir]||[]).filter(x=>norm(x)!==canon).slice(0,60);
    if(lst.length){ _renderWordLinks(anaEl, lst, "Anagrammes"); }
  }

  // Rallonges du lemme
  const rallEl = $("#def-rall"); if(rallEl) rallEl.innerHTML="";
  if(R && rallEl){
    const lst = R[canon]||[];
    if(lst.length){ _renderWordLinks(rallEl, lst, "Rallonges"); }
  }

  // Section forme fléchie : soit redirect depuis conjugaison, soit entrée avec virgule (ex: PERLANT, E)
  let flechieToShow = flechie || null;
  if(!flechieToShow && titleIdx >= 0 && E?.[titleIdx]?.includes(',')){
    const resolved = resolveInflectedCanon(canon, E[titleIdx].split(',')[1]);
    if(resolved && resolved !== canon) flechieToShow = resolved;
  }
  const flechieEl = $("#def-flechie"); if(flechieEl) flechieEl.innerHTML="";
  if(flechieToShow && flechieToShow !== canon && flechieEl){
    // Cherche dans toutes les formes (d[]), pas seulement les lemmes (A),
    // car l'anagramme d'une forme fléchie peut être une autre forme fléchie.
    const ftir = flechieToShow.split("").sort().join("");
    const normToE = getNormToE();
    const fAna = getDictArr()
      .filter(w => w !== flechieToShow && w.split("").sort().join("") === ftir)
      .slice(0, 60)
      .map(w => normToE[w] || w);
    const fRal = R ? (R[flechieToShow]||[]) : [];
    if(fAna.length || fRal.length){
      const sep = document.createElement("hr");
      sep.style.cssText = "border:none;border-top:1px solid var(--stroke);margin:12px 0 4px";
      flechieEl.appendChild(sep);
      const sub = document.createElement("p");
      sub.style.cssText = "font-size:11px;color:var(--muted);margin:0 0 2px";
      sub.appendChild(document.createTextNode("Forme : "));
      const fLink = document.createElement("a"); fLink.href="#"; fLink.className="def-link";
      fLink.style.cssText = "font-size:11px;";
      fLink.textContent = flechieToShow;
      fLink.addEventListener("click", e=>{ e.preventDefault(); openDef(flechieToShow, flechieToShow); });
      sub.appendChild(fLink);
      flechieEl.appendChild(sub);
      if(fAna.length){
        const sec = document.createElement("div"); sec.className="modal-sec";
        _renderWordLinks(sec, fAna, "Anagrammes"); flechieEl.appendChild(sec);
      }
      if(fRal.length){
        const sec = document.createElement("div"); sec.className="modal-sec";
        _renderWordLinks(sec, fRal, "Rallonges"); flechieEl.appendChild(sec);
      }
    }
  }

  _openDefCanon = canon;
  $("#def-modal").classList.add("open");

  // Chargement lazy de la déf custom si pas encore en cache
  if(defText===undefined && allIdxs.length>0 && !window._rechCache?.[canon]?.loaded){
    const targetCanon = canon;
    fbGet("rech_custom", canon).then(r=>{
      if(_openDefCanon !== targetCanon) return;
      if(!window._rechCache) window._rechCache={};
      if(!window._rechCache[canon]) window._rechCache[canon]={custom:{},excl:[],loaded:false};
      window._rechCache[canon].custom = r.ok && r.data ? r.data : {};
      window._rechCache[canon].loaded = true;
      const cd = window._rechCache[canon].custom?.def;
      if(cd===undefined) return;
      const bodyEl=$("#def-body"); if(!bodyEl) return;
      if(!$("#def-modal")?.classList.contains("open")) return;
      if(defs.length<=1) bodyEl.textContent = cd || "(définition absente)";
      else { const p=bodyEl.querySelector("p"); if(p) p.textContent=cd||"(définition absente)"; }
    }).catch(()=>{});
  }
}

function closeDef(){
  $("#def-modal")?.classList.remove("open");
  if(!window.matchMedia("(pointer:fine)").matches) return;
  setTimeout(()=>{
    const active=document.querySelector(".view.active")?.id;
    if(active==="v-entremods") document.getElementById("em-saisie")?.focus();
    else if(active==="v-themods") document.getElementById("tm-saisie")?.focus();
  }, 50);
}

function wireDefModal(){
  $("#def-close")?.addEventListener("click", closeDef);
  $("#def-bd")?.addEventListener("click", closeDef);
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeDef(); });
}

/* ── Clavier mobile générique ── */
function wireKeyboard(kbId, dispId, msgId, onKey){
  const kb = document.getElementById(kbId);
  if(!kb) return;
  let buf = "";
  const upd = () => { const d=document.getElementById(dispId); if(d) d.textContent=buf; };
  const setKbMsg = (t,c) => { const m=document.getElementById(msgId); if(m){m.textContent=t;m.className="kb-msg"+(c?" "+c:"");} };

  const press = k => {
    if(k==="CLR"){ buf=""; upd(); }
    else if(k==="DEL"){ buf=buf.slice(0,-1); upd(); }
    else if(k==="OK"){
      if(buf.trim()){ onKey(buf.trim()); buf=""; upd(); }
    } else { buf+=k; upd(); }
  };

  kb.addEventListener("mousedown", e=>{
    const key=e.target.closest(".kk"); if(!key) return;
    e.preventDefault(); press(key.dataset.k);
  });
  kb.addEventListener("touchstart", e=>{
    const key=e.target.closest(".kk"); if(!key) return;
    e.preventDefault(); press(key.dataset.k);
  }, {passive:false});
  kb.addEventListener("click", e=>{ if(e.target.closest(".kk")) e.preventDefault(); });

  return { setMsg: setKbMsg, clear: ()=>{ buf=""; upd(); } };
}

/* ── Dictionnaire modal ── */

function setDictBtnVisible(v){
  document.getElementById("btn-dict")?.classList.toggle("hidden", !v);
}

// Extrait la nature grammaticale depuis le début d'une définition ("v.", "n.m.", "adj.", etc.)
function _posLabel(def){
  const d=(def||"").replace(/^(?:ou\s+)?\[[^\]]*\]\s*/i,"").trim();
  const parts=[];
  for(const t of d.split(/\s+/)){
    if(parts.length>=2||!t.endsWith(".")||t.length>6) break;
    parts.push(t);
  }
  return parts.join(" ");
}

// Binary search: premier index i dans le tableau trié A tel que A[i] >= prefix
function _dictBisect(A, prefix){
  let lo=0, hi=A.length;
  while(lo<hi){ const mid=(lo+hi)>>1; if(A[mid]<prefix) lo=mid+1; else hi=mid; }
  return lo;
}

// Map lazy : mot canonique → index dans c[] (pour retrouver def/display)
let _cMap=null;
function _getCMap(){
  if(!_cMap){
    _cMap=new Map();
    const c=window.SEQODS_DATA?.c;
    if(c) c.forEach((w,i)=>_cMap.set(w,i));
  }
  return _cMap;
}

// Set lazy de tous les canons qui doivent afficher "/" (pré-construit en O(n) une seule fois)
let _wantsSlashSet = null;
function _getWantsSlashSet(){
  if(_wantsSlashSet) return _wantsSlashSet;
  _wantsSlashSet = new Set();
  const DATA=window.SEQODS_DATA; if(!DATA) return _wantsSlashSet;
  const {c:C,e:E,f:F}=DATA;
  const _INVAR=/\binterj\b|\bloc\b|\badv\b/;
  const _VAR=/\bn\.[mf]\b|\bn\.\s|\bn\.\)|\badj\b|\bv\.|\bpron\b|\bnum\b/;
  // Regrouper les indices par canon
  const byCanon=new Map();
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

// Conservé pour openDef / dictSelectWord (appels unitaires)
function _wantsSlash(canon){ return _getWantsSlashSet().has(canon); }

function dictUpdateLinks(displayWord){
  const raw=(displayWord||"").split(",")[0].trim().toLowerCase().replace(/\s+.*/,"");
  const w=document.getElementById("dict-wikt");
  const img=document.getElementById("dict-img");
  if(w) w.href = raw ? "https://fr.wiktionary.org/wiki/"+encodeURIComponent(raw) : "#";
  if(img) img.href = raw ? "https://www.google.com/search?tbm=isch&q="+encodeURIComponent(raw) : "#";
}

// Afficher le résultat pour un mot canonique normalisé (présent dans d[])
function dictSelectWord(w, idx){
  const DATA=window.SEQODS_DATA; if(!DATA) return;
  const inp=document.getElementById("dict-input");
  if(inp){ inp.value=w; }
  const _disp=document.getElementById("rech-kb-disp");
  if(_disp) _disp.textContent=w;
  document.getElementById("dict-sugg").innerHTML="";

  let allIdxs=_findAllIdxs(w);
  // If a specific idx was passed (suggestion click), put it first
  if(idx!==undefined && allIdxs.length>1 && allIdxs[0]!==idx){
    allIdxs=[idx,...allIdxs.filter(i=>i!==idx)];
  }
  // Filter/redirect pure conjugation-form entries
  {
    const conjM=_getConjMap();
    if(conjM.has(w)){
      const _POS=/^(n\.|adj\.|v\.|loc\.|adv\.|interj\.|pron\.|num\.|art\.)/;
      const _CONJ=/-->\s+\S+\s+\d{2,}\./;
      const real=allIdxs.filter(i=>{const f=DATA.f[i]||'';return _POS.test(f)||!_CONJ.test(f);});
      if(real.length>0) allIdxs=real;
      else{ dictSelectWord(conjM.get(w)); return; }
    }
  }

  if(allIdxs.length>0){
    const cIdx0=allIdxs[0];
    const display=DATA.e[cIdx0]||w;
    const slash=_wantsSlash(w)&&!display.includes('/');
    document.getElementById("dict-word").textContent=display+(slash?' /':'');

    const defEl=document.getElementById("dict-def");
    const _customDef = window._rechCache?.[w]?.loaded ? window._rechCache[w].custom?.def : undefined;
    if(allIdxs.length===1){
      const raw=(DATA.f[cIdx0]||'').replace(/^(?:ou\s+)?\[[^\]]*\]\s*/i,'').trim();
      defEl.textContent=(_customDef!==undefined ? _customDef : raw)||"(définition absente)";
    } else {
      defEl.innerHTML="";
      allIdxs.forEach((i,n)=>{
        if(n>0){
          const hr=document.createElement("hr");
          hr.style.cssText="border:none;border-top:1px solid var(--stroke);margin:6px 0 3px";
          defEl.appendChild(hr);
          const dispI=DATA.e[i]||w;
          if(dispI!==display){
            const lbl=document.createElement("small");
            lbl.style.cssText="color:var(--muted);display:block;font-size:10px;margin-bottom:2px";
            lbl.textContent=dispI; defEl.appendChild(lbl);
          }
        }
        let raw=(DATA.f[i]||'').replace(/^(?:ou\s+)?\[[^\]]*\]\s*/i,'').trim();
        if(n===0 && _customDef!==undefined) raw=_customDef;
        const p=document.createElement("p"); p.style.margin="0";
        p.textContent=raw||"(définition absente)"; defEl.appendChild(p);
      });
    }
    // Anagrammes
    const anaEl=document.getElementById("dict-ana");
    if(anaEl && DATA.a){
      anaEl.innerHTML="";
      const tir=w.split("").sort((a,b)=>a.localeCompare(b,"fr")).join("");
      const anaLst=(DATA.a[tir]||[]).filter(x=>norm(x)!==w).slice(0,60);
      if(anaLst.length){
        const lbl=document.createElement("strong"); lbl.textContent="Anagrammes"; anaEl.appendChild(lbl);
        const sp=document.createElement("span");
        anaLst.forEach((aw,ai)=>{
          if(ai) sp.appendChild(document.createTextNode(" • "));
          const a=document.createElement("a"); a.href="#"; a.className="def-link";
          a.textContent=aw;
          a.addEventListener("click",e=>{ e.preventDefault(); dictSelectWord(norm(aw)); });
          sp.appendChild(a);
        });
        anaEl.appendChild(sp);
      }
    } else if(anaEl) anaEl.innerHTML="";
    // Rallonges
    const lst=DATA.r?.[w]||[];
    const rallEl=document.getElementById("dict-rall");
    if(rallEl){
      rallEl.innerHTML="";
      if(lst.length){
        const lbl=document.createElement("strong"); lbl.textContent="Rallonges"; rallEl.appendChild(lbl);
        const sp=document.createElement("span");
        lst.forEach((rw,ri)=>{
          if(ri) sp.appendChild(document.createTextNode(" • "));
          const a=document.createElement("a"); a.href="#"; a.className="def-link";
          a.textContent=rw;
          a.addEventListener("click",e=>{ e.preventDefault(); dictSelectWord(norm(rw)); });
          sp.appendChild(a);
        });
        rallEl.appendChild(sp);
      }
    }
    // Conjugaison : si ce mot est aussi une forme irrégulière, afficher lien vers l'infinitif
    const conjEl=document.getElementById("dict-conj");
    if(conjEl){
      conjEl.innerHTML="";
      const irr=_getIrregMap();
      if(irr.has(w)){
        const inf=irr.get(w);
        if(inf && inf!==w && _getCMap().has(inf)){
          const infIdx=_getCMap().get(inf);
          const infDisp=(infIdx!==undefined ? DATA.e[infIdx] : null)||inf;
          const lbl=document.createElement("strong"); lbl.textContent="Conjugaison";
          conjEl.appendChild(lbl);
          const sp=document.createElement("span");
          sp.appendChild(document.createTextNode(" → "));
          const a=document.createElement("a"); a.href="#"; a.className="def-link";
          a.textContent=infDisp;
          a.addEventListener("click",e=>{e.preventDefault();dictSelectWord(inf);});
          sp.appendChild(a); conjEl.appendChild(sp);
        }
      }
    }
    dictUpdateLinks(display);
  } else {
    // Not a canonical entry
    const lemma=findLemma(w);
    document.getElementById("dict-word").textContent=w;
    document.getElementById("dict-ana").innerHTML="";
    document.getElementById("dict-rall").innerHTML="";
    document.getElementById("dict-conj").innerHTML="";
    const defEl=document.getElementById("dict-def");
    if(lemma && lemma!==w){
      defEl.innerHTML="";
      defEl.appendChild(document.createTextNode("→ "));
      const lnk=document.createElement("a"); lnk.href="#"; lnk.className="def-link";
      lnk.textContent=lemma;
      lnk.addEventListener("click",e=>{e.preventDefault();dictSelectWord(lemma);});
      defEl.appendChild(lnk);
    } else {
      defEl.textContent=_getDSet().has(w)?"Forme variable · Mot valide ODS9":"Mot inconnu.";
    }
    dictUpdateLinks(w);
  }
  document.getElementById("dict-result").style.display="";
  window._onDictSelect?.(w);
}

function _dictRenderSugg(prefix){
  const sugg=document.getElementById("dict-sugg"); if(!sugg) return;
  if(!prefix){ sugg.innerHTML=""; return; }
  const DATA=window.SEQODS_DATA;
  if(!DATA?.c){ sugg.innerHTML="<li class='dict-no-result'>Données non chargées — rechargez l'application.</li>"; return; }
  const C=DATA.c, E=DATA.e||[], F=DATA.f||[];
  const start=_dictBisect(C, prefix);
  const _conjM=_getConjMap();
  const _POS=/^(n\.|adj\.|v\.|loc\.|adv\.|interj\.|pron\.|num\.|art\.)/;
  const _CONJ=/-->\s+\S+\s+\d{2,}\./;
  const candidates=[];
  for(let i=start; i<C.length; i++){
    if(!C[i].startsWith(prefix)) break;
    if(_conjM.has(C[i])){const f=F[i]||''; if(!_POS.test(f)&&_CONJ.test(f)) continue;}
    candidates.push(i);
  }
  let html="";
  const _prefixIsConj=_conjM.has(prefix)&&!candidates.some(i=>C[i]===prefix);
  if((!_getCMap().has(prefix)||_prefixIsConj)&&(_getDSet().has(prefix)||_prefixIsConj)){
    const lemma=_prefixIsConj?_conjM.get(prefix):findLemma(prefix);
    if(lemma&&lemma!==prefix) html+=`<li data-lemma="${lemma}">→ <a class="def-link">${lemma}</a></li>`;
  }
  for(const i of candidates){
    let label=(E[i]||C[i]).replace(/&/g,"&amp;").replace(/</g,"&lt;");
    if(_wantsSlash(C[i])&&!label.includes("/")) label+=" /";
    const pos=_posLabel(F[i]); if(pos) label+="  "+pos;
    html+=`<li data-idx="${i}">${label}</li>`;
  }
  sugg.innerHTML=html||"<li class='dict-no-result'>Mot inconnu.</li>";
}

let _rechFromView = null;
let _rechActiveTab = 'dict';

function _rechSwitchTab(tab){
  _rechActiveTab = tab;
  document.getElementById("v-recherche")?.setAttribute("data-rech-tab", tab);
  document.getElementById("rech-tab-btn-dict")?.classList.toggle("active", tab==="dict");
  document.getElementById("rech-tab-btn-search")?.classList.toggle("active", tab==="search");
  const dictEl=document.getElementById("rech-tab-dict");
  const srchEl=document.getElementById("rech-tab-search");
  if(dictEl) dictEl.style.display = tab==="dict" ? "" : "none";
  if(srchEl) srchEl.style.display = tab==="search" ? "" : "none";
  const spec=document.getElementById("rech-kb-specials");
  if(spec) spec.style.display = tab==="search" ? "" : "none";
  const inp=document.getElementById("dict-input");
  if(inp){
    inp.value="";
    inp.placeholder = tab==="search" ? "Motif de recherche…" : "Saisir un mot…";
  }
  inp?.focus();
  if(tab==="dict"){
    document.getElementById("dict-result")?.style.setProperty("display","none");
    const s=document.getElementById("dict-sugg"); if(s) s.innerHTML="";
  } else {
    const r=document.getElementById("rech-search-res"); if(r) r.innerHTML="";
  }
}

/* ── Moteur de recherche (onglet Recherche) ── */
let _rechWordSet=null;
function _getWordSet(){
  if(_rechWordSet) return _rechWordSet;
  _rechWordSet=new Set(getDictArr());
  return _rechWordSet;
}

let _rechAnagramMap=null;
function _getAnagramMap(){
  if(_rechAnagramMap) return _rechAnagramMap;
  const arr=getDictArr(); if(!arr.length) return new Map();
  _rechAnagramMap=new Map();
  for(const w of arr){
    const k=w.split("").sort().join("");
    if(!_rechAnagramMap.has(k)) _rechAnagramMap.set(k,[]);
    _rechAnagramMap.get(k).push(w);
  }
  return _rechAnagramMap;
}

function _isSubanagram(letters,word){
  const freq={};
  for(const c of word) freq[c]=(freq[c]||0)+1;
  for(const c of letters){ if(!freq[c]) return false; freq[c]--; }
  return true;
}

function _rechParseQuery(q){
  const parts=q.split("/");
  const base=parts[0];
  const alts=parts.slice(1).map(p=>({exclude:p[0]==="-",suffix:p[0]==="-"?p.slice(1):p}));
  if(!base) return null;

  if(base.includes("•")||base.includes("*")){
    const stars=(base.match(/\*/g)||[]).length;
    const hasDots=base.includes("•");
    // Chemins rapides : patterns purs sans mélange
    if(!hasDots){
      const fi=base.indexOf("*"),la=base.lastIndexOf("*");
      if(stars===1&&fi===0) return {type:"suffix",suffix:base.slice(1),alts};
      if(stars===1&&la===base.length-1) return {type:"prefix",prefix:base.slice(0,-1),alts};
      if(stars===2&&fi===0&&la===base.length-1) return {type:"contains",inner:base.slice(1,-1),alts};
    }
    if(!stars){
      const leadDots=(base.match(/^•+/)||[""])[0].length;
      const trailDots=(base.match(/•+$/)||[""])[0].length;
      const core=base.replace(/^•+/,"").replace(/•+$/,"");
      if(!core) return null;
      if(leadDots>0&&trailDots===0&&!core.includes("•")) return {type:"exact-suffix",core,totalLen:leadDots+core.length,alts};
      if(trailDots>0&&leadDots===0&&!core.includes("•")) return {type:"exact-prefix",core,totalLen:core.length+trailDots,alts};
    }
    // Cas général et mixte : B*D•E, B•R, B*D*E, etc.
    const regexStr="^"+[...base].map(c=>c==="*"?".*":c==="•"?".":c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("")+"$";
    return {type:"wildcard",regex:new RegExp(regexStr),alts};
  }

  if(base.includes("?")){
    const qCount=(base.match(/\?/g)||[]).length;
    const letters=base.replace(/\?/g,"");
    return {type:"subanagram",letters,extraCount:qCount,alts};
  }

  if(/^[A-Z]+$/.test(base)) return {type:"anagram",letters:base,alts};
  return null;
}

let _rechSearchTimer=null;
function _rechTriggerSearch(raw){
  clearTimeout(_rechSearchTimer);
  const q=raw.toUpperCase().trim();
  const el=document.getElementById("rech-search-res");
  if(!q){ if(el) el.innerHTML=""; return; }
  _rechSearchTimer=setTimeout(()=>_rechRenderResults(_rechExec(q)),250);
}

function _rechExec(q){
  const parsed=_rechParseQuery(q);
  if(!parsed) return [];
  const words=getDictArr(); if(!words.length) return [];
  let res=[];
  switch(parsed.type){
    case "anagram":{ const k=parsed.letters.split("").sort().join(""); res=(_getAnagramMap().get(k)||[]).slice(); break; }
    case "subanagram":{
      const {letters,extraCount}=parsed;
      const tl=letters.length+extraCount;
      for(const w of words) if(w.length===tl&&_isSubanagram(letters,w)) res.push(w);
      break;
    }
    case "suffix":{ const s=parsed.suffix; if(s) for(const w of words) if(w.endsWith(s)&&w.length>s.length) res.push(w); break; }
    case "prefix":{ const p=parsed.prefix; if(p) for(const w of words) if(w.startsWith(p)&&w.length>p.length) res.push(w); break; }
    case "contains":{
      const inner=parsed.inner; if(!inner) break;
      for(const w of words){ const i=w.indexOf(inner); if(i>0&&i+inner.length<w.length) res.push(w); }
      break;
    }
    case "exact-suffix":{ const {core,totalLen}=parsed; for(const w of words) if(w.length===totalLen&&w.endsWith(core)) res.push(w); break; }
    case "exact-prefix":{ const {core,totalLen}=parsed; for(const w of words) if(w.length===totalLen&&w.startsWith(core)) res.push(w); break; }
    case "wildcard":{ for(const w of words) if(parsed.regex.test(w)) res.push(w); break; }
  }
  const baseSuffix=parsed.type==="suffix"?parsed.suffix:parsed.type==="exact-suffix"?parsed.core:null;
  if(parsed.alts.length>0&&baseSuffix){
    const ws=_getWordSet();
    const incl=parsed.alts.filter(a=>!a.exclude);
    const excl=parsed.alts.filter(a=>a.exclude);
    res=res.filter(w=>{
      const stem=w.slice(0,w.length-baseSuffix.length);
      return (incl.length===0||incl.some(a=>ws.has(stem+a.suffix)))&&excl.every(a=>!ws.has(stem+a.suffix));
    });
  }
  return res;
}

function _rechRenderResults(words){
  const el=document.getElementById("rech-search-res"); if(!el) return;
  if(!words.length){ el.innerHTML="<div class='rech-no-res'>Aucun résultat</div>"; return; }
  const total=words.length;
  const groups={};
  for(const w of words)(groups[w.length]=groups[w.length]||[]).push(w);
  const lens=Object.keys(groups).map(Number).sort((a,b)=>a-b);
  let html=`<div class="rech-count">${total} mot${total>1?"s":""}</div>`;
  for(const len of lens){
    const g=groups[len];
    html+=`<div class="rech-group-hdr">${len} lettres · ${g.length}</div><div class="rech-group">`;
    for(const w of g){
      html+=`<span class="rech-res-word" data-canon="${w}">${w}</span>`;
    }
    html+="</div>";
  }
  el.innerHTML=html;
}

function prewarmDictMaps(){
  setTimeout(()=>{ _getCMap(); _getDSet(); _getConjMap(); _getWantsSlashSet(); }, 0);
  setTimeout(()=>{ _getAnagramMap(); }, 1000);
}

function openDictModal(){
  _rechFromView = document.querySelector(".view.active")?.id || "v-select";
  _rechSwitchTab("dict");
  showView("v-recherche");
  const inp=document.getElementById("dict-input");
  if(inp){ inp.value=""; }
  const disp=document.getElementById("rech-kb-disp");
  if(disp) disp.textContent="";
  const _suggEl=document.getElementById("dict-sugg"); if(_suggEl) _suggEl.innerHTML="";
  const _resEl=document.getElementById("dict-result"); if(_resEl) _resEl.style.display="none";
  dictUpdateLinks("");
  inp?.focus();
}

function closeDictModal(){
  showView(_rechFromView || "v-select");
  _rechFromView = null;
}

function _wireDictBtn(el){
  if(!el) return;
  el.addEventListener("touchend", e=>{ e.preventDefault(); openDictModal(); });
  el.addEventListener("click", openDictModal);
}
function wireDictModal(){
  _wireDictBtn(document.getElementById("btn-dict"));
  document.querySelectorAll(".btn-dict-kb").forEach(b=>_wireDictBtn(b));
  document.getElementById("rech-btn-back")?.addEventListener("click", closeDictModal);
  document.getElementById("em-btn-recherche")?.addEventListener("click", openDictModal);
  document.getElementById("btn-tm-recherche")?.addEventListener("click", openDictModal);

  // Onglets
  document.getElementById("rech-tab-btn-dict")?.addEventListener("click", ()=>_rechSwitchTab("dict"));
  document.getElementById("rech-tab-btn-search")?.addEventListener("click", ()=>_rechSwitchTab("search"));

  // Délégation suggestions dictionnaire
  document.getElementById("dict-sugg")?.addEventListener("click", e=>{
    const li=e.target.closest("li"); if(!li) return;
    e.preventDefault();
    if(li.dataset.lemma){ dictSelectWord(li.dataset.lemma); return; }
    if(li.dataset.idx!==undefined){
      const C=window.SEQODS_DATA?.c;
      if(C) dictSelectWord(C[+li.dataset.idx], +li.dataset.idx);
    }
  });
  // Clic sur un mot résultat
  document.getElementById("rech-search-res")?.addEventListener("click", e=>{
    const sp=e.target.closest(".rech-res-word"); if(!sp) return;
    openDef(sp.dataset.canon);
  });

  const inp=document.getElementById("dict-input");
  if(inp){
    inp.addEventListener("input", e=>{
      const disp=document.getElementById("rech-kb-disp");
      if(disp) disp.textContent=e.target.value;
      if(_rechActiveTab==="search"){
        _rechTriggerSearch(e.target.value);
      } else {
        document.getElementById("dict-result")?.style.setProperty("display","none");
        dictUpdateLinks(e.target.value);
        _dictRenderSugg(norm(e.target.value));
      }
    });
    inp.addEventListener("keydown", e=>{
      if(e.key==="Escape"){ closeDictModal(); return; }
      if(e.key==="Enter"){
        if(_rechActiveTab==="search"){
          clearTimeout(_rechSearchTimer);
          const q=inp.value.toUpperCase().trim();
          if(q) _rechRenderResults(_rechExec(q));
          return;
        }
        const v=norm(inp.value); if(!v) return;
        const C=window.SEQODS_DATA?.c; if(!C) return;
        const start=_dictBisect(C,v);
        if(start<C.length && C[start]===v){ dictSelectWord(v); return; }
        if(_getDSet().has(v)){ dictSelectWord(v); return; }
        const first=document.querySelector("#dict-sugg li[data-idx]");
        if(first) first.click();
      }
    });
  }
  document.addEventListener("keydown", e=>{
    if(e.key==="Escape" && document.querySelector("#v-recherche.active")) closeDictModal();
  });
  // Clavier Recherche (mobile)
  const rechKb=document.getElementById("rech-kb");
  if(rechKb){
    const _rechKbPress=k=>{
      const i=document.getElementById("dict-input");
      const d=document.getElementById("rech-kb-disp");
      if(!i) return;
      if(_rechActiveTab==="search"){
        const pos=i.selectionStart??i.value.length;
        const sel=i.selectionEnd??pos;
        if(k==="CLR"){ i.value=""; }
        else if(k==="DEL"){
          if(sel>pos){ i.value=i.value.slice(0,pos)+i.value.slice(sel); i.selectionStart=i.selectionEnd=pos; }
          else if(pos>0){ i.value=i.value.slice(0,pos-1)+i.value.slice(pos); i.selectionStart=i.selectionEnd=pos-1; }
        } else if(k==="OK"){
          clearTimeout(_rechSearchTimer);
          const q=i.value.toUpperCase().trim();
          if(q) _rechRenderResults(_rechExec(q));
          return;
        } else {
          i.value=i.value.slice(0,pos)+k+i.value.slice(sel>pos?sel:pos);
          i.selectionStart=i.selectionEnd=pos+1;
        }
        _rechTriggerSearch(i.value);
        return;
      }
      if(k==="CLR"){ i.value=""; }
      else if(k==="DEL"){ i.value=i.value.slice(0,-1); }
      else if(k==="OK"){
        const v=norm(i.value); if(!v) return;
        const C=window.SEQODS_DATA?.c; if(!C) return;
        const s=_dictBisect(C,v);
        if(s<C.length&&C[s]===v){ dictSelectWord(v); return; }
        if(_getDSet().has(v)){ dictSelectWord(v); return; }
        document.querySelector("#dict-sugg li[data-idx]")?.click();
        return;
      } else { i.value+=k; }
      if(d) d.textContent=i.value;
      document.getElementById("dict-result")?.style.setProperty("display","none");
      dictUpdateLinks(i.value);
      _dictRenderSugg(norm(i.value));
    };
    rechKb.addEventListener("mousedown",e=>{
      const k=e.target.closest(".kk"); if(!k) return;
      e.preventDefault(); _rechKbPress(k.dataset.k);
    });
    rechKb.addEventListener("touchstart",e=>{
      const k=e.target.closest(".kk"); if(!k) return;
      e.preventDefault(); _rechKbPress(k.dataset.k);
    },{passive:false});
    rechKb.addEventListener("click",e=>{ if(e.target.closest(".kk")) e.preventDefault(); });
  }

  if(typeof wireRechercheAdmin==="function") wireRechercheAdmin();
}

/* ── Auth UI ── */
function wireAuthUI(onSuccess){
  // Onglets
  document.querySelectorAll(".auth-tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      document.querySelectorAll(".auth-tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      ["login","register","recover"].forEach(name=>{
        const f=document.getElementById("f-"+name);
        if(f) f.style.display = (name===tab.dataset.tab) ? "flex" : "none";
      });
      $("#auth-err").textContent="";
    });
  });

  const setErr = (msg, ok=false) => {
    const el=$("#auth-err"); if(el){el.textContent=msg; el.className="msg"+(ok?" ok":" err");}
  };
  const setLoading = on => {
    ["btn-login","btn-register","btn-recover"].forEach(id=>{
      const b=document.getElementById(id); if(b) b.disabled=on;
    });
  };

  $("#btn-login")?.addEventListener("click", async()=>{
    const p=$("#login-pseudo")?.value||"", pw=$("#login-pass")?.value||"";
    setLoading(true); setErr("");
    const r = await authLogin(p, pw);
    setLoading(false);
    if(!r.ok){ setErr(r.err); return; }
    onSuccess(r.pseudo, r.token);
  });

  $("#btn-register")?.addEventListener("click", async()=>{
    const p=$("#reg-pseudo")?.value||"";
    const pw=$("#reg-pass")?.value||"", pw2=$("#reg-pass2")?.value||"";
    const secretQ=$("#reg-question")?.value||"", secretA=$("#reg-answer")?.value||"";
    setLoading(true); setErr("");
    const r = await authRegister(p, pw, pw2, secretQ, secretA);
    setLoading(false);
    if(!r.ok){ setErr(r.err); return; }
    onSuccess(r.pseudo, r.token);
  });

  $("#btn-find-question")?.addEventListener("click", async()=>{
    const p=$("#rec-pseudo")?.value||"";
    setLoading(true); setErr("");
    const r = await authGetQuestion(p);
    setLoading(false);
    if(!r.ok){ setErr(r.err); return; }
    const qDiv=$("#rec-question-display");
    if(qDiv){qDiv.textContent=r.question;qDiv.style.display="";}
    ["rec-answer","rec-new","btn-recover"].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display=""; });
  });

  $("#btn-recover")?.addEventListener("click", async()=>{
    const p=$("#rec-pseudo")?.value||"";
    const ans=$("#rec-answer")?.value||"", np=$("#rec-new")?.value||"";
    setLoading(true); setErr("");
    const r = await authRecover(p, ans, np);
    setLoading(false);
    if(!r.ok){ setErr(r.err); return; }
    setErr("Mot de passe changé. Reconnecte-toi.", true);
  });

  // Enter pour valider
  [["login-pass","btn-login"],["reg-answer","btn-register"],["rec-new","btn-recover"]].forEach(([inp,btn])=>{
    document.getElementById(inp)?.addEventListener("keydown", e=>{
      if(e.key==="Enter") document.getElementById(btn)?.click();
    });
  });
}
