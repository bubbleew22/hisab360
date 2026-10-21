import { categoryModules, localDateKey } from './domain.js';
import { initializeApp } from "firebase/app";
import {
  collection, addDoc, onSnapshot, doc,
  updateDoc, deleteDoc, query, orderBy, serverTimestamp,
  where, getDocs, getDoc, setDoc, limit, writeBatch, startAfter, runTransaction,
  initializeFirestore, persistentLocalCache, persistentSingleTabManager
} from "firebase/firestore";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential,
  updateEmail, updatePassword, createUserWithEmailAndPassword, deleteUser,
  setPersistence, browserLocalPersistence, sendEmailVerification, reload, getIdToken
} from "firebase/auth";
import Chart from "chart.js/auto";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

/* v7.1.4 approved mockup: Account + quick Light/Dark in header.
   Full Settings remains in bottom navigation. */
window.H360 = window.H360 || {};
window.H360.syncThemeButton = function(){
  const el=document.getElementById('headerThemeIcon');
  if(!el) return;
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  el.textContent=dark?'🌙':'☀️';
  const btn=document.getElementById('headerThemeBtn');
  if(btn){ btn.classList.toggle('is-dark',dark); btn.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode'); }
};
window.H360.toggleQuickTheme = function(){
  const html=document.documentElement;
  const dark=html.getAttribute('data-theme')==='dark';
  const next=dark?'light':'dark';
  localStorage.setItem('km_theme',next);
  html.setAttribute('data-theme',next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',next==='dark'?'#07111f':'#073477');
  window.H360.syncThemeButton();
  if(typeof showToast==='function') showToast(next==='dark'?'🌙 Dark mode':'☀️ Light mode','success');
};
document.addEventListener('DOMContentLoaded',()=>window.H360.syncThemeButton());

window.Chart = Chart;


window.H360.refreshPremiumStats = function(){
  try{
    const txns=Object.values(transactions||{}).flat();
    const today=localDateKey();
    const todayTx=txns.filter(t=>String(t.date||t.createdAtISO||'').slice(0,10)===today);
    const wasooli=todayTx.filter(t=>t.type==='credit').reduce((a,t)=>a+Number(t.amount||0),0);
    const w=document.getElementById('statWasooli'), a=document.getElementById('statActivity');
    if(w) w.textContent='Rs '+wasooli.toLocaleString();
    if(a) a.textContent=String(todayTx.length);
  }catch(_){}
};
setInterval(()=>window.H360.refreshPremiumStats?.(),1500);

const APP_NAME = "Hisab360";
const APP_VERSION = "7.2.3";
const DEVELOPER = "Yasir Khan";

const firebaseConfig = {
  apiKey: "AIzaSyCah7UdzixwnKwbgWfUzvwgzPYKV4zdRTs",
  authDomain: "self-data-base.firebaseapp.com",
  projectId: "self-data-base",
  storageBucket: "self-data-base.firebasestorage.app",
  messagingSenderId: "430233599855",
  appId: "1:430233599855:web:d2cf0cdd6fa6aa24c5f29a",
  measurementId: "G-3Q9HDEKSDJ"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager()
  })
});
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(e => console.warn("Auth persistence:", e.message));

// Hisab360 extension bridge — exposes only controlled core handles.
window.KMCore = {
  db, auth,
  firebase: { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, where, getDocs, getDoc, setDoc, limit, writeBatch, startAfter, runTransaction },
  get user(){ return currentUser; },
  get userData(){ return currentUserData; },
  get customers(){ return customers; },
  get transactions(){ return transactions; },
  get stockItems(){ return stockItems; },
  get suppliers(){ return suppliers; },
  get stockMovements(){ return stockMovements; },
  get supplierPayments(){ return supplierPayments; },
  get items(){ return items; },
  get workspace(){ return activeWorkspace(); },
  get workspaceId(){ return activeWorkspaceId(); },
  isMaster: () => isMaster?.() || false,
  restartListeners(){ clearFirestoreListeners(); startListeners(); },
  refreshHeader(){ updateHeader(); }
};

// ============================================
// PDF VIEWER (Upar move kiya — pehle jo masla tha)
// ============================================
let _currentPdfHTML = '';
let _currentPdfTitle = '';
let _reportReady=Promise.resolve(),_reportRevision=0,_canvasCache=null,exportBusy=false;

window.openPdfViewer = function(htmlContent, title = '📄 Report') {
  if(exportBusy)return showToast('File tayyar ho rahi hai — thora wait karein','info');
  _currentPdfHTML = htmlContent;
  _currentPdfTitle = title;
  const viewer = document.getElementById('pdfViewer');
  const frame = document.getElementById('pdfFrame');
  document.getElementById('pdfTitle').textContent = title;
  _reportRevision++;_canvasCache=null;
  _reportReady=new Promise(resolve=>{frame.onload=()=>resolve();});
  frame.srcdoc = htmlContent;
  viewer.classList.add('show');
  document.body.style.overflow = 'hidden';
  window._pdfViewerOpen = true;
  history.pushState({ page: 'pdf' }, '');
};

window.closePdfViewer = function() {
  if(exportBusy)return showToast('File tayyar ho rahi hai — thora wait karein','info');
  const viewer = document.getElementById('pdfViewer');
  const frame = document.getElementById('pdfFrame');
  viewer.classList.remove('show');
  frame.srcdoc = '';
  document.body.style.overflow = '';
  window._pdfViewerOpen = false;
  _currentPdfHTML = '';
  _currentPdfTitle = '';
};

// ✅ NAYA: Print function
window.printPdfFrame = function() {
  const frame = document.getElementById('pdfFrame');
  if(!frame || !frame.contentWindow) {
    return showToast('Print nahi ho saka', 'error');
  }
  try {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch(e) {
    // Fallback: new window
    const w = window.open('', '_blank');
    w.document.write(_currentPdfHTML);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  }
};

// ✅ NAYA: Share Modal
window.openSharePdfModal = function() {
 const title=String(_currentPdfTitle||'Report').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
 showModal(`<div class="km-form share-options"><h3 class="km-modal-title">Share / Save Report</h3><p class="km-modal-sub">${title}</p><div class="share-recommendation">PDF detailed hisab ke liye behtar hai. Image WhatsApp par foran dekhne ke liye.</div><div class="km-action-grid"><button onclick="sharePdfAsFile()"><b>📄 Share PDF</b><span>WhatsApp, email ya doosri app</span></button><button onclick="sharePdfWhatsApp()"><b>🖼️ Share Image</b><span>Complete report ki PNG image</span></button><button onclick="saveReportFile('pdf')"><b>📥 Save PDF</b><span>Phone / Downloads mein rakhein</span></button><button onclick="saveReportFile('png')"><b>📥 Save Image</b><span>PNG file apne paas rakhein</span></button><button onclick="closeModal();printPdfFrame()"><b>🖨️ Print</b><span>Printer ya system PDF option</span></button><button onclick="closeModal()"><b>👁️ Preview</b><span>Report pehle dekh lein</span></button></div><p class="finance-hint">Share dabane par phone ka menu khulega. App aur recipient aap select karein.</p><button class="km-btn ghost" onclick="closeModal()" style="width:100%">Close</button></div>`);
};
window.sharePdfSmsText = function(){
  const profile=window.H360?.receiptProfile?.()||{};
  const text=`${profile.name||'Hisab360'} — ${_currentPdfTitle||'Report'}. Detailed image/PDF Hisab360 app se available hai.`;
  window.location.href=`sms:?body=${encodeURIComponent(text)}`;
  closeModal();
};

async function blobToBase64(blob){
  const buf=new Uint8Array(await blob.arrayBuffer());
  let bin='';const step=0x8000;
  for(let i=0;i<buf.length;i+=step) bin+=String.fromCharCode(...buf.subarray(i,i+step));
  return btoa(bin);
}
async function shareActualFile(blob, fileName, mimeType, title, text=''){
  // Native Android path first: write into app Cache, then open the real Android share sheet.
  if(Capacitor.isNativePlatform()){
    try{
      const safe=Date.now()+'_'+fileName.replace(/[^a-zA-Z0-9._-]/g,'_');
      const result=await Filesystem.writeFile({path:safe,data:await blobToBase64(blob),directory:Directory.Cache,recursive:true});
      // Receipt/report shares are real attachments. Do not pre-fill a plain
      // WhatsApp message; reminders/SMS remain a separate explicit action.
      await Share.share({title,files:[result.uri],dialogTitle:title});
      return true;
    }catch(e){if(/cancel|dismiss|abort/i.test(String(e.message||'')))throw Object.assign(new Error('Share cancelled'),{name:'AbortError'});throw e;}
  }
  // Browser/Web Share Level 2 fallback.
  const file=new File([blob],fileName,{type:mimeType});
  if(navigator.share && navigator.canShare?.({files:[file]})){
    await navigator.share({title,text,files:[file]});
    return true;
  }
  return false;
}

window.sharePdfWhatsApp = async function() {
  if(exportBusy)return;exportBusy=true;
  closeModal(); showToast('🖼️ Premium report image ban rahi hai...','info');
  try{
    const canvas=await renderCurrentReportCanvas();
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image render fail')),'image/png',0.97));
    const safe=(_currentPdfTitle||'Hisab360_Report').replace(/[^a-zA-Z0-9_-]/g,'_');
    const fileName=`${safe}.png`;
    const text=`${window.H360?.receiptProfile?.().name||'Hisab360'} · ${_currentPdfTitle}`;
    const shared=await shareActualFile(blob,fileName,'image/png',_currentPdfTitle,text);
    if(!shared){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);}
    showToast('✅ Premium image share ready','success');
  }catch(e){if(e.name!=='AbortError')showToast('Share image: '+e.message,'error');}finally{exportBusy=false;}
};
window.sharePdfEmail = function() {
  const subject = encodeURIComponent(_currentPdfTitle + ' — Hisab360');
  const body = encodeURIComponent(`${_currentPdfTitle} attached/share file hai.\n\nHisab360`);
  window.location.href = `mailto:?subject=${subject}&body=${body}`; closeModal();
};
async function renderCurrentReportCanvas(){
 const revision=_reportRevision;await _reportReady;
 const frame=document.getElementById('pdfFrame'),body=frame?.contentDocument?.body;
 if(!body||revision!==_reportRevision)throw new Error('Report dobara preview karein');
 await frame.contentDocument.fonts?.ready;
 if(!_canvasCache){_canvasCache={revision,promise:html2canvas(body,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false,windowWidth:Math.max(body.scrollWidth,800),windowHeight:body.scrollHeight})};}
 try{return await _canvasCache.promise;}catch(e){_canvasCache=null;throw e;}
}
window.sharePdfAsImage = async function() {
  closeModal(); showToast('🖼️ High quality PNG ban rahi hai...','info');
  try {
    const canvas=await renderCurrentReportCanvas();
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG render fail')),'image/png',0.96));
    const safe=(_currentPdfTitle||'Hisab360_Report').replace(/[^a-zA-Z0-9_-]/g,'_'),fileName=`${safe}.png`;
    const shared=await shareActualFile(blob,fileName,'image/png',_currentPdfTitle,'');
    if(!shared){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
    showToast('✅ PNG ready','success');
  } catch(e) { showToast('❌ Image: '+e.message,'error'); }
};
window.sharePdfAsFile = async function() {
  if(exportBusy)return;exportBusy=true;
  closeModal(); showToast('📄 Real PDF ban rahi hai...','info');
  try {
    const canvas=await renderCurrentReportCanvas();
    const pdf=new jsPDF({orientation:'p',unit:'mm',format:'a4',compress:true});
    const pageW=210,pageH=297,margin=8,usableW=pageW-margin*2,usableH=pageH-margin*2;
    const pxPerMm=canvas.width/usableW; const slicePx=Math.floor(usableH*pxPerMm);
    let y=0,page=0;
    while(y<canvas.height){
      const h=Math.min(slicePx,canvas.height-y),slice=document.createElement('canvas'); slice.width=canvas.width;slice.height=h; slice.getContext('2d').drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);
      const img=slice.toDataURL('image/jpeg',0.92),hmm=h/pxPerMm; if(page>0)pdf.addPage(); pdf.addImage(img,'JPEG',margin,margin,usableW,hmm,undefined,'FAST'); y+=h;page++;
    }
    const blob=pdf.output('blob'); const safe=(_currentPdfTitle||'Hisab360_Report').replace(/[^a-zA-Z0-9_-]/g,'_'),fileName=`${safe}.pdf`;
    const shared=await shareActualFile(blob,fileName,'application/pdf',_currentPdfTitle,'');
    if(!shared) pdf.save(fileName);
    showToast('✅ PDF ready','success');
  } catch(e) { if(e.name!=='AbortError')showToast('PDF: '+e.message,'error'); }finally{exportBusy=false;}
};

// ✅ Track current tab
window._currentTab = 'list';

// ✅ Back button handler — dono (Capacitor + Browser) ke liye
function handleBackPress() {
  if(window.H360Save?.busy){showToast('Entry save ho rahi hai — confirmation ka wait karein','info');return true;}
  // 1. PDF viewer open?
  if(window._pdfViewerOpen) {
    closePdfViewer();
    return true;
  }
  // 2. Modal open?
  if(document.getElementById('modal').style.display === 'flex') {
    closeModal();
    return true;
  }
  // 3. Customer detail open?
  if(document.getElementById('detailPage').classList.contains('show')) {
    closeDetail();
    return true;
  }
  // 4. Kisi aur tab par hain? → Home tab par jao
  const home=activeWorkspace().category==='personal'?'personal':'business';
  if(home==='personal'&&document.getElementById('financeNav')?.classList.contains('active')){switchTab('personal',document.querySelector('.tab[data-tab="personal"]'));window.scrollTo(0,0);return true;}
  if(window._currentTab && window._currentTab !== home) {
    switchTab(home,document.querySelector('.tab[data-tab="'+home+'"]'));window.scrollTo(0,0);
    return true;
  }
  // 5. Home par hain — Android back app close nahi karega.
  return true;
}

window.handleBackPress = handleBackPress;

// Capacitor back button
document.addEventListener('backbutton', function(e) {
  e.preventDefault();
  handleBackPress();
}, false);

// Browser popstate (fallback)
window.addEventListener('popstate', function(e) {
  handleBackPress();
  history.pushState({ page: 'main' }, '');
});

// Har page load par ek state push karein
window.addEventListener('load', () => {
  history.pushState({ page: 'main' }, '');
});

// ============================================
// CONSTANTS
// ============================================
const MASTER_EMAIL = "s9oman28@gmail.com";
const DEFAULT_MASTER_PIN = null;
const KEY_APP_PIN = 'fk_app_pin';
const KEY_DELETE_PIN = 'fk_delete_pin';
const KEY_MASTER_PIN = 'fk_master_pin';
const KEY_APP_LOCK = 'fk_app_lock';
const DEFAULT_DELETE_PIN = null;

let currentUser = null;
let currentUserData = null;
let customers = [];
let transactions = {};
let items = [];
let requests = [];
let allUsers = [];
let stockItems = [];
let suppliers = [];
let stockMovements = [];
let supplierPayments = [];
let currentCustomerId = null;
let listenersStarted = false;
let listenerUnsubscribers = [];
let signupInProgress = false;

// ============================================
// HISAB360 v6 WORKSPACE / ACCOUNT MODEL
// One Firebase identity can own multiple isolated category workspaces.
// Existing v5 profiles are migrated in-memory to one default workspace.
// ============================================
function slugId(v='workspace') {
  return String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30) || 'workspace';
}
function makeWorkspace(data={}) {
  const category=data.category||'other';
  return {
    id: data.id || data.workspaceId || `ws_${slugId(category)}_${Math.random().toString(36).slice(2,8)}`,
    name: data.name || data.shopName || data.shop || (category==='personal'?'Personal Ledger':'My Business'),
    category,
    modules: Array.isArray(data.modules) ? data.modules : defaultModulesForCategory(category),
    location: data.location || data.shopLocation || '',
    phone: data.phone || data.shopPhone || '',
    whatsapp: data.whatsapp || data.phone || data.shopPhone || '',
    language: data.language || 'en',
    branding: {
      icon: data.branding?.icon || (category==='personal'?'🤝':'📒'),
      headerStyle: data.branding?.headerStyle || data.headerStyle || 'navy',
      receiptStyle: data.branding?.receiptStyle || data.receiptStyle || 'modern',
      footer: data.branding?.footer || 'Thank you for your business!'
    },
    ...Object.fromEntries(['deletedAtMs','purgeAfterMs','deletedBy','purgedAtMs'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]])),
    createdAtMs: Number(data.createdAtMs||Date.now())
  };
}
function defaultModulesForCategory(category){ return categoryModules(category); }
function ensureWorkspaceData(data=currentUserData){
  if(!data) return false;
  let changed=false;
  if(!Array.isArray(data.workspaces) || !data.workspaces.length){
    const ws=makeWorkspace({
      id:'default', name:data.shopName||'Hisab360', category:data.category||'other',
      location:data.shopLocation||'', phone:data.shopPhone||'', whatsapp:data.whatsapp||'',
      language:data.language||'en', branding:data.branding||{}
    });
    data.workspaces=[ws]; data.activeWorkspaceId=ws.id; changed=true;
  } else {
    data.workspaces=data.workspaces.map(w=>makeWorkspace(w));
    if(!data.activeWorkspaceId || !data.workspaces.some(w=>w.id===data.activeWorkspaceId)){
      data.activeWorkspaceId=data.workspaces[0].id; changed=true;
    }
  }
  applyWorkspaceMirror(data);
  return changed;
}
function activeWorkspace(){
  if(!currentUserData) return makeWorkspace({id:'default',name:'Hisab360'});
  ensureWorkspaceData(currentUserData);
  return currentUserData.workspaces.find(w=>w.id===currentUserData.activeWorkspaceId) || currentUserData.workspaces[0];
}
function activeWorkspaceId(){ return activeWorkspace()?.id || 'default'; }
function applyWorkspaceMirror(data=currentUserData){
  if(!data?.workspaces?.length) return;
  const w=data.workspaces.find(x=>x.id===data.activeWorkspaceId)||data.workspaces[0];
  data.activeWorkspaceId=w.id;
  data.shopName=w.name; data.shopLocation=w.location; data.shopPhone=w.phone; data.whatsapp=w.whatsapp;
  data.category=w.category; data.language=w.language; data.branding=w.branding;
}
function workspaceOfRecord(x){ return x?.workspaceId || 'default'; }
function visibleInWorkspace(x){ return workspaceOfRecord(x)===activeWorkspaceId(); }
function workspaceWriteFields(){
  const wid=activeWorkspaceId(), owner=currentUser?.email||'';
  return {workspaceId:wid, workspaceName:activeWorkspace()?.name||'', workspaceKey:owner?`${owner}::${wid}`:wid};
}
window.H360Core={activeWorkspace,activeWorkspaceId,ensureWorkspaceData,applyWorkspaceMirror,workspaceWriteFields,defaultModulesForCategory};

async function migrateLegacyWorkspaceRecords(){
  if(!currentUser||!currentUserData||Number(currentUserData.workspaceSchemaVersion||0)>=7) return;
  const wid=activeWorkspaceId(), names=['customers','transactions','stock_items','stock_movements','suppliers','supplier_payments'];
  try{
    for(const name of names){
      const snap=await getDocs(query(collection(db,name),where('ownerEmail','==',currentUser.email)));
      const pending=snap.docs.filter(d=>!d.data().workspaceKey);
      for(let i=0;i<pending.length;i+=350){
        const batch=writeBatch(db);
        pending.slice(i,i+350).forEach(d=>{const data=d.data(), dwid=data.workspaceId||wid; batch.update(d.ref,{workspaceId:dwid,workspaceName:data.workspaceName||activeWorkspace()?.name||'',workspaceKey:`${currentUser.email}::${dwid}`});});
        await batch.commit();
      }
    }
    currentUserData.workspaceSchemaVersion=7;
    await updateDoc(doc(db,'users',currentUser.email),{workspaceSchemaVersion:7});
    localStorage.setItem('fk_user_data_'+currentUser.email,JSON.stringify(currentUserData));
    console.log('✅ Hisab360 v6 legacy workspace migration complete');
  }catch(e){ console.warn('Workspace migration skipped:',e.code||'',e.message); }
}

function clearFirestoreListeners() {
  const active = listenerUnsubscribers.splice(0);
  active.forEach(unsub => {
    try { if(typeof unsub === 'function') unsub(); } catch(e) { console.warn('Listener cleanup:', e.message); }
  });
  listenersStarted = false;
  window._logStarted = false;
}

function listenFirestore(scope, ref, onNext) {
  const unsub = onSnapshot(ref, onNext, err => handleFirestoreListenerError(scope, err));
  listenerUnsubscribers.push(unsub);
  return unsub;
}

const DEFAULT_ITEMS = [
  { emoji: '🧈', name: 'Ghee' }, { emoji: '🍚', name: 'Chawal' },
  { emoji: '🍬', name: 'Cheeni' }, { emoji: '🫒', name: 'Tel' },
  { emoji: '🧂', name: 'Namak' }, { emoji: '☕', name: 'Chai' },
  { emoji: '🥛', name: 'Doodh' }, { emoji: '🍞', name: 'Aata' },
  { emoji: '🫘', name: 'Daal' }, { emoji: '🌶️', name: 'Mirch' },
  { emoji: '🧄', name: 'Lehsun' }, { emoji: '🧅', name: 'Pyaz' },
  { emoji: '🥔', name: 'Aloo' }, { emoji: '🍅', name: 'Tamatar' },
  { emoji: '🧼', name: 'Sabun' }, { emoji: '🧴', name: 'Shampoo' },
  { emoji: '🍪', name: 'Biscuit' }, { emoji: '🥤', name: 'Cold Drink' }
];

const UNITS = ['kg', 'g', 'pcs', 'L', 'ml', 'dozen', 'bundle', 'packet', 'bori'];

let pinBuffer = '';
let pinMode = 'lock';
let firstPinEntry = '';

