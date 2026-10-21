/* Hisab360 v7 Premium Polish layer */
const C=()=>window.KMCore;
const Core=()=>window.H360Core;
const App=()=>window.H360App;
const $7=id=>document.getElementById(id);
const esc7=(v='')=>String(v).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const DAY=86400000;

function activeWorkspaces(){
  const d=C()?.userData; return (d?.workspaces||[]).filter(w=>!w.deletedAtMs);
}
function deletedWorkspaces(){
  const d=C()?.userData; return (d?.workspaces||[]).filter(w=>w.deletedAtMs && Date.now() < Number(w.purgeAfterMs||w.deletedAtMs+30*DAY));
}
function catLabel(cat){return window.H360?.categoryLabel?.(cat)||cat||'Business';}
function catIcon(cat){return ({karyana:'🛒',general:'🏪',superstore:'🛍️',mobile:'📱',computer:'💻',pharmacy:'💊',hardware:'🔧',personal:'🤝',hybrid:'🧩',other:'🏷️'})[cat]||'📒';}
function wsRow(w,active=false){
  return `<button class="h360-workspace-row ${active?'active':''}" onclick="H360.switchWorkspace('${esc7(w.id)}')"><span class="h360-ws-icon">${esc7(w.branding?.icon||catIcon(w.category))}</span><span class="h360-ws-main"><b>${esc7(w.name)}</b><small>${esc7(catLabel(w.category))} · ${w.language==='ur'?'اردو':'English'}</small></span>${active?'<em>ACTIVE</em>':'<span>Switch ›</span>'}</button>`;
}
async function ownPendingWorkspaceRequests(){
  try{
    const c=C(),f=c.firebase;
    const q=f.query(f.collection(c.db,'account_requests'),f.where('email','==',c.user.email));
    const snap=await f.getDocs(q);
    return snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.requestType==='workspace'&&x.status==='pending');
  }catch(e){console.warn('workspace request lookup',e.message);return[];}
}

