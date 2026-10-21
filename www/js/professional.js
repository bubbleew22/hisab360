import { categoryModules, localDateKey } from './domain.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'Rs '+Number(v||0).toLocaleString('en-PK',{maximumFractionDigits:2});
// Keep all defaults tagged to the workspace category.
window.H360Catalog=Object.fromEntries(Object.entries({mobile:[['📱','Mobile Phone'],['🔌','Charger'],['🎧','Handsfree'],['🔋','Power Bank'],['📲','Screen Protector'],['🛡️','Phone Cover'],['🔗','USB Cable']],computer:[['💻','Laptop'],['🖥️','Desktop'],['⌨️','Keyboard'],['🖱️','Mouse'],['💾','Storage Drive']],pharmacy:[['💊','Medicine'],['🩹','First Aid']],hardware:[['🔧','Tools'],['🔩','Fasteners'],['🎨','Paint'],['🚰','Plumbing']],personal:[],other:[]}).map(([category,rows])=>[category,rows.map(([emoji,name])=>({id:'default-'+name,emoji,name,category}))]));
function apply(){
 const c=window.KMCore,w=c?.workspace;if(!c?.userData||!w)return;
 const personal=w.category==='personal',lang=w.language,ur=lang==='ur';
 const label=(id,en,urdu)=>{if($(id))$(id).textContent=ur?urdu:en;};
 document.body.dataset.category=w.category;document.body.dataset.headerStyle=w.branding?.headerStyle||'navy';
 const modules=new Set(w.category==='hybrid'?w.modules:categoryModules(w.category));
 document.querySelectorAll('.tabs .tab[data-module]').forEach(tab=>{
  const module=tab.dataset.module;tab.style.display=(modules.has(module)&&!['reports'].includes(module)||module==='settings')?'flex':'none';
  if(tab.dataset.tab==='add')tab.style.display='none';
  tab.hidden=tab.style.display==='none';
 });
 label('navBusiness','Home','ہوم');label('navCustomers','Khata','کھاتہ');label('navLoans',personal?'Home':'Loans',personal?'ہوم':'قرض');label('navSettings','More','مزید');
 let finance=$('financeNav');
 if(!finance){finance=document.createElement('button');finance.id='financeNav';finance.className='tab';finance.innerHTML='<span>💼</span><span>Finance</span>';finance.onclick=()=>{window.switchTab('personal',document.querySelector('.tab[data-tab="personal"]'));document.querySelectorAll('.tabs .tab').forEach(tab=>tab.classList.toggle('active',tab===finance));document.querySelector('.h360-salary-card')?.scrollIntoView({behavior:'smooth',block:'start'});};document.querySelector('.tabs')?.insertBefore(finance,document.querySelector('.tab[data-tab="settings"]'));}
 finance.hidden=!personal;finance.style.display=personal?'flex':'none';finance.lastElementChild.textContent=ur?'آمدن':'Finance';
 const more=document.querySelector('.tab[data-tab="settings"]');if(more)more.onclick=()=>openMore();
 const home=personal?'personal':'business';
 const homeTab=document.querySelector('.tabs .tab[data-tab="'+home+'"]');if(homeTab)document.querySelector('.tabs').prepend(homeTab);
 const currentModule={list:'khata',add:'khata',stock:'stock',business:'pos',personal:'loans',summary:'reports'}[window._currentTab];
 const allowedCurrent=window._currentTab==='settings'||window._currentTab==='requests'&&c.isMaster()||modules.has(currentModule);
 if(window._currentTab==='list'&&!document.body.dataset.homeInitialized||!window._currentTab||!allowedCurrent)window.switchTab(home,document.querySelector('.tab[data-tab="'+home+'"]'));
 const title=document.querySelector('#tab-personal .km-hero h2');if(title)title.textContent=ur?'ذاتی حساب':'Personal Hisab';
 const subtitle=document.querySelector('#tab-personal .km-hero p');if(subtitle)subtitle.textContent=ur?'قرض، اقساط، آمدن اور ذاتی اخراجات ایک جگہ۔':'Loans, installments, income and your everyday expenses.';
 const salary=document.querySelector('.h360-salary-card');if(salary)salary.style.display=modules.has('loans')?'block':'none';
 document.body.dataset.homeInitialized='1';
 if(personal)updatePersonalHeader();
 else{document.querySelector('.h710-wasooli .lbl').textContent='Today Wasooli';document.querySelector('.h710-activity .lbl').textContent='Today Activity';}

 const fab=$('fab');if(fab){fab.hidden=!modules.has('khata');fab.style.display=modules.has('khata')?'flex':'none';}
 document.querySelectorAll('.tabs .tab').forEach(tab=>{tab.setAttribute('role','button');tab.setAttribute('tabindex','0');tab.setAttribute('aria-label',tab.textContent.trim());});
}
function openMore(){
 const c=window.KMCore,personal=c?.workspace?.category==='personal';
 window.showModal(`<div class="km-form"><h3 class="km-modal-title">Account & Tools</h3><p class="km-modal-sub">${esc(c?.workspace?.name)}</p><div class="km-action-grid"><button onclick="H360.openSettings()"><b>Settings</b><span>Appearance, language & security</span></button><button onclick="H360.openWorkspaceSwitcher()"><b>Switch Workspace</b><span>Your approved accounts</span></button><button onclick="${personal?'KMFeatures.openSalaryReport()':"closeModal();switchTab('summary',document.querySelector('[data-tab=summary]'))"}"><b>Reports</b><span>${personal?'Income, expenses & savings':'Khata totals & statements'}</span></button><button onclick="KMFeatures.syncNow()"><b>Sync Data</b><span>Refresh cloud changes</span></button><button onclick="KMFeatures.openCloudBackupMenu()"><b>Backup & Restore</b><span>Keep your records safe</span></button>${c?.isMaster()?`<button onclick="closeModal();switchTab('requests',document.querySelector('[data-tab=requests]'))"><b>Approval Requests</b><span>Accounts & workspaces</span></button>`:''}<button onclick="closeModal();logout()"><b>Logout</b><span>End this session</span></button></div></div>`);
}
function updatePersonalHeader(){
 if(window.KMCore?.workspace?.category!=='personal')return;
 const lent=$('kmLoanLent')?.textContent||'Rs 0',borrowed=$('kmLoanBorrowed')?.textContent||'Rs 0';
 $('statCustomers').textContent=$('kmLoanActive')?.textContent||'0';$('statCustomersLabel').textContent='Active Loans';
 $('statWasooli').textContent=lent;document.querySelector('.h710-wasooli .lbl').textContent='Mujhe lene hain';
 $('statBalance').textContent=borrowed;$('statBalanceLabel').textContent='Mujhe dene hain';
 $('statActivity').textContent=$('h360SalaryRemaining')?.textContent||'Rs 0';document.querySelector('.h710-activity .lbl').textContent='Monthly Savings';
}
async function breakdown(){
 const db=window.KMFeatures?.localDB;if(!db)return;
 const month=localDateKey().slice(0,7),rows=(await db.list('km_personal_expenses')).filter(x=>!x.deletedAt&&String(x.date||x.createdAtISO).startsWith(month));
 const groups=new Map();for(const row of rows)groups.set(row.category,(groups.get(row.category)||0)+Number(row.amount||0));
 const total=rows.reduce((s,x)=>s+Number(x.amount||0),0),el=$('h360ExpenseBreakdown');if(!el)return;
 el.innerHTML=groups.size?'<h4>This month · Spending breakdown</h4>'+[...groups].sort((a,b)=>b[1]-a[1]).map(([cat,amount])=>`<div class="spending-row"><div><span>${esc(cat)}</span><b>${money(amount)}</b></div><div class="spending-track"><i style="width:${total?amount/total*100:0}%"></i></div></div>`).join(''):'<p class="finance-hint">Add your salary and daily expenses to see where your money goes.</p>';
 updatePersonalHeader();
}
window.H360Professional={apply,updatePersonalHeader,breakdown};
function install(){
 if(!window.H360?.applyWorkspaceUI||!window.KMFeatures)return setTimeout(install,150);
 const original=window.H360.applyWorkspaceUI;window.H360.applyWorkspaceUI=()=>{original();apply();};
 const oldStats=window.H360.refreshPremiumStats;window.H360.refreshPremiumStats=()=>{if(window.KMCore?.workspace?.category==='personal')updatePersonalHeader();else oldStats?.();};
 const originalSalary=window.KMFeatures.renderSalary;window.KMFeatures.renderSalary=async()=>{await originalSalary();await breakdown();};
 $('personalLoanSearch')?.addEventListener('input',()=>window.KMFeatures.renderPersonal());$('personalLoanDirection')?.addEventListener('change',()=>window.KMFeatures.renderPersonal());
 document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('tab')){e.preventDefault();e.target.click();}});
 apply();
}
setTimeout(install,350);