function getAppPin() { return localStorage.getItem(KEY_APP_PIN); }
function setAppPin(pin) { localStorage.setItem(KEY_APP_PIN, pin); }
function getDeletePin() { return localStorage.getItem(KEY_DELETE_PIN) || DEFAULT_DELETE_PIN; }
function setDeletePin(pin) { localStorage.setItem(KEY_DELETE_PIN, pin); }
function getMasterPin() { return localStorage.getItem(KEY_MASTER_PIN) || DEFAULT_MASTER_PIN; }
function setMasterPin(pin) { localStorage.setItem(KEY_MASTER_PIN, pin); }
function isAppLockOn() { return localStorage.getItem(KEY_APP_LOCK) === 'on'; }
function setAppLock(on) { localStorage.setItem(KEY_APP_LOCK, on ? 'on' : 'off'); }
function isMaster() { return currentUser?.email === MASTER_EMAIL; }
function formatDate(d) { return d?.toDate ? d.toDate().toLocaleString('en-GB') : '—'; }
function formatDateOnly(d) { return d?.toDate ? d.toDate().toLocaleDateString('en-GB') : '—'; }

// ============================================
// TOAST (pehle)
// ============================================
window.showToast = function(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = type;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
};

// ============================================
// NETWORK STATUS (showToast ke baad)
// ============================================
window.addEventListener('online', () => {
  showToast('✅ Online — data sync ho raha hai', 'success');
  updateNetworkBadge(true);
});
window.addEventListener('offline', () => {
  showToast('📴 Offline — data local save hoga', 'error');
  updateNetworkBadge(false);
});

function updateNetworkBadge(isOnline) {
  const badge = document.getElementById('networkBadge');
  if(!badge) return;
  if(isOnline) {
    badge.style.background = 'rgba(37,211,102,0.15)';
    badge.style.color = '#25D366';
    badge.textContent = '✅ Online';
  } else {
    badge.style.background = 'rgba(231,76,60,0.15)';
    badge.style.color = '#e74c3c';
    badge.textContent = '📴 Offline';
  }
}

function initNetworkBadge() {
  updateNetworkBadge(navigator.onLine);
}

let _firestoreErrorToastAt = 0;
function firestoreErrorText(error) {
  const code = error?.code || '';
  if(code === 'permission-denied') return 'Cloud sync permission blocked — Hisab360 Firestore Rules publish karein';
  if(code === 'failed-precondition' && String(error?.message || '').toLowerCase().includes('index')) return 'Firebase index required hai';
  if(code === 'unavailable' || code === 'network-request-failed') return navigator.onLine ? 'Firebase temporarily unavailable' : 'Internet connection nahi hai';
  return error?.message || 'Firebase error';
}
function handleFirestoreListenerError(scope, error) {
  console.error(`[Hisab360:${scope}] Firestore listener error`, error);
  const badge = document.getElementById('networkBadge');
  if(error?.code === 'permission-denied' && badge) {
    badge.style.background = 'rgba(230,126,34,0.16)';
    badge.style.color = '#d35400';
    badge.textContent = '🔐 Sync Rules';
  } else if((error?.code === 'unavailable' || !navigator.onLine) && badge) {
    updateNetworkBadge(false);
  }
  const now = Date.now();
  if(now - _firestoreErrorToastAt > 5000) {
    _firestoreErrorToastAt = now;
    showToast(`⚠️ ${firestoreErrorText(error)}`, 'error');
  }
}

// ============================================
// AUTH TABS
// ============================================
window.switchAuthTab = function(tab) {
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  const err = document.getElementById('authErr');
  err.classList.remove('show'); err.textContent = '';
};

function showAuthErr(msg, type = 'error') {
  const err = document.getElementById('authErr');
  err.textContent = msg;
  err.className = 'auth-err show' + (type === 'success' ? ' success' : '');
}

window.showForgotPassword = function() {
 showModal('<div class="km-form"><h3 class="km-modal-title">Reset Password</h3><p class="km-modal-sub">Apne account ka email daalein. Password reset link email par milega.</p><label for="resetEmail">Email address</label><input id="resetEmail" type="email" autocomplete="email" placeholder="you@example.com"><p id="resetStatus" role="status"></p><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button id="resetSubmit" class="km-btn green" onclick="sendResetLink()">Send Reset Link</button></div></div>');
 document.getElementById('resetEmail').value=document.getElementById('loginEmail').value;
};
window.sendResetLink=async function(){
 const email=document.getElementById('resetEmail').value.trim(),status=document.getElementById('resetStatus');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){status.textContent='Sahi email address daalein';return;}
 const button=document.getElementById('resetSubmit');button.disabled=true;
 try{await sendPasswordResetEmail(auth,email);status.textContent='Agar is email ka account hai to reset link inbox mein milega.';}
 catch(e){status.textContent=e.code==='auth/too-many-requests'?'Requests temporarily limit ho gayi hain. Kuch dair baad try karein.':'Reset link send nahi hui. Connection check karke dobara try karein.';}
 finally{button.disabled=false;}
};

// ============================================
// PASSWORD POLICY v6
// ============================================
function strongPasswordError(pass='') {
  if(pass.length < 10) return 'Password kam az kam 10 characters ho';
  if(!/[A-Z]/.test(pass)) return 'Password mein 1 uppercase A-Z zaroor ho';
  if(!/[a-z]/.test(pass)) return 'Password mein 1 lowercase a-z zaroor ho';
  if(!/[0-9]/.test(pass)) return 'Password mein 1 number zaroor ho';
  if(!/[^A-Za-z0-9]/.test(pass)) return 'Password mein 1 special character zaroor ho';
  return '';
}

// ============================================
// SIGNUP
// ============================================
async function submitVerifiedSignup(user){
 const key='h360_pending_signup_'+user.uid,raw=localStorage.getItem(key);if(!raw||!user.emailVerified)return false;
 const draft=JSON.parse(raw);if(draft.email!==user.email)throw new Error('Signup email mismatch');
 await getIdToken(user,true);
 const ref=doc(db,'account_requests',user.uid),existing=await getDoc(ref);
 if(!existing.exists())await setDoc(ref,{...draft,emailVerified:true,requestedAt:serverTimestamp()});
 localStorage.removeItem(key);await signOut(auth);showAuthErr('Email verified. Account request Master ko bhej di gayi. Approval ke baad login karein.','success');return true;
}

window.requestAccount = async function() {
  const name = document.getElementById('suName').value.trim();
  const shop = document.getElementById('suShop').value.trim();
  const category = document.getElementById('suCategory')?.value || 'other';
  const language = document.getElementById('suLanguage')?.value || 'en';
  const headerStyle = document.getElementById('suHeaderStyle')?.value || 'navy';
  const receiptStyle = document.getElementById('suReceiptStyle')?.value || 'modern';
  const modules = category === 'hybrid'
    ? [...document.querySelectorAll('#suHybridModules input[type="checkbox"]:checked')].map(x=>x.value)
    : defaultModulesForCategory(category);
  const location = document.getElementById('suLocation').value.trim();
  const phone = document.getElementById('suPhone').value.trim();
  const whatsapp = (document.getElementById('suWhatsapp')?.value || '').trim();
  const email = document.getElementById('suEmail').value.trim().toLowerCase();
  const pass = document.getElementById('suPass').value;
  const pass2 = document.getElementById('suPass2').value;

  if(!name || !shop || !location || !phone || !email || !pass)
    return showAuthErr('Sab fields bharein (location bhi zaroori hai)');
  if(!/^92\d{10}$/.test(phone)) return showAuthErr('Phone 92XXXXXXXXXX format mein');
  if(whatsapp && !/^92\d{10}$/.test(whatsapp)) return showAuthErr('WhatsApp 92XXXXXXXXXX format mein');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showAuthErr('Email sahi nahi');
  const pwErr = strongPasswordError(pass);
  if(pwErr) return showAuthErr(pwErr);
  if(pass !== pass2) return showAuthErr('Passwords match nahi karte');
  if(category==='hybrid' && !modules.length) return showAuthErr('Hybrid account ke liye kam az kam 1 module select karein');

  if(signupInProgress)return;
  try {
    signupInProgress=true;
    let user;
    try {user=(await createUserWithEmailAndPassword(auth,email,pass)).user;}
    catch(e){if(e.code!=='auth/email-already-in-use')throw e;user=(await signInWithEmailAndPassword(auth,email,pass)).user;const profile=await getDoc(doc(db,'users',email));if(profile.exists())throw new Error('Is email ka approved account hai. Login use karein.');}
    const draft={name,shop,category,modules,language,headerStyle,receiptStyle,location,phone,whatsapp:whatsapp||phone,email,authCreated:true,emailVerified:true,requestType:'signup',workspaceId:'ws_'+slugId(category)+'_'+user.uid.slice(0,12),status:'pending'};
    localStorage.setItem('h360_pending_signup_'+user.uid,JSON.stringify(draft));
    if(user.emailVerified){await submitVerifiedSignup(user);return;}
    switchAuthTab('login');document.getElementById('loginEmail').value=email;document.getElementById('loginPass').value='';window.H360Auth?.showLegacyVerification(user);
    try{await sendEmailVerification(user);showAuthErr('Verification link email par bhej diya. Link khol kar confirmation check karein.','success');}
    catch(e){showAuthErr(e.code==='auth/too-many-requests'?'Verification request limit aa gayi. Kuch dair baad resend karein.':e.message);}

    ['suPass','suPass2'].forEach(id=>document.getElementById(id).value='');
  }catch(e){showAuthErr(e.code==='auth/invalid-credential'?'Is email ka account pehle se hai. Sahi password se login karein ya password reset use karein.':e.message);}
  finally{signupInProgress=false;}

};

// ============================================
// LOGIN
// ============================================
window.doLogin = async function() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  if(!email || !pass) return showAuthErr('Email aur password daalein');
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    if(document.getElementById('rememberMe').checked) {
      localStorage.setItem('fk_email', email);
      localStorage.setItem('fk_remember', 'true');
    }
  } catch(e) {
    showAuthErr('❌ Ghalat email ya password');
  }
};

window.loginWithBiometric = async function() {
  try {
    if(!window.Capacitor?.Plugins?.BiometricAuth) return showAuthErr('Fingerprint available nahi');
    const { BiometricAuth } = window.Capacitor.Plugins;
    const check = await BiometricAuth.checkBiometry();
    if(!check.isAvailable) return showAuthErr('Fingerprint available nahi');
    if(!auth.currentUser) return showAuthErr('Session expire ho chuka hai — password se login karein');
    await BiometricAuth.verifyIdentity({ reason: "Unlock karein", title: "Fingerprint", subtitle: "Apni finger lagayein", cancelTitle: "Cancel" });
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
  } catch(e) {
    if(e.message?.toLowerCase().includes('cancel')) return;
    showAuthErr('Fingerprint fail');
  }
};

window.logout = async function() {
  if(!confirm("Logout karna hai?")) return;
  if(currentUser?.email) {
    localStorage.setItem('fk_email', currentUser.email);
    localStorage.setItem('fk_remember', 'true');
    // Profile cache intentionally retained. Password is never stored locally.
  }
  clearFirestoreListeners();
  await signOut(auth);
  showToast('👋 Logout ho gaya — profile is device par saved hai');
};