async function openWorkspaceSwitcherV7(){
  const d=C()?.userData;if(!d)return;
  const rows=activeWorkspaces().map(w=>wsRow(w,w.id===d.activeWorkspaceId)).join('');
  showModal(`<div class="km-form"><h3 class="km-modal-title">🗂️ Accounts / Workspaces</h3><p class="km-modal-sub">Choose an approved account. Har workspace ka apna hisab hai.</p><div class="h360-workspace-list">${rows||'<div class="km-empty">No active account.</div>'}</div><div id="h360PendingWorkspaceList"></div><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Close</button><button class="km-btn" onclick="H360.openAddWorkspace()">＋ Request New Account</button></div></div>`);
  // Active accounts render immediately. Pending requests never block the chooser.
  const placeholder=$7('h360PendingWorkspaceList');
  ownPendingWorkspaceRequests().then(requests=>{if(!placeholder?.isConnected||!requests.length)return;placeholder.innerHTML='<h4 class="km-subtitle">Pending approval</h4>'+requests.map(r=>`<div class="h360-workspace-row"><span class="h360-ws-icon">${catIcon(r.category)}</span><span class="h360-ws-main"><b>${esc7(r.shop)}</b><small>${esc7(catLabel(r.category))}</small></span><em class="h360-ws-pending">PENDING</em></div>`).join('');});
}
function openAddWorkspaceV7(){
  closeModal();
  const opts=[['karyana','🛒 Karyana / Grocery'],['general','🏪 General Store'],['superstore','🛍️ Super Store'],['mobile','📱 Mobile Shop'],['computer','💻 Computer Shop'],['pharmacy','💊 Pharmacy / Medical'],['hardware','🔧 Hardware'],['personal','🤝 Personal Ledger'],['hybrid','🧩 Hybrid / Multiple Categories'],['other','🏷️ Other / Custom']].map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  showModal(`<div class="km-form"><h3 class="km-modal-title">＋ Request New Account</h3><p class="km-modal-sub">New category direct active nahi hogi. Request Master ko jayegi aur approval ke baad account list mein nazar aayegi.</p><label>Account / Shop name</label><input id="h360NewName" placeholder="e.g. Khan Mobile Store"><label>Category</label><select id="h360NewCat" onchange="H360.newWorkspaceCategoryChanged(this.value)">${opts}</select><div id="h360NewModules" class="h360-signup-options" style="display:none"><label><input type="checkbox" value="khata" checked> 👥 Khata</label><label><input type="checkbox" value="pos" checked> 🧾 POS</label><label><input type="checkbox" value="stock" checked> 📦 Stock</label><label><input type="checkbox" value="loans"> 🤝 Loans</label><label><input type="checkbox" value="reports" checked> 📊 Reports</label></div><div class="km-grid-2"><div><label>Location</label><input id="h360NewLocation" placeholder="City / area"></div><div><label>Phone</label><input id="h360NewPhone" placeholder="923001234567"></div></div><div class="km-grid-2"><div><label>Language</label><select id="h360NewLang"><option value="en">English</option><option value="ur">اردو</option></select></div><div><label>Header</label><select id="h360NewHeader"><option value="navy">Navy Gold</option><option value="emerald">Emerald</option><option value="violet">Violet</option><option value="amber">Amber</option></select></div></div><label>Receipt style</label><select id="h360NewReceipt"><option value="modern">Modern</option><option value="classic">Classic</option><option value="thermal80">80mm Thermal</option><option value="thermal58">58mm Thermal</option></select><div class="h360-danger-note">🔐 Master approval required. Is category ka account approval se pehle data create nahi karega.</div><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="H360.saveNewWorkspace()">📤 Send Request</button></div></div>`);
}
async function saveNewWorkspaceV7(){
  const c=C(),d=c?.userData,f=c?.firebase;if(!c?.user||!d||!f)return showToast('Login required','error');
  const name=$7('h360NewName')?.value.trim(),category=$7('h360NewCat')?.value||'other';if(!name)return showToast('Account name zaroori hai','error');
  if((d.workspaces||[]).some(w=>w.category===category && (!w.deletedAtMs || Date.now()<Number(w.purgeAfterMs||w.deletedAtMs+30*DAY))))return showToast('Is category ka account active ya 30-day recovery mein already hai. Pehle restore/purge period complete karein.','error');
  const pending=await ownPendingWorkspaceRequests();if(pending.some(r=>r.category===category))return showToast('Is category ki request pehle se pending hai','error');
  const modules=category==='hybrid'?[...document.querySelectorAll('#h360NewModules input:checked')].map(x=>x.value):(Core()?.defaultModulesForCategory?.(category)||[]);
  if(!modules.length)return showToast('Kam az kam 1 module select karein','error');
  const workspaceId=`ws_${category}_${Date.now().toString(36)}`;
  await f.addDoc(f.collection(c.db,'account_requests'),{requestType:'workspace',name:d.ownerName||c.user.email,shop:name,category,modules,language:$7('h360NewLang')?.value||'en',headerStyle:$7('h360NewHeader')?.value||'navy',receiptStyle:$7('h360NewReceipt')?.value||'modern',workspaceId,location:$7('h360NewLocation')?.value.trim()||'',phone:$7('h360NewPhone')?.value.trim()||'',whatsapp:$7('h360NewPhone')?.value.trim()||'',email:c.user.email,authCreated:true,emailVerified:true,status:'pending',requestedAt:f.serverTimestamp()});
  closeModal();showToast('✅ New account request Master ko bhej di gayi','success');
}

