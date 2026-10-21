/* Hisab360 v6 workspace, language, onboarding and adaptive-shell layer */
const H = () => window.H360Core;
const A = () => window.H360App;
const K = () => window.KMCore;
const $ = (id) => document.getElementById(id);
const esc = (v='') => String(v).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));

const CATEGORY_META = {
  karyana:{label:'Karyana / Grocery',icon:'🛒'}, general:{label:'General Store',icon:'🏪'}, superstore:{label:'Super Store',icon:'🛍️'},
  mobile:{label:'Mobile Shop',icon:'📱'}, computer:{label:'Computer Shop',icon:'💻'}, pharmacy:{label:'Pharmacy / Medical',icon:'💊'},
  hardware:{label:'Hardware',icon:'🔧'}, personal:{label:'Personal Hisab',icon:'🤝'}, hybrid:{label:'Hybrid Business',icon:'🧩'}, other:{label:'Other / Custom',icon:'🏷️'}
};
const I18N = {
  en:{customers:'Customers',people:'People',new:'New',stock:'Stock',business:'Business',loans:'Loans',report:'Report',settings:'Settings',logout:'Logout',due:'Total Due',account:'Account'},
  ur:{customers:'گاہک',people:'افراد',new:'نیا',stock:'اسٹاک',business:'کاروبار',loans:'قرض',report:'رپورٹ',settings:'سیٹنگز',logout:'لاگ آؤٹ',due:'کل بقایا',account:'اکاؤنٹ'}
};
function ws(){ return K()?.workspace || H()?.activeWorkspace?.(); }
function userData(){ return K()?.userData; }
function isMaster(){ return K()?.isMaster?.() || false; }
function modulesFor(w=ws()){
  const base=new Set(w?.category==='personal'?['loans','reports']:w?.category!=='hybrid'?H()?.defaultModulesForCategory?.(w?.category):w?.modules || H()?.defaultModulesForCategory?.(w?.category||'other') || ['khata','pos','stock','reports']);
  base.add('settings'); base.add('logout'); if(isMaster()) base.add('admin'); return base;
}
function categoryLabel(c){return CATEGORY_META[c]?.label||'Business';}

function categoryChanged(value){
  const box=$('suHybridModules'); if(box) box.style.display=value==='hybrid'?'grid':'none';
  const shop=$('suShop'); if(shop){
    if(value==='personal') shop.placeholder='Account name, e.g. Yasir Personal Ledger';
    else shop.placeholder='Shop / Business name';
  }
}
function passwordMeter(pass=''){
  const checks=[pass.length>=10,/[A-Z]/.test(pass),/[a-z]/.test(pass),/[0-9]/.test(pass),/[^A-Za-z0-9]/.test(pass)];
  const score=checks.filter(Boolean).length, bar=$('suPassBar'), hint=$('suPassHint');
  if(bar){bar.style.width=(score*20)+'%';bar.dataset.score=String(score);}
  if(hint) hint.textContent=score===5?'Strong password ✓':'10+ chars · A-Z · a-z · 0-9 · special';
}