// ============================================
// AUTH STATE (Fast Login + Offline)
// ============================================
onAuthStateChanged(auth, async (user) => {
  if(user) {
    if(signupInProgress) return;
    clearFirestoreListeners();
    if(!user.emailVerified){
      document.getElementById("mainApp").style.display="none";
      document.getElementById("authScreen").style.display="flex";
      window.H360Auth?.showLegacyVerification(user);
      return;
    }
    document.getElementById("legacyEmailVerify")?.remove();
    if(localStorage.getItem("h360_pending_signup_"+user.uid)){
      try{if(await submitVerifiedSignup(user))return;}catch(e){showAuthErr("Request send nahi hui: "+e.message);return;}
    }
    currentUser = user;
    if(isMaster()){for(const k of Object.keys(localStorage)){if(k.startsWith('fk_user_data_')&&k!=='fk_user_data_'+user.email)localStorage.removeItem(k);}}
    const cacheKey = 'fk_user_data_' + user.email;
    const cachedData = localStorage.getItem(cacheKey);
    let uiOpened = false;
    
    if(cachedData) {
      try {
        currentUserData = JSON.parse(cachedData);
        ensureWorkspaceData(currentUserData);
        if(currentUserData.blocked === true) {
          document.getElementById('authScreen').style.display = 'none';
          document.getElementById('mainApp').style.display = 'none';
          document.getElementById('globalCredit').classList.add('show');
          showBlockedScreen(currentUserData);
          return;
        }
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('globalCredit').classList.add('show');
        updateHeader();
        const appPin = getAppPin();
        const lockOn = isAppLockOn();
        if(lockOn && !appPin) {
          document.getElementById('mainApp').style.display = 'none';
          startSetupScreen('setup-new');
        } else if(lockOn && appPin) {
          document.getElementById('mainApp').style.display = 'none';
          startLockScreen();
        } else {
          document.getElementById('mainApp').style.display = 'block';
        }
        uiOpened = true;
      } catch(e) { console.warn('Cache parse fail:', e); }
    }
    
    try {
      await syncApprovedWorkspaces(user);
      const userDoc = await getDoc(doc(db, "users", user.email));
      if(userDoc.exists()) {
        currentUserData = userDoc.data();
        const rememberedWorkspace=localStorage.getItem('h360_active_workspace_'+user.uid);
        if(currentUserData.workspaces?.some(w=>w.id===rememberedWorkspace&&!w.deletedAtMs))currentUserData.activeWorkspaceId=rememberedWorkspace;
        const wsChanged = ensureWorkspaceData(currentUserData);
        if(wsChanged) {
          try { await updateDoc(doc(db,"users",user.email), {workspaces:currentUserData.workspaces,activeWorkspaceId:currentUserData.activeWorkspaceId}); } catch(e){ console.warn('Workspace migration save:',e.message); }
        }
        localStorage.setItem(cacheKey, JSON.stringify(currentUserData));
        
        if(!uiOpened) {
          if(currentUserData.blocked === true) {
            document.getElementById('authScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'none';
            document.getElementById('globalCredit').classList.add('show');
            showBlockedScreen(currentUserData);
            return;
          }
          document.getElementById('authScreen').style.display = 'none';
          document.getElementById('globalCredit').classList.add('show');
          updateHeader();
          const appPin = getAppPin();
          const lockOn = isAppLockOn();
          if(lockOn && !appPin) {
            document.getElementById('mainApp').style.display = 'none';
            startSetupScreen('setup-new');
          } else if(lockOn && appPin) {
            document.getElementById('mainApp').style.display = 'none';
            startLockScreen();
          } else {
            document.getElementById('mainApp').style.display = 'block';
          }
        }
        await migrateLegacyWorkspaceRecords();
        startListeners();
      } else {
        if(user.email === MASTER_EMAIL) {
          currentUserData = {
            role: 'master',
            shopName: 'Hisab360',
            shopLocation: 'Sheraghund',
            shopPhone: '+92 313 9757267',
            ownerEmail: MASTER_EMAIL,
            category: 'hybrid',
            workspaces: [makeWorkspace({id:'master',name:'Hisab360 Master',category:'hybrid',modules:['khata','pos','stock','loans','reports'],location:'',phone:'',language:'en'})],
            activeWorkspaceId: 'master', workspaceSchemaVersion: 7
          };
          applyWorkspaceMirror(currentUserData);
          await setDoc(doc(db, "users", user.email), currentUserData);
          localStorage.setItem(cacheKey, JSON.stringify(currentUserData));
          
          if(!uiOpened) {
            document.getElementById('authScreen').style.display = 'none';
            document.getElementById('globalCredit').classList.add('show');
            updateHeader();
            const appPin = getAppPin();
            const lockOn = isAppLockOn();
            if(lockOn && !appPin) {
              document.getElementById('mainApp').style.display = 'none';
              startSetupScreen('setup-new');
            } else if(lockOn && appPin) {
              document.getElementById('mainApp').style.display = 'none';
              startLockScreen();
            } else {
              document.getElementById('mainApp').style.display = 'block';
            }
          }
          await migrateLegacyWorkspaceRecords();
          startListeners();
        } else {
          await signOut(auth);
          showAuthErr('❌ Aap ka account approve nahi hua');
          return;
        }
      }
    } catch(e) {
      console.warn('Hisab360 Firestore auth/profile error:', e.code, e.message);
      if(e.code === 'permission-denied') {
        clearFirestoreListeners();
        if(uiOpened) {
          document.getElementById('mainApp').style.display = 'none';
          document.getElementById('authScreen').style.display = 'flex';
        }
        showAuthErr('❌ Firestore permission denied. HISAB360_ONLY_FIRESTORE_RULES.txt ko Self-data-base project mein Publish karein.');
      } else if(e.code === 'unavailable' || e.code === 'auth/network-request-failed' || !navigator.onLine) {
        // A previously validated cached profile may continue in offline mode.
        if(uiOpened && cachedData) startListeners();
        else showAuthErr('❌ Internet / Firebase connection check karein');
      } else if(!uiOpened && !currentUserData) {
        showAuthErr('❌ ' + firestoreErrorText(e));
      }
    }
  } else {
    clearFirestoreListeners();
    document.getElementById("legacyEmailVerify")?.remove();
    currentUser = null;
    currentUserData = null;
    const blockedEl = document.getElementById('blockedScreen');
    if(blockedEl) blockedEl.remove();
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('globalCredit').classList.remove('show');
    hidePinScreens();
    document.getElementById('loginPass').value = '';
  }
});

function updateHeader() {
  if(!currentUserData) return;
  ensureWorkspaceData(currentUserData); applyWorkspaceMirror(currentUserData);
  const ws=activeWorkspace();
  document.getElementById('headerShopName').textContent = ws.name || 'Hisab360';
  document.getElementById('headerShopLocation').textContent = '📍 ' + (ws.location || '');
  document.getElementById('headerUserEmail').textContent = '📧 ' + (currentUser?.email||'');
  const badge=document.getElementById('headerCategoryBadge'); if(badge) badge.textContent=(ws.category||'business').replace(/^./,c=>c.toUpperCase());
  document.body.dataset.headerStyle=ws.branding?.headerStyle||'navy';
  window.H360?.applyWorkspaceUI?.();
}

window.addEventListener('load', async () => {
  const savedEmail = localStorage.getItem('fk_email');
  if(savedEmail) document.getElementById('loginEmail').value = savedEmail;
  setTimeout(async () => {
    try {
      if(window.Capacitor?.Plugins?.BiometricAuth && auth.currentUser) {
        const check = await window.Capacitor.Plugins.BiometricAuth.checkBiometry();
        if(check.isAvailable) document.getElementById('bioBtn').style.display = 'flex';
      }
    } catch(e) {}
  }, 800);
  // Firebase Auth persists the authenticated session securely; passwords are never cached by the app.
});

// ============================================
// FIREBASE LISTENERS
// ============================================
async function syncApprovedWorkspaces(user){
  const grants=await getDocs(collection(db,'workspace_approvals',user.email,'workspaces'));
  if(!grants.size)return;
  const ref=doc(db,'users',user.email),snap=await getDoc(ref);
  const profile=snap.exists()?snap.data():null;
  const approved=grants.docs.map(d=>d.data());
  if(!profile){
    const first=approved[0],w=first.workspace;const data={role:'user',ownerName:first.ownerName||'',ownerEmail:user.email,workspaces:[w],activeWorkspaceId:w.id,workspaceSchemaVersion:7,blocked:false};applyWorkspaceMirror(data);await setDoc(ref,data);
  }else{
    const workspaces=[...(profile.workspaces||[])];for(const grant of approved){if(!workspaces.some(w=>w.id===grant.workspace.id)&&workspaces.length<10)workspaces.push(grant.workspace);}
    if(workspaces.length!==(profile.workspaces||[]).length)await updateDoc(ref,{workspaces,workspaceSchemaVersion:7});
  }
}

function startListeners() {
  if(listenersStarted) return;
  if(!auth.currentUser || !currentUser || !currentUserData) return;
  if(currentUserData.blocked === true) return;
  listenersStarted = true;
  const ownerEmail = currentUser.email;
  const master = isMaster();
  const wsId = activeWorkspaceId();

  listenFirestore('items', collection(db, "items"), snap => {
    const category=activeWorkspace().category;
    items = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(it=>category==='hybrid'||it.category===category||(!it.category&&['karyana','general','superstore'].includes(category)));
    if(!items.length)items=window.H360Catalog?.[category]||[];
    if(false) {
      DEFAULT_ITEMS.forEach(async (it) => await addDoc(collection(db, "items"), it));
      items = DEFAULT_ITEMS;
    }
    renderItemsManage();
  window.H360?.renderWorkspaceSettings?.();
  });

  const wsKey = `${ownerEmail}::${wsId}`;
  if(activeWorkspace().category!=='personal'){
  const custQuery = query(collection(db, "customers"), where("workspaceKey", "==", wsKey), where("ownerEmail","==",ownerEmail));

  listenFirestore('customers', custQuery, snap => {
    customers = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(x => !x.deletedAt && visibleInWorkspace(x));
    customers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    renderCustomers(); updateStats();
    if(currentCustomerId) refreshDetail();
  });

  let txnQuery;
  // Keep only a recent working window live. Older history is loaded on-demand per customer/report.
  const LIVE_TXN_LIMIT = 750;
  txnQuery = query(collection(db, "transactions"), where("workspaceKey", "==", wsKey), where("ownerEmail","==",ownerEmail));

  listenFirestore('transactions', txnQuery, snap => {
    transactions = {};
    snap.docs.forEach(d => {
      const t = {id: d.id, ...d.data()};
      if(!visibleInWorkspace(t)) return;
      if(!transactions[t.customerId]) transactions[t.customerId] = [];
      transactions[t.customerId].push(t);
    });
    Object.values(transactions).forEach(arr=>arr.sort((a,b)=>(b.createdAt?.toMillis?.()||b.createdAt?.seconds*1000||0)-(a.createdAt?.toMillis?.()||a.createdAt?.seconds*1000||0)));
    renderCustomers();
    if(currentCustomerId) refreshDetail();
  });

  const stockQuery = query(collection(db, "stock_items"), where("workspaceKey", "==", wsKey), where("ownerEmail","==",ownerEmail));
  listenFirestore('stock_items', stockQuery, snap => {
    stockItems = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(x => !x.deletedAt && visibleInWorkspace(x));
    stockItems.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    renderStockItems(); updateStockDashboard();
  });

  const supplierQuery = query(collection(db, "suppliers"), where("workspaceKey", "==", wsKey), where("ownerEmail","==",ownerEmail));
  listenFirestore('suppliers', supplierQuery, snap => {
    suppliers = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(x => !x.deletedAt && visibleInWorkspace(x));
    suppliers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    renderSuppliers();
  });

  const moveQuery = query(collection(db, "stock_movements"), where("workspaceKey", "==", wsKey), where("ownerEmail","==",ownerEmail));
  listenFirestore('stock_movements', moveQuery, snap => {
    stockMovements = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(visibleInWorkspace);
  });
  const supplierPayQuery = query(collection(db, "supplier_payments"), where("workspaceKey", "==", wsKey), where("ownerEmail","==",ownerEmail));
  listenFirestore('supplier_payments', supplierPayQuery, snap => {
    supplierPayments = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(visibleInWorkspace);
  });

  }
  listenFirestore('own_approvals',collection(db,'workspace_approvals',ownerEmail,'workspaces'),()=>{syncApprovedWorkspaces(currentUser).catch(e=>console.warn('Approval sync deferred:',e.message));});
  listenFirestore('self_profile', doc(db,"users",ownerEmail), snap => {
    if(!snap.exists()) return;
    const fresh=snap.data();
    if(fresh.blocked===true){
      clearFirestoreListeners();
      signOut(auth).catch(()=>{});
      showAuthErr('🚫 Master ne is device/account ko lock kar diya hai');
      document.getElementById('mainApp').style.display='none';
      document.getElementById('authScreen').style.display='flex';
      return;
    }
    // Live profile refresh: Master-approved workspace/category becomes available without re-login.
    const previousWorkspace=currentUserData?.activeWorkspaceId;
    if(fresh.workspaces?.some(w=>w.id===previousWorkspace&&!w.deletedAtMs))fresh.activeWorkspaceId=previousWorkspace;
    currentUserData={...(currentUserData||{}),...fresh};
    ensureWorkspaceData(currentUserData);
    localStorage.setItem('fk_user_data_'+ownerEmail,JSON.stringify(currentUserData));
    updateHeader();
    window.H360?.applyWorkspaceUI?.();
    if(previousWorkspace!==currentUserData.activeWorkspaceId) window.H360App?.restartListeners?.();
  });

  if(master) {
    listenFirestore('account_requests', query(collection(db, "account_requests"), orderBy("requestedAt", "desc"), limit(200)), snap => {
      requests = snap.docs.map(d => ({id: d.id, ...d.data()}));
      renderRequests(); updateReqBadge();
    });
    allUsers=[];renderUsersList();
    document.getElementById('masterPinRow').style.display = 'flex';
    document.getElementById('itemsManageCard').style.display = 'none';
  } else {
    document.getElementById('tabRequests').style.display = 'none';
  }
}

function updateStats() {
  document.getElementById('statCustomers').textContent = customers.length;
  const total = customers.reduce((s, c) => s + (c.balance || 0), 0);
  document.getElementById('statBalance').textContent = 'Rs ' + total.toLocaleString();
}

// ============================================
// TABS
// ============================================
window.switchTab = function(tab, el) {
  if(tab === 'logout') return;
  const allowed=categoryModules(activeWorkspace()?.category);
  const module={list:'khata',add:'khata',stock:'stock',business:'pos',personal:'loans',summary:'reports',requests:'admin'}[tab];
  if(module==='admin'&&!isMaster())return;
  if(module&&module!=='admin'&&!allowed.includes(module)&&activeWorkspace()?.category!=='hybrid')return;
  if(tab==='summary'&&activeWorkspace()?.category==='personal'){window.KMFeatures?.openSalaryReport();return;}
  window._currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el?.classList.add('active');
  ['list','add','stock','business','personal','summary','requests','settings'].forEach(t => {
    const e = document.getElementById('tab-' + t);
    if(e) e.style.display = t === tab ? 'block' : 'none';
  });
  if(tab === 'list') document.body.classList.add('show-fab');
  else document.body.classList.remove('show-fab');
  if(tab === 'settings') renderSettings();
  if(tab === 'requests') renderRequests();
  if(tab === 'summary') renderSummaryPage();
  if(tab === 'business') window.KMFeatures?.renderBusiness();
  if(tab === 'personal') window.KMFeatures?.renderPersonal();
  if(tab === 'settings') window.KMFeatures?.renderSettingsAddon();
};

window.switchSubTab = function(tab) {
  const stockTab = document.getElementById('subTabStock');
  const supTab = document.getElementById('subTabSuppliers');
  if(tab === 'stock') {
    stockTab.style.background = '#fff'; stockTab.style.color = 'var(--primary)';
    stockTab.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
    supTab.style.background = 'transparent'; supTab.style.color = 'var(--text-light)'; supTab.style.boxShadow = 'none';
    document.getElementById('stockView').style.display = 'block';
    document.getElementById('suppliersView').style.display = 'none';
    renderStockItems();
  } else {
    supTab.style.background = '#fff'; supTab.style.color = 'var(--primary)';
    supTab.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
    stockTab.style.background = 'transparent'; stockTab.style.color = 'var(--text-light)'; stockTab.style.boxShadow = 'none';
    document.getElementById('stockView').style.display = 'none';
    document.getElementById('suppliersView').style.display = 'block';
    renderSuppliers();
  }
};

// ============================================
// ADD CUSTOMER
// ============================================
window.addCustomer = async function() {
  const name = document.getElementById('cName').value.trim();
  const phone = document.getElementById('cPhone').value.trim();
  const whatsapp = (document.getElementById('cWhatsapp')?.value || '').trim();
  const opening = parseFloat(document.getElementById('cOpening').value) || 0;
  const notes = (document.getElementById('cNotes')?.value || '').trim();
  const tags = getNewCustomerTags();

  if(!name || !phone) return showToast('Naam aur phone zaroori hai!', 'error');
  if(!/^92\d{10}$/.test(phone)) return showToast('Phone 92XXXXXXXXXX format mein', 'error');
  if(whatsapp && !/^92\d{10}$/.test(whatsapp)) return showToast('WhatsApp 92XXXXXXXXXX format mein', 'error');

  try {
    await addDoc(collection(db, "customers"), {
      name, phone,
      whatsapp: whatsapp || phone,
      openingBalance: opening,
      balance: opening,
      tags: tags,
      notes: notes,
      ownerEmail: currentUser.email,
      ownerShop: currentUserData.shopName,
      ...workspaceWriteFields(),
      createdAt: serverTimestamp()
    });
    document.getElementById('cName').value = '';
    document.getElementById('cPhone').value = '';
    if(document.getElementById('cWhatsapp')) document.getElementById('cWhatsapp').value = '';
    document.getElementById('cOpening').value = '0';
    document.getElementById('cNotes').value = '';
    document.querySelectorAll('#newCustTags .tag-option').forEach(t => t.classList.remove('selected'));
    showToast('✅ Customer save ho gaya!', 'success');
    switchTab('list', document.querySelectorAll('.tab')[0]);
  } catch(e) {
    showToast('❌ Error: ' + e.message, 'error');
  }
};

function getNewCustomerTags() {
  const tags = [];
  document.querySelectorAll('#newCustTags .tag-option.selected').forEach(t => { tags.push(t.dataset.tag); });
  return tags;
}
window.toggleNewTag = function(el) { el.classList.toggle('selected'); };

// ============================================
// RENDER CUSTOMERS
// ============================================
let custDateFilter = 'all';
let custCustomRange = null;

window.renderCustomers = function() {
  const box = document.getElementById('customersList');
  if(!box) return;
  const q = (document.getElementById('searchBox').value || '').toLowerCase();
  let dateFilteredIds = null;
  if(custDateFilter !== 'all') {
    const range = getDateRange(custDateFilter, custCustomRange);
    dateFilteredIds = new Set();
    Object.keys(transactions).forEach(custId => {
      const txns = transactions[custId] || [];
      if(txns.some(t => isInRange(t.createdAt, range))) dateFilteredIds.add(custId);
    });
  }
  let list = customers.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  if(dateFilteredIds) list = list.filter(c => dateFilteredIds.has(c.id));
  if(list.length === 0) {
    const emptyMsg = custDateFilter !== 'all' ? 'Is time period mein koi customer activity nahi'
      : (customers.length === 0 ? 'Abhi koi customer nahi' : 'Koi customer nahi mila');
    box.innerHTML = `<div class="empty"><span class="ico">📭</span><p>${emptyMsg}</p><p class="sub">${customers.length === 0 ? '➕ Naya tab se add karein' : 'Filter change karein'}</p></div>`;
    return;
  }
  box.innerHTML = list.map(c => {
    const bal = c.balance || 0;
    const hasBal = bal > 0;
    const cls = hasBal ? 'has-balance' : 'cleared';
    const balCls = hasBal ? 'debit' : 'clear';
    const initial = (c.name || '?').trim().charAt(0).toUpperCase();
    return `<div class="cust-item ${cls}" onclick="openDetail('${c.id}')">
      <div class="avatar">${initial}</div>
      <div class="info">
        <p class="name">${c.name}</p>
        <p class="phone">📱 ${c.phone}</p>
        <div class="balance ${balCls}">Rs ${bal.toLocaleString()} ${hasBal ? '<span class="h360-due-pill">Due</span>' : '<span class="h360-clear-pill">Clear</span>'}</div>
      </div>
      <div class="arrow">›</div>
    </div>`;
  }).join('');
};

function getDateRange(filter, custom = null) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if(filter === 'today') start.setHours(0, 0, 0, 0);
  else if(filter === 'week') { const day = start.getDay(); start.setDate(start.getDate() - day); start.setHours(0, 0, 0, 0); }
  else if(filter === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
  else if(filter === 'year') { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
  else if(filter === 'custom' && custom) {
    return { start: new Date(custom.start + 'T00:00:00'), end: new Date(custom.end + 'T23:59:59'), label: `${custom.start} → ${custom.end}` };
  } else {
    return { start: new Date(0), end: new Date(8640000000000000), label: 'All Time' };
  }
  const labels = { today: '📅 Aaj', week: '📆 Yeh Hafta', month: '🗓️ Yeh Mahina', year: '📅 Yeh Saal' };
  return { start, end, label: labels[filter] || 'All Time' };
}

function isInRange(date, range) {
  if(!date) return false;
  const d = date.toDate ? date.toDate() : new Date(date);
  return d >= range.start && d <= range.end;
}

window.setCustDateFilter = function(filter, el) {
  document.querySelectorAll('#custDateFilter .date-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  custDateFilter = filter;
  if(filter === 'custom') { openCustomRangeModal('cust'); return; }
  custCustomRange = null;
  renderCustomers();
};

const _fullHistoryLoaded = new Set();
async function loadFullCustomerHistory(custId) {
  if(!custId || _fullHistoryLoaded.has(custId) || !currentUser) return;
  try {
    const base = collection(db, "transactions");
    const q = query(base, where("workspaceKey", "==", `${currentUser.email}::${activeWorkspaceId()}`),where("ownerEmail","==",currentUser.email));
    const snap = await getDocs(q);
    const rows = snap.docs.map(d => ({id:d.id, ...d.data()})).filter(x=>x.customerId===custId);
    rows.sort((a,b) => {
      const am = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt||0).getTime();
      const bm = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt||0).getTime();
      return bm-am;
    });
    transactions[custId] = rows;
    _fullHistoryLoaded.add(custId);
    if(currentCustomerId === custId) refreshDetail();
  } catch(e) {
    console.warn('Customer history load failed', e);
    showToast('⚠️ Purani history load nahi ho saki', 'error');
  }
}

window.openDetail = function(custId) {
  currentCustomerId = custId;
  refreshDetail();
  loadFullCustomerHistory(custId);
  document.getElementById('detailPage').classList.add('show');
  document.body.style.overflow = 'hidden';
  history.pushState({ page: 'detail' }, '');
};

window.closeDetail = function() {
  currentCustomerId = null;
  document.getElementById('detailPage').classList.remove('show');
  document.body.style.overflow = '';
};

function refreshDetail() {
  if(!currentCustomerId) return;
  const c = customers.find(x => x.id === currentCustomerId);
  if(!c) { closeDetail(); return; }
  document.getElementById('detailName').textContent = c.name;
  document.getElementById('detailPhone').textContent = '📱 ' + c.phone;
  const bal = c.balance || 0;
  document.getElementById('detailBalance').textContent = 'Rs ' + bal.toLocaleString();
  const txns = transactions[c.id] || [];
  document.getElementById('detailTxnCount').textContent = txns.length + ' transactions';
  document.getElementById('txnCountBadge').textContent = txns.length;
  document.getElementById('balanceCard').style.borderLeftColor = bal > 0 ? '#e74c3c' : '#25D366';
  document.getElementById('detailBalance').style.color = bal > 0 ? '#e74c3c' : '#25D366';
  const initial = (c.name || '?').trim().charAt(0).toUpperCase();
  document.getElementById('profilePhoto').textContent = initial;
  document.getElementById('profileName').textContent = c.name;
  document.getElementById('profilePhone').textContent = '📱 ' + c.phone;
  document.getElementById('profileTags').innerHTML = renderCustTags(c.tags);
  const notesBox = document.getElementById('notesBox');
  if(c.notes && c.notes.trim()) { notesBox.style.display = 'block'; document.getElementById('notesContent').textContent = c.notes; }
  else notesBox.style.display = 'none';
  const familySection = document.getElementById('familySection');
  if(c.familyLinks && c.familyLinks.length > 0) {
    familySection.style.display = 'block';
    document.getElementById('familyList').innerHTML = c.familyLinks.map(fid => {
      const fam = customers.find(x => x.id === fid);
      if(!fam) return '';
      return `<div style="background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;" onclick="switchToFamily('${fid}')">👤 ${fam.name}</div>`;
    }).join('');
  } else familySection.style.display = 'none';
  const tBox = document.getElementById('detailTxns');
  if(txns.length === 0) { tBox.innerHTML = '<div class="empty"><span class="ico">📭</span><p>Koi transaction nahi</p></div>'; return; }
  tBox.innerHTML = txns.map(t => {
    const d = formatDate(t.createdAt);
    const sign = t.type === 'debit' ? '−' : '+';
    const label = t.type === 'debit' ? 'Udhaar' : 'Wasooli';
    const color = t.type === 'debit' ? '#e74c3c' : '#25D366';
    const itemsHtml = (t.items && t.items.trim()) ? `<div style="font-size:12px;color:var(--primary);background:#f0f4f8;padding:6px 10px;border-radius:8px;margin:6px 0;display:inline-block;font-weight:600;">🛒 ${t.items}</div>` : '';
    return `<div style="background:#fff;border-radius:14px;padding:12px;margin-bottom:8px;box-shadow:var(--shadow-sm);border-left:4px solid ${color};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;background:rgba(${t.type === 'debit' ? '231,76,60' : '37,211,102'},0.1);color:${color};text-transform:uppercase;">${label}</span>
        <span style="font-size:16px;font-weight:800;color:${color};">${sign} Rs ${t.amount.toLocaleString()}</span>
      </div>${itemsHtml}
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-light);margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);">
        <span>🕐 ${d}</span><span>Bal: Rs ${(t.balanceAfter||0).toLocaleString()}</span>
      </div></div>`;
  }).join('');
}

const TAG_LABELS = {
  vip: { label: '⭐ VIP', class: 'vip' }, regular: { label: '👤 Regular', class: 'regular' },
  risky: { label: '⚠️ Risky', class: 'risky' }, family: { label: '👨‍👩‍👧 Family', class: 'family' },
  new: { label: '🆕 New', class: 'new' }, business: { label: '💼 Business', class: 'business' }
};

function renderCustTags(tags) {
  if(!tags || tags.length === 0) return '';
  return tags.map(t => {
    const info = TAG_LABELS[t] || { label: t, class: 'regular' };
    const colors = {
      vip: 'background:rgba(212,175,55,0.2);color:#a67c00;',
      regular: 'background:rgba(52,152,219,0.15);color:#2874a6;',
      risky: 'background:rgba(231,76,60,0.15);color:#c0392b;',
      family: 'background:rgba(155,89,182,0.15);color:#7d3c98;',
      new: 'background:rgba(37,211,102,0.15);color:#128C7E;',
      business: 'background:rgba(243,156,18,0.15);color:#d68910;'
    };
    return `<span style="padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;text-transform:uppercase;${colors[info.class]}">${info.label}</span>`;
  }).join('');
}

window.openAddTxn = function(type) {
  if(!currentCustomerId) return;
  const c = customers.find(x => x.id === currentCustomerId);
  if(!c) return;
  const label = type === 'debit' ? 'Udhaar' : 'Wasooli';
  const emoji = type === 'debit' ? '➕' : '💵';
  let itemsHtml = '';
  if(type === 'debit') {
    itemsHtml = `<div class="form-field"><label>Kya Kya Liya? (select karein)</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;">
        ${items.map(item => `<div class="item-chip" data-item="${item.name}" onclick="toggleItem(this)" style="background:#f8f9fb;border:2px solid transparent;border-radius:12px;padding:10px 4px;text-align:center;cursor:pointer;font-size:10px;font-weight:600;"><div style="font-size:22px;">${item.emoji}</div><div>${item.name}</div></div>`).join('')}
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;"><input type="text" id="customItem" placeholder="✏️ Aur kuch? (misal: anday)" style="flex:1;padding:12px 14px;background:#f8f9fb;border:2px solid transparent;border-radius:12px;font-size:14px;"></div>
      <div id="selectedItems" style="margin-top:10px;padding:10px 14px;background:#e8f5e9;border-radius:10px;font-size:13px;color:#2e7d32;font-weight:600;display:none;"></div>
    </div>`;
  }
  const html = `<h3>${emoji} ${c.name} — ${label}</h3>
    <div style="font-size:13px;color:#7f8c8d;margin-bottom:16px;">📱 ${c.phone} &nbsp; • &nbsp; Baqaya: Rs ${(c.balance||0).toLocaleString()}</div>
    <div class="form-field"><label>Kitni Raqam? (Rs) *</label><input type="number" id="txnAmount" placeholder="Misal: 5000" autofocus></div>
    ${itemsHtml}
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-save btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
      <button class="btn-save" style="flex:2;" onclick="saveTxn('${c.id}','${type}')">✅ Save Karein</button>
    </div>`;
  showModal(html);
};

window.toggleItem = function(el) {
  el.classList.toggle('selected');
  const selected = el.classList.contains('selected');
  if(selected) { el.style.background = 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)'; el.style.borderColor = '#25D366'; el.style.color = '#25D366'; }
  else { el.style.background = '#f8f9fb'; el.style.borderColor = 'transparent'; el.style.color = 'var(--text)'; }
  updateSelectedItems();
};

function updateSelectedItems() {
  const selected = [...document.querySelectorAll('.item-chip.selected')].map(e => e.dataset.item);
  const custom = (document.getElementById('customItem')?.value || '').trim();
  const all = [...selected];
  if(custom) all.push(custom);
  const box = document.getElementById('selectedItems');
  if(!box) return;
  if(all.length === 0) { box.style.display = 'none'; box.textContent = ''; }
  else { box.style.display = 'block'; box.textContent = '✓ ' + all.join(', '); }
}

document.addEventListener('input', function(e) {
  if(e.target && e.target.id === 'customItem') updateSelectedItems();
});

window.saveTxn = async function(custId, type) {
  const cust = customers.find(c => c.id === custId);
  const amtStr = document.getElementById('txnAmount').value;
  if(!amtStr) return showToast('Raqam daalein', 'error');
  const amt = parseFloat(amtStr);
  if(!Number.isFinite(amt) || amt <= 0) return showToast('Sahi raqam likhein', 'error');
  let itemsStr = '';
  if(type === 'debit') {
    const selected = [...document.querySelectorAll('.item-chip.selected')].map(e => e.dataset.item);
    const custom = (document.getElementById('customItem')?.value || '').trim();
    const all = [...selected];
    if(custom) all.push(custom);
    itemsStr = all.join(', ');
  }
  const newBal = type === 'debit' ? (cust.balance||0) + amt : (cust.balance||0) - amt;
  const data = {
    customerId: custId, customerName: cust.name, type, amount: amt, balanceAfter: newBal,
    ownerEmail: currentUser.email, ...workspaceWriteFields(), createdAt: serverTimestamp()
  };
  if(type === 'debit' && itemsStr) data.items = itemsStr;
  if(window.__h360TxnBusy)return;
  window.__h360TxnBusy=true;
  try {
    const customerRef=doc(db,'customers',custId),txnRef=doc(collection(db,'transactions'),window.H360Save?.recordId('transactions')||crypto.randomUUID());
    await runTransaction(db,async tx=>{
      const [snap,existing]=await Promise.all([tx.get(customerRef),tx.get(txnRef)]);if(!snap.exists())throw new Error('Customer nahi mila');if(existing.exists())return;
      const balance=Number(snap.data().balance||0)+(type==='debit'?amt:-amt);
      tx.set(txnRef,{...data,balanceAfter:balance});tx.update(customerRef,{balance,updatedAt:serverTimestamp()});
    });
    closeModal();
    showToast(`✅ ${type === 'debit' ? 'Udhaar' : 'Wasooli'} Rs ${amt} save ho gaya`, 'success');
  } catch(e) {
    showToast('❌ Error: ' + e.message, 'error');
  } finally { window.__h360TxnBusy=false; }
};

function showModal(html) {
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modal').style.display = 'flex';
  history.pushState({ page: 'modal' }, '');
}
window.showModal = showModal;
window.closeModal = function() { document.getElementById('modal').style.display = 'none'; };

console.log('Part 3 loaded — ' + DEVELOPER);

// ============================================
// PART 4 — REQUESTS / STOCK / SUPPLIERS / REPORT / PIN
// ============================================
function renderRequests() {
  const box = document.getElementById('requestsList');
  if(!box) return;
  const pending = requests.filter(r => r.status === 'pending');
  const processed = requests.filter(r => r.status === 'approved' || r.status === 'rejected');
  document.getElementById('reqCount').textContent = pending.length;
  
  let html = '';
  
  // ===== PENDING SECTION =====
  if(pending.length === 0) {
    html += `<div class="empty"><span class="ico">✅</span><p>Koi pending request nahi</p><p class="sub">Sab clear hai!</p></div>`;
  } else {
    html += pending.map(r => {
      const initial = (r.name || '?').charAt(0).toUpperCase();
      const dt = formatDate(r.requestedAt);
      return `<div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:var(--shadow-sm);border-left:4px solid var(--orange);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:42px;height:42px;background:linear-gradient(135deg,#f39c12,#d68910);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;">${initial}</div>
          <div style="flex:1;"><p style="font-weight:700;font-size:14px;margin:0;">${r.name}</p><p style="font-size:11px;color:var(--primary);font-weight:600;margin:2px 0 0;">${r.requestType==='workspace'?'🧩 Workspace':'🏪 Account'} · ${r.shop}</p></div>
        </div>
        <div style="font-size:11px;color:var(--text-light);line-height:1.7;">📍 ${r.location || '—'}<br>📱 ${r.phone}<br>📧 ${r.email}<br>🕐 ${dt}</div>
        <div style="display:flex;gap:8px;margin-top:12px;padding-top:10px;border-top:1px dashed var(--border);">
          <button onclick="approveRequest('${r.id}')" style="flex:1;padding:10px;border-radius:10px;font-weight:700;font-size:12px;color:#fff;background:linear-gradient(135deg,#25D366,#128C7E);">✅ Approve</button>
          <button onclick="rejectRequest('${r.id}')" style="flex:1;padding:10px;border-radius:10px;font-weight:700;font-size:12px;color:#fff;background:linear-gradient(135deg,#e74c3c,#c0392b);">❌ Reject</button>
          <button onclick="deleteRequest('${r.id}')" style="padding:10px 14px;border-radius:10px;font-weight:700;font-size:12px;color:#fff;background:#95a5a6;">🗑️</button>
        </div></div>`;
    }).join('');
  }
  
  // ===== PROCESSED SECTION =====
  if(processed.length > 0) {
    html += `<div style="font-size:13px;font-weight:800;color:var(--primary);margin:20px 0 10px;display:flex;justify-content:space-between;">
      <span>📋 Purani Requests</span>
      <span style="font-size:11px;background:#f0f2f5;padding:3px 10px;border-radius:8px;color:var(--text-light);">${processed.length}</span>
    </div>`;
    html += processed.map(r => {
      const initial = (r.name || '?').charAt(0).toUpperCase();
      const dt = formatDate(r.requestedAt);
      const isApproved = r.status === 'approved';
      const color = isApproved ? '#25D366' : '#e74c3c';
      const label = isApproved ? '✅ Approved' : '❌ Rejected';
      return `<div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:var(--shadow-sm);border-left:4px solid ${color};opacity:0.85;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:42px;height:42px;background:linear-gradient(135deg,${color},${color});border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;">${initial}</div>
          <div style="flex:1;">
            <p style="font-weight:700;font-size:14px;margin:0;">${r.name}</p>
            <p style="font-size:11px;color:var(--primary);font-weight:600;margin:2px 0 0;">${r.requestType==='workspace'?'🧩 Workspace':'🏪 Account'} · ${r.shop} • ${label}</p>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-light);line-height:1.7;">📱 ${r.phone}<br>📧 ${r.email}<br>🕐 ${dt}</div>
        <div style="display:flex;gap:8px;margin-top:12px;padding-top:10px;border-top:1px dashed var(--border);">
          <button onclick="deleteRequest('${r.id}')" style="flex:1;padding:10px;border-radius:10px;font-weight:700;font-size:12px;color:#fff;background:linear-gradient(135deg,#e74c3c,#c0392b);">🗑️ Delete Request</button>
        </div></div>`;
    }).join('');
  }
  
  box.innerHTML = html;
}

function updateReqBadge() {
  const badge = document.getElementById('reqBadge');
  if(!badge) return;
  const pending = isMaster() ? requests.filter(r => r.status === 'pending').length : 0;
  badge.textContent = pending > 0 ? String(pending) : '';
  badge.classList.toggle('show', pending > 0);
  badge.hidden = pending <= 0;
  badge.style.display = pending > 0 ? 'block' : 'none';
}

function renderUsersList() {const box=document.getElementById('usersList');if(box)box.innerHTML='<p class="finance-hint">Master sirf requests approve/reject karta hai. User profiles aur personal data private hain.</p>';
}

window.approveRequest = async function(reqId) {
  const pin = prompt('🔑 Master PIN daalein:');
  if(pin === null) return;
  if(!getMasterPin()) return showToast('⚠️ Pehle Settings > Security mein Master PIN set karein', 'error');
  if(pin !== getMasterPin()) return showToast('❌ Ghalat Master PIN', 'error');
  const req = requests.find(r => r.id === reqId);
  if(!req) return;
  if(!confirm(`"${req.name}" (${req.shop}) ko approve karein?`)) return;
  try {
    if(!req.authCreated || (req.requestType!=='workspace'&&req.emailVerified!==true)) {
      // Legacy request from older builds: do not use/read stored passwords anymore.
      return showToast('⚠️ Purani insecure request hai — user ko latest app se request dobara bhejne dein', 'error');
    }
    // Rules: signup requests MUST use workspace id 'default'; workspace-type requests use their own workspaceId.
    const approvedWorkspace=makeWorkspace({id:req.requestType==='workspace'?(req.workspaceId||'default'):'default',name:req.shop,category:req.category||'other',modules:req.modules,location:req.location,phone:req.phone,whatsapp:req.whatsapp||req.phone,language:req.language||'en',headerStyle:req.headerStyle||'navy',receiptStyle:req.receiptStyle||'modern'});
    const batch=writeBatch(db);
    batch.set(doc(db,'workspace_approvals',req.email,'workspaces',approvedWorkspace.id),{email:req.email,workspace:approvedWorkspace,ownerName:req.name||'',requestId:reqId,approvedBy:currentUser.email,approvedAt:serverTimestamp()});
    batch.update(doc(db,'account_requests',reqId),{status:'approved',approvedAt:serverTimestamp(),approvedBy:currentUser.email});
    await batch.commit();
    showToast('✅ Approve ho gaya!', 'success');
  } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
};

window.rejectRequest = async function(reqId) {
  const pin = prompt('🔑 Master PIN daalein:');
  if(pin === null) return;
  if(!getMasterPin()) return showToast('⚠️ Pehle Settings > Security mein Master PIN set karein', 'error');
  if(pin !== getMasterPin()) return showToast('❌ Ghalat Master PIN', 'error');
  const req = requests.find(r => r.id === reqId);
  if(!req) return;
  const reason = prompt('Reject karne ki wajah (optional):', '');
  if(!confirm(`"${req.name}" ko reject karein?`)) return;
  await updateDoc(doc(db, "account_requests", reqId), {
    status: 'rejected', rejectedAt: serverTimestamp(), rejectedBy: currentUser.email, rejectReason: reason || ''
  });
  showToast('❌ Reject kar diya', 'success');
};
window.deleteRequest = async function(reqId) {
  const pin = prompt('🔑 Master PIN daalein:');
  if(pin === null) return;
  if(!getMasterPin()) return showToast('⚠️ Pehle Settings > Security mein Master PIN set karein', 'error');
  if(pin !== getMasterPin()) return showToast('❌ Ghalat Master PIN', 'error');
  const req = requests.find(r => r.id === reqId);
  if(!req) return;
  if(!confirm(`"${req.name}" ki request delete karein?\n\n(Agar account approve ho chuka hai, to user ko manually Firebase Console se delete karna hoga)`)) return;
  try {
    await deleteDoc(doc(db, "account_requests", reqId));
    showToast('🗑️ Request delete ho gayi', 'success');
  } catch(e) {
    showToast('❌ Error: ' + e.message, 'error');
  }
};
window.blockUser = async function(email) {
  return showToast('User ka private account Master manage nahi kar sakta','error');
  if(!isMaster()) return showToast('Sirf master', 'error');
  if(email === MASTER_EMAIL) return showToast('Master block nahi ho sakta', 'error');
  const user = allUsers.find(u => u.email === email);
  if(!user) return;
  const pin = prompt('🔑 Master PIN daalein:');
  if(pin === null) return;
  if(!getMasterPin()) return showToast('⚠️ Pehle Settings > Security mein Master PIN set karein', 'error');
  if(pin !== getMasterPin()) return showToast('❌ Ghalat Master PIN', 'error');
  showBlockModal(user);
};



window.setBlockReason = function(reason) { document.getElementById('blockReason').value = reason; };

window.confirmBlockUser = async function(email) {
  return showToast('User ka private account Master manage nahi kar sakta','error');
  const reason = document.getElementById('blockReason').value.trim();
  if(!reason) return showToast('Wajah likhna zaroori hai', 'error');
  try {
    await updateDoc(doc(db, "users", email), { blocked: true, blockReason: reason, blockedAt: serverTimestamp(), blockedBy: currentUser.email });
    closeModal();
    showToast('🚫 User block ho gaya', 'success');
  } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
};

window.unblockUser = async function(email) {
  return showToast('User ka private account Master manage nahi kar sakta','error');
  if(!isMaster()) return showToast('Sirf master', 'error');
  const pin = prompt('🔑 Master PIN daalein:');
  if(pin === null) return;
  if(!getMasterPin()) return showToast('⚠️ Pehle Settings > Security mein Master PIN set karein', 'error');
  if(pin !== getMasterPin()) return showToast('❌ Ghalat Master PIN', 'error');
  const user = allUsers.find(u => u.email === email);
  if(!user) return;
  if(!confirm(`"${user.shopName}" ko unblock karein?`)) return;
  try {
    await updateDoc(doc(db, "users", email), { blocked: false, unblockedAt: serverTimestamp(), unblockedBy: currentUser.email });
    showToast('✅ User unblock ho gaya', 'success');
  } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
};

window.openUserDetail = function(email) {
  return showToast('User ka private account Master manage nahi kar sakta','error');
  const user = allUsers.find(u => u.email === email);
  if(!user) return;
  const userCustomers = customers.filter(c => c.ownerEmail === email);
  const totalBaqaya = userCustomers.reduce((s, c) => s + (c.balance || 0), 0);
  const blocked = user.blocked === true;
  const html = `<h3>👤 ${user.shopName}</h3>
    <div style="font-size:12px;color:#7f8c8d;margin-bottom:14px;">👤 ${user.ownerName || 'User'}</div>
    <div style="background:#f8f9fb;border-radius:12px;padding:4px 14px;">
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eef1f4;font-size:12px;"><span style="color:#7f8c8d;">📍 Location</span><strong>${user.shopLocation || '—'}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eef1f4;font-size:12px;"><span style="color:#7f8c8d;">📧 Email</span><strong style="font-size:10px;">${user.email}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eef1f4;font-size:12px;"><span style="color:#7f8c8d;">📱 Phone</span><strong>${user.shopPhone || '—'}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:12px;"><span style="color:#7f8c8d;">👥 Customers</span><strong>${userCustomers.length}</strong></div>
    </div>
    <div style="margin-top:14px;background:#fff5f5;border-radius:10px;padding:12px;border-left:3px solid #e74c3c;">
      <div style="font-size:11px;color:#c0392b;font-weight:700;">💰 Total Baqaya</div>
      <div style="font-size:18px;font-weight:800;color:#e74c3c;">Rs ${totalBaqaya.toLocaleString()}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-save btn-secondary" style="flex:1;" onclick="closeModal()">Close</button>
      ${blocked ? `<button class="btn-save" style="flex:1;background:linear-gradient(135deg,#25D366,#128C7E);" onclick="closeModal();unblockUser('${user.email}')">✅ Unblock</button>`
                : email !== MASTER_EMAIL ? `<button class="btn-save" style="flex:1;background:linear-gradient(135deg,#e74c3c,#c0392b);" onclick="closeModal();blockUser('${user.email}')">🚫 Block</button>` : ''}
    </div>`;
  showModal(html);
};

function showBlockedScreen(userData) {
  const blockReason = userData.blockReason || 'Admin ne block kiya hai';
  const html = `<div style="position:fixed;inset:0;background:linear-gradient(135deg,#1e3a5f,#2d5a8c);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;">
    <div style="background:#fff;border-radius:24px;padding:28px 22px;max-width:400px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
      <div style="width:70px;height:70px;margin:0 auto 14px;background:linear-gradient(135deg,#e74c3c,#c0392b);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:36px;">🚫</div>
      <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:22px;font-weight:800;">Account Blocked</h2>
      <p style="color:#2c3e50;font-size:13px;margin:0 0 14px;">Aap ka account temporarily block hai.</p>
      <div style="background:#fff5f5;padding:12px;border-radius:12px;margin-bottom:14px;border-left:4px solid #e74c3c;text-align:left;">
        <div style="font-size:10px;color:#c0392b;font-weight:700;margin-bottom:4px;">WAJAH</div>
        <div style="font-size:12px;color:#2c3e50;font-style:italic;">"${blockReason}"</div>
      </div>
      <div style="font-size:12px;color:#7f8c8d;margin-bottom:14px;">📞 +92 313 9757267<br>📧 s9oman28@gmail.com</div>
      <button onclick="logoutFromBlocked()" style="width:100%;padding:12px;background:linear-gradient(135deg,#1e3a5f,#2d5a8c);color:#fff;border:none;border-radius:12px;font-weight:700;font-size:14px;">🚪 Logout</button>
    </div></div>`;
  const div = document.createElement('div');
  div.id = 'blockedScreen';
  div.innerHTML = html;
  document.body.appendChild(div);
}

window.logoutFromBlocked = async function() {
  const el = document.getElementById('blockedScreen');
  if(el) el.remove();
  await signOut(auth);
};

// STOCK
window.renderStockItems = function() {
  const box = document.getElementById('stockList');
  if(!box) return;
  const q = (document.getElementById('stockSearchBox').value || '').toLowerCase();
  const list = stockItems.filter(s => (s.name || '').toLowerCase().includes(q));
  if(list.length === 0) { box.innerHTML = `<div class="empty"><span class="ico">📦</span><p>${stockItems.length === 0 ? 'Koi stock item nahi' : 'Koi item nahi mila'}</p><p class="sub">${stockItems.length === 0 ? '➕ Naya Item Add karein' : 'Doosra naam try karein'}</p></div>`; return; }
  box.innerHTML = list.map(s => {
    const qty = s.quantity || 0; const minQty = s.minQuantity || 0; const rate = s.rate || 0; const saleRate = s.saleRate || s.sellRate || 0; const unit = s.unit || 'pcs';
    let statusColor = '#25D366', badge = '✅ OK', badgeBg = 'rgba(37,211,102,0.15)', badgeColor = '#25D366';
    if(qty === 0) { statusColor = '#e74c3c'; badge = '🚫 Out'; badgeBg = 'rgba(231,76,60,0.15)'; badgeColor = '#e74c3c'; }
    else if(qty <= minQty) { statusColor = '#f39c12'; badge = '⚠️ Low'; badgeBg = 'rgba(243,156,18,0.15)'; badgeColor = '#f39c12'; }
    return `<div style="background:#fff;border-radius:14px;padding:12px;margin-bottom:10px;box-shadow:var(--shadow-sm);border-left:4px solid ${statusColor};">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:42px;height:42px;background:#f8f9fb;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;border:1.5px solid var(--border);">${s.emoji || '📦'}</div>
        <div style="flex:1;min-width:0;">
          <p style="font-weight:700;font-size:14px;margin:0;">${s.name}</p>
          <p style="font-size:12px;margin:3px 0 0;color:var(--text-light);">Stock: <strong style="font-size:14px;font-weight:800;color:${statusColor};">${qty} ${unit}</strong><span style="background:${badgeBg};color:${badgeColor};padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;margin-left:6px;">${badge}</span></p>
          <div style="font-size:11px;color:var(--text-light);margin-top:4px;">${rate > 0 ? `Cost: Rs ${rate}/${unit} • Value: Rs ${(qty*rate).toLocaleString()}` : 'Cost rate set nahi'}${saleRate > 0 ? ` • Sale: Rs ${saleRate}/${unit}` : ''}${s.barcode ? ` • SKU: ${s.barcode}` : ''}</div>
        </div></div>
      <div style="display:flex;gap:6px;padding-top:10px;border-top:1px dashed var(--border);">
        <button onclick="openStockIn('${s.id}')" style="flex:1;padding:9px 6px;border-radius:9px;font-weight:700;font-size:11px;color:#fff;background:linear-gradient(135deg,#25D366,#128C7E);">➕ Aya</button>
        <button onclick="openStockOut('${s.id}')" style="flex:1;padding:9px 6px;border-radius:9px;font-weight:700;font-size:11px;color:#fff;background:linear-gradient(135deg,#e74c3c,#c0392b);">➖ Gaya</button>
        <button onclick="openEditStockItem('${s.id}')" style="flex:1;padding:9px 6px;border-radius:9px;font-weight:700;font-size:11px;color:#fff;background:linear-gradient(135deg,#3498db,#2874a6);">✏️ Edit</button>
        <button onclick="openStockHistory('${s.id}')" style="flex:1;padding:9px 6px;border-radius:9px;font-weight:700;font-size:11px;color:#fff;background:linear-gradient(135deg,#9b59b6,#8e44ad);">📜 Hist</button>
      </div></div>`;
  }).join('');
};

window.updateStockDashboard = function() {
  const totalItems = stockItems.length;
  const totalValue = stockItems.reduce((s, it) => s + ((it.quantity || 0) * (it.rate || 0)), 0);
  const lowStock = stockItems.filter(s => (s.quantity || 0) > 0 && (s.quantity || 0) <= (s.minQuantity || 0)).length;
  const outStock = stockItems.filter(s => (s.quantity || 0) === 0).length;
  document.getElementById('dashTotalItems').textContent = totalItems;
  document.getElementById('dashStockValue').textContent = 'Rs ' + totalValue.toLocaleString();
  document.getElementById('dashLowStock').textContent = lowStock;
  document.getElementById('dashOutStock').textContent = outStock;
};

window.openAddStockItem = function() {
  const unitOpts = UNITS.map(u => `<option value="${u}">${u}</option>`).join('');
  const html = `<h3>📦 Naya Stock Item</h3>
    <div class="form-field"><label>Item ka Naam *</label><input type="text" id="siName" placeholder="Misal: Chawal" autofocus></div>
    <div class="form-field"><label>Emoji (optional)</label><input type="text" id="siEmoji" placeholder="Misal: 🍚" style="text-align:center;font-size:22px;" maxlength="4"></div>
    <div class="form-field"><label>Unit *</label><select id="siUnit">${unitOpts}</select></div>
    <div class="form-field"><label>Starting Quantity</label><input type="number" id="siQty" placeholder="0" value="0"></div>
    <div class="form-field"><label>Cost / Purchase Rate (Rs per unit)</label><input type="number" id="siRate" placeholder="0" value="0"></div>
    <div class="form-field"><label>Sale Rate (Rs per unit)</label><input type="number" id="siSaleRate" placeholder="0" value="0"></div>
    <div class="form-field"><label>Barcode / SKU (optional)</label><input type="text" id="siBarcode" placeholder="Scan ya type karein"></div>
    <div class="form-field"><label>Minimum Quantity</label><input type="number" id="siMin" placeholder="0" value="0"></div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-save btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
      <button class="btn-save" style="flex:2;" onclick="saveStockItem()">✅ Save Karein</button>
    </div>`;
  showModal(html);
};

window.saveStockItem = async function() {
  const name = document.getElementById('siName').value.trim();
  const emoji = document.getElementById('siEmoji').value.trim() || '📦';
  const unit = document.getElementById('siUnit').value;
  const qty = parseFloat(document.getElementById('siQty').value) || 0;
  const rate = parseFloat(document.getElementById('siRate').value) || 0;
  const saleRate = parseFloat(document.getElementById('siSaleRate')?.value) || 0;
  const barcode = (document.getElementById('siBarcode')?.value || '').trim();
  const minQty = parseFloat(document.getElementById('siMin').value) || 0;
  if(!name) return showToast('Naam zaroori hai', 'error');
  await addDoc(collection(db, "stock_items"), {
    name, emoji, unit, quantity: qty, rate, saleRate, barcode, sku: barcode, minQuantity: minQty,
    ownerEmail: currentUser.email, ...workspaceWriteFields(), createdAt: serverTimestamp()
  });
  closeModal();
  showToast('✅ Item add ho gaya!', 'success');
};

window.openEditStockItem = function(id) {
  const s = stockItems.find(x => x.id === id);
  if(!s) return;
  const unitOpts = UNITS.map(u => `<option value="${u}" ${u === s.unit ? 'selected' : ''}>${u}</option>`).join('');
  const html = `<h3>✏️ Edit — ${s.name}</h3>
    <div class="form-field"><label>Naam</label><input type="text" id="siName" value="${s.name}"></div>
    <div class="form-field"><label>Emoji</label><input type="text" id="siEmoji" value="${s.emoji || '📦'}" style="text-align:center;font-size:22px;" maxlength="4"></div>
    <div class="form-field"><label>Unit</label><select id="siUnit">${unitOpts}</select></div>
    <div class="form-field"><label>Quantity</label><input type="number" id="siQty" value="${s.quantity || 0}"></div>
    <div class="form-field"><label>Cost / Purchase Rate</label><input type="number" id="siRate" value="${s.rate || 0}"></div>
    <div class="form-field"><label>Sale Rate</label><input type="number" id="siSaleRate" value="${s.saleRate || s.sellRate || 0}"></div>
    <div class="form-field"><label>Barcode / SKU</label><input type="text" id="siBarcode" value="${s.barcode || s.sku || ''}"></div>
    <div class="form-field"><label>Minimum Quantity</label><input type="number" id="siMin" value="${s.minQuantity || 0}"></div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-save btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
      <button class="btn-save" style="flex:1;background:linear-gradient(135deg,#e74c3c,#c0392b);" onclick="deleteStockItem('${s.id}')">🗑️ Delete</button>
      <button class="btn-save" style="flex:1;" onclick="updateStockItem('${s.id}')">✅ Update</button>
    </div>`;
  showModal(html);
};

window.updateStockItem = async function(id) {
  const name = document.getElementById('siName').value.trim();
  const emoji = document.getElementById('siEmoji').value.trim() || '📦';
  const unit = document.getElementById('siUnit').value;
  const qty = parseFloat(document.getElementById('siQty').value) || 0;
  const rate = parseFloat(document.getElementById('siRate').value) || 0;
  const saleRate = parseFloat(document.getElementById('siSaleRate')?.value) || 0;
  const barcode = (document.getElementById('siBarcode')?.value || '').trim();
  const minQty = parseFloat(document.getElementById('siMin').value) || 0;
  if(!name) return showToast('Naam zaroori hai', 'error');
  await updateDoc(doc(db, "stock_items", id), { name, emoji, unit, quantity: qty, rate, saleRate, barcode, sku: barcode, minQuantity: minQty, updatedAt: serverTimestamp() });
  closeModal();
  showToast('✅ Update ho gaya!', 'success');
};

window.deleteStockItem = async function(id) {
  const pin = prompt('🔑 Delete PIN daalein:');
  if(!getDeletePin()) return showToast('⚠️ Pehle Settings > Security mein Delete PIN set karein', 'error');
  if(pin !== getDeletePin()) return showToast('❌ Ghalat PIN', 'error');
  if(!confirm('Yeh item delete karein?')) return;
  const item = stockItems.find(x => x.id === id);
  await updateDoc(doc(db, "stock_items", id), { deletedAt: serverTimestamp(), deletedAtMs: Date.now(), deletedBy: currentUser.email });
  window.KMFeatures?.audit?.('stock_moved_to_recycle_bin', { stockId:id, name:item?.name||'' });
  closeModal();
  showToast('🗑️ Recycle Bin mein move ho gaya', 'success');
};

window.openStockIn = function(id) {
  const s = stockItems.find(x => x.id === id);
  if(!s) return;
  const supplierOpts = '<option value="">-- Select Supplier --</option>' + suppliers.map(sp => `<option value="${sp.id}">${sp.name}</option>`).join('') + '<option value="__new__">➕ Naya Supplier</option>';
  const html = `<h3>➕ Stock In — ${s.emoji} ${s.name}</h3>
    <div style="font-size:12px;color:#7f8c8d;margin-bottom:14px;">Current Stock: <strong style="color:#1e3a5f;">${s.quantity || 0} ${s.unit}</strong></div>
    <div class="form-field"><label>Kitna Aya? (${s.unit}) *</label><input type="number" id="inQty" placeholder="Misal: 50" autofocus></div>
    <div class="form-field"><label>Rate (Rs per ${s.unit})</label><input type="number" id="inRate" placeholder="${s.rate || 0}" value="${s.rate || 0}"></div>
    <div class="form-field"><label>Supplier</label><select id="inSupplier" onchange="handleSupplierChange(this)">${supplierOpts}</select></div>
    <div class="form-field"><label>Notes (optional)</label><input type="text" id="inNotes" placeholder="Misal: Bill #123"></div>
    <div class="form-field" style="background:#e8f5e9;padding:12px;border-radius:10px;font-size:13px;color:#2e7d32;">💰 <strong>Total Cost:</strong> <span id="inTotalCost">Rs 0</span></div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-save btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
      <button class="btn-save" style="flex:2;background:linear-gradient(135deg,#25D366,#128C7E);" onclick="saveStockIn('${s.id}')">✅ Add Karein</button>
    </div>`;
  showModal(html);
  setTimeout(() => {
    const qtyEl = document.getElementById('inQty');
    const rateEl = document.getElementById('inRate');
    function upd() {
      const q = parseFloat(qtyEl.value) || 0; const r = parseFloat(rateEl.value) || 0;
      document.getElementById('inTotalCost').textContent = 'Rs ' + (q * r).toLocaleString();
    }
    qtyEl.addEventListener('input', upd); rateEl.addEventListener('input', upd); qtyEl.focus();
  }, 200);
};

window.handleSupplierChange = function(el) {
  if(el.value === '__new__') { el.value = ''; closeModal(); setTimeout(() => openAddSupplier(), 300); }
};

window.saveStockIn = async function(stockId){
 if(window.__stockBusy)return;window.__stockBusy=true;
 try{
  const qty=Number(document.getElementById('inQty').value),rate=Number(document.getElementById('inRate').value),supplierId=document.getElementById('inSupplier').value,notes=document.getElementById('inNotes').value.trim();
  if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(rate)||rate<0)throw new Error('Quantity aur rate check karein');
  const stockRef=doc(db,'stock_items',stockId),supplierRef=supplierId?doc(db,'suppliers',supplierId):null,moveRef=doc(collection(db,'stock_movements')),fields=workspaceWriteFields();
  await runTransaction(db,async tx=>{
   const snap=await tx.get(stockRef),supplier=supplierRef?await tx.get(supplierRef):null;
   if(!snap.exists()||snap.data().deletedAt||snap.data().workspaceKey!==fields.workspaceKey)throw new Error('Item available nahi');
   if(supplierRef&&(!supplier.exists()||supplier.data().workspaceKey!==fields.workspaceKey))throw new Error('Supplier available nahi');
   const item=snap.data(),totalCost=qty*rate;tx.update(stockRef,{quantity:Number(item.quantity||0)+qty,rate,updatedAt:serverTimestamp()});
   tx.set(moveRef,{stockId,stockName:item.name,type:'in',quantity:qty,rate,unit:item.unit||'',totalCost,supplierId:supplierId||null,supplierName:supplier?.data()?.name||'',notes,ownerEmail:currentUser.email,...fields,createdAt:serverTimestamp()});
   if(supplierRef&&totalCost>0)tx.update(supplierRef,{balance:Number(supplier.data().balance||0)+totalCost,totalLiya:Number(supplier.data().totalLiya||0)+totalCost,updatedAt:serverTimestamp()});
  });closeModal();showToast('Stock add ho gaya','success');
 }catch(e){showToast(e.message,'error');}finally{window.__stockBusy=false;}
};