async function requestDeleteWorkspace(){
  const c=C(),d=c?.userData;if(!c?.user||!d)return;
  const live=activeWorkspaces(),w=c.workspace;if(!w)return;

  if(!confirm(`“${w.name}” delete karein?\n\n30 din tak restore ho sakta hai.`))return;
  const deletedAtMs=Date.now(),workspaces=structuredClone(d.workspaces);const target=workspaces.find(x=>x.id===w.id);target.deletedAtMs=deletedAtMs;target.purgeAfterMs=deletedAtMs+30*DAY;target.deletedBy=c.user.email;
  const next=live.find(x=>x.id!==w.id);
  try{await c.firebase.updateDoc(c.firebase.doc(c.db,'users',c.user.email),{workspaces,activeWorkspaceId:next?.id||w.id});d.workspaces=workspaces;d.activeWorkspaceId=next?.id||w.id;Core()?.applyWorkspaceMirror?.(d);App()?.updateHeader?.();App()?.restartListeners?.();window.H360?.applyWorkspaceUI?.();renderWorkspaceSettingsV7();showToast('🗑️ Account Recycle Bin mein hai — 30 days recovery','success');if(!next)openDeletedWorkspaces();}catch(e){showToast('Account delete nahi hua: '+e.message,'error');}
}
function openDeletedWorkspaces(){
  const arr=deletedWorkspaces();
  const rows=arr.length?arr.map(w=>{const days=Math.max(0,Math.ceil((Number(w.purgeAfterMs)-Date.now())/DAY));return `<div class="h360-workspace-row h360-ws-deleted"><span class="h360-ws-icon">${catIcon(w.category)}</span><span class="h360-ws-main"><b>${esc7(w.name)}</b><small>${days} day(s) recovery left</small></span><button class="km-restore-btn" onclick="H360.restoreWorkspace('${esc7(w.id)}')">↩ Restore</button></div>`}).join(''):'<div class="km-empty">No deleted account in 30-day recovery.</div>';
  showModal(`<div class="km-form"><h3 class="km-modal-title">♻️ Deleted Accounts</h3><p class="km-modal-sub">Deleted workspace 30 days tak restore ho sakta hai.</p><div class="h360-workspace-list">${rows}</div><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Close</button></div></div>`);
}
async function restoreWorkspace(id){
  const d=C()?.userData,w=(d?.workspaces||[]).find(x=>x.id===id);if(!w)return;
  if(!w.deletedAtMs||Date.now()>=Number(w.purgeAfterMs)||w.purgedAtMs)return showToast('30-day recovery period khatam ho gaya','error');
  const c=C(),workspaces=structuredClone(d.workspaces),restored=workspaces.find(x=>x.id===id);delete restored.deletedAtMs;delete restored.purgeAfterMs;delete restored.deletedBy;
  try{await c.firebase.updateDoc(c.firebase.doc(c.db,'users',c.user.email),{workspaces,activeWorkspaceId:id});d.workspaces=workspaces;d.activeWorkspaceId=id;closeModal();showToast('↩️ Account restored','success');location.reload();}catch(e){showToast('Restore nahi hua: '+e.message,'error');}
}
async function deleteQueryInBatches(q, batchSize=350){
  const c=C(),f=c?.firebase;if(!c?.user||!f)return;
  while(true){
    const snap=await f.getDocs(f.query(q,f.limit(batchSize)));
    if(snap.empty) break;
    const batch=f.writeBatch(c.db);snap.docs.forEach(d=>batch.delete(d.ref));await batch.commit();
    if(snap.size<batchSize) break;
  }
}
async function purgeWorkspaceCloudData(w){
  const c=C(),f=c?.firebase;if(!c?.user||!f||!navigator.onLine) throw new Error('offline');
  const uid=c.user.uid,wid=w.id,wsKey=`${c.user.email}::${wid}`;
  // Local-first workspace collections.
  for(const kind of ['km_sales','km_purchases','km_expenses','km_loans','km_loan_payments','km_closings','km_audit','km_salary','km_personal_expenses']){
    await deleteQueryInBatches(f.collection(c.db,'km_users',uid,'workspaces',wid,kind));
  }
  // Legacy/root collections scoped by workspaceKey.
  for(const name of ['customers','transactions','stock_items','stock_movements','suppliers','supplier_payments']){
    await deleteQueryInBatches(f.query(f.collection(c.db,name),f.where('workspaceKey','==',wsKey),f.where('ownerEmail','==',c.user.email)));
  }
}
async function purgeExpiredWorkspaceMetadata(){
  const c=C(),d=c?.userData;if(!d?.workspaces||!c?.user)return;
  const expired=d.workspaces.filter(w=>w.deletedAtMs && Date.now()>=Number(w.purgeAfterMs||w.deletedAtMs+30*DAY));
  if(!expired.length)return;
  for(const w of expired){
    try{
      await purgeWorkspaceCloudData(w);
      w.purgedAtMs=Date.now();
      try{await window.KMFeatures?.localDB?.deleteWorkspace?.(w.id);}catch(_e){}
      await App()?.saveUserProfile?.();
      console.log('Hisab360: permanently purged expired workspace',w.id);
    }catch(e){console.warn('Workspace purge deferred:',w.id,e.message);}
  }
}

function renderWorkspaceSettingsV7(){
  const d=C()?.userData;if(!d)return;const list=$7('h360WorkspaceList');if(list)list.innerHTML=activeWorkspaces().map(w=>wsRow(w,w.id===d.activeWorkspaceId)).join('');
  const w=C()?.workspace;if(!w)return;if($7('h360BrandIcon'))$7('h360BrandIcon').textContent=w.branding?.icon||catIcon(w.category);if($7('h360BrandName'))$7('h360BrandName').textContent=w.name;if($7('h360BrandMeta'))$7('h360BrandMeta').textContent=`${w.branding?.receiptStyle||'modern'} · ${w.branding?.headerStyle||'navy'}`;
}

/* Share always opens actual rendered document flow. Text sharing remains only for explicit SMS/reminder actions. */
function premiumShareCurrentCustomer(){
  if(typeof window.exportPDFCurrent==='function'){window.exportPDFCurrent();window.openSharePdfModal?.();}
}
function premiumShareSummary(){
  if(typeof window.exportSummaryPDF==='function'){window.exportSummaryPDF();window.openSharePdfModal?.();}
}