function applyLanguage(lang){
  lang=lang==='ur'?'ur':'en'; const t=I18N[lang];
  document.documentElement.lang=lang; document.documentElement.dir=lang==='ur'?'rtl':'ltr'; document.body.classList.toggle('h360-rtl',lang==='ur');
  const personal=ws()?.category==='personal';
  const vals={navCustomers:personal?t.people:t.customers,navNew:t.new,navStock:t.stock,navBusiness:t.business,navLoans:t.loans,navReport:t.report,navSettings:t.settings,navLogout:t.logout,statCustomersLabel:personal?t.people:t.customers,statBalanceLabel:t.due};
  Object.entries(vals).forEach(([id,v])=>{const e=$(id);if(e)e.textContent=v;});
  const s=$('workspaceSwitcher')?.querySelector('small'); if(s)s.textContent=t.account;
  const ur=lang==='ur';
  const text=(sel,val)=>{const e=document.querySelector(sel);if(e)e.textContent=val;};
  const ph=(sel,val)=>{const e=document.querySelector(sel);if(e)e.placeholder=val;};
  if(ur){
    text('#tabLogin','🔐 لاگ اِن'); text('#tabSignup','✨ اکاؤنٹ بنائیں');
    text('#loginForm .btn-auth span:last-child','لاگ اِن'); text('.remember-row span','مجھے یاد رکھیں'); text('.auth-link a','🔗 پاس ورڈ بھول گئے؟');
    ph('#loginEmail','ای میل ایڈریس'); ph('#loginPass','پاس ورڈ'); ph('#suName','آپ کا پورا نام'); ph('#suShop','دکان / اکاؤنٹ کا نام'); ph('#suLocation','مقام'); ph('#suPhone','فون نمبر'); ph('#suWhatsapp','واٹس ایپ (اختیاری)'); ph('#suEmail','ای میل ایڈریس');
    text('#signupForm .btn-auth span:last-child','اکاؤنٹ کی درخواست بھیجیں'); ph('#searchBox','نام یا نمبر سے تلاش کریں…');
    text('#tab-add .form-card h3',ws()?.category==='personal'?'نیا فرد شامل کریں':'نیا گاہک شامل کریں');
    text('#tab-business .km-hero h2','آج کا کاروباری خلاصہ'); text('#tab-personal .km-hero h2','ذاتی لین دین / قرض');
  } else {
    text('#tabLogin','🔐 Login'); text('#tabSignup','✨ Create Account'); text('#loginForm .btn-auth span:last-child','Login'); text('.remember-row span','Remember me (auto-login)'); text('.auth-link a','🔗 Forgot password?');
    ph('#loginEmail','Email address'); ph('#loginPass','Password'); ph('#suName','Your full name'); ph('#suShop','Shop / Account name'); ph('#suLocation','Location'); ph('#suPhone','Phone: 923001234567'); ph('#suWhatsapp','WhatsApp (optional)'); ph('#suEmail','Email address');
    text('#signupForm .btn-auth span:last-child','Send Account Request'); ph('#searchBox','Search by name or number…');
    text('#tab-add .form-card h3',ws()?.category==='personal'?'Add New Person':'Add New Customer'); text('#tab-business .km-hero h2','Today at a glance'); text('#tab-personal .km-hero h2','Personal Loans');
  }
}
async function setLanguage(lang){
  const w=ws(); if(!w)return; w.language=lang==='ur'?'ur':'en'; H()?.applyWorkspaceMirror?.(userData()); applyLanguage(w.language); await A()?.saveUserProfile?.(); renderWorkspaceSettings();
}

function applyWorkspaceUI(){
  const w=ws(); if(!w)return;
  const mods=modulesFor(w);
  document.querySelectorAll('.tabs .tab[data-module]').forEach(tab=>{
    const m=tab.dataset.module; const show=mods.has(m) || m==='settings' || m==='logout' || (m==='admin'&&isMaster()); tab.style.display=show?'flex':'none';
  });
  document.body.dataset.category=w.category||'other'; document.body.dataset.headerStyle=w.branding?.headerStyle||'navy';
  const logo=document.querySelector('.header-logo'); if(logo)logo.textContent=w.branding?.icon||CATEGORY_META[w.category]?.icon||'📒';
  const badge=$('headerCategoryBadge');if(badge)badge.textContent=categoryLabel(w.category);
  applyLanguage(w.language||'en'); renderWorkspaceSettings();
  const fab=$('fab'); if(fab) fab.style.display=mods.has('khata')?'flex':'none';
  const addTitle=document.querySelector('#tab-add .form-card h3'); if(addTitle) addTitle.textContent=w.category==='personal'?(w.language==='ur'?'نیا فرد شامل کریں':'Add New Person'):'Naya Customer Add Karein';
  const active=document.querySelector('.tabs .tab.active'); if(active&&active.style.display==='none'){
    const first=[...document.querySelectorAll('.tabs .tab[data-tab]')].find(x=>x.style.display!=='none'&&x.dataset.tab!=='settings'); first?.click();
  }
  if($('h360TrustedLockState')) $('h360TrustedLockState').textContent=localStorage.getItem('fk_app_lock')==='on'?'Optional / ON':'Optional / OFF';
}

function workspaceCard(w,active){
  const meta=CATEGORY_META[w.category]||CATEGORY_META.other;
  return `<button class="h360-workspace-row ${active?'active':''}" onclick="H360.switchWorkspace('${esc(w.id)}')"><span class="h360-ws-icon">${esc(w.branding?.icon||meta.icon)}</span><span class="h360-ws-main"><b>${esc(w.name)}</b><small>${esc(meta.label)} · ${esc(w.language==='ur'?'اردو':'English')}</small></span>${active?'<em>ACTIVE</em>':'<span>Switch ›</span>'}</button>`;
}
function renderWorkspaceSettings(){
  const d=userData(); if(!d)return; H()?.ensureWorkspaceData?.(d); const list=$('h360WorkspaceList');
  if(list) list.innerHTML=(d.workspaces||[]).map(x=>workspaceCard(x,x.id===d.activeWorkspaceId)).join('');
  const w=ws(); if(!w)return; if($('h360BrandIcon'))$('h360BrandIcon').textContent=w.branding?.icon||'📒'; if($('h360BrandName'))$('h360BrandName').textContent=w.name; if($('h360BrandMeta'))$('h360BrandMeta').textContent=`${w.branding?.receiptStyle||'modern'} · ${w.branding?.headerStyle||'navy'}`;
}