window.openStockOut = function(id) {
  const s = stockItems.find(x => x.id === id);
  if(!s) return;
  const html = `<h3>➖ Stock Out — ${s.emoji} ${s.name}</h3>
    <div style="font-size:12px;color:#7f8c8d;margin-bottom:14px;">Current Stock: <strong style="color:#1e3a5f;">${s.quantity || 0} ${s.unit}</strong></div>
    <div class="form-field"><label>Kitna Gaya? (${s.unit}) *</label><input type="number" id="outQty" placeholder="Misal: 5" autofocus></div>
    <div class="form-field"><label>Wajah *</label><select id="outReason"><option value="sold">🛒 Bika / Customer ka order</option><option value="damaged">⚠️ Kharab ho gaya</option><option value="return">↩️ Supplier ko wapas</option><option value="personal">🏠 Ghar use</option><option value="other">❓ Other</option></select></div>
    <div class="form-field"><label>Customer (agar bika)</label><input type="text" id="outCustomer" placeholder="Customer ka naam (optional)"></div>
    <div class="form-field"><label>Notes (optional)</label><input type="text" id="outNotes" placeholder="Koi tafseel"></div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-save btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
      <button class="btn-save" style="flex:2;background:linear-gradient(135deg,#e74c3c,#c0392b);" onclick="saveStockOut('${s.id}')">✅ Save Out</button>
    </div>`;
  showModal(html);
  setTimeout(() => document.getElementById('outQty').focus(), 200);
};