/* Remember only identity hint after explicit logout; Firebase itself keeps the trusted session until logout/revoke. */
function rememberIdentity(){const u=C()?.user;if(u?.email)localStorage.setItem('h360_last_email',u.email);}
function fillRememberedIdentity(){const e=$7('loginEmail'),last=localStorage.getItem('h360_last_email');if(e&&last&&!e.value)e.value=last;}


async function switchWorkspaceV7(id){
  const c=C(),d=c?.userData;if(!d)return;
  const target=(d.workspaces||[]).find(w=>w.id===id&&!w.deletedAtMs);if(!target)return showToast('Account available nahi','error');
  if(d.activeWorkspaceId===id){closeModal();return;}
  const previous=d.activeWorkspaceId;
  d.activeWorkspaceId=id;Core()?.applyWorkspaceMirror?.(d);
  localStorage.setItem('h360_active_workspace_'+c.user.uid,id);
  const save=App()?.saveWorkspaceSelection?.(id);
  closeModal();window.closeDetail?.();if(window._pdfViewerOpen)window.closePdfViewer?.();
  App()?.restartListeners?.();App()?.updateHeader?.();window.H360?.applyWorkspaceUI?.();
  const home=target.category==='personal'?'personal':'business';window.switchTab?.(home,document.querySelector('.tab[data-tab="'+home+'"]'));window.scrollTo(0,0);
  showToast(`✅ ${target.name} active`,'success');
  try{await save;}catch(e){
    if(C()?.userData?.activeWorkspaceId===id){C().userData.activeWorkspaceId=previous;Core()?.applyWorkspaceMirror?.(C().userData);localStorage.setItem('h360_active_workspace_'+c.user.uid,previous);App()?.restartListeners?.();App()?.updateHeader?.();}
    showToast('Account preference save nahi hui: '+e.message,'error');
  }
}

function installOverrides(){
  if(!window.H360)return setTimeout(installOverrides,100);
  const originalApply=window.H360.applyWorkspaceUI;
  const originalSetLanguage=window.H360.setLanguage;
  const originalSaveBranding=window.H360.saveBranding;
  window.H360.openWorkspaceSwitcher=openWorkspaceSwitcherV7;
  window.H360.switchWorkspace=switchWorkspaceV7;
  window.H360.openAddWorkspace=openAddWorkspaceV7;
  window.H360.saveNewWorkspace=saveNewWorkspaceV7;
  window.H360.requestDeleteWorkspace=requestDeleteWorkspace;
  window.H360.openDeletedWorkspaces=openDeletedWorkspaces;
  window.H360.restoreWorkspace=restoreWorkspace;
  window.H360.renderWorkspaceSettings=renderWorkspaceSettingsV7;
  window.H360.applyWorkspaceUI=function(){ originalApply?.(); document.body.classList.toggle('recovery-only',!!C()?.user&&!activeWorkspaces().length); renderWorkspaceSettingsV7(); const sc=document.querySelector('.h360-salary-card'); if(sc) sc.style.display=(C()?.workspace?.category==='personal')?'block':'none'; };
  window.H360.setLanguage=async function(lang){await originalSetLanguage?.(lang);renderWorkspaceSettingsV7();};
  window.H360.saveBranding=async function(){await originalSaveBranding?.();renderWorkspaceSettingsV7();};
  window.shareKhataCurrent=premiumShareCurrentCustomer;
  window.shareSummaryText=premiumShareSummary;
  if(C()?.user&&C()?.userData&&!activeWorkspaces().length)setTimeout(()=>openDeletedWorkspaces(),600);
  purgeExpiredWorkspaceMetadata().catch(()=>{});
  renderWorkspaceSettingsV7();
  fillRememberedIdentity();
}
setTimeout(installOverrides,150);
window.addEventListener('beforeunload',rememberIdentity);

/* Native/browser back: close overlays/detail, otherwise always return/stay on Home; never exit app. */
window.h360BackToHome=function(){
  if(window._pdfViewerOpen){window.closePdfViewer?.();return true;}
  const modal=$7('modal');if(modal?.style.display==='flex'){window.closeModal?.();return true;}
  if($7('detailPage')?.classList.contains('show')){window.closeDetail?.();return true;}
  const home=C()?.workspace?.category==='personal'?'personal':'business';
  if(window._currentTab!==home){window.switchTab?.(home,document.querySelector('.tabs .tab[data-tab="'+home+'"]'));return true;}
  return true;
};

console.log('✅ Hisab360 v7.1.4 Premium Polish layer loaded');