function openSettings(){ closeModal(); const tab=document.querySelector('.tabs .tab[data-tab="settings"]'); window.switchTab?.('settings',tab); setTimeout(()=>document.getElementById('tab-settings')?.scrollTo?.({top:0,behavior:'smooth'}),50); }
function openAccountHub(){
  const w=ws(), online=navigator.onLine?'Online':'Offline';
  showModal(`<div class="km-form h360-account-hub"><h3 class="km-modal-title">⚙️ Account & Settings</h3><p class="km-modal-sub">${esc(w?.name||'Hisab360')} · ${esc(categoryLabel(w?.category))} · ${online}</p><div class="km-action-grid"><button onclick="closeModal();H360.openWorkspaceSwitcher()"><b>⇄ Switch Account</b><span>Workspace / category</span></button><button onclick="H360.openSettings()"><b>⚙️ Settings</b><span>Theme, language, security</span></button><button onclick="closeModal();H360.openBrandingEditor()"><b>🎨 Header & Receipt</b><span>Logo, style, footer</span></button><button onclick="closeModal();KMFeatures.syncNow()"><b>☁️ Sync Now</b><span>Firebase + local cache</span></button><button onclick="closeModal();KMFeatures.openCloudBackupMenu()"><b>🛡️ Backup</b><span>Phone / Drive / cloud</span></button><button class="danger" onclick="closeModal();logout()"><b>🚪 Logout</b><span>End trusted session</span></button></div><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Close</button></div></div>`);
}
function openWorkspaceSwitcher(){
  const d=userData(); if(!d)return; const rows=(d.workspaces||[]).map(x=>workspaceCard(x,x.id===d.activeWorkspaceId)).join('');
  showModal(`<div class="km-form"><h3 class="km-modal-title">🗂️ Switch Account</h3><p class="km-modal-sub">Har account ka apna category-specific interface aur data scope hai.</p><div class="h360-workspace-list">${rows}</div><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Close</button><button class="km-btn" onclick="H360.openAddWorkspace()">＋ Add Account</button></div></div>`);
}
async function switchWorkspace(id){
  const d=userData(); if(!d?.workspaces?.some(x=>x.id===id))return; d.activeWorkspaceId=id; H()?.applyWorkspaceMirror?.(d); await A()?.saveUserProfile?.(); closeModal(); A()?.updateHeader?.(); A()?.restartListeners?.(); applyWorkspaceUI();
  setTimeout(()=>{window.KMFeatures?.renderBusiness?.();window.KMFeatures?.renderPersonal?.();},250); showToast(`✅ ${ws()?.name||'Account'} active`,'success');
}
function moduleChecks(prefix='h360New',selected=['khata','pos','stock','reports']){
  return ['khata','pos','stock','loans','reports'].map(m=>`<label><input id="${prefix}_${m}" type="checkbox" value="${m}" ${selected.includes(m)?'checked':''}> ${m==='khata'?'👥 Khata':m==='pos'?'🧾 POS':m==='stock'?'📦 Stock':m==='loans'?'🤝 Loans':'📊 Reports'}</label>`).join('');
}
function openAddWorkspace(){
  closeModal(); const opts=Object.entries(CATEGORY_META).map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('');
  showModal(`<div class="km-form"><h3 class="km-modal-title">＋ New Account / Workspace</h3><p class="km-modal-sub">Same login ke andar separate category account.</p><label>Account / Shop name</label><input id="h360NewName" placeholder="e.g. Khan General Store"><label>Category</label><select id="h360NewCat" onchange="H360.newWorkspaceCategoryChanged(this.value)">${opts}</select><div id="h360NewModules" class="h360-signup-options" style="display:none">${moduleChecks()}</div><div class="km-grid-2"><div><label>Location</label><input id="h360NewLocation" placeholder="City / area"></div><div><label>Phone</label><input id="h360NewPhone" placeholder="923001234567"></div></div><div class="km-grid-2"><div><label>Language</label><select id="h360NewLang"><option value="en">English</option><option value="ur">اردو</option></select></div><div><label>Header</label><select id="h360NewHeader"><option value="navy">Navy Gold</option><option value="emerald">Emerald</option><option value="violet">Violet</option><option value="amber">Amber</option></select></div></div><label>Receipt style</label><select id="h360NewReceipt"><option value="modern">Modern</option><option value="classic">Classic</option><option value="thermal80">80mm Thermal</option><option value="thermal58">58mm Thermal</option></select><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="H360.saveNewWorkspace()">Create</button></div></div>`);
}
function newWorkspaceCategoryChanged(cat){
  const box=$('h360NewModules'); if(box)box.style.display=cat==='hybrid'?'grid':'none';
}
async function saveNewWorkspace(){
  const d=userData(), name=$('h360NewName')?.value.trim(), category=$('h360NewCat')?.value||'other'; if(!d||!name)return showToast('Account name zaroori hai','error');
  if((d.workspaces||[]).some(w=>w.category===category)) return showToast('Is category ka account pehle se maujood hai. Hybrid use karein.','error');
  const mods=category==='hybrid'?[...document.querySelectorAll('#h360NewModules input:checked')].map(x=>x.value):(H()?.defaultModulesForCategory?.(category)||[]); if(!mods.length)return showToast('Kam az kam 1 module select karein','error');
  const id=`ws_${category}_${Date.now().toString(36)}`; const w={id,name,category,modules:mods,location:$('h360NewLocation')?.value.trim()||'',phone:$('h360NewPhone')?.value.trim()||'',whatsapp:$('h360NewPhone')?.value.trim()||'',language:$('h360NewLang')?.value||'en',branding:{icon:CATEGORY_META[category]?.icon||'📒',headerStyle:$('h360NewHeader')?.value||'navy',receiptStyle:$('h360NewReceipt')?.value||'modern',footer:'Thank you for your business!'},createdAtMs:Date.now()};
  d.workspaces.push(w); d.activeWorkspaceId=id; H()?.applyWorkspaceMirror?.(d); await A()?.saveUserProfile?.(); closeModal(); A()?.updateHeader?.(); A()?.restartListeners?.(); applyWorkspaceUI(); showToast('✅ New account created','success');
}
function openBrandingEditor(){
  const w=ws(); if(!w)return; showModal(`<div class="km-form"><h3 class="km-modal-title">🏷️ Header & Receipt</h3><p class="km-modal-sub">Current workspace ki identity customize karein.</p><div class="km-grid-2"><div><label>Icon / Emoji</label><input id="h360BrandIconInput" maxlength="4" value="${esc(w.branding?.icon||'📒')}"></div><div><label>Account name</label><input id="h360BrandNameInput" value="${esc(w.name)}"></div></div><label>Location</label><input id="h360BrandLocation" value="${esc(w.location||'')}"><label>Phone</label><input id="h360BrandPhone" value="${esc(w.phone||'')}"><div class="km-grid-2"><div><label>Header style</label><select id="h360BrandHeader"><option value="navy">Navy Gold</option><option value="emerald">Emerald</option><option value="violet">Violet</option><option value="amber">Amber</option></select></div><div><label>Receipt style</label><select id="h360BrandReceipt"><option value="modern">Modern</option><option value="classic">Classic</option><option value="thermal80">80mm Thermal</option><option value="thermal58">58mm Thermal</option></select></div></div><label>Receipt footer</label><input id="h360BrandFooter" value="${esc(w.branding?.footer||'Thank you for your business!')}"><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="H360.saveBranding()">Save</button></div></div>`); setTimeout(()=>{if($('h360BrandHeader'))$('h360BrandHeader').value=w.branding?.headerStyle||'navy';if($('h360BrandReceipt'))$('h360BrandReceipt').value=w.branding?.receiptStyle||'modern';},0);
}
async function saveBranding(){
  const w=ws(); if(!w)return; const name=$('h360BrandNameInput')?.value.trim(); if(!name)return showToast('Name zaroori hai','error'); w.name=name;w.location=$('h360BrandLocation')?.value.trim()||'';w.phone=$('h360BrandPhone')?.value.trim()||'';w.whatsapp=w.phone;w.branding={...(w.branding||{}),icon:$('h360BrandIconInput')?.value.trim()||'📒',headerStyle:$('h360BrandHeader')?.value||'navy',receiptStyle:$('h360BrandReceipt')?.value||'modern',footer:$('h360BrandFooter')?.value.trim()||'Thank you for your business!'};H()?.applyWorkspaceMirror?.(userData());await A()?.saveUserProfile?.();closeModal();A()?.updateHeader?.();applyWorkspaceUI();showToast('✅ Header & receipt updated','success');
}