window.saveStockOut = async function(stockId){
 if(window.__stockBusy)return;window.__stockBusy=true;
 try{
  const qty=Number(document.getElementById('outQty').value),reason=document.getElementById('outReason').value,customer=document.getElementById('outCustomer').value.trim(),notes=document.getElementById('outNotes').value.trim();
  if(!Number.isFinite(qty)||qty<=0)throw new Error('Quantity check karein');
  const stockRef=doc(db,'stock_items',stockId),moveRef=doc(collection(db,'stock_movements')),fields=workspaceWriteFields();
  await runTransaction(db,async tx=>{const snap=await tx.get(stockRef);if(!snap.exists()||snap.data().deletedAt||snap.data().workspaceKey!==fields.workspaceKey)throw new Error('Stock item available nahi');const item=snap.data();if(qty>Number(item.quantity||0))throw new Error('Itna stock nahi hai');tx.update(stockRef,{quantity:Number(item.quantity||0)-qty,updatedAt:serverTimestamp()});tx.set(moveRef,{stockId,stockName:item.name,type:'out',quantity:qty,unit:item.unit||'',reason,customer,notes,ownerEmail:currentUser.email,...fields,createdAt:serverTimestamp()});});
  closeModal();showToast('Stock out save ho gaya','success');
 }catch(e){showToast(e.message,'error');}finally{window.__stockBusy=false;}
};


window.openStockHistory = function(id) {
  const s = stockItems.find(x => x.id === id);
  if(!s) return;
  const moves = stockMovements.filter(m => m.stockId === id);
  let html = `<h3>📜 ${s.emoji} ${s.name} — History</h3>`;
  html += `<div style="font-size:12px;color:#7f8c8d;margin-bottom:12px;">Stock: <strong>${s.quantity || 0} ${s.unit}</strong> • ${moves.length} movements</div>`;
  if(moves.length === 0) html += '<div class="empty"><span class="ico">📭</span><p>Koi movement nahi</p></div>';
  else {
    html += moves.slice(0, 50).map(m => {
      const d = formatDate(m.createdAt);
      const isIn = m.type === 'in';
      const sign = isIn ? '+' : '−';
      const color = isIn ? '#25D366' : '#e74c3c';
      const detail = isIn ? (m.supplierName ? `🏪 ${m.supplierName}` : '') + (m.notes ? ` • ${m.notes}` : '') : (m.customer ? `👤 ${m.customer}` : '') + (m.notes ? ` • ${m.notes}` : '');
      return `<div style="background:#fff;border-radius:10px;padding:10px;margin-bottom:8px;border-left:3px solid ${color};display:flex;align-items:center;gap:10px;box-shadow:var(--shadow-sm);">
        <div style="width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;background:rgba(${isIn ? '37,211,102' : '231,76,60'},0.15);">${isIn ? '➕' : '➖'}</div>
        <div style="flex:1;min-width:0;"><p style="font-weight:700;font-size:12px;margin:0;">${isIn ? 'Stock In' : 'Stock Out'}</p><p style="font-size:10px;color:var(--text-light);margin:2px 0 0;">${d}${detail ? '<br>' + detail : ''}</p></div>
        <div style="font-weight:800;font-size:13px;color:${color};">${sign}${m.quantity} ${s.unit}</div></div>`;
    }).join('');
  }
  html += `<button class="btn-save" style="margin-top:14px;" onclick="closeModal()">❌ Close</button>`;
  showModal(html);
};

// SUPPLIERS
window.renderSuppliers = function() {
  const box = document.getElementById('suppliersList');
  if(!box) return;
  const q = (document.getElementById('supplierSearchBox').value || '').toLowerCase();
  const list = suppliers.filter(s => (s.name || '').toLowerCase().includes(q) || (s.phone || '').includes(q));
  if(list.length === 0) { box.innerHTML = `<div class="empty"><span class="ico">🏪</span><p>${suppliers.length === 0 ? 'Koi supplier nahi' : 'Koi supplier nahi mila'}</p><p class="sub">${suppliers.length === 0 ? '➕ Naya Supplier Add karein' : 'Doosra naam try karein'}</p></div>`; return; }
  box.innerHTML = list.map(s => {
    const bal = s.balance || 0;
    const hasBal = bal > 0;
    const initial = (s.name || '?').charAt(0).toUpperCase();
    return `<div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:var(--shadow-sm);border-left:4px solid ${hasBal ? '#e74c3c' : '#25D366'};">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
        <div style="width:44px;height:44px;background:linear-gradient(135deg,#9b59b6,#8e44ad);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:18px;flex-shrink:0;">${initial}</div>
        <div style="flex:1;min-width:0;"><p style="font-weight:700;font-size:14px;margin:0;">${s.name}</p>
          ${s.phone ? `<p style="font-size:11px;color:var(--text-light);margin:2px 0 0;">📱 ${s.phone}</p>` : ''}
          ${s.address ? `<p style="font-size:11px;color:var(--text-light);margin:2px 0 0;">📍 ${s.address}</p>` : ''}
        </div></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;border-bottom:1px dashed var(--border);"><span style="color:var(--text-light);">💰 Total Liya</span><strong>Rs ${(s.totalLiya || 0).toLocaleString()}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;border-bottom:1px dashed var(--border);"><span style="color:var(--text-light);">💵 Diya</span><strong>Rs ${(s.totalDiya || 0).toLocaleString()}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;"><span style="color:var(--text-light);">⚠️ Baqaya</span><strong style="color:${hasBal ? '#e74c3c' : '#25D366'};font-size:14px;font-weight:800;">Rs ${bal.toLocaleString()}</strong></div>
      <div style="display:flex;gap:6px;padding-top:10px;margin-top:8px;border-top:1px dashed var(--border);">
        <button onclick="openSupplierPayment('${s.id}')" style="flex:1;padding:9px 6px;border-radius:9px;font-weight:700;font-size:11px;color:#fff;background:linear-gradient(135deg,#25D366,#128C7E);">💰 Diya</button>
        <button onclick="openSupplierHistory('${s.id}')" style="flex:1;padding:9px 6px;border-radius:9px;font-weight:700;font-size:11px;color:#fff;background:linear-gradient(135deg,#3498db,#2874a6);">📜 Hist</button>
        ${s.phone ? `<button onclick="callSupplier('${s.phone}')" style="flex:1;padding:9px 6px;border-radius:9px;font-weight:700;font-size:11px;color:#fff;background:linear-gradient(135deg,#1abc9c,#16a085);">📞</button>` : ''}
        <button onclick="deleteSupplier('${s.id}')" style="flex:1;padding:9px 6px;border-radius:9px;font-weight:700;font-size:11px;color:#fff;background:linear-gradient(135deg,#e74c3c,#c0392b);">🗑️</button>
      </div></div>`;
  }).join('');
};

window.openAddSupplier = function() {
  const html = `<h3>🏪 Naya Supplier</h3>
    <div class="form-field"><label>Supplier ka Naam *</label><input type="text" id="spName" placeholder="Misal: Chaudhry Store" autofocus></div>
    <div class="form-field"><label>Phone Number</label><input type="tel" id="spPhone" placeholder="923001234567"></div>
    <div class="form-field"><label>Address / Location</label><input type="text" id="spAddress" placeholder="Misal: Mingora Bazaar"></div>
    <div class="form-field"><label>Shuru ka Baqaya (agar hai)</label><input type="number" id="spOpening" placeholder="0" value="0"></div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-save btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
      <button class="btn-save" style="flex:2;" onclick="saveSupplier()">✅ Save Karein</button>
    </div>`;
  showModal(html);
};

window.saveSupplier = async function() {
  const name = document.getElementById('spName').value.trim();
  const phone = document.getElementById('spPhone').value.trim();
  const address = document.getElementById('spAddress').value.trim();
  const opening = parseFloat(document.getElementById('spOpening').value) || 0;
  if(!name) return showToast('Naam zaroori hai', 'error');
  if(phone && !/^92\d{10}$/.test(phone)) return showToast('Phone 92XXXXXXXXXX format mein', 'error');
  await addDoc(collection(db, "suppliers"), {
    name, phone, address, balance: opening, totalLiya: opening, totalDiya: 0,
    ownerEmail: currentUser.email, ...workspaceWriteFields(), createdAt: serverTimestamp()
  });
  closeModal();
  showToast('✅ Supplier add ho gaya!', 'success');
};

window.openSupplierPayment = function(id) {
  const s = suppliers.find(x => x.id === id);
  if(!s) return;
  const bal = s.balance || 0;
  const html = `<h3>💰 Payment — ${s.name}</h3>
    <div style="font-size:13px;color:#7f8c8d;margin-bottom:14px;">Baqaya: <strong style="color:${bal > 0 ? '#e74c3c' : '#25D366'};font-size:16px;">Rs ${bal.toLocaleString()}</strong></div>
    <div class="form-field"><label>Kitna Diya? (Rs) *</label><input type="number" id="payAmt" placeholder="Misal: 5000" autofocus></div>
    <div class="form-field"><label>Notes (optional)</label><input type="text" id="payNotes" placeholder="Misal: Cash / Bank transfer"></div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-save btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
      <button class="btn-save" style="flex:2;background:linear-gradient(135deg,#25D366,#128C7E);" onclick="saveSupplierPayment('${s.id}')">✅ Save Payment</button>
    </div>`;
  showModal(html);
  setTimeout(() => document.getElementById('payAmt').focus(), 200);
};

window.saveSupplierPayment = async function(id){
 if(window.__supplierBusy)return;window.__supplierBusy=true;
 try{
  const amount=Number(document.getElementById('payAmt').value),notes=document.getElementById('payNotes').value.trim();if(!Number.isFinite(amount)||amount<=0)throw new Error('Raqam check karein');
  const ref=doc(db,'suppliers',id),payRef=doc(collection(db,'supplier_payments')),fields=workspaceWriteFields();
  await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists()||snap.data().workspaceKey!==fields.workspaceKey)throw new Error('Supplier available nahi');const supplier=snap.data(),balance=Number(supplier.balance||0)-amount;tx.update(ref,{balance,totalDiya:Number(supplier.totalDiya||0)+amount,updatedAt:serverTimestamp()});tx.set(payRef,{supplierId:id,supplierName:supplier.name,amount,notes,balanceAfter:balance,ownerEmail:currentUser.email,...fields,createdAt:serverTimestamp()});});
  closeModal();showToast('Supplier payment saved','success');
 }catch(e){showToast(e.message,'error');}finally{window.__supplierBusy=false;}
};


window.openSupplierHistory = function(id) {
  const s = suppliers.find(x => x.id === id);
  if(!s) return;
  const moves = stockMovements.filter(m => m.supplierId === id);
  const payments = supplierPayments.filter(p => p.supplierId === id);
  let allEvents = [];
  moves.forEach(m => allEvents.push({ ...m, _type: 'liya' }));
  payments.forEach(p => allEvents.push({ ...p, _type: 'diya' }));
  allEvents.sort((a, b) => {
    const at = a.createdAt?.toDate?.() || new Date(0);
    const bt = b.createdAt?.toDate?.() || new Date(0);
    return bt - at;
  });
  let html = `<h3>📜 ${s.name} — History</h3>`;
  html += `<div style="font-size:11px;color:#7f8c8d;margin-bottom:12px;">Liya: <strong>Rs ${(s.totalLiya||0).toLocaleString()}</strong> • Diya: <strong>Rs ${(s.totalDiya||0).toLocaleString()}</strong> • Baqaya: <strong style="color:#e74c3c;">Rs ${(s.balance||0).toLocaleString()}</strong></div>`;
  if(allEvents.length === 0) html += '<div class="empty"><span class="ico">📭</span><p>Koi record nahi</p></div>';
  else {
    html += allEvents.slice(0, 50).map(e => {
      const d = formatDate(e.createdAt);
      const isLiya = e._type === 'liya';
      const color = isLiya ? '#e74c3c' : '#25D366';
      return `<div style="background:#fff;border-radius:10px;padding:10px;margin-bottom:8px;border-left:3px solid ${color};display:flex;align-items:center;gap:10px;box-shadow:var(--shadow-sm);">
        <div style="width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;background:rgba(${isLiya ? '231,76,60' : '37,211,102'},0.15);">${isLiya ? '📦' : '💰'}</div>
        <div style="flex:1;min-width:0;"><p style="font-weight:700;font-size:12px;margin:0;">${isLiya ? 'Maal Liya' : 'Payment Diya'}</p><p style="font-size:10px;color:var(--text-light);margin:2px 0 0;">${d}${e.notes ? ' • ' + e.notes : ''}</p></div>
        <div style="font-weight:800;font-size:13px;color:${color};">${isLiya ? '−' : '+'} Rs ${(e.totalCost || e.amount).toLocaleString()}</div></div>`;
    }).join('');
  }
  html += `<button class="btn-save" style="margin-top:14px;" onclick="closeModal()">❌ Close</button>`;
  showModal(html);
};

window.callSupplier = function(phone) { window.location.href = `tel:+${phone}`; };

window.deleteSupplier = async function(id) {
  const pin = prompt('🔑 Delete PIN daalein:');
  if(!getDeletePin()) return showToast('⚠️ Pehle Settings > Security mein Delete PIN set karein', 'error');
  if(pin !== getDeletePin()) return showToast('❌ Ghalat PIN', 'error');
  if(!confirm('Yeh supplier delete karein?')) return;
  const sp = suppliers.find(x => x.id === id);
  await updateDoc(doc(db, "suppliers", id), { deletedAt: serverTimestamp(), deletedAtMs: Date.now(), deletedBy: currentUser.email });
  window.KMFeatures?.audit?.('supplier_moved_to_recycle_bin', { supplierId:id, name:sp?.name||'' });
  showToast('🗑️ Recycle Bin mein move ho gaya', 'success');
};

// SUMMARY
let summaryDateFilter = 'week';
let summaryCustomRange = null;
let summaryChartInstance = null;
let activityLogs = [];
let logDateFilter = 'today';

// Chart.js is bundled locally by Vite so reports also work offline.
window.Chart = Chart;