const ONBOARD = [
  ['👋','Welcome to Hisab360','Aap ka account category ke mutabiq sirf relevant modules dikhata hai.'],
  ['🧾','Fast daily work','Khata, POS, stock ya personal loans — jo module aap ke account mein enabled ho wahi use karein.'],
  ['☁️','Local cache + smart sync','Firestore persistent cache first load ke baad repeat reads kam karti hai; sync status Business screen par dikhai deta hai.'],
  ['🛡️','Backup & restore','Settings se JSON, encrypted backup, cloud share aur restore preview available hai.']
];
let onboardStep=0;
function showOnboarding(force=false){
  const uid=K()?.user?.uid,w=ws(); if(!uid||!w)return; const key=`h360_onboard_v6_${uid}`; if(!force&&localStorage.getItem(key)==='1')return; onboardStep=0; renderOnboard(key);
}
function renderOnboard(key){
  const [icon,title,body]=ONBOARD[onboardStep]; const last=onboardStep===ONBOARD.length-1;
  showModal(`<div class="h360-onboard"><div class="h360-onboard-icon">${icon}</div><h2>${title}</h2><p>${body}</p><div class="h360-dots">${ONBOARD.map((_,i)=>`<i class="${i===onboardStep?'active':''}"></i>`).join('')}</div><div class="km-btn-row">${onboardStep?'<button class="km-btn ghost" onclick="H360.onboardPrev()">Back</button>':'<button class="km-btn ghost" onclick="H360.finishOnboarding()">Skip</button>'}<button class="km-btn green" onclick="${last?'H360.finishOnboarding()':'H360.onboardNext()'}">${last?'Done':'Next'}</button></div></div>`); window.__h360OnboardKey=key;
}
function onboardNext(){onboardStep=Math.min(ONBOARD.length-1,onboardStep+1);renderOnboard(window.__h360OnboardKey);}
function onboardPrev(){onboardStep=Math.max(0,onboardStep-1);renderOnboard(window.__h360OnboardKey);}
function finishOnboarding(){if(window.__h360OnboardKey)localStorage.setItem(window.__h360OnboardKey,'1');closeModal();}