window.setSummaryDateFilter = function(filter, el) {
  document.querySelectorAll('#summaryDateFilter .date-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  summaryDateFilter = filter;
  if(filter === 'custom') { openCustomRangeModal('summary'); return; }
  summaryCustomRange = null;
  renderSummaryPage();
};

const _summaryRangesLoaded = new Set();
async function ensureSummaryRangeLoaded(range) {
  if(!currentUser || !range?.start || !range?.end) return;
  const key = `${currentUser.uid}|${activeWorkspaceId()}|${range.start.getTime()}|${range.end.getTime()}`;
  if(_summaryRangesLoaded.has(key)) return;
  try {
    const base=collection(db,"transactions");
    const q=query(base, where("workspaceKey","==",`${currentUser.email}::${activeWorkspaceId()}`),where("ownerEmail","==",currentUser.email));
    const snap=await getDocs(q);
    snap.docs.forEach(d=>{
      const t={id:d.id,...d.data()};
      if(!visibleInWorkspace(t) || !isInRange(t.createdAt, range)) return;
      if(!transactions[t.customerId]) transactions[t.customerId]=[];
      const idx=transactions[t.customerId].findIndex(x=>x.id===t.id);
      if(idx>=0) transactions[t.customerId][idx]=t; else transactions[t.customerId].push(t);
    });
    _summaryRangesLoaded.add(key);
  } catch(e) {
    console.warn('Summary range load failed',e);
  }
}

window.renderSummaryPage = async function() {
  const range = getDateRange(summaryDateFilter, summaryCustomRange);
  document.getElementById('summaryPeriod').textContent = range.label;
  await ensureSummaryRangeLoaded(range);
  let totalDebit = 0, totalCredit = 0, debitCount = 0, creditCount = 0;
  const activeCustomers = new Set();
  const dailyData = {};
  Object.keys(transactions).forEach(custId => {
    (transactions[custId] || []).forEach(t => {
      if(!isInRange(t.createdAt, range)) return;
      activeCustomers.add(custId);
      const d = t.createdAt?.toDate ? t.createdAt.toDate() : null;
      if(d) {
        const key = d.toISOString().split('T')[0];
        if(!dailyData[key]) dailyData[key] = { debit: 0, credit: 0 };
        if(t.type === 'debit') dailyData[key].debit += t.amount || 0;
        else dailyData[key].credit += t.amount || 0;
      }
      if(t.type === 'debit') { totalDebit += t.amount || 0; debitCount++; }
      else { totalCredit += t.amount || 0; creditCount++; }
    });
  });
  const netBalance = customers.reduce((s, c) => s + (c.balance || 0), 0);
  document.getElementById('sumTotalDebit').textContent = 'Rs ' + totalDebit.toLocaleString();
  document.getElementById('sumDebitCount').textContent = debitCount + ' transactions';
  document.getElementById('sumTotalCredit').textContent = 'Rs ' + totalCredit.toLocaleString();
  document.getElementById('sumCreditCount').textContent = creditCount + ' transactions';
  document.getElementById('sumNetBalance').textContent = 'Rs ' + netBalance.toLocaleString();
  document.getElementById('sumActiveCustomers').textContent = activeCustomers.size;
  renderSummaryChart(dailyData, range);
  renderTopCustomers(range);
};

function renderSummaryChart(dailyData, range) {
  const canvas = document.getElementById('summaryChart');
  if(!canvas || !window.Chart) return;
  const labels = [], debitArr = [], creditArr = [];
  let days = 7;
  if(summaryDateFilter === 'today') days = 1;
  else if(summaryDateFilter === 'week') days = 7;
  else if(summaryDateFilter === 'month') days = 30;
  if(summaryDateFilter === 'year') {
    for(let m = 0; m < 12; m++) {
      const d = new Date(); d.setMonth(m, 1);
      labels.push(d.toLocaleString('en', { month: 'short' }));
      debitArr.push(0); creditArr.push(0);
    }
    Object.keys(dailyData).forEach(key => {
      const d = new Date(key); const idx = d.getMonth();
      if(idx >= 0 && idx < 12) { debitArr[idx] += dailyData[key].debit; creditArr[idx] += dailyData[key].credit; }
    });
    document.getElementById('chartPeriodLabel').textContent = 'Monthly trend';
  } else {
    for(let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
      debitArr.push(dailyData[key]?.debit || 0);
      creditArr.push(dailyData[key]?.credit || 0);
    }
    document.getElementById('chartPeriodLabel').textContent = `Last ${days} days`;
  }
  if(summaryChartInstance) summaryChartInstance.destroy();
  const ctx = canvas.getContext('2d');
  summaryChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Udhaar', data: debitArr, backgroundColor: 'rgba(231, 76, 60, 0.7)', borderColor: '#e74c3c', borderWidth: 1.5, borderRadius: 4 },
      { label: 'Wasooli', data: creditArr, backgroundColor: 'rgba(37, 211, 102, 0.7)', borderColor: '#25D366', borderWidth: 1.5, borderRadius: 4 }
    ]},
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 10, weight: '600' }, boxWidth: 12, padding: 8 } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: Rs ${ctx.parsed.y.toLocaleString()}` } } },
      scales: { y: { beginAtZero: true, ticks: { font: { size: 9 }, callback: v => 'Rs ' + v.toLocaleString() }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { ticks: { font: { size: 9 } }, grid: { display: false } } }
    }
  });
}

function renderTopCustomers(range) {
  const box = document.getElementById('topCustomersList');
  if(!box) return;
  const custTotals = {};
  Object.keys(transactions).forEach(custId => {
    let total = 0;
    (transactions[custId] || []).forEach(t => {
      if(!isInRange(t.createdAt, range)) return;
      if(t.type === 'debit') total += t.amount || 0;
    });
    if(total > 0) custTotals[custId] = total;
  });
  const sorted = Object.keys(custTotals).map(id => ({ id, total: custTotals[id], customer: customers.find(c => c.id === id) })).filter(x => x.customer).sort((a, b) => b.total - a.total).slice(0, 10);
  document.getElementById('topCustCount').textContent = sorted.length;
  if(sorted.length === 0) { box.innerHTML = `<div class="empty" style="padding:20px;"><span class="ico" style="font-size:32px;">📭</span><p style="font-size:12px;">Is period mein koi udhaar nahi</p></div>`; return; }
  const medals = ['🥇', '🥈', '🥉'];
  box.innerHTML = sorted.map((x, i) => {
    const rank = medals[i] || (i + 1);
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff;border-radius:12px;margin-bottom:6px;box-shadow:var(--shadow-sm);border-left:4px solid #e74c3c;">
      <div style="width:28px;height:28px;background:linear-gradient(135deg,#d4af37,#f5d76e);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#1e3a5f;flex-shrink:0;">${rank}</div>
      <div style="flex:1;min-width:0;"><p style="font-weight:700;font-size:13px;margin:0;">${x.customer.name}</p><p style="font-size:10px;color:var(--text-light);margin:2px 0 0;">📱 ${x.customer.phone} • Baqaya: Rs ${(x.customer.balance||0).toLocaleString()}</p></div>
      <div style="font-weight:800;font-size:14px;color:#e74c3c;flex-shrink:0;">Rs ${x.total.toLocaleString()}</div></div>`;
  }).join('');
}