function receiptProfile(){ const w=ws(); return {name:w?.name||'Hisab360',icon:w?.branding?.icon||'📒',style:w?.branding?.receiptStyle||'modern',footer:w?.branding?.footer||'Thank you!',phone:w?.phone||'',location:w?.location||''}; }
function receiptCss(){
  const r=receiptProfile(); const width=r.style==='thermal58'?'58mm':r.style==='thermal80'?'80mm':'760px'; const classic=r.style==='classic';
  return `*{box-sizing:border-box}body{font-family:Arial,sans-serif;background:#eef3f7;color:#17212b;margin:0;padding:18px}.receipt{max-width:${width};margin:auto;background:#fff;padding:${r.style.startsWith('thermal')?'10px':'22px'};border-radius:${r.style.startsWith('thermal')?'0':'20px'};box-shadow:${r.style.startsWith('thermal')?'none':'0 12px 32px rgba(20,50,70,.13)'}}.receipt h1{color:#163d5b;margin:5px 0}.head{${classic?'border:2px solid #163d5b;':'background:linear-gradient(135deg,#f7fafc,#eef4f8);'}border-radius:14px;padding:14px!important}.receipt-footer{text-align:center;margin-top:18px;font-size:11px;color:#667085;border-top:1px dashed #cbd5df;padding-top:12px}@media print{body{background:#fff;padding:0}.receipt{box-shadow:none;border-radius:0;max-width:100%}}`;
}


let firstReady=false;
function readyTick(){
  if(!K()?.user||!userData())return; H()?.ensureWorkspaceData?.(userData()); window.H360.applyWorkspaceUI(); if(!firstReady){firstReady=true;setTimeout(()=>showOnboarding(false),450);} clearInterval(window.__h360ReadyTimer);
}
window.__h360ReadyTimer=setInterval(readyTick,250);
window.addEventListener('online',()=>window.KMFeatures?.syncNow?.());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')window.KMFeatures?.syncNow?.();});
setInterval(()=>{if(K()?.user&&navigator.onLine)window.KMFeatures?.syncNow?.();},30*60*1000);

window.H360={...(window.H360||{}),categoryChanged,passwordMeter,applyWorkspaceUI,setLanguage,openAccountHub,openSettings,openWorkspaceSwitcher,switchWorkspace,openAddWorkspace,newWorkspaceCategoryChanged,saveNewWorkspace,openBrandingEditor,saveBranding,renderWorkspaceSettings,showOnboarding,onboardNext,onboardPrev,finishOnboarding,receiptProfile,receiptCss,categoryLabel};
categoryChanged($('suCategory')?.value||'karyana');
console.log('✅ Hisab360 v7.1.4 workspace layer loaded');