function summaryReportData(){
  const range=getDateRange(summaryDateFilter, summaryCustomRange);
  let totalDebit=0,totalCredit=0,debitCount=0,creditCount=0;
  const activeCustomers=new Set(), top=[];
  Object.keys(transactions).forEach(custId=>{
    let debit=0;
    (transactions[custId]||[]).forEach(t=>{
      if(!isInRange(t.createdAt,range))return;
      activeCustomers.add(custId);
      if(t.type==='debit'){totalDebit+=t.amount||0;debitCount++;debit+=t.amount||0;}
      else {totalCredit+=t.amount||0;creditCount++;}
    });
    if(debit>0){const c=customers.find(x=>x.id===custId);if(c)top.push({name:c.name,phone:c.phone||'',amount:debit,balance:c.balance||0});}
  });
  top.sort((a,b)=>b.amount-a.amount);
  return {range,totalDebit,totalCredit,debitCount,creditCount,activeCustomers:activeCustomers.size,netBalance:customers.reduce((s,c)=>s+(c.balance||0),0),top:top.slice(0,10)};
}
function buildSummaryReportHTML(){
  const e=(v='')=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  const d=summaryReportData(), rp=window.H360?.receiptProfile?.()||{};
  const style=rp.style||'modern', headerStyle=activeWorkspace()?.branding?.headerStyle||'navy';
  const palettes={navy:['#123d5c','#247b86'],emerald:['#0f4c44','#16866f'],violet:['#342553','#6d4b8a'],amber:['#633e0c','#a36614']};
  const [c1,c2]=palettes[headerStyle]||palettes.navy;
  const maxW=style==='thermal58'?'58mm':style==='thermal80'?'80mm':'820px';
  const topRows=d.top.length?d.top.map((x,i)=>`<tr><td>${i+1}</td><td><b>${e(x.name)}</b><small>${e(x.phone)}</small></td><td>Rs ${Number(x.amount).toLocaleString()}</td><td>Rs ${Number(x.balance).toLocaleString()}</td></tr>`).join(''):'<tr><td colspan="4" class="emptyrow">No customer activity in this period</td></tr>';
  const now=new Date().toLocaleString('en-PK',{dateStyle:'medium',timeStyle:'short'});
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box}body{margin:0;padding:18px;background:#eef3f7;color:#17212b;font-family:Arial,sans-serif}.sheet{max-width:${maxW};margin:auto;background:#fff;border-radius:${style.startsWith('thermal')?'0':'24px'};overflow:hidden;box-shadow:0 14px 40px rgba(20,50,70,.14)}
  .hero{padding:24px;color:#fff;background:linear-gradient(135deg,${c1},${c2});position:relative}.brand{display:flex;align-items:center;gap:14px}.logo{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:rgba(255,255,255,.14);font-size:30px}.hero h1{margin:0;font-size:24px}.hero p{margin:4px 0 0;font-size:11px;opacity:.9}.period{margin-top:16px;display:inline-block;padding:7px 11px;border-radius:999px;background:rgba(255,255,255,.14);font-size:11px;font-weight:700}.body{padding:18px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.metric{border:1px solid #e5ebf0;border-radius:16px;padding:14px}.metric span{display:block;font-size:10px;color:#718096;text-transform:uppercase}.metric b{display:block;font-size:19px;margin-top:5px}.red b{color:#d84b4b}.green b{color:#15966a}.gold b{color:#b87b00}.section{margin-top:18px}.section h3{font-size:13px;margin:0 0 9px;color:#163d5b}table{width:100%;border-collapse:collapse}th,td{padding:9px 6px;border-bottom:1px solid #edf1f5;font-size:10px;text-align:left}th{font-size:9px;color:#718096;text-transform:uppercase}td:nth-child(3),td:nth-child(4),th:nth-child(3),th:nth-child(4){text-align:right}td small{display:block;color:#8996a6;margin-top:2px}.emptyrow{text-align:center!important;color:#8996a6;padding:18px}.foot{text-align:center;padding:14px 18px 18px;color:#7a8796;font-size:9px;border-top:1px solid #edf1f5}.foot b{color:#163d5b}.thermal .grid{grid-template-columns:1fr}.thermal .hero{padding:14px}.thermal .body{padding:10px}.thermal .sheet{box-shadow:none}@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;max-width:100%;border-radius:0}}
  </style></head><body class="${style.startsWith('thermal')?'thermal':''}"><main class="sheet"><section class="hero"><div class="brand"><div class="logo">${e(rp.icon||'📒')}</div><div><h1>${e(rp.name||currentUserData.shopName||'Hisab360')}</h1><p>${e(rp.location||currentUserData.shopLocation||'')}${rp.phone?` · ${e(rp.phone)}`:''}</p></div></div><div class="period">📊 Summary · ${e(d.range.label)}</div></section><section class="body"><div class="grid"><div class="metric red"><span>Total Udhaar</span><b>Rs ${d.totalDebit.toLocaleString()}</b><small>${d.debitCount} transactions</small></div><div class="metric green"><span>Total Wasooli</span><b>Rs ${d.totalCredit.toLocaleString()}</b><small>${d.creditCount} transactions</small></div><div class="metric gold"><span>Net Balance</span><b>Rs ${d.netBalance.toLocaleString()}</b></div><div class="metric"><span>Active Customers</span><b>${d.activeCustomers}</b></div></div><div class="section"><h3>🏆 Top Customers</h3><table><thead><tr><th>#</th><th>Customer</th><th>Udhaar</th><th>Balance</th></tr></thead><tbody>${topRows}</tbody></table></div></section><footer class="foot">${e(rp.footer||'Thank you for your business!')}<br>Generated ${e(now)} · <b>Hisab360</b></footer></main></body></html>`;
}
window.exportSummaryPDF = function(){
  openPdfViewer(buildSummaryReportHTML(),'📊 Premium Summary Report');
  showToast('📄 Premium report ready — PDF / Image / Share available','success');
};
window.shareSummaryText = function(){
  openPdfViewer(buildSummaryReportHTML(),'📊 Premium Summary Report');
  setTimeout(()=>openSharePdfModal(),180);
};
window.openCustomRangeModal = function(target) {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const html = `<h3>🎯 Custom Date Range</h3>
    <div style="display:flex;gap:10px;margin-bottom:14px;">
      <div style="flex:1;"><label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px;">Se (Start)</label><input type="date" id="customStart" value="${weekAgo}" style="width:100%;padding:10px;background:#f8f9fb;border:2px solid transparent;border-radius:10px;font-size:14px;"></div>
      <div style="flex:1;"><label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px;">Tak (End)</label><input type="date" id="customEnd" value="${today}" style="width:100%;padding:10px;background:#f8f9fb;border:2px solid transparent;border-radius:10px;font-size:14px;"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-save btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
      <button class="btn-save" style="flex:2;" onclick="applyCustomRange('${target}')">✅ Apply</button>
    </div>`;
  showModal(html);
};

window.applyCustomRange = function(target) {
  const start = document.getElementById('customStart').value;
  const end = document.getElementById('customEnd').value;
  if(!start || !end) return showToast('Dono dates daalein', 'error');
  if(new Date(start) > new Date(end)) return showToast('Start date end se pehle honi chahiye', 'error');
  if(target === 'cust') { custCustomRange = { start, end }; renderCustomers(); }
  else if(target === 'summary') { summaryCustomRange = { start, end }; renderSummaryPage(); }
  closeModal();
};

// BACKUP
window.downloadBackupJSON = function() {
  const data = { shop: currentUserData, exportedAt: new Date().toISOString(), customers, transactions, stockItems, suppliers, stockMovements, supplierPayments, items };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hisab-kitab-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem('fk_last_backup', new Date().toLocaleString('en-GB'));
  document.getElementById('lastBackupAt').textContent = localStorage.getItem('fk_last_backup');
  showToast('📥 Backup download ho gaya!', 'success');
};

window.downloadBackupCSV = function() {
  const esc = (v) => { if(v === null || v === undefined) return ''; const s = String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
  let csv = '';
  csv += '=== CUSTOMERS ===\nName,Phone,Balance,Shop,Email\n';
  customers.forEach(c => { csv += [esc(c.name), esc(c.phone), esc(c.balance || 0), esc(c.ownerShop || ''), esc(c.ownerEmail || '')].join(',') + '\n'; });
  csv += '\n=== TRANSACTIONS ===\nDate,Customer,Type,Amount,Items,Balance\n';
  Object.keys(transactions).forEach(custId => {
    (transactions[custId] || []).forEach(t => {
      const d = t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString('en-GB') : '';
      csv += [esc(d), esc(t.customerName), esc(t.type), esc(t.amount), esc(t.items || ''), esc(t.balanceAfter || 0)].join(',') + '\n';
    });
  });
  csv += '\n=== STOCK ITEMS ===\nName,Unit,Quantity,Rate,MinQuantity,Value\n';
  stockItems.forEach(s => { csv += [esc(s.name), esc(s.unit), esc(s.quantity || 0), esc(s.rate || 0), esc(s.minQuantity || 0), esc((s.quantity || 0) * (s.rate || 0))].join(',') + '\n'; });
  csv += '\n=== SUPPLIERS ===\nName,Phone,Address,TotalLiya,TotalDiya,Balance\n';
  suppliers.forEach(s => { csv += [esc(s.name), esc(s.phone || ''), esc(s.address || ''), esc(s.totalLiya || 0), esc(s.totalDiya || 0), esc(s.balance || 0)].join(',') + '\n'; });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hisab-kitab-backup-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📊 CSV download ho gaya!', 'success');
};

window.downloadFullPDF = function() {
  const shopName = currentUserData.shopName;
  const shopLoc = currentUserData.shopLocation;
  const shopPhone = currentUserData.shopPhone;
  const now = new Date().toLocaleString('en-GB');
  let custRows = customers.map((c, i) => `<tr><td style="padding:6px;border-bottom:1px solid #eee;font-size:11px;">${i+1}</td><td style="padding:6px;border-bottom:1px solid #eee;font-size:11px;">${c.name}</td><td style="padding:6px;border-bottom:1px solid #eee;font-size:11px;">${c.phone}</td><td style="padding:6px;border-bottom:1px solid #eee;font-size:11px;text-align:right;color:#e74c3c;font-weight:bold;">Rs ${(c.balance||0).toLocaleString()}</td></tr>`).join('');
  const pdfHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Full Report</title>
<style>@page{size:A4;margin:15mm}*{font-family:Arial}body{margin:0;padding:20px;color:#2c3e50}
.header{background:linear-gradient(135deg,#1e3a5f,#2d5a8c);color:#fff;padding:20px;border-radius:12px;margin-bottom:20px}
.header h1{margin:0 0 5px;font-size:24px}.header p{margin:3px 0;font-size:13px;opacity:.9}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{background:#1e3a5f;color:#fff;padding:10px;text-align:left;font-size:12px}
.footer{text-align:center;font-size:11px;color:#7f8c8d;margin-top:30px;padding-top:15px;border-top:1px solid #eee}</style>
</head><body>
<div class="header"><h1>📒 ${shopName}</h1><p>📍 ${shopLoc}</p><p>📞 ${shopPhone}</p></div>
<h2 style="font-size:16px;color:#1e3a5f;">👥 Customers (${customers.length})</h2>
<table><thead><tr><th>#</th><th>Naam</th><th>Phone</th><th style="text-align:right;">Baqaya</th></tr></thead><tbody>
${custRows || '<tr><td colspan="4" style="text-align:center;padding:20px;color:#999;">Koi customer nahi</td></tr>'}
</tbody></table>
<div class="footer"><p>Generated: ${now}</p><p>💻 App by: ${DEVELOPER}</p></div>

</body></html>`;
  openPdfViewer(pdfHTML, '📄 Report');
  showToast('📄 PDF ready', 'success');
};

// ✅ NAYA: Advanced Share Backup — Image generate karke WhatsApp par bhejein
window.shareBackupWhatsApp = async function() {
  const shopName = currentUserData.shopName || 'Hisab360';
  const shopLoc = currentUserData.shopLocation || '';
  const shopPhone = currentUserData.shopPhone || '';
  const netBalance = customers.reduce((s, c) => s + (c.balance || 0), 0);
  const stockValue = stockItems.reduce((s, it) => s + ((it.quantity||0)*(it.rate||0)), 0);
  const supplierDue = suppliers.reduce((s, sp) => s + (sp.balance || 0), 0);
  const now = new Date().toLocaleString('en-GB');
  
  showToast('🖼️ Summary image ban rahi hai...', 'info');

  // ============ CANVAS IMAGE GENERATE ============
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const W = 900;
  const H = 900;
  canvas.width = W;
  canvas.height = H;

  // ===== Background =====
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#f0f2f5');
  bgGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ===== Top Header (Blue Gradient) =====
  const headGrad = ctx.createLinearGradient(0, 0, W, 200);
  headGrad.addColorStop(0, '#1e3a5f');
  headGrad.addColorStop(1, '#2d5a8c');
  ctx.fillStyle = headGrad;
  ctx.fillRect(0, 0, W, 200);

  // Gold decorative circle
  ctx.fillStyle = 'rgba(212,175,55,0.15)';
  ctx.beginPath();
  ctx.arc(W - 80, 60, 120, 0, Math.PI * 2);
  ctx.fill();

  // ===== Yellow Notebook Icon =====
  ctx.fillStyle = '#f5d76e';
  ctx.beginPath();
  if(ctx.roundRect) {
    ctx.roundRect(50, 50, 100, 100, 20);
  } else {
    ctx.rect(50, 50, 100, 100);
  }
  ctx.fill();
  // Book spine
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(50, 50, 20, 100);
  // Binding rings
  ctx.fillStyle = '#1e3a5f';
  [75, 95, 115, 135].forEach(y => {
    ctx.beginPath();
    ctx.arc(60, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  // Small RS on book
  ctx.fillStyle = '#1e3a5f';
  ctx.font = 'bold 40px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Rs', 115, 120);

  // ===== Shop Name =====
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(shopName, 180, 105);
  
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '20px Arial';
  ctx.fillText('📍 ' + shopLoc, 180, 140);
  ctx.fillText('📞 ' + shopPhone, 180, 170);

  // ===== Title Bar =====
  ctx.fillStyle = '#1e3a5f';
  ctx.font = 'bold 26px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('📊 BACKUP SUMMARY', W / 2, 250);

  ctx.fillStyle = '#7f8c8d';
  ctx.font = '18px Arial';
  ctx.fillText('📅 ' + now, W / 2, 285);

  // ===== Big Total Card =====
  const cardGrad = ctx.createLinearGradient(50, 320, W - 50, 460);
  cardGrad.addColorStop(0, '#fff5f5');
  cardGrad.addColorStop(1, '#ffe8e8');
  ctx.fillStyle = cardGrad;
  ctx.beginPath();
  if(ctx.roundRect) {
    ctx.roundRect(50, 320, W - 100, 140, 20);
  } else {
    ctx.rect(50, 320, W - 100, 140);
  }
  ctx.fill();

  // Left red border
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(50, 320, 8, 140);

  ctx.fillStyle = '#7f8c8d';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('TOTAL BAQAYA', 90, 360);

  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('Rs ' + netBalance.toLocaleString(), 90, 425);

  // ===== Stats Grid =====
  const stats = [
    { icon: '👥', label: 'Customers', value: customers.length.toString(), color: '#3498db' },
    { icon: '📦', label: 'Stock Items', value: stockItems.length.toString(), color: '#f39c12' },
    { icon: '📊', label: 'Stock Value', value: 'Rs ' + stockValue.toLocaleString(), color: '#9b59b6' },
    { icon: '🏪', label: 'Suppliers', value: suppliers.length.toString(), color: '#1abc9c' },
    { icon: '💸', label: 'Supplier Due', value: 'Rs ' + supplierDue.toLocaleString(), color: '#e67e22' },
    { icon: '💰', label: 'Net Balance', value: 'Rs ' + netBalance.toLocaleString(), color: '#e74c3c' }
  ];

  const startX = 50;
  const startY = 490;
  const boxW = (W - 130) / 2;
  const boxH = 100;
  const gapX = 30;
  const gapY = 20;

  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (boxW + gapX);
    const y = startY + row * (boxH + gapY);

    // Card background
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if(ctx.roundRect) {
      ctx.roundRect(x, y, boxW, boxH, 14);
    } else {
      ctx.rect(x, y, boxW, boxH);
    }
    ctx.fill();

    // Colored left border
    ctx.fillStyle = s.color;
    ctx.fillRect(x, y, 6, boxH);

    // Icon
    ctx.font = '28px Arial';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2c3e50';
    ctx.fillText(s.icon, x + 20, y + 42);

    // Label
    ctx.fillStyle = '#7f8c8d';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(s.label.toUpperCase(), x + 60, y + 35);

    // Value
    ctx.fillStyle = s.color;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(s.value, x + 20, y + 78);
  });

  // ===== Footer =====
  const footerY = H - 60;
  
  // Footer line
  ctx.strokeStyle = 'rgba(30,58,95,0.15)';
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(50, footerY - 20);
  ctx.lineTo(W - 50, footerY - 20);
  ctx.stroke();
  ctx.setLineDash([]);

  // Credit text
  ctx.fillStyle = '#1e3a5f';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('💻 App by: ' + DEVELOPER, W / 2, footerY + 10);

  ctx.fillStyle = '#95a5a6';
  ctx.font = '13px Arial';
  ctx.fillText('Hisab360 — Smart Shop Manager System', W / 2, footerY + 35);

  // ============ SHARE OR DOWNLOAD ============
  canvas.toBlob(async (blob) => {
    const file = new File([blob], `summary-${new Date().toISOString().split('T')[0]}.png`, { type: 'image/png' });
    
    if(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Hisab360 — Backup Summary',
          text: `${shopName} — Backup Summary\n📅 ${now}`
        });
        showToast('✅ Share ho gaya!', 'success');
      } catch(e) {
        if(e.name !== 'AbortError') {
          dlSummaryImage(blob);
        }
      }
    } else {
      // Fallback: download
      dlSummaryImage(blob);
      // Aur WhatsApp text bhi bhej dein
      const msg = `📊 *${shopName} — Backup Summary*\n📅 ${now}\n\n👥 Customers: ${customers.length}\n💰 Total Baqaya: Rs ${netBalance.toLocaleString()}\n📦 Stock Items: ${stockItems.length}\n📊 Stock Value: Rs ${stockValue.toLocaleString()}\n🏪 Suppliers: ${suppliers.length}\n💸 Supplier Due: Rs ${supplierDue.toLocaleString()}\n\n💻 by ${DEVELOPER}`;
      setTimeout(() => {
        if(confirm('📤 WhatsApp par summary bhejein?')) {
          window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
        }
      }, 500);
    }
  }, 'image/png');
};

function dlSummaryImage(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `summary-${new Date().toISOString().split('T')[0]}.png`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('🖼️ Summary image download ho gayi!', 'success');
}
// SETTINGS
function renderSettings() {
  ensureWorkspaceData(currentUserData); applyWorkspaceMirror(currentUserData);
  document.getElementById('appLockStatus').textContent = isAppLockOn() ? '✅ ON' : '❌ OFF';
  document.getElementById('appLockToggleBtn').textContent = isAppLockOn() ? 'Disable' : 'Enable';
  document.getElementById('settingsEmail').textContent = currentUser?.email || '-';
  document.getElementById('settingsShopName').textContent = currentUserData?.shopName || '-';
  document.getElementById('settingsShopLocation').textContent = '📍 ' + (currentUserData?.shopLocation || '-');
  document.getElementById('settingsShopPhone').textContent = currentUserData?.shopPhone || '-';
  document.getElementById('settingsRole').textContent = isMaster() ? '🔑 Master Admin' : '👤 User';
  document.getElementById('passChangedAt').textContent = localStorage.getItem('fk_pass_changed') || 'Kabhi nahi';
  renderItemsManage();
  const logCard = document.getElementById('activityLogCard');
  if(logCard) { logCard.style.display = 'none'; }
  const lb = document.getElementById('lastBackupAt');
  if(lb) lb.textContent = localStorage.getItem('fk_last_backup') || 'Kabhi nahi';
}

function renderItemsManage() {
  const box = document.getElementById('itemsManageList');
  if(!box) return;
  if(items.length === 0) { box.innerHTML = '<div style="text-align:center;padding:20px;color:#999;font-size:12px;">Koi item nahi. Neeche se add karein.</div>'; return; }
  box.innerHTML = items.map(it => `<div style="display:flex;align-items:center;padding:8px 10px;background:#f8f9fb;border-radius:10px;margin-bottom:6px;gap:10px;">
    <span style="font-size:20px;">${it.emoji}</span><span style="flex:1;font-weight:600;font-size:13px;">${it.name}</span>
    <button onclick="deleteItem('${it.id}')" style="width:28px;height:28px;border-radius:8px;background:rgba(231,76,60,0.1);color:#e74c3c;font-weight:800;cursor:pointer;border:none;">🗑️</button>
  </div>`).join('');
}

window.toggleAppLock = function() {
  const newState = !isAppLockOn();
  setAppLock(newState);
  renderSettings();
  showToast(newState ? '🔒 App Lock ON' : '🔓 App Lock OFF', 'success');
};

window.editShopField = async function(field) {
  const labels = { shopName: 'Shop ka Naam', shopLocation: 'Location', shopPhone: 'Shop Phone' };
  const current = currentUserData[field] || '';
  const val = prompt(`${labels[field]} change karein:`, current);
  if(val === null || val.trim() === '') return;
  const ws=activeWorkspace();
  if(field==='shopName') ws.name=val.trim();
  if(field==='shopLocation') ws.location=val.trim();
  if(field==='shopPhone') ws.phone=val.trim();
  applyWorkspaceMirror(currentUserData);
  await updateDoc(doc(db,"users",currentUser.email), {workspaces:currentUserData.workspaces,activeWorkspaceId:currentUserData.activeWorkspaceId,shopName:currentUserData.shopName,shopLocation:currentUserData.shopLocation,shopPhone:currentUserData.shopPhone});
  localStorage.setItem('fk_user_data_' + currentUser.email, JSON.stringify(currentUserData));
  updateHeader();
  renderSettings();
  showToast('✅ Update ho gaya!', 'success');
};

window.addNewItem = async function() {
  if(!isMaster()) return showToast('Sirf master add kar sakta hai', 'error');
  const emoji = document.getElementById('newItemEmoji').value.trim() || '🛒';
  const name = document.getElementById('newItemName').value.trim();
  if(!name) return showToast('Item ka naam daalein', 'error');
  await addDoc(collection(db, "items"), { emoji, name, category:activeWorkspace().category, createdAt: serverTimestamp() });
  document.getElementById('newItemName').value = '';
  document.getElementById('newItemEmoji').value = '🛒';
  showToast('✅ Item add ho gaya!', 'success');
};

window.deleteItem = async function(id) {
  if(!isMaster()) return showToast('Sirf master delete kar sakta hai', 'error');
  if(!confirm('Yeh item delete karein?')) return;
  await deleteDoc(doc(db, "items", id));
  showToast('🗑️ Delete!', 'success');
};

window.changeAppPin = function() {
  const current = getAppPin();
  if(!current) startSetupScreen('setup-new');
  else startSetupScreen('change-old');
};

window.changeDeletePin = function() {
  const existing = getDeletePin();
  if(existing) {
    const oldPin = prompt('Purana Delete PIN:');
    if(oldPin === null) return;
    if(oldPin !== existing) return showToast('❌ Ghalat purana PIN', 'error');
  }
  const newPin = prompt(existing ? 'Naya 4-digit PIN:' : '4-digit Delete PIN set karein:');
  if(!newPin || !/^\d{4}$/.test(newPin)) return showToast('4 digits chahiye', 'error');
  const confirm2 = prompt('Naya PIN dobara:');
  if(newPin !== confirm2) return showToast('Match nahi', 'error');
  setDeletePin(newPin);
  showToast('✅ Delete PIN change ho gaya!', 'success');
};

window.changeMasterPin = function() {
  if(!isMaster()) return showToast('Sirf master change kar sakta hai', 'error');
  const existing = getMasterPin();
  if(existing) {
    const oldPin = prompt('Purana Master PIN:');
    if(oldPin === null) return;
    if(oldPin !== existing) return showToast('❌ Ghalat purana PIN', 'error');
  }
  const newPin = prompt(existing ? 'Naya 4-digit Master PIN:' : '4-digit Master PIN set karein:');
  if(!newPin || !/^\d{4}$/.test(newPin)) return showToast('4 digits chahiye', 'error');
  const confirm2 = prompt('Naya PIN dobara:');
  if(newPin !== confirm2) return showToast('Match nahi', 'error');
  setMasterPin(newPin);
  showToast('✅ Master PIN change ho gaya!', 'success');
};

window.changeEmail = async function() {
  showToast('🔐 Login email data-owner key hai. Public build mein direct email change disabled hai; backup + verified migration use karein.', 'info');
};

window.changePassword = async function() {
  const user = auth.currentUser;
  if(!user) return;
  const oldPass = prompt('Purana password:');
  if(!oldPass) return;
  const newPass = prompt('Naya strong password (10+ chars, A-Z, a-z, number, special):');
  const pwErr=strongPasswordError(newPass||''); if(pwErr) return showToast(pwErr,'error');
  const confirm2 = prompt('Naya password dobara:');
  if(newPass !== confirm2) return showToast('Match nahi', 'error');
  try {
    const cred = EmailAuthProvider.credential(user.email, oldPass);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPass);
    localStorage.setItem('fk_pass_changed', new Date().toLocaleDateString('en-GB'));
    showToast('✅ Password change ho gaya!', 'success');
    renderSettings();
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
};

function renderActivityLog() {
  const box = document.getElementById('activityLogList');
  if(!box) return;
  const range = getDateRange(logDateFilter);
  let logs = activityLogs.filter(l => isInRange(l.createdAt, range)).slice(0, 100);
  if(logs.length === 0) { box.innerHTML = `<div style="text-align:center;padding:20px;color:#999;font-size:12px;">Is period mein koi activity nahi</div>`; return; }
  const iconMap = { add: '➕', delete: '🗑️', edit: '✏️', default: '📋' };
  box.innerHTML = logs.map(l => {
    const d = formatDate(l.createdAt);
    const type = l.type || 'default';
    const colors = { add: '#25D366', delete: '#e74c3c', edit: '#f39c12', default: '#1e3a5f' };
    return `<div style="background:#fff;border-radius:10px;padding:10px;margin-bottom:6px;border-left:3px solid ${colors[type]};display:flex;gap:10px;box-shadow:var(--shadow-sm);">
      <div style="width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;background:rgba(${type==='add'?'37,211,102':type==='delete'?'231,76,60':type==='edit'?'243,156,18':'30,58,95'},0.15);">${iconMap[type] || iconMap.default}</div>
      <div style="flex:1;min-width:0;"><p style="font-size:12px;font-weight:700;margin:0;">${l.action}${l.details ? ' — ' + l.details : ''}</p><p style="font-size:10px;color:var(--text-light);margin:3px 0 0;">🕐 ${d}</p></div></div>`;
  }).join('');
}

window.setLogFilter = function(filter, el) {
  document.querySelectorAll('#activityLogCard .date-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  logDateFilter = filter;
  renderActivityLog();
};

window.clearOldLogs = async function() {
  if(!isMaster()) return showToast('Sirf master', 'error');
  const pin = prompt('🔑 Master PIN:');
  if(pin === null) return;
  if(!getMasterPin()) return showToast('⚠️ Pehle Settings > Security mein Master PIN set karein', 'error');
  if(pin !== getMasterPin()) return showToast('❌ Ghalat PIN', 'error');
  if(!confirm('30 din se purane logs delete karein?')) return;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  let deleted = 0;
  for(const log of activityLogs) {
    const d = log.createdAt?.toDate ? log.createdAt.toDate() : null;
    if(d && d < cutoff) { await deleteDoc(doc(db, "activity_logs", log.id)); deleted++; }
  }
  showToast(`🗑️ ${deleted} logs delete`, 'success');
};

function buildKeypad(containerId, onDigit, onDelete) {
  const box = document.getElementById(containerId);
  if(!box) return;
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  box.innerHTML = keys.map(k => {
    if(k === '') return '<button class="pin-key empty"></button>';
    if(k === '⌫') return `<button class="pin-key delete" data-k="del">⌫</button>`;
    return `<button class="pin-key" data-k="${k}">${k}</button>`;
  }).join('');
  box.querySelectorAll('.pin-key').forEach(btn => {
    btn.onclick = () => {
      const k = btn.dataset.k;
      if(k === 'del') onDelete();
      else if(k) onDigit(k);
    };
  });
}

function updateDots(containerId, length) {
  document.getElementById(containerId).querySelectorAll('.pin-dot').forEach((d, i) => { d.classList.toggle('filled', i < length); });
}

function showPinScreen(screenId) {
  document.querySelectorAll('.pin-screen').forEach(s => s.classList.remove('show'));
  document.getElementById(screenId).classList.add('show');
}

function hidePinScreens() {
  document.querySelectorAll('.pin-screen').forEach(s => s.classList.remove('show'));
}

function startLockScreen() {
  pinBuffer = ''; pinMode = 'lock';
  updateDots('lockDots', 0);
  document.getElementById('lockErr').classList.remove('show');
  showPinScreen('pinLockScreen');
}

function startSetupScreen(mode) {
  pinBuffer = ''; pinMode = mode;
  if(mode === 'setup-new' || mode === 'change-new' || mode === 'forgot-new') firstPinEntry = '';
  updateDots('setupDots', 0);
  const icon = document.getElementById('setupIcon');
  const title = document.getElementById('setupTitle');
  const sub = document.getElementById('setupSub');
  const err = document.getElementById('setupErr');
  const hint = document.getElementById('setupHint');
  err.classList.remove('show'); err.textContent = ''; hint.textContent = '';
  const map = {
    'setup-new': ['🔐','PIN Set Karein','4-digit PIN banayein (Step 1/2)','Phir dobara daal kar confirm'],
    'setup-confirm': ['✓','Confirm PIN','Wahi 4-digit PIN dobara daalein',''],
    'change-old': ['🔑','Purana PIN','Purana 4-digit PIN daalein',''],
    'change-new': ['✨','Naya PIN','Naya 4-digit PIN banayein',''],
    'change-confirm': ['✓','Confirm','Naya PIN dobara daalein',''],
    'forgot-new': ['🔓','Naya PIN','Naya 4-digit PIN banayein',''],
    'forgot-confirm': ['✓','Confirm','Naya PIN dobara daalein','']
  };
  if(map[mode]) { icon.textContent = map[mode][0]; title.textContent = map[mode][1]; sub.textContent = map[mode][2]; hint.textContent = map[mode][3]; }
  showPinScreen('pinSetupScreen');
}

function handleDigit(k, mode) {
  if(pinBuffer.length >= 4) return;
  pinBuffer += k;
  updateDots(mode === 'lock' ? 'lockDots' : 'setupDots', pinBuffer.length);
  if(pinBuffer.length === 4) {
    setTimeout(() => {
      const actualMode = (mode === 'lock') ? 'lock' : pinMode;
      processPin(actualMode);
    }, 150);
  }
}

function handleDelete(mode) {
  if(pinBuffer.length === 0) return;
  pinBuffer = pinBuffer.slice(0, -1);
  updateDots(mode === 'lock' ? 'lockDots' : 'setupDots', pinBuffer.length);
}

function processPin(mode) {
  const pin = pinBuffer;
  pinBuffer = '';
  if(mode === 'lock') {
    if(pin === getAppPin()) {
      hidePinScreens();
      document.getElementById('mainApp').style.display = 'block';
      showToast('✅ Welcome!', 'success');
    } else {
      const err = document.getElementById('lockErr');
      err.textContent = '❌ Ghalat PIN';
      err.classList.add('show');
      document.querySelectorAll('#lockDots .pin-dot').forEach(d => d.classList.add('error'));
      setTimeout(() => {
        document.querySelectorAll('#lockDots .pin-dot').forEach(d => { d.classList.remove('filled'); d.classList.remove('error'); });
      }, 600);
    }
    return;
  }
  if(mode === 'setup-new') { firstPinEntry = pin; showToast('✅ Step 1 done', 'success'); startSetupScreen('setup-confirm'); return; }
  if(mode === 'setup-confirm') {
    if(pin === firstPinEntry) { setAppPin(pin); hidePinScreens(); document.getElementById('mainApp').style.display = 'block'; showToast('✅ PIN set!', 'success'); }
    else { showSetupError('❌ PIN match nahi hua'); firstPinEntry = ''; setTimeout(() => startSetupScreen('setup-new'), 1200); }
    return;
  }
  if(mode === 'change-old') {
    if(pin === getAppPin()) { firstPinEntry = ''; startSetupScreen('change-new'); }
    else { showSetupError('❌ Ghalat purana PIN'); setTimeout(() => startSetupScreen('change-old'), 1200); }
    return;
  }
  if(mode === 'change-new') { firstPinEntry = pin; startSetupScreen('change-confirm'); return; }
  if(mode === 'change-confirm') {
    if(pin === firstPinEntry) { setAppPin(pin); hidePinScreens(); showToast('✅ App PIN change!', 'success'); }
    else { showSetupError('❌ Match nahi'); firstPinEntry = ''; setTimeout(() => startSetupScreen('change-new'), 1200); }
    return;
  }
  if(mode === 'forgot-new') { firstPinEntry = pin; startSetupScreen('forgot-confirm'); return; }
  if(mode === 'forgot-confirm') {
    if(pin === firstPinEntry) { setAppPin(pin); hidePinScreens(); document.getElementById('mainApp').style.display = 'block'; showToast('✅ Naya PIN set!', 'success'); }
    else { showSetupError('❌ Match nahi'); firstPinEntry = ''; setTimeout(() => startSetupScreen('forgot-new'), 1200); }
    return;
  }
}

function showSetupError(msg) {
  const err = document.getElementById('setupErr');
  err.textContent = msg;
  err.classList.add('show');
}

window.forgotPin = async function() {
  const email = localStorage.getItem('fk_email') || currentUser?.email;
  if(!email) return showToast('Email nahi mila', 'error');
  if(!confirm(`PIN reset karne ke liye ${email} par link bhejenge?`)) return;
  try { await sendPasswordResetEmail(auth, email); } catch(e) {}
  startSetupScreen('forgot-new');
};

buildKeypad('lockKeypad', (k) => handleDigit(k, 'lock'), () => handleDelete('lock'));
buildKeypad('setupKeypad', (k) => handleDigit(k, 'setup'), () => handleDelete('setup'));

// EDIT CUSTOMER
window.editCustomerNotes = async function() {
  if(!currentCustomerId) return;
  const c = customers.find(x => x.id === currentCustomerId);
  if(!c) return;
  const current = c.notes || '';
  const newNotes = prompt('Notes edit karein:', current);
  if(newNotes === null) return;
  try {
    await updateDoc(doc(db, "customers", currentCustomerId), { notes: newNotes.trim(), updatedAt: serverTimestamp() });
    showToast('✅ Notes update ho gaye!', 'success');
  } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
};

window.openEditCustomer = function() {
  if(!currentCustomerId) return;
  const c = customers.find(x => x.id === currentCustomerId);
  if(!c) return;
  const tags = c.tags || [];
  const html = `<h3>✏️ Edit Customer</h3>
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px;background:#f8f9fb;border-radius:14px;border:2px dashed var(--border);margin-bottom:14px;">
      <div id="editPhotoPreview" style="width:80px;height:80px;border-radius:18px;background:linear-gradient(135deg,#1e3a5f,#2d5a8c);display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px;font-weight:800;">
        ${c.photo ? `<img src="${c.photo}" style="width:100%;height:100%;border-radius:18px;object-fit:cover;">` : (c.name||'?').charAt(0).toUpperCase()}
      </div>
      <div style="display:flex;gap:8px;">
        <label style="padding:8px 12px;background:linear-gradient(135deg,#0b2440,#174f7a);color:#fff;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;">📷 Camera<input type="file" accept="image/*" capture="environment" onchange="handleEditPhotoUpload(this)" style="display:none;"></label>
        <label style="padding:8px 12px;background:linear-gradient(135deg,#b8871b,#d7aa3d);color:#fff;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;">🖼️ Gallery<input type="file" accept="image/*" onchange="handleEditPhotoUpload(this)" style="display:none;"></label>
        ${c.photo ? `<button onclick="removeEditPhoto()" style="padding:8px 14px;background:#95a5a6;color:#fff;border:none;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">🗑️ Remove</button>` : ''}
      </div>
      <div style="font-size:10px;color:#7f8c8d;">Photo 200KB se chhoti rakhein</div>
    </div>
    <div class="form-field"><label>Naam *</label><input type="text" id="editCName" value="${c.name}"></div>
    <div class="form-field"><label>Phone Number *</label><input type="tel" id="editCPhone" value="${c.phone}"></div>
    <div class="form-field"><label>Category Tags</label>
      <div class="tags-picker" id="editCustTags">
        <div class="tag-option vip ${tags.includes('vip') ? 'selected' : ''}" data-tag="vip" onclick="toggleEditTag(this)">⭐ VIP</div>
        <div class="tag-option regular ${tags.includes('regular') ? 'selected' : ''}" data-tag="regular" onclick="toggleEditTag(this)">👤 Regular</div>
        <div class="tag-option risky ${tags.includes('risky') ? 'selected' : ''}" data-tag="risky" onclick="toggleEditTag(this)">⚠️ Risky</div>
        <div class="tag-option family ${tags.includes('family') ? 'selected' : ''}" data-tag="family" onclick="toggleEditTag(this)">👨‍👩‍👧 Family</div>
        <div class="tag-option new ${tags.includes('new') ? 'selected' : ''}" data-tag="new" onclick="toggleEditTag(this)">🆕 New</div>
        <div class="tag-option business ${tags.includes('business') ? 'selected' : ''}" data-tag="business" onclick="toggleEditTag(this)">💼 Business</div>
      </div>
    </div>
    <div class="form-field"><label>Notes</label><textarea id="editCNotes" rows="2">${c.notes || ''}</textarea></div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-save btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
      <button class="btn-save" style="flex:2;" onclick="saveEditedCustomer()">✅ Save</button>
    </div>`;
  showModal(html);
  setTimeout(() => {
    document.querySelectorAll('#editCustTags .tag-option.selected').forEach(el => {
      const tag = el.dataset.tag;
      const colors = { vip: ['#d4af37', '#f5d76e'], regular: ['#3498db', '#5dade2'], risky: ['#e74c3c', '#ec7063'], family: ['#9b59b6', '#bb8fce'], new: ['#25D366', '#58d68d'], business: ['#f39c12', '#f8c471'] };
      if(colors[tag]) { el.style.background = `linear-gradient(135deg, ${colors[tag][0]}, ${colors[tag][1]})`; el.style.color = '#fff'; el.style.borderColor = colors[tag][0]; }
    });
  }, 50);
};

window.toggleEditTag = function(el) {
  el.classList.toggle('selected');
  const tag = el.dataset.tag;
  const colors = { vip: ['#d4af37', '#f5d76e'], regular: ['#3498db', '#5dade2'], risky: ['#e74c3c', '#ec7063'], family: ['#9b59b6', '#bb8fce'], new: ['#25D366', '#58d68d'], business: ['#f39c12', '#f8c471'] };
  if(el.classList.contains('selected')) { el.style.background = `linear-gradient(135deg, ${colors[tag][0]}, ${colors[tag][1]})`; el.style.color = '#fff'; el.style.borderColor = colors[tag][0]; }
  else { el.style.background = '#f0f2f5'; el.style.color = 'var(--text-light)'; el.style.borderColor = 'transparent'; }
};

let editPhotoData = null;

window.handleEditPhotoUpload = function(input) {
  const file = input.files[0];
  if(!file) return;
  if(file.size > 200 * 1024) return showToast('Photo 200KB se chhoti honi chahiye', 'error');
  const reader = new FileReader();
  reader.onload = function(e) {
    editPhotoData = e.target.result;
    const preview = document.getElementById('editPhotoPreview');
    preview.innerHTML = `<img src="${editPhotoData}" style="width:100%;height:100%;border-radius:18px;object-fit:cover;">`;
    showToast('✅ Photo select!', 'success');
  };
  reader.readAsDataURL(file);
};

window.removeEditPhoto = function() {
  editPhotoData = 'REMOVE';
  const preview = document.getElementById('editPhotoPreview');
  const c = customers.find(x => x.id === currentCustomerId);
  preview.textContent = (c?.name || '?').charAt(0).toUpperCase();
  showToast('🗑️ Photo remove hogi', 'success');
};

window.saveEditedCustomer = async function() {
  if(!currentCustomerId) return;
  const name = document.getElementById('editCName').value.trim();
  const phone = document.getElementById('editCPhone').value.trim();
  const notes = document.getElementById('editCNotes').value.trim();
  if(!name || !phone) return showToast('Naam aur phone zaroori hai', 'error');
  if(!/^92\d{10}$/.test(phone)) return showToast('Phone 92XXXXXXXXXX format mein', 'error');
  const tags = [];
  document.querySelectorAll('#editCustTags .tag-option.selected').forEach(t => { tags.push(t.dataset.tag); });
  const updateData = { name, phone, notes, tags, updatedAt: serverTimestamp() };
  if(editPhotoData === 'REMOVE') updateData.photo = '';
  else if(editPhotoData) updateData.photo = editPhotoData;
  try {
    await updateDoc(doc(db, "customers", currentCustomerId), updateData);
    editPhotoData = null;
    closeModal();
    showToast('✅ Customer update!', 'success');
  } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
};

window.printReceipt = function() {
  if(!currentCustomerId) return;
  const c = customers.find(x => x.id === currentCustomerId);
  if(!c) return;
  const txns = transactions[c.id] || [];
  if(txns.length === 0) return showToast('Koi transaction nahi hai', 'error');
  const latest = txns[0];
  const rp=window.H360?.receiptProfile?.()||{};
  const shopName = rp.name || currentUserData.shopName || 'Hisab360';
  const shopLoc = rp.location || currentUserData.shopLocation || '';
  const shopPhone = rp.phone || currentUserData.shopPhone || '';
  const receiptStyle=rp.style||'modern', receiptIcon=rp.icon||'📒', receiptFooter=rp.footer||'Shukriya!';
  const thermal=receiptStyle==='thermal58'||receiptStyle==='thermal80';
  const pageSize=receiptStyle==='thermal58'?'58mm auto':receiptStyle==='thermal80'?'80mm auto':'A4';
  const bodyWidth=receiptStyle==='thermal58'?'52mm':receiptStyle==='thermal80'?'74mm':'176mm';
  const now = new Date();
  const dateText=now.toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'});
  const timeText=now.toLocaleTimeString('en-PK',{hour:'2-digit',minute:'2-digit'});
  const typeLabel = latest.type === 'debit' ? 'UDHAAR / DEBIT' : 'WASOOLI / PAYMENT';
  const color = latest.type === 'debit' ? '#c93b3b' : '#12845b';
  const sign = latest.type === 'debit' ? '+' : '−';
  const currentBal=Number(c.balance||0), amount=Number(latest.amount||0);
  const previousBal=latest.type==='debit' ? currentBal-amount : currentBal+amount;
  const receiptNo=('H360-'+String(latest.id||Date.now()).replace(/[^a-zA-Z0-9]/g,'').slice(-10)).toUpperCase();
  const tags=(c.tags||[]).join(' · ');
  const detail=latest.items||latest.note||latest.notes||'Khata transaction';
  const status=currentBal===0?'PAID / CLEAR':currentBal>0?'BALANCE DUE':'ADVANCE';
  const receiptHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${receiptNo}</title>
<style>
@page{size:${pageSize};margin:${thermal?'3mm':'7mm'}}
*{box-sizing:border-box;font-family:${receiptStyle==='classic'?"'Courier New',monospace":"Inter,Arial,sans-serif"}}
body{margin:0 auto;padding:${thermal?'5px':'14px'};color:#132235;max-width:${bodyWidth};background:#fff}
.receipt{overflow:hidden;border:${thermal?'0':'1px solid #dbe4ec'};border-radius:${thermal?'0':'22px'};background:#fff;box-shadow:${thermal?'none':'0 14px 40px rgba(14,38,64,.10)'}}
.hero{padding:${thermal?'10px 4px':'22px'};text-align:center;background:${thermal?'#fff':'linear-gradient(135deg,#0b2440,#153f66)'};color:${thermal?'#111':'#fff'};position:relative}
.hero:after{content:"";display:${thermal?'none':'block'};height:4px;background:linear-gradient(90deg,#b8871b,#f1d37a,#b8871b);position:absolute;left:0;right:0;bottom:0}
.brand{font-size:${thermal?'17px':'24px'};font-weight:900;letter-spacing:.2px}.meta{font-size:10px;opacity:.82;margin-top:5px;line-height:1.55}
.badge{display:inline-block;margin-top:10px;padding:5px 11px;border-radius:999px;background:${thermal?'#eee':'rgba(255,255,255,.12)'};font-size:9px;font-weight:900;letter-spacing:1px}
.body{padding:${thermal?'7px 2px':'18px'}}
.receipt-id{display:flex;justify-content:space-between;gap:8px;font-size:9px;color:#64748b;border-bottom:1px dashed #cbd5e1;padding-bottom:10px}
.customer{margin:12px 0;padding:${thermal?'7px 2px':'12px'};background:${thermal?'#fff':'#f6f9fc'};border-radius:12px}
.customer b{font-size:14px}.small{font-size:9px;color:#64748b;margin-top:3px}
.amount-card{text-align:center;padding:14px 8px;border:1px solid #e4eaf0;border-radius:14px;margin:12px 0}
.amount-title{font-size:9px;font-weight:900;letter-spacing:1px;color:#64748b}.amount{font-size:${thermal?'22px':'30px'};font-weight:950;color:${color};margin:4px 0}
.status{font-size:9px;font-weight:900;color:${color}}
.row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:10px;border-bottom:1px solid #edf1f5}.row:last-child{border:0}.label{color:#64748b}.value{text-align:right;font-weight:750}
.balance{margin-top:12px;padding:12px;border-radius:13px;background:${thermal?'#f5f5f5':'#fff8e7'};border:1px solid ${thermal?'#ddd':'#ead29a'}}
.balance .total{font-size:${thermal?'16px':'20px'};font-weight:950;color:#0b2440}
.footer{text-align:center;padding:12px 6px 4px;font-size:9px;color:#718096;line-height:1.6}.h360{font-weight:900;color:#0b2440}
@media print{body{padding:0}.receipt{box-shadow:none}}
</style></head><body><main class="receipt">
<section class="hero"><div class="brand">${receiptIcon} ${shopName}</div><div class="meta">${shopLoc?`📍 ${shopLoc}<br>`:''}${shopPhone?`☎ ${shopPhone}`:''}</div><div class="badge">OFFICIAL KHATA RECEIPT</div></section>
<section class="body">
<div class="receipt-id"><span>Receipt # ${receiptNo}</span><span>${dateText} · ${timeText}</span></div>
<div class="customer"><b>${c.name}</b><div class="small">📱 ${c.phone}${tags?` &nbsp; · &nbsp; ${tags}`:''}</div></div>
<div class="amount-card"><div class="amount-title">${typeLabel}</div><div class="amount">${sign} Rs ${amount.toLocaleString()}</div><div class="status">${status}</div></div>
<div class="row"><span class="label">Details</span><span class="value">${detail}</span></div>
<div class="row"><span class="label">Previous Balance</span><span class="value">Rs ${previousBal.toLocaleString()}</span></div>
<div class="row"><span class="label">Transaction</span><span class="value">${sign} Rs ${amount.toLocaleString()}</span></div>
<div class="balance"><div class="row"><span class="label">CURRENT BALANCE</span><span class="total">Rs ${currentBal.toLocaleString()}</span></div></div>
<div class="footer">${receiptFooter}<br><span class="h360">Hisab360</span> · Secure Digital Ledger<br>Yasir Khan</div>
</section></main></body></html>`;
  openPdfViewer(receiptHTML, `🧾 ${receiptNo}`);
  showToast('🧾 Premium receipt ready — Image/PDF share karein', 'success');
};

window.openFamilyLinkPicker = function() {
  if(!currentCustomerId) return;
  const c = customers.find(x => x.id === currentCustomerId);
  if(!c) return;
  const existing = c.familyLinks || [];
  const others = customers.filter(x => x.id !== currentCustomerId);
  if(others.length === 0) return showToast('Koi doosra customer nahi hai', 'error');
  const html = `<h3>👨‍👩‍👧 Family Link — ${c.name}</h3>
    <div style="max-height:400px;overflow-y:auto;">
      ${others.map(o => {
        const isLinked = existing.includes(o.id);
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:#fff;border-radius:12px;margin-bottom:6px;box-shadow:var(--shadow-sm);cursor:pointer;border-left:4px solid ${isLinked ? '#25D366' : '#1e3a5f'};" onclick="linkFamily('${o.id}')">
          <div style="width:38px;height:38px;background:linear-gradient(135deg,#1e3a5f,#2d5a8c);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;">${(o.name||'?').charAt(0).toUpperCase()}</div>
          <div style="flex:1;min-width:0;"><p style="font-weight:700;font-size:13px;margin:0;">${o.name}</p><p style="font-size:11px;color:var(--text-light);margin:2px 0 0;">📱 ${o.phone}</p></div>
          <div style="font-size:18px;">${isLinked ? '✅' : '➕'}</div></div>`;
      }).join('')}
    </div>
    <button class="btn-save" style="margin-top:14px;" onclick="closeModal()">❌ Close</button>`;
  showModal(html);
};

window.linkFamily = async function(otherId) {
  if(!currentCustomerId) return;
  const c = customers.find(x => x.id === currentCustomerId);
  if(!c) return;
  let links = c.familyLinks || [];
  if(links.includes(otherId)) links = links.filter(x => x !== otherId);
  else links.push(otherId);
  try {
    await updateDoc(doc(db, "customers", currentCustomerId), { familyLinks: links, updatedAt: serverTimestamp() });
    closeModal();
    showToast(links.includes(otherId) ? '✅ Family link ho gaya!' : '❌ Link hataya', 'success');
  } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
};

window.switchToFamily = function(fid) {
  closeDetail();
  setTimeout(() => openDetail(fid), 300);
};

window.remindCurrent = function() {
  if(!currentCustomerId) return;
  const c = customers.find(x => x.id === currentCustomerId);
  if(!c) return;
  const bal = c.balance || 0;
  if(bal <= 0) return showToast('Is customer ka koi baqaya nahi', 'error');
  const shopName = currentUserData.shopName;
  const shopLoc = currentUserData.shopLocation;
  const shopPhone = currentUserData.shopPhone;
  const msg = `Assalam-o-Alaikum ${c.name} Bhai! 🌸\n\nUmeed hai aap khairiyat se honge. Aap ka ${shopName} (${shopLoc}) mein Rs ${bal.toLocaleString()} ka hisaab baqi hai.\n\nJab bhi waqt mile, tashreef laayein — chai to pilayenge hi! ☕\n\nAllah aap ko khush rakhe. 🤲\n— ${shopName}, ${shopLoc}\n📞 ${shopPhone}`;
  const enc = encodeURIComponent(msg);
  const waNumber = c.whatsapp || c.phone;
  const choice = confirm(`Reminder bhejne ka tareeqa:\n\nOK = WhatsApp\nCancel = SMS`);
  if(choice) window.open(`https://wa.me/${waNumber}?text=${enc}`, '_blank');
  else window.location.href = `sms:${c.phone}?body=${enc}`;
};

window.callCurrent = function() {
  if(!currentCustomerId) return;
  const c = customers.find(x => x.id === currentCustomerId);
  if(c) window.location.href = `tel:+${c.phone}`;
};

window.exportPDFCurrent = function() {
  if(!currentCustomerId) return;
  const c = customers.find(x => x.id === currentCustomerId);
  if(!c) return;
  const txns = transactions[c.id] || [];
  const now = new Date().toLocaleString('en-GB');
  const shopName = currentUserData.shopName;
  const shopLoc = currentUserData.shopLocation;
  const shopPhone = currentUserData.shopPhone;
  let rows = '';
  if(txns.length === 0) rows = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#999;">Koi transaction nahi</td></tr>';
  else {
    rows = txns.map(t => {
      const d = formatDate(t.createdAt);
      const typeLabel = t.type === 'debit' ? 'Udhaar' : 'Wasooli';
      const sign = t.type === 'debit' ? '+' : '−';
      const color = t.type === 'debit' ? '#e74c3c' : '#25D366';
      return `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-size:11px;">${d}</td><td style="padding:8px;border-bottom:1px solid #eee;font-size:11px;color:${color};font-weight:bold;">${typeLabel}</td><td style="padding:8px;border-bottom:1px solid #eee;font-size:11px;">${t.items || '—'}</td><td style="padding:8px;border-bottom:1px solid #eee;font-size:11px;color:${color};font-weight:bold;text-align:right;">${sign} Rs ${t.amount.toLocaleString()}</td><td style="padding:8px;border-bottom:1px solid #eee;font-size:11px;text-align:right;">Rs ${(t.balanceAfter||0).toLocaleString()}</td></tr>`;
    }).join('');
  }
  const pdfHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${c.name}</title>
<style>@page{size:A4;margin:15mm}*{font-family:Arial}body{margin:0;padding:20px;color:#2c3e50}
.header{background:linear-gradient(135deg,#1e3a5f,#2d5a8c);color:#fff;padding:20px;border-radius:12px;margin-bottom:20px}
.header h1{margin:0 0 5px;font-size:24px}.header p{margin:3px 0;font-size:13px;opacity:.9}
.cust-box{background:#f8f9fb;padding:15px;border-radius:10px;margin-bottom:20px;border-left:4px solid #d4af37}
.cust-box h2{margin:0 0 8px;color:#1e3a5f;font-size:18px}
.balance-box{background:#fff5f5;padding:15px;border-radius:10px;margin-bottom:20px;border-left:4px solid #e74c3c;display:flex;justify-content:space-between}
.balance-box .amt{font-size:28px;font-weight:800;color:#e74c3c}
table{width:100%;border-collapse:collapse}th{background:#1e3a5f;color:#fff;padding:10px;text-align:left;font-size:12px}
th:last-child,td:last-child{text-align:right}.footer{text-align:center;font-size:11px;color:#7f8c8d;margin-top:30px;padding-top:15px;border-top:1px solid #eee}</style>
</head><body>
<div class="header"><h1>📒 ${shopName}</h1><p>📍 ${shopLoc}</p><p>📞 ${shopPhone}</p></div>
<div class="cust-box"><h2>${c.name}</h2><p>📱 ${c.phone}</p></div>
<div class="balance-box"><span>Total Baqaya</span><span class="amt">Rs ${(c.balance||0).toLocaleString()}</span></div>
<table><thead><tr><th>Date</th><th>Type</th><th>Items</th><th>Amount</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer"><p>Generated: ${now}</p><p>Shukriya! — ${shopName}</p><p style="margin-top:8px;color:#1e3a5f;font-weight:700;">💻 App by: ${DEVELOPER}</p></div>
</body></html>`;
  openPdfViewer(pdfHTML, '📄 Report');
  showToast('📄 PDF ready', 'success');
};

window.shareKhataCurrent = function() {
  if(!currentCustomerId) return;
  exportPDFCurrent();
  setTimeout(()=>openSharePdfModal(),180);
};

window.shareImageCurrent = function(){window.exportPDFCurrent();window.openSharePdfModal();};

function dlImg(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${name}-khata.png`; a.click();
  URL.revokeObjectURL(url);
  showToast('🖼️ Image download', 'success');
}

window.delCurrent = async function() {
  if(!currentCustomerId) return;
  const c = customers.find(x => x.id === currentCustomerId);
  if(!c) return;
  const html = `<h3>🔐 Delete Confirm</h3>
    <div style="font-size:13px;color:#7f8c8d;margin-bottom:14px;"><strong style="color:#2c3e50;font-size:15px;">${c.name}</strong> ko delete karne ke liye <strong>4-digit Delete PIN</strong> daalein.</div>
    <div class="form-field"><input type="password" id="deletePinInput" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="• • • •" style="text-align:center;font-size:24px;letter-spacing:16px;font-weight:700;"></div>
    <div id="delPinErr" style="color:var(--red);font-size:13px;text-align:center;margin-top:10px;padding:8px;border-radius:8px;background:rgba(231,76,60,0.08);display:none;"></div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-save btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
      <button class="btn-save" style="flex:2;background:linear-gradient(135deg,#e74c3c,#c0392b);" onclick="confirmDelete('${c.id}')">🗑️ Delete Karein</button>
    </div>`;
  showModal(html);
  setTimeout(() => document.getElementById('deletePinInput').focus(), 200);
};

window.confirmDelete = async function(custId) {
  const pin = document.getElementById('deletePinInput').value;
  const err = document.getElementById('delPinErr');
  err.style.display = 'none';
  if(!getDeletePin()) {
    err.textContent = '⚠️ Settings > Security mein Delete PIN pehle set karein';
    err.style.display = 'block';
    return;
  }
  if(pin !== getDeletePin()) {
    err.textContent = '❌ Ghalat PIN';
    err.style.display = 'block';
    setTimeout(() => { document.getElementById('deletePinInput').value = ''; }, 600);
    return;
  }
  const c = customers.find(x => x.id === custId);
  if(!c) return;
  await updateDoc(doc(db, "customers", custId), { deletedAt: serverTimestamp(), deletedAtMs: Date.now(), deletedBy: currentUser.email });
  window.KMFeatures?.audit?.('customer_moved_to_recycle_bin', { customerId: custId, name: c.name });
  closeModal();
  closeDetail();
  showToast('🗑️ Recycle Bin mein move ho gaya', 'success');
};

function startActivityLogListener() {
  return;
  listenFirestore('activity_logs', query(collection(db, "activity_logs"), orderBy("createdAt", "desc"), limit(300)), snap => {
    activityLogs = snap.docs.map(d => ({id: d.id, ...d.data()}));
    renderActivityLog();
  });
}

setInterval(() => {
  if(isMaster() && currentUser && !window._logStarted) {
    window._logStarted = true;
    startActivityLogListener();
  }
}, 2000);

// Native Android back button (Capacitor App plugin).
try {
  CapacitorApp.addListener('backButton', () => {
    handleBackPress();
  });
} catch(e) { console.warn('Native back listener:', e.message); }

// FINAL INIT
initNetworkBadge();
console.log('✅ Hisab360 loaded — ' + DEVELOPER);
console.log('Version: ' + APP_VERSION);

// v6 bridge helpers
window.H360App={saveUserProfile:async()=>{if(!currentUser||!currentUserData)return;applyWorkspaceMirror(currentUserData);await updateDoc(doc(db,"users",currentUser.email),{workspaces:currentUserData.workspaces,activeWorkspaceId:currentUserData.activeWorkspaceId,shopName:currentUserData.shopName,shopLocation:currentUserData.shopLocation,shopPhone:currentUserData.shopPhone,category:currentUserData.category,language:currentUserData.language,branding:currentUserData.branding});localStorage.setItem('fk_user_data_'+currentUser.email,JSON.stringify(currentUserData));},renderSettings:()=>renderSettings(),updateHeader:()=>updateHeader(),restartListeners:()=>{clearFirestoreListeners();customers=[];transactions={};stockItems=[];suppliers=[];stockMovements=[];supplierPayments=[];startListeners();},strongPasswordError};

window.H360AuthAPI={sendVerification:()=>sendEmailVerification(auth.currentUser),refreshVerification:async()=>{if(!auth.currentUser)throw new Error('Pehle login karein');await reload(auth.currentUser);await getIdToken(auth.currentUser,true);if(auth.currentUser.emailVerified)location.reload();return auth.currentUser.emailVerified;}};

window.H360App.saveWorkspaceSelection=async id=>{
  if(!currentUser||!currentUserData)return;
  localStorage.setItem('fk_user_data_'+currentUser.email,JSON.stringify(currentUserData));
  await updateDoc(doc(db,'users',currentUser.email),{activeWorkspaceId:id});
};

window.saveReportFile=async function(format){
 if(exportBusy)return;exportBusy=true;closeModal();showToast('File tayyar ho rahi hai…','info');
 try{
  const canvas=await renderCurrentReportCanvas(),name=(_currentPdfTitle||'Hisab360_Report').replace(/[^a-zA-Z0-9_-]/g,'_');let blob;
  if(format==='pdf'){
   const pdf=new jsPDF({unit:'mm',format:'a4',compress:true}),width=194,height=281,slicePixels=Math.floor(height*canvas.width/width);
   for(let y=0,page=0;y<canvas.height;y+=slicePixels,page++){const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=Math.min(slicePixels,canvas.height-y);slice.getContext('2d').drawImage(canvas,0,y,canvas.width,slice.height,0,0,canvas.width,slice.height);if(page)pdf.addPage();pdf.addImage(slice.toDataURL('image/jpeg',.92),'JPEG',8,8,width,slice.height*width/canvas.width);}
   blob=pdf.output('blob');
  }else blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image render fail')),'image/png'));
  const fileName=name+'_'+Date.now()+'.'+format;
  if(Capacitor.isNativePlatform()){
   const permission=await Filesystem.checkPermissions();if(permission.publicStorage!=='granted')await Filesystem.requestPermissions();
   const result=await Filesystem.writeFile({path:'Hisab360/'+fileName,data:await blobToBase64(blob),directory:Directory.Documents,recursive:true});
   showModal('<div class="km-form"><h3>File Saved</h3><p>Hisab360 folder mein '+fileName+' save ho gayi.</p><button class="km-btn ghost" onclick="closeModal()">Done</button></div>');
  }else{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('File saved','success');}
 }catch(e){showToast('File save nahi hui: '+e.message,'error');}finally{exportBusy=false;}
};
