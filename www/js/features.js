import { localDateKey, expenseCategories, aggregateSaleLines } from './domain.js';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
/* Hisab360 v6 feature layer
 * Local-first business operations, personal loans, smart backups and adaptive UI.
 */
const APP = { name: 'Hisab360', version: '7.2.3', schema: 7 };
const COLLECTIONS = ['km_sales','km_purchases','km_expenses','km_loans','km_loan_payments','km_closings','km_salary','km_personal_expenses','km_audit'];
const SYNC_TTL_MS = 30 * 60 * 1000; // throttled cloud refresh; critical writes still commit immediately

const $ = (id) => document.getElementById(id);
const money = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-PK', {maximumFractionDigits:2});
const nowISO = () => new Date().toISOString();
const todayKey = () => localDateKey();
const idText = (v='') => String(v).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const toMillis = (v) => {
  if(!v) return 0;
  if(typeof v === 'number') return v;
  if(v?.toMillis) return v.toMillis();
  if(v?.seconds) return v.seconds * 1000;
  const d = new Date(v); return Number.isNaN(+d) ? 0 : +d;
};
const dateLabel = (v) => {
  const ms = toMillis(v); if(!ms) return '—';
  return new Date(ms).toLocaleString('en-PK',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
};
const uid = () => window.KMCore?.user?.uid || '';
const email = () => window.KMCore?.user?.email || '';
const workspaceId = () => window.KMCore?.workspaceId || window.H360Core?.activeWorkspaceId?.() || 'default';
const workspace = () => window.KMCore?.workspace || window.H360Core?.activeWorkspace?.() || null;
const shopName = () => workspace()?.name || window.KMCore?.userData?.shopName || APP.name;
const workspaceFields = () => ({workspaceId:workspaceId(),workspaceName:shopName(),workspaceKey:`${email()}::${workspaceId()}`});

// ---------- Theme ----------
function effectiveTheme(mode) {
  if(mode === 'system') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return mode || 'light';
}
function applyTheme() {
  const mode = localStorage.getItem('km_theme') || 'system';
  document.documentElement.dataset.theme = effectiveTheme(mode);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effectiveTheme(mode)==='dark' ? '#0b1220' : '#163d5b');
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if((localStorage.getItem('km_theme') || 'system') === 'system') applyTheme();
});
if(localStorage.getItem('km_compact') === '1') document.body.classList.add('km-compact');

// ---------- IndexedDB ----------
const LocalDB = {
  dbp: null,
  open() {
    if(this.dbp) return this.dbp;
    this.dbp = new Promise((resolve,reject) => {
      const req = indexedDB.open('hisab360-v5', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const s = db.createObjectStore('records', { keyPath:'key' });
        s.createIndex('ownerKind','ownerKind',{unique:false});
        s.createIndex('owner','owner',{unique:false});
        db.createObjectStore('meta',{keyPath:'key'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbp;
  },
  async put(kind, record) {
    const owner = uid(); if(!owner) return;
    const db = await this.open();
    const id = record.id || record.cloudId || crypto.randomUUID();
    const wid=record.workspaceId||workspaceId(); const row = {...record, workspaceId:wid, kind, id, key:`${owner}|${wid}|${kind}|${id}`, owner, ownerKind:`${owner}|${kind}`};
    await new Promise((res,rej) => { const tx=db.transaction('records','readwrite'); tx.objectStore('records').put(row); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); });
    return row;
  },
  async bulkPut(kind, rows=[]) { for(const r of rows) await this.put(kind,r); },
  async list(kind) {
    const owner=uid(); if(!owner) return [];
    const db=await this.open();
    return await new Promise((res,rej)=>{ const tx=db.transaction('records','readonly'); const req=tx.objectStore('records').index('ownerKind').getAll(`${owner}|${kind}`); req.onsuccess=()=>res((req.result||[]).filter(r=>(r.workspaceId||'default')===workspaceId())); req.onerror=()=>rej(req.error); });
  },
  async all() {
    const owner=uid(); if(!owner) return [];
    const db=await this.open();
    return await new Promise((res,rej)=>{ const tx=db.transaction('records','readonly'); const req=tx.objectStore('records').index('owner').getAll(owner); req.onsuccess=()=>res((req.result||[]).filter(r=>(r.workspaceId||'default')===workspaceId())); req.onerror=()=>rej(req.error); });
  },
  async meta(key, value) {
    const db=await this.open(); const k=`${uid()}|${workspaceId()}|${key}`;
    if(arguments.length > 1) {
      await new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put({key:k,value}); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); });
      return value;
    }
    return await new Promise((res,rej)=>{ const tx=db.transaction('meta','readonly'); const req=tx.objectStore('meta').get(k); req.onsuccess=()=>res(req.result?.value); req.onerror=()=>rej(req.error); });
  },
  async clearOwner() {
    const rows=await this.all(); const db=await this.open();
    await new Promise((res,rej)=>{ const tx=db.transaction('records','readwrite'); const st=tx.objectStore('records'); rows.forEach(r=>st.delete(r.key)); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); });
  }
};

function core() {
  if(!window.KMCore?.db || !window.KMCore?.user) throw new Error('Please login first');
  return window.KMCore;
}
function cloudCol(kind) {
  const c=core(), f=c.firebase;
  return f.collection(c.db,'km_users',c.user.uid,'workspaces',workspaceId(),kind);
}
function plainDoc(id,data) {
  const p={id};
  for(const [k,v] of Object.entries(data||{})) {
    if(v?.toDate) p[k]=v.toDate().toISOString();
    else if(Array.isArray(v)) p[k]=v.map(x => x?.toDate ? x.toDate().toISOString() : x);
    else p[k]=v;
  }
  return p;
}
async function cloudDelta(kind, force=false) {
  const c=core(), f=c.firebase, owner=c.user.uid, wid=workspaceId();
  const col=f.collection(c.db,'km_users',owner,'workspaces',wid,kind);
  
  const last=force?0:Number(await LocalDB.meta(`sync:v72:${kind}`)||0);
  let cursor=null,total=0,newest=last;
  do {
    const constraints=last>0?[f.where('updatedAt','>=',new Date(last)),f.orderBy('updatedAt')]:[f.orderBy('updatedAtMs')];
    if(cursor)constraints.push(f.startAfter(cursor));
    constraints.push(f.limit(300));
    const snap=await f.getDocs(f.query(col,...constraints));
    if(uid()!==owner||workspaceId()!==wid)throw new Error('Account changed; sync dobara karein');
    for(const d of snap.docs){const raw=d.data(),row=plainDoc(d.id,raw);if(uid()!==owner||workspaceId()!==wid)throw new Error('Account changed');await LocalDB.put(kind,{...row,workspaceId:wid});newest=Math.max(newest,toMillis(raw.updatedAt||raw.createdAt));}
    total+=snap.size;cursor=snap.size===300?snap.docs.at(-1):null;
  }while(cursor);
  if(newest)await LocalDB.meta(`sync:v72:${kind}`,newest);
  return total;
}
const syncJobs=new Map();
async function smartRefresh(kinds, force=false, full=false) {
  const key=uid()+'|'+workspaceId()+'|'+[...kinds].sort().join(',');
  if(syncJobs.has(key))return syncJobs.get(key);
  const job=(async()=>{
    const state=$('kmSyncState');
    if(!navigator.onLine){if(state)state.textContent='Offline · cached data';return false;}
    const last=Number(await LocalDB.meta('refresh:'+kinds.join(','))||0);
    if(!force&&Date.now()-last<SYNC_TTL_MS)return true;
    if(state)state.textContent='Syncing…';
    try{
      let total=0;for(const kind of kinds)total+=await cloudDelta(kind,full);
      await LocalDB.meta('refresh:'+kinds.join(','),Date.now());
      if(state)state.textContent='Synced · '+total+' records';
      return true;
    }catch(e){if(state)state.textContent='Sync failed · retry';console.warn('Sync failed',e);if(force)throw e;return false;}
  })();syncJobs.set(key,job);try{return await job;}finally{syncJobs.delete(key);}
}

async function audit(action, detail={}) {
  try {
    const c=core(), f=c.firebase, data={action,detail,...workspaceFields(),device:navigator.userAgent.slice(0,120),createdAtISO:nowISO(),updatedAtMs:Date.now()};
    const ref=await f.addDoc(cloudCol('km_audit'), {...data,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});
    await LocalDB.put('km_audit',{...data,id:ref.id});
  } catch(e) { console.warn('audit skipped',e.message); }
}


const createStates=new WeakMap();
async function createRecord(kind,record){
 const c=core(),f=c.firebase,node=document.querySelector('#modalBox .km-form')||document.getElementById('modalBox')?.firstElementChild;
 if(!node)throw new Error('Entry form dobara kholein');
 let states=createStates.get(node);if(!states){states=new Map();createStates.set(node,states);}
 let saved=states.get(kind);
 if(!saved){saved={ref:f.doc(cloudCol(kind),window.H360Save?.recordId(kind)||crypto.randomUUID()),payload:structuredClone(record),committed:false};states.set(kind,saved);}
 if(!saved.committed){await f.setDoc(saved.ref,{...saved.payload,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});saved.committed=true;}
 Object.assign(record,saved.payload);return saved.ref;
}

// ---------- Business rendering ----------
async function renderBusiness() {
  if(!uid()) return;
  const [sales,purchases,expenses] = await Promise.all([LocalDB.list('km_sales'),LocalDB.list('km_purchases'),LocalDB.list('km_expenses')]);
  const today=todayKey();
  const sToday=sales.filter(x=>localDateKey(new Date(x.createdAtISO))===today && !x.deletedAt);
  const eToday=expenses.filter(x=>localDateKey(new Date(x.createdAtISO))===today && !x.deletedAt);
  const salesTotal=sToday.reduce((a,x)=>a+Number(x.total||0),0);
  const profit=sToday.reduce((a,x)=>a+Number(x.grossProfit||0),0);
  const exp=eToday.reduce((a,x)=>a+Number(x.amount||0),0);
  $('kmTodaySales').textContent=money(salesTotal); $('kmTodayOrders').textContent=`${sToday.length} bills`;
  $('kmTodayProfit').textContent=money(profit); $('kmTodayExpense').textContent=money(exp);
  $('kmBusinessDue').textContent=money((window.KMCore?.customers||[]).reduce((a,c)=>a+Number(c.balance||0),0));
  renderList('kmSalesList',sales,'🧾',x=>x.invoiceNo||'Sale',x=>`${dateLabel(x.createdAtISO)} · ${x.paymentMethod||'cash'}`,x=>money(x.total));
  renderList('kmPurchaseList',purchases,'📥',x=>x.supplierName||'Purchase',x=>dateLabel(x.createdAtISO),x=>money(x.total));
  renderList('kmExpenseList',expenses,'💸',x=>x.category||'Expense',x=>x.note||dateLabel(x.createdAtISO),x=>money(x.amount));
  smartRefresh(['km_sales','km_purchases','km_expenses']).then(renderBusinessLocalOnly);
}
async function renderBusinessLocalOnly(){
  await updateBusinessMetrics();
  const [sales,purchases,expenses]=await Promise.all([LocalDB.list('km_sales'),LocalDB.list('km_purchases'),LocalDB.list('km_expenses')]);
  renderList('kmSalesList',sales,'🧾',x=>x.invoiceNo||'Sale',x=>`${dateLabel(x.createdAtISO)} · ${x.paymentMethod||'cash'}`,x=>money(x.total));
  renderList('kmPurchaseList',purchases,'📥',x=>x.supplierName||'Purchase',x=>dateLabel(x.createdAtISO),x=>money(x.total));
  renderList('kmExpenseList',expenses,'💸',x=>x.category||'Expense',x=>x.note||dateLabel(x.createdAtISO),x=>money(x.amount));
}
function renderList(id, rows, icon, title, sub, value) {
  const el=$(id); if(!el) return;
  const arr=[...rows].filter(x=>!x.deletedAt).sort((a,b)=>toMillis(b.createdAtISO||b.createdAt)-toMillis(a.createdAtISO||a.createdAt)).slice(0,12);
  if(!arr.length){ el.innerHTML='<div class="km-empty">Abhi koi record nahi.</div>'; return; }
  el.innerHTML=arr.map(x=>`<div class="km-list-row"><div class="km-list-icon">${icon}</div><div class="km-list-main"><b>${idText(title(x))}</b><small>${idText(sub(x))}</small></div><div class="km-list-value">${idText(value(x))}</div></div>`).join('');
}

// ---------- POS / Sale ----------
let saleLineSeq=0;
function stockOptions(selected='', includeEmpty=false) {
  const items=(window.KMCore?.stockItems||[]).filter(x=>includeEmpty||Number(x.quantity||0)>0);
  return '<option value="">Select item…</option>'+items.map(x=>`<option value="${idText(x.id)}" ${x.id===selected?'selected':''}>${idText((x.emoji||'📦')+' '+x.name)} — ${x.quantity||0} ${idText(x.unit||'')}</option>`).join('');
}
function customerOptions() {
  return '<option value="">Walk-in / Cash customer</option>'+(window.KMCore?.customers||[]).map(x=>`<option value="${idText(x.id)}">${idText(x.name)} — ${idText(x.phone||'')}</option>`).join('');
}
function supplierOptions() {
  return '<option value="">No supplier</option>'+(window.KMCore?.suppliers||[]).map(x=>`<option value="${idText(x.id)}">${idText(x.name)}</option>`).join('');
}
function saleLineHTML() {
  const n=++saleLineSeq;
  return `<div class="km-sale-line" data-line="${n}"><div><label>Item</label><select class="km-item" onchange="KMFeatures.saleItemChanged(this)">${stockOptions()}</select></div><div><label>Qty</label><input class="km-qty" type="number" step="0.01" value="1" min="0.01" oninput="KMFeatures.calcSale()"></div><div><label>Rate</label><input class="km-rate" type="number" step="0.01" value="0" min="0" oninput="KMFeatures.calcSale()"></div><button type="button" onclick="KMFeatures.removeSaleLine(this)">×</button></div>`;
}
function openSale() {
  const html=`<div class="km-form"><h3 class="km-modal-title">🧾 New Sale / POS</h3><p class="km-modal-sub">Stock automatically minus hoga; udhaar ho to customer khata bhi update hoga.</p>
    <label>Customer</label><select id="kmSaleCustomer">${customerOptions()}</select>
    <div id="kmSaleLines">${saleLineHTML()}</div><button class="km-chip" type="button" onclick="KMFeatures.addSaleLine()">＋ Add item</button>
    <div class="km-grid-2"><div><label>Discount</label><input id="kmSaleDiscount" type="number" value="0" min="0" oninput="KMFeatures.calcSale()"></div><div><label>Paid now</label><input id="kmSalePaid" type="number" value="0" min="0" oninput="KMFeatures.calcSale()"></div></div>
    <div class="km-grid-2"><div><label>Payment</label><select id="kmSaleMethod"><option value="cash">Cash</option><option value="bank">Bank</option><option value="easypaisa">EasyPaisa</option><option value="jazzcash">JazzCash</option><option value="credit">Udhaar</option></select></div><div><label>Note</label><input id="kmSaleNote" placeholder="Optional"></div></div>
    <div class="km-summary-box"><div><span>Total</span><b id="kmSaleTotal">Rs 0</b></div><div><span>Due</span><b id="kmSaleDue">Rs 0</b></div></div>
    <div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="KMFeatures.saveSale()">Save Sale</button></div></div>`;
  window.showModal(html); setTimeout(calcSale,30);
}
function addSaleLine(){ $('kmSaleLines')?.insertAdjacentHTML('beforeend',saleLineHTML()); }
function removeSaleLine(btn){ if(document.querySelectorAll('#kmSaleLines .km-sale-line').length>1){btn.closest('.km-sale-line').remove();calcSale();} }
function saleItemChanged(sel){ const s=(window.KMCore?.stockItems||[]).find(x=>x.id===sel.value); const line=sel.closest('.km-sale-line'); if(s) line.querySelector('.km-rate').value=Number(s.saleRate||s.sellRate||s.rate||0); calcSale(); }
function getSaleLines(){
  return [...document.querySelectorAll('#kmSaleLines .km-sale-line')].map(line=>{const stockId=line.querySelector('.km-item').value; const s=(window.KMCore?.stockItems||[]).find(x=>x.id===stockId); const qty=Number(line.querySelector('.km-qty').value||0), rate=Number(line.querySelector('.km-rate').value||0); return {stockId,name:s?.name||'',emoji:s?.emoji||'📦',unit:s?.unit||'',qty,rate,costRate:Number(s?.rate||0),stockQty:Number(s?.quantity||0),lineTotal:qty*rate};}).filter(x=>x.stockId&&x.qty>0); }
function calcSale(){ const lines=getSaleLines(), sub=lines.reduce((a,x)=>a+x.lineTotal,0), disc=Number($('kmSaleDiscount')?.value||0), total=Math.max(0,sub-disc), paid=Math.max(0,Number($('kmSalePaid')?.value||0)), due=Math.max(0,total-paid); if($('kmSaleTotal')) $('kmSaleTotal').textContent=money(total); if($('kmSaleDue')) $('kmSaleDue').textContent=money(due); return {lines,sub,discount:disc,total,paid,due}; }
let saleBusy=false;
async function saveSale(){
 if(saleBusy)return;saleBusy=true;
 try{
  const c=core(),f=c.firebase,data=calcSale();if(!data.lines.length)throw new Error('Kam az kam 1 item select karein');
  const qty=aggregateSaleLines(data.lines);
  if(!Number.isFinite(data.discount)||data.discount<0||data.discount>data.sub||!Number.isFinite(data.paid)||data.paid<0||data.paid>data.total)throw new Error('Discount ya paid amount check karein');
  const customerId=$('kmSaleCustomer').value,customer=c.customers.find(x=>x.id===customerId);
  if(data.due>0&&!customer)throw new Error('Udhaar ke liye customer select karein');
  const wid=workspaceId(),fields=workspaceFields(),ts=Date.now(),invoiceNo='H360-'+ts+'-'+crypto.randomUUID().slice(0,4);
  const saleRef=f.doc(cloudCol('km_sales')),note=$('kmSaleNote').value.trim();
  const sale={invoiceNo,customerId:customerId||null,customerName:customer?.name||'Walk-in',items:data.lines,subtotal:data.sub,discount:data.discount,total:data.total,paid:data.paid,due:data.due,paymentMethod:$('kmSaleMethod').value,note,...fields,createdAtISO:nowISO(),updatedAtMs:ts};
  await f.runTransaction(c.db,async tx=>{
   const stocks=new Map();
   for(const [id] of qty){const ref=f.doc(c.db,'stock_items',id),snap=await tx.get(ref);if(!snap.exists()||snap.data().deletedAt||snap.data().workspaceKey!==fields.workspaceKey)throw new Error('Stock item available nahi');stocks.set(id,{ref,...snap.data()});}
   const customerRef=customer?f.doc(c.db,'customers',customer.id):null;
   const customerSnap=customerRef?await tx.get(customerRef):null;
   if(customerRef&&(!customerSnap.exists()||customerSnap.data().workspaceKey!==fields.workspaceKey))throw new Error('Customer available nahi');
   for(const [id,count] of qty){const stock=stocks.get(id);if(count>Number(stock.quantity||0))throw new Error(stock.name+': stock sirf '+stock.quantity+' hai');}
   sale.grossProfit=data.lines.reduce((sum,line)=>sum+(line.rate-Number(stocks.get(line.stockId).rate||0))*line.qty,0)-data.discount;
   sale.items=data.lines.map(line=>({...line,costRate:Number(stocks.get(line.stockId).rate||0)}));
   tx.set(saleRef,{...sale,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});
   for(const [id,count] of qty){const stock=stocks.get(id);tx.update(stock.ref,{quantity:Number(stock.quantity||0)-count,updatedAt:f.serverTimestamp()});tx.set(f.doc(f.collection(c.db,'stock_movements')),{stockId:id,stockName:stock.name,type:'out',quantity:count,unit:stock.unit||'',reason:'sold',customer:sale.customerName,notes:invoiceNo,ownerEmail:c.user.email,...fields,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});}
   if(data.due>0){const balance=Number(customerSnap.data().balance||0)+data.due;tx.set(f.doc(f.collection(c.db,'transactions')),{customerId:customer.id,customerName:customer.name,type:'debit',amount:data.due,items:'Sale '+invoiceNo,notes:note,balanceAfter:balance,ownerEmail:c.user.email,...fields,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});tx.update(customerRef,{balance,updatedAt:f.serverTimestamp()});}
  });
  await LocalDB.put('km_sales',{...sale,id:saleRef.id});void audit('sale_created',{invoiceNo,total:sale.total,due:sale.due});closeModal();showToast('Sale saved · '+money(sale.total),'success');renderBusiness();showSaleReceipt({...sale,id:saleRef.id});
 }catch(e){showToast('Sale save nahi hui: '+e.message,'error');}finally{saleBusy=false;}
}

function showSaleReceipt(s){
  const lines=s.items.map(x=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dashed var(--border);font-size:11px"><span>${idText(x.name)} × ${x.qty}</span><b>${money(x.lineTotal)}</b></div>`).join('');
  const payload=idText(JSON.stringify(JSON.stringify(s)));
  const html=`<div class="km-form"><h3 class="km-modal-title">✅ Sale Saved</h3><p class="km-modal-sub">${idText(s.invoiceNo)} · ${idText(shopName())}</p><div>${lines}</div><div class="km-summary-box"><div><span>Total</span><b>${money(s.total)}</b></div><div><span>Due</span><b>${money(s.due)}</b></div></div><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Close</button><button class="km-btn" onclick='KMFeatures.openSaleReceipt(${payload})'>🧾 VIP Receipt</button><button class="km-btn green" onclick='KMFeatures.shareSale(${payload})'>📤 Share Receipt</button></div></div>`;
  showModal(html);
}
function saleReceiptDocument(s){
  const rp=window.H360?.receiptProfile?.()||{name:shopName(),icon:'📒',footer:'Thank you!',phone:'',location:'',style:'modern'};
  const css=window.H360?.receiptCss?.()||'body{font-family:Arial;background:#fff;color:#17212b;padding:18px}.receipt{max-width:800px;margin:auto}';
  const rows=(s.items||[]).map(x=>`<tr><td>${idText(x.name)}</td><td style="text-align:center">${Number(x.qty||0)}</td><td style="text-align:right">${money(x.rate)}</td><td style="text-align:right"><b>${money(x.lineTotal)}</b></td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:8px 4px;border-bottom:1px dashed #ccd3dc;font-size:12px}th{text-align:left}.head{text-align:center;border-bottom:2px solid #163d5b;padding-bottom:12px}.head .icon{font-size:32px}.meta{font-size:11px;color:#667085;line-height:1.5}.totals{margin-top:14px}.totals div{display:flex;justify-content:space-between;padding:5px 0}.grand{font-size:17px;border-top:2px solid #17212b;margin-top:6px;padding-top:8px}.receipt-footer{text-align:center;margin-top:18px;font-size:11px;color:#667085}</style></head><body><div class="receipt"><div class="head"><div class="icon">${idText(rp.icon||'📒')}</div><h1>${idText(rp.name||shopName())}</h1><div class="meta">${idText(rp.location||'')}${rp.phone?'<br>'+idText(rp.phone):''}<br>Invoice: <b>${idText(s.invoiceNo)}</b><br>${idText(dateLabel(s.createdAtISO))}</div></div><div class="meta" style="margin-top:10px">Customer: <b>${idText(s.customerName||'Walk-in')}</b> · Payment: ${idText(s.paymentMethod||'cash')}</div><table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>Subtotal</span><b>${money(s.subtotal)}</b></div><div><span>Discount</span><b>${money(s.discount)}</b></div><div class="grand"><span>Total</span><b>${money(s.total)}</b></div><div><span>Paid</span><b>${money(s.paid)}</b></div><div><span>Due</span><b>${money(s.due)}</b></div></div>${s.note?`<div class="meta" style="margin-top:12px">Note: ${idText(s.note)}</div>`:''}<div class="receipt-footer">${idText(rp.footer||'Thank you!')}<br>Generated by Hisab360</div></div></body></html>`;
}
function openSaleReceipt(json){ const s=JSON.parse(json); closeModal(); window.openPdfViewer?.(saleReceiptDocument(s),`🧾 ${s.invoiceNo}`); }
async function shareSale(json){ const s=JSON.parse(json); closeModal(); window.openPdfViewer?.(saleReceiptDocument(s),`🧾 ${s.invoiceNo}`); window.openSharePdfModal?.(); }

// ---------- Purchase ----------
function openPurchase(){ const html=`<div class="km-form"><h3 class="km-modal-title">📥 Stock Purchase</h3><p class="km-modal-sub">Stock increase + supplier balance ek saath update hoga.</p><label>Supplier</label><select id="kmPurSupplier">${supplierOptions()}</select><label>Item</label><select id="kmPurItem">${stockOptions('',true)}</select><div class="km-grid-2"><div><label>Quantity</label><input id="kmPurQty" type="number" min="0.01" step="0.01" value="1"></div><div><label>Cost rate</label><input id="kmPurRate" type="number" min="0" step="0.01" value="0"></div></div><div class="km-grid-2"><div><label>Paid now</label><input id="kmPurPaid" type="number" min="0" value="0"></div><div><label>Payment</label><select id="kmPurMethod"><option>cash</option><option>bank</option><option>credit</option></select></div></div><label>Note</label><input id="kmPurNote" placeholder="Invoice / detail"><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="KMFeatures.savePurchase()">Save Purchase</button></div></div>`; showModal(html); }
let purchaseBusy=false;
async function savePurchase(){
 if(purchaseBusy)return;purchaseBusy=true;
 try{
  const c=core(),f=c.firebase,id=$('kmPurItem').value,qty=Number($('kmPurQty').value),rate=Number($('kmPurRate').value),paid=Number($('kmPurPaid').value),supplierId=$('kmPurSupplier').value,total=qty*rate;
  if(!id||![qty,rate,paid,total].every(Number.isFinite)||qty<=0||rate<0||paid<0||paid>total)throw new Error('Item, quantity, rate aur payment check karein');
  const fields=workspaceFields(),ref=f.doc(cloudCol('km_purchases')),stockRef=f.doc(c.db,'stock_items',id),supplierRef=supplierId?f.doc(c.db,'suppliers',supplierId):null;
  const rec={stockId:id,qty,rate,total,paid,due:total-paid,supplierId:supplierId||null,paymentMethod:$('kmPurMethod').value,note:$('kmPurNote').value.trim(),...fields,createdAtISO:nowISO(),updatedAtMs:Date.now()};
  await f.runTransaction(c.db,async tx=>{
   const stock=await tx.get(stockRef),supplier=supplierRef?await tx.get(supplierRef):null;
   if(!stock.exists()||stock.data().deletedAt||stock.data().workspaceKey!==fields.workspaceKey)throw new Error('Stock item nahi mila');
   if(supplierRef&&(!supplier.exists()||supplier.data().workspaceKey!==fields.workspaceKey))throw new Error('Supplier nahi mila');
   if(rec.due>0&&!supplierRef)throw new Error('Udhaar purchase ke liye supplier select karein');
   rec.itemName=stock.data().name;rec.unit=stock.data().unit||'';rec.supplierName=supplier?.data()?.name||'Cash purchase';
   tx.set(ref,{...rec,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});tx.update(stockRef,{quantity:Number(stock.data().quantity||0)+qty,rate,updatedAt:f.serverTimestamp()});
   tx.set(f.doc(f.collection(c.db,'stock_movements')),{stockId:id,stockName:rec.itemName,type:'in',quantity:qty,rate,unit:rec.unit,totalCost:total,supplierId:rec.supplierId,supplierName:rec.supplierName,notes:rec.note,ownerEmail:c.user.email,...fields,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});
   if(supplierRef)tx.update(supplierRef,{balance:Number(supplier.data().balance||0)+rec.due,totalLiya:Number(supplier.data().totalLiya||0)+total,totalDiya:Number(supplier.data().totalDiya||0)+paid,updatedAt:f.serverTimestamp()});
  });
  await LocalDB.put('km_purchases',{...rec,id:ref.id});void audit('purchase_created',{total,due:rec.due});closeModal();showToast('Purchase saved','success');renderBusiness();
 }catch(e){showToast('Purchase save nahi hui: '+e.message,'error');}finally{purchaseBusy=false;}
}

// ---------- Expenses ----------
function openExpense(){ const html=`<div class="km-form"><h3 class="km-modal-title">💸 Add Expense</h3><p class="km-modal-sub">Shop expense profit report mein automatically count hoga.</p><label>Category</label><select id="kmExpCat"><option>Rent</option><option>Electricity</option><option>Salary</option><option>Transport</option><option>Repair</option><option>Tea/Food</option><option>Tax/Fee</option><option>Other</option></select><label>Amount</label><input id="kmExpAmt" type="number" min="0" step="0.01" placeholder="0"><label>Payment</label><select id="kmExpMethod"><option>cash</option><option>bank</option><option>easypaisa</option><option>jazzcash</option></select><label>Note</label><textarea id="kmExpNote" placeholder="Optional detail"></textarea><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="KMFeatures.saveExpense()">Save Expense</button></div></div>`; showModal(html); }
async function saveExpense(){ try{ const c=core(),f=c.firebase, amount=Number($('kmExpAmt').value||0); if(!Number.isFinite(amount)||amount<=0)return showToast('Amount daalein','error'); const rec={category:$('kmExpCat').value,amount,paymentMethod:$('kmExpMethod').value,note:$('kmExpNote').value.trim(),...workspaceFields(),createdAtISO:nowISO(),updatedAtMs:Date.now()}; const ref=await createRecord('km_expenses',rec); await LocalDB.put('km_expenses',{...rec,id:ref.id}); void audit('expense_created',{category:rec.category,amount}); closeModal(); showToast('✅ Expense saved','success'); renderBusiness(); }catch(e){showToast('❌ '+e.message,'error');} }

// ---------- Daily closing ----------
async function openClosing(){
  const [sales,expenses,purchases]=await Promise.all([LocalDB.list('km_sales'),LocalDB.list('km_expenses'),LocalDB.list('km_purchases')]); const today=todayKey(); const cashSales=sales.filter(x=>localDateKey(new Date(x.createdAtISO))===today&&x.paymentMethod==='cash').reduce((a,x)=>a+Number(x.paid||0),0); const cashExpenses=expenses.filter(x=>localDateKey(new Date(x.createdAtISO))===today&&x.paymentMethod==='cash').reduce((a,x)=>a+Number(x.amount||0),0); const cashPurchases=purchases.filter(x=>localDateKey(new Date(x.createdAtISO))===today&&x.paymentMethod==='cash').reduce((a,x)=>a+Number(x.paid||0),0); let recoveries=0; const txns=window.KMCore?.transactions||{}; Object.values(txns).flat().forEach(t=>{const ms=toMillis(t.createdAt); if(ms&&localDateKey(new Date(ms))===today&&t.type==='credit') recoveries+=Number(t.amount||0);}); const html=`<div class="km-form"><h3 class="km-modal-title">💰 Daily Cash Closing</h3><p class="km-modal-sub">Expected cash = opening + cash sales + recoveries − cash purchase − expenses.</p><label>Opening cash</label><input id="kmCloseOpening" type="number" value="0" oninput="KMFeatures.calcClosing()"><div class="km-summary-box"><div><span>Cash Sales</span><b id="kmCloseSales" data-v="${cashSales}">${money(cashSales)}</b></div><div><span>Recoveries</span><b id="kmCloseRec" data-v="${recoveries}">${money(recoveries)}</b></div><div><span>Cash Purchases</span><b id="kmClosePur" data-v="${cashPurchases}">${money(cashPurchases)}</b></div><div><span>Expenses</span><b id="kmCloseExp" data-v="${cashExpenses}">${money(cashExpenses)}</b></div></div><label>Actual closing cash</label><input id="kmCloseActual" type="number" value="0" oninput="KMFeatures.calcClosing()"><div class="km-summary-box"><div><span>Expected</span><b id="kmCloseExpected">Rs 0</b></div><div><span>Difference</span><b id="kmCloseDiff">Rs 0</b></div></div><label>Note</label><input id="kmCloseNote" placeholder="Optional"><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="KMFeatures.saveClosing()">Lock Closing</button></div></div>`; showModal(html); setTimeout(calcClosing,10);
}
function calcClosing(){ const opening=Number($('kmCloseOpening')?.value||0), sales=Number($('kmCloseSales')?.dataset.v||0), rec=Number($('kmCloseRec')?.dataset.v||0), pur=Number($('kmClosePur')?.dataset.v||0), exp=Number($('kmCloseExp')?.dataset.v||0), expected=opening+sales+rec-pur-exp, actual=Number($('kmCloseActual')?.value||0), diff=actual-expected; if($('kmCloseExpected')) $('kmCloseExpected').textContent=money(expected); if($('kmCloseDiff')) $('kmCloseDiff').textContent=money(diff); return {opening,sales,rec,pur,exp,expected,actual,diff}; }
async function saveClosing(){try{const c=core(),f=c.firebase,d=calcClosing(),rec={date:todayKey(),...d,note:$('kmCloseNote').value.trim(),...workspaceFields(),createdAtISO:nowISO(),updatedAtMs:Date.now(),locked:true};const ref=await createRecord('km_closings',rec);await LocalDB.put('km_closings',{...rec,id:ref.id});void audit('cash_closing',{date:rec.date,difference:rec.diff});closeModal();showToast(`✅ Closing locked · Difference ${money(rec.diff)}`,'success');}catch(e){showToast('❌ '+e.message,'error');}}

// ---------- Barcode ----------
let scannerStream=null, scannerRAF=0;
function openBarcodeScanner(){ const html=`<div class="km-form"><h3 class="km-modal-title">📷 Barcode Lookup</h3><p class="km-modal-sub">Supported Android browsers par camera scan; warna code manually type karein.</p><video id="kmScannerVideo" playsinline muted></video><label>Barcode / item search</label><input id="kmBarcodeInput" placeholder="Scan ya type…" oninput="KMFeatures.lookupBarcode(this.value)"><div id="kmBarcodeResult" class="km-note">Camera start karne ke liye button press karein.</div><div class="km-btn-row"><button class="km-btn ghost" onclick="KMFeatures.stopScanner();closeModal()">Close</button><button class="km-btn" onclick="KMFeatures.startScanner()">Start Camera</button></div></div>`; showModal(html); }
function lookupBarcode(v){ const q=String(v||'').trim().toLowerCase(); const el=$('kmBarcodeResult'); if(!el)return; if(!q){el.textContent='Code type karein.';return;} const s=(window.KMCore?.stockItems||[]).find(x=>String(x.barcode||x.sku||'').toLowerCase()===q||(x.name||'').toLowerCase().includes(q)); el.innerHTML=s?`<b>${idText(s.emoji||'📦')} ${idText(s.name)}</b><br>Stock: ${s.quantity||0} ${idText(s.unit||'')} · Rate: ${money(s.saleRate||s.sellRate||s.rate||0)}`:'No matching item. Stock item edit mein barcode/SKU field future-ready hai.'; }
async function startScanner(){ try{ if(!('BarcodeDetector' in window)) return showToast('Camera barcode API available nahi — manual code use karein','error'); const video=$('kmScannerVideo'); scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); video.srcObject=scannerStream; await video.play(); const detector=new BarcodeDetector({formats:['ean_13','ean_8','code_128','code_39','upc_a','upc_e','qr_code']}); const tick=async()=>{if(!scannerStream)return; try{const codes=await detector.detect(video);if(codes.length){$('kmBarcodeInput').value=codes[0].rawValue;lookupBarcode(codes[0].rawValue);stopScanner();return;}}catch(e){} scannerRAF=requestAnimationFrame(tick);};tick(); }catch(e){showToast('Camera open nahi hua: '+e.message,'error');} }
function stopScanner(){ cancelAnimationFrame(scannerRAF); scannerStream?.getTracks?.().forEach(t=>t.stop()); scannerStream=null; }

// ---------- Personal loans ----------
function loanDueState(x){
  const due=x.dueDate?new Date(String(x.dueDate).slice(0,10)+'T23:59:59').getTime():0, out=Number(x.outstanding||0), now=Date.now();
  if(out<=0) return {key:'closed',label:'Closed',cls:'ok'};
  if(due && due < now) return {key:'overdue',label:'Overdue',cls:'danger'};
  if(due && due <= now + 7*86400000) return {key:'soon',label:'Due soon',cls:'warn'};
  return {key:'active',label:'Active',cls:'info'};
}
function loanPaid(x){ return Math.max(0,Number(x.total||x.principal||0)-Number(x.outstanding||0)); }
function loanPhone(v=''){ const d=String(v).replace(/\D/g,''); if(!d)return''; if(d.startsWith('92'))return d; if(d.startsWith('0'))return '92'+d.slice(1); return d; }
async function renderPersonal(){
  if(!uid())return;await renderPersonalLocalOnly();
  smartRefresh(['km_loans','km_loan_payments','km_salary','km_personal_expenses']).then(renderPersonalLocalOnly);
}
async function renderPersonalLocalOnly(){
  const loans=await LocalDB.list('km_loans'),active=loans.filter(x=>Number(x.outstanding||0)>0&&!x.deletedAt);
  $('kmLoanLent').textContent=money(active.filter(x=>x.type==='lent').reduce((s,x)=>s+Number(x.outstanding||0),0));
  $('kmLoanBorrowed').textContent=money(active.filter(x=>x.type==='borrowed').reduce((s,x)=>s+Number(x.outstanding||0),0));
  $('kmLoanDueSoon').textContent=String(active.filter(x=>['soon','overdue'].includes(loanDueState(x).key)).length);
  $('kmLoanActive').textContent=String(active.length);renderLoanList(loans);await renderSalary();await window.H360Professional?.breakdown();
  window.H360Professional?.updatePersonalHeader();
}

function renderLoanList(loans){
  const el=$('kmLoanList'); if(!el)return;
  const search=($('personalLoanSearch')?.value||'').toLowerCase(),direction=$('personalLoanDirection')?.value||'all';
  const arr=[...loans].filter(x=>!x.deletedAt&&String(x.person||'').toLowerCase().includes(search)&&(direction==='all'||x.type===direction)).sort((a,b)=>toMillis(b.createdAtISO)-toMillis(a.createdAtISO));
  if(!arr.length){el.innerHTML='<div class="km-empty">Abhi koi personal loan record nahi.</div>';return;}
  el.innerHTML=arr.map(x=>{
    const st=loanDueState(x), total=Number(x.total||x.principal||0), paid=loanPaid(x), pct=total>0?Math.min(100,Math.round((paid/total)*100)):0;
    const due=x.dueDate?new Date(x.dueDate).toLocaleDateString('en-PK'):'Open';
    return `<button class="km-loan-row" onclick="KMFeatures.openLoanDetail('${x.id}')">
      <span class="km-list-icon">${x.type==='lent'?'↗️':'↙️'}</span>
      <span class="km-list-main"><b>${idText(x.person||'Loan')}</b><small>${x.type==='lent'?'In se lene hain':'In ko dene hain'} · Due ${idText(due)}${x.phone?' · 📱 '+idText(x.phone):''}</small><span class="km-progress"><i style="width:${pct}%"></i></span></span>
      <span class="km-loan-side"><em class="km-state ${st.cls}">${st.label}</em><strong>${money(x.outstanding)}</strong></span>
    </button>`;
  }).join('');
}
function openLoan(type){
  const html=`<div class="km-form"><h3 class="km-modal-title">${type==='lent'?'↗️ Maine Diya':'↙️ Maine Liya'}</h3><p class="km-modal-sub">Personal ledger business profit aur shop cash se separate rahega.</p>
  <div class="km-grid-2"><div><label>Person *</label><input id="kmLoanPerson" placeholder="Naam"></div><div><label>Phone / WhatsApp</label><input id="kmLoanPhone" inputmode="tel" placeholder="0300..."></div></div>
  <label>Reference / relation</label><input id="kmLoanRef" placeholder="Dost, relative, employee, etc.">
  <div class="km-grid-2"><div><label>Principal *</label><input id="kmLoanAmt" type="number" min="0" step="0.01"></div><div><label>Markup % (optional)</label><input id="kmLoanRate" type="number" min="0" step="0.01" value="0"></div></div>
  <div class="km-grid-2"><div><label>Start date</label><input id="kmLoanStart" type="date" value="${todayKey()}"></div><div><label>Due date</label><input id="kmLoanDue" type="date"></div></div>
  <div class="km-grid-2"><div><label>Installment amount</label><input id="kmLoanInst" type="number" min="0" step="0.01"></div><div><label>Frequency</label><select id="kmLoanFreq"><option value="none">No schedule</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select></div></div>
  <label>Payment channel</label><select id="kmLoanMethod"><option value="cash">Cash</option><option value="bank">Bank</option><option value="easypaisa">EasyPaisa</option><option value="jazzcash">JazzCash</option><option value="other">Other</option></select>
  <label>Note</label><textarea id="kmLoanNote" placeholder="Agreement / purpose / detail"></textarea>
  <div class="km-note">Markup yahan simple flat percentage hai. Agar markup 0 ho to total = principal.</div>
  <div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="KMFeatures.saveLoan('${type}')">Save Loan</button></div></div>`;
  showModal(html);
}
async function saveLoan(type){
  try{
    const c=core(),f=c.firebase,person=$('kmLoanPerson').value.trim(),principal=Number($('kmLoanAmt').value||0),rate=Number($('kmLoanRate').value||0);
    if(!person||!Number.isFinite(principal)||principal<=0)return showToast('Naam aur amount zaroori hai','error');
    if(!Number.isFinite(rate)||rate<0||rate>500)return showToast('Markup % check karein','error');
    const total=Number((principal+(principal*rate/100)).toFixed(2)), ts=Date.now();
    const rec={type,person,phone:$('kmLoanPhone').value.trim(),reference:$('kmLoanRef').value.trim(),principal,interestRate:rate,interestMode:'flat',total,outstanding:total,installment:Number($('kmLoanInst').value||0),installmentFrequency:$('kmLoanFreq').value,paymentMethod:$('kmLoanMethod').value,startDate:$('kmLoanStart').value||todayKey(),dueDate:$('kmLoanDue').value||null,note:$('kmLoanNote').value.trim(),status:'active',...workspaceFields(),createdAtISO:nowISO(),updatedAtMs:ts};
    const ref=await createRecord('km_loans',rec); await LocalDB.put('km_loans',{...rec,id:ref.id}); void audit('personal_loan_created',{type,person,principal,total}); closeModal(); showToast('✅ Personal loan saved','success'); renderPersonal();
  }catch(e){showToast('❌ '+e.message,'error');}
}
async function openLoanDetail(id){
  const loans=await LocalDB.list('km_loans'), loan=loans.find(x=>x.id===id); if(!loan)return showToast('Loan record nahi mila','error');
  const payments=(await LocalDB.list('km_loan_payments')).filter(p=>p.loanId===id&&!p.deletedAt).sort((a,b)=>toMillis(b.createdAtISO)-toMillis(a.createdAtISO));
  const st=loanDueState(loan), paid=loanPaid(loan), total=Number(loan.total||loan.principal||0), pct=total?Math.min(100,Math.round(paid/total*100)):0;
  const history=payments.length?payments.map(p=>`<div class="km-loan-pay"><span><b>${money(p.amount)}</b><small>${dateLabel(p.createdAtISO)} · ${idText(p.paymentMethod||'cash')}${p.note?' · '+idText(p.note):''}</small></span></div>`).join(''):'<div class="km-empty">Abhi payment history nahi.</div>';
  const html=`<div class="km-form"><div class="km-loan-detail-head"><div><h3 class="km-modal-title">${idText(loan.person)}</h3><p class="km-modal-sub">${loan.type==='lent'?'Aap ne diya':'Aap ne liya'}${loan.reference?' · '+idText(loan.reference):''}</p></div><em class="km-state ${st.cls}">${st.label}</em></div>
  <div class="km-summary-box"><div><span>Principal</span><b>${money(loan.principal)}</b></div><div><span>Total</span><b>${money(total)}</b></div><div><span>Paid</span><b>${money(paid)}</b></div><div><span>${loan.type==='lent'?'In se lene hain':'In ko dene hain'}</span><b>${money(loan.outstanding)}</b></div></div>
  <div class="km-progress large"><i style="width:${pct}%"></i></div>
  <div class="km-note">Due: <b>${loan.dueDate?new Date(loan.dueDate).toLocaleDateString('en-PK'):'Open'}</b> · Installment: <b>${loan.installment?money(loan.installment):'Not set'}</b> · ${idText(loan.installmentFrequency||'none')}${loan.phone?'<br>Phone: <b>'+idText(loan.phone)+'</b>':''}${loan.note?'<br>'+idText(loan.note):''}</div>
  <h4 class="km-subtitle">Payment History</h4>${history}
  <div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Close</button>${Number(loan.outstanding||0)>0?`<button class="km-btn" onclick="KMFeatures.openLoanPayment('${id}')">💵 Payment</button>`:''}${loan.phone?`<button class="km-btn green" onclick="KMFeatures.shareLoanReminder('${id}')">💬 Reminder</button>`:''}</div></div>`;
  showModal(html);
}
async function openLoanPayment(preselect=''){
  const loans=(await LocalDB.list('km_loans')).filter(x=>Number(x.outstanding||0)>0&&!x.deletedAt); if(!loans.length)return showToast('Koi active personal loan nahi','error');
  const opts=loans.map(x=>`<option value="${x.id}" ${x.id===preselect?'selected':''}>${idText(x.person)} — ${x.type==='lent'?'recovery':'repayment'} — ${money(x.outstanding)}</option>`).join('');
  const html=`<div class="km-form"><h3 class="km-modal-title">💵 Loan Payment</h3><label>Loan</label><select id="kmLoanPayId">${opts}</select><div class="km-grid-2"><div><label>Amount</label><input id="kmLoanPayAmt" type="number" min="0" step="0.01"></div><div><label>Channel</label><select id="kmLoanPayMethod"><option value="cash">Cash</option><option value="bank">Bank</option><option value="easypaisa">EasyPaisa</option><option value="jazzcash">JazzCash</option><option value="other">Other</option></select></div></div><label>Note</label><input id="kmLoanPayNote" placeholder="Installment / recovery note"><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="KMFeatures.saveLoanPayment()">Save Payment</button></div></div>`; showModal(html);
}
let loanPaymentBusy=false;
async function saveLoanPayment(){
 if(loanPaymentBusy)return;loanPaymentBusy=true;
 try{
  const c=core(),f=c.firebase,id=$('kmLoanPayId').value,amount=Number($('kmLoanPayAmt').value);
  if(!id||!Number.isFinite(amount)||amount<=0)throw new Error('Loan aur amount check karein');
  const loanRef=f.doc(cloudCol('km_loans'),id),payRef=f.doc(cloudCol('km_loan_payments')),fields=workspaceFields();
  const pay={loanId:id,amount,paymentMethod:$('kmLoanPayMethod').value,note:$('kmLoanPayNote').value.trim(),...fields,createdAtISO:nowISO(),updatedAtMs:Date.now()};let updated;
  await f.runTransaction(c.db,async tx=>{
   const snap=await tx.get(loanRef);if(!snap.exists()||snap.data().deletedAt)throw new Error('Loan nahi mila');
   const loan=snap.data();if(amount>Number(loan.outstanding||0)+0.001)throw new Error('Payment baqaya se zyada hai');
   const outstanding=Number((Number(loan.outstanding||0)-amount).toFixed(2));updated={...loan,id,outstanding,status:outstanding===0?'closed':'active',updatedAtMs:pay.updatedAtMs};
   pay.person=loan.person;pay.type=loan.type;tx.update(loanRef,{outstanding,status:updated.status,updatedAtMs:pay.updatedAtMs,updatedAt:f.serverTimestamp()});tx.set(payRef,{...pay,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});
  });
  await LocalDB.put('km_loans',updated);await LocalDB.put('km_loan_payments',{...pay,id:payRef.id});void audit('personal_loan_payment',{person:pay.person,amount,outstanding:updated.outstanding});closeModal();showToast('Payment saved','success');renderPersonal();
 }catch(e){showToast(e.message,'error');}finally{loanPaymentBusy=false;}
}
async function shareLoanReminder(id){
  const loan=(await LocalDB.list('km_loans')).find(x=>x.id===id); if(!loan)return;
  const direction=loan.type==='lent'?'aap se receive hona hai':'aap ko repay karna hai';
  const msg=`Assalam-o-Alaikum ${loan.person},\n\nHisab360 personal loan reminder:\nOutstanding: ${money(loan.outstanding)}\nDue: ${loan.dueDate?new Date(loan.dueDate).toLocaleDateString('en-PK'):'Open'}\nYe amount ${direction}.\n\nShukriya.`;
  try{ if(navigator.share) await navigator.share({title:'Hisab360 Loan Reminder',text:msg}); else if(loan.phone) window.open(`https://wa.me/${loanPhone(loan.phone)}?text=${encodeURIComponent(msg)}`,'_blank'); }catch(e){}
}



// ---------- Salary & Personal Finance ----------
function monthKeyFrom(v){ const d=v?new Date(v):new Date(); return Number.isNaN(+d)?todayKey().slice(0,7):d.toISOString().slice(0,7); }
function yearFrom(v){ const d=v?new Date(v):new Date(); return Number.isNaN(+d)?new Date().getFullYear():d.getFullYear(); }
async function renderSalary(){
  if(!uid())return;
  const [income,expenses]=await Promise.all([LocalDB.list('km_salary'),LocalDB.list('km_personal_expenses')]);
  const month=todayKey().slice(0,7), year=String(new Date().getFullYear());
  const incMonth=income.filter(x=>!x.deletedAt&&(x.date||x.createdAtISO||'').slice(0,7)===month).reduce((a,x)=>a+Number(x.amount||0),0);
  const expMonth=expenses.filter(x=>!x.deletedAt&&(x.date||x.createdAtISO||'').slice(0,7)===month).reduce((a,x)=>a+Number(x.amount||0),0);
  const incYear=income.filter(x=>!x.deletedAt&&(x.date||x.createdAtISO||'').slice(0,4)===year).reduce((a,x)=>a+Number(x.amount||0),0);
  const expYear=expenses.filter(x=>!x.deletedAt&&(x.date||x.createdAtISO||'').slice(0,4)===year).reduce((a,x)=>a+Number(x.amount||0),0);
  if($('h360SalaryIncome'))$('h360SalaryIncome').textContent=money(incMonth);
  if($('h360SalaryExpense'))$('h360SalaryExpense').textContent=money(expMonth);
  if($('h360SalaryRemaining')){$('h360SalaryRemaining').textContent=money(incMonth-expMonth);$('h360SalaryRemaining').classList.toggle('h360-salary-negative',incMonth-expMonth<0);}
  if($('h360AnnualSavings'))$('h360AnnualSavings').textContent=money(incYear-expYear);
  const rows=[...income.map(x=>({...x,_kind:'income'})),...expenses.map(x=>({...x,_kind:'expense'}))].filter(x=>!x.deletedAt).sort((a,b)=>String(b.date||b.createdAtISO||'').localeCompare(String(a.date||a.createdAtISO||''))).slice(0,12);
  window.H360Professional?.breakdown();
  const el=$('h360SalaryRecent');if(el)el.innerHTML=rows.length?rows.map(x=>`<div class="h360-money-row"><span class="ico">${x._kind==='income'?'💼':'💸'}</span><span class="main"><b>${idText(x.source||x.category||'Entry')}</b><small>${idText(x.date||'')} ${x.note?'· '+idText(x.note):''}</small></span><span class="amount ${x._kind==='income'?'h360-salary-positive':'h360-salary-negative'}">${x._kind==='income'?'+':'−'} ${money(x.amount)}</span></div>`).join(''):'<div class="km-empty">Salary / personal expense record abhi nahi.</div>';
}
function openSalaryIncome(){
  const html=`<div class="km-form"><h3 class="km-modal-title">💼 Salary / Income</h3><p class="km-modal-sub">Monthly salary, overtime, bonus ya extra income.</p><div class="km-grid-2"><div><label>Type</label><select id="h360IncomeSource"><option>Salary</option><option>Overtime</option><option>Bonus</option><option>Freelance</option><option>Business Income</option><option>Side Income</option><option>Other Income</option></select></div><div><label>Date</label><input id="h360IncomeDate" type="date" value="${todayKey()}"></div></div><label>Amount</label><input id="h360IncomeAmount" type="number" min="0" step="0.01" placeholder="0"><label>Source / employer</label><input id="h360IncomeEmployer" placeholder="Company / client name"><label>Note</label><input id="h360IncomeNote" placeholder="Month / company / detail"><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="KMFeatures.saveSalaryIncome()">Save Income</button></div></div>`;showModal(html);
}
async function saveSalaryIncome(){
  try{const c=core(),f=c.firebase,amount=Number($('h360IncomeAmount').value||0);if(!Number.isFinite(amount)||amount<=0)return showToast('Amount daalein','error');const rec={source:$('h360IncomeSource').value,employer:$('h360IncomeEmployer').value.trim(),amount,date:$('h360IncomeDate').value||todayKey(),note:$('h360IncomeNote').value.trim(),...workspaceFields(),createdAtISO:nowISO(),updatedAtMs:Date.now()};const ref=await createRecord('km_salary',rec);await LocalDB.put('km_salary',{...rec,id:ref.id});void audit('salary_income_created',{source:rec.source,amount});closeModal();showToast('✅ Income saved','success');renderSalary();}catch(e){showToast('❌ '+e.message,'error');}
}
function openPersonalExpense(){
  const html=`<div class="km-form"><h3 class="km-modal-title">💸 Personal Expense</h3><p class="km-modal-sub">Salary kidhar kharch hui — category-wise record.</p><div class="km-grid-2"><div><label>Category</label><select id="h360PExpCat">${expenseCategories.map(x=>`<option>${x}</option>`).join('')}</select></div><div><label>Date</label><input id="h360PExpDate" type="date" value="${todayKey()}"></div></div><label>Amount</label><input id="h360PExpAmount" type="number" min="0" step="0.01"><label>Note</label><input id="h360PExpNote" placeholder="Detail"><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="KMFeatures.savePersonalExpense()">Save Expense</button></div></div>`;showModal(html);
}
async function savePersonalExpense(){
  try{const c=core(),f=c.firebase,amount=Number($('h360PExpAmount').value||0);if(!Number.isFinite(amount)||amount<=0)return showToast('Amount daalein','error');const rec={category:$('h360PExpCat').value,amount,date:$('h360PExpDate').value||todayKey(),note:$('h360PExpNote').value.trim(),...workspaceFields(),createdAtISO:nowISO(),updatedAtMs:Date.now()};const ref=await createRecord('km_personal_expenses',rec);await LocalDB.put('km_personal_expenses',{...rec,id:ref.id});void audit('personal_expense_created',{category:rec.category,amount});closeModal();showToast('✅ Personal expense saved','success');renderSalary();}catch(e){showToast('❌ '+e.message,'error');}
}
async function openSalaryReport(){
  const [income,expenses]=await Promise.all([LocalDB.list('km_salary'),LocalDB.list('km_personal_expenses')]);const year=new Date().getFullYear();
  const months=Array.from({length:12},(_,i)=>({key:`${year}-${String(i+1).padStart(2,'0')}`,label:new Date(year,i,1).toLocaleString('en-PK',{month:'short'})}));
  let yi=0,ye=0;const rows=months.map(m=>{const inc=income.filter(x=>!x.deletedAt&&String(x.date||x.createdAtISO||'').startsWith(m.key)).reduce((a,x)=>a+Number(x.amount||0),0);const exp=expenses.filter(x=>!x.deletedAt&&String(x.date||x.createdAtISO||'').startsWith(m.key)).reduce((a,x)=>a+Number(x.amount||0),0);yi+=inc;ye+=exp;return `<tr><td>${m.label}</td><td>${money(inc)}</td><td>${money(exp)}</td><td>${money(inc-exp)}</td></tr>`}).join('');
  const rp=window.H360?.receiptProfile?.()||{};const html=`<!doctype html><html><head><meta charset="utf-8"><style>${window.H360?.receiptCss?.()||''}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:10px;border-bottom:1px solid #e8edf2;font-size:11px;text-align:right}th:first-child,td:first-child{text-align:left}.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.sum div{padding:12px;border:1px solid #e3eaf0;border-radius:12px}.sum span,.sum b{display:block}.sum span{font-size:9px;color:#738091}.sum b{font-size:16px;margin-top:4px}</style></head><body><main class="receipt"><div class="head"><h1>${idText(rp.icon||'🤝')} ${idText(rp.name||shopName())}</h1><div>Personal Salary & Finance · ${year}</div></div><div class="sum"><div><span>Annual Income</span><b>${money(yi)}</b></div><div><span>Annual Expense</span><b>${money(ye)}</b></div><div><span>Annual Savings</span><b>${money(yi-ye)}</b></div></div><table><thead><tr><th>Month</th><th>Income</th><th>Expense</th><th>Saved</th></tr></thead><tbody>${rows}</tbody></table><div class="receipt-footer">${idText(rp.footer||'Hisab360 Personal Finance')}<br>Generated ${new Date().toLocaleString('en-PK')}</div></main></body></html>`;window.openPdfViewer?.(html,`💼 Salary Report ${year}`);window.openSharePdfModal?.();
}

// ---------- Settings / backup ----------
function setTheme(mode){localStorage.setItem('km_theme',mode);applyTheme();showToast(`🎨 ${mode} theme applied`,'success');}
function setCompact(v){localStorage.setItem('km_compact',v?'1':'0');document.body.classList.toggle('km-compact',v);}
function renderSettingsAddon(){const v=localStorage.getItem('km_compact')==='1';if($('kmCompactToggle'))$('kmCompactToggle').checked=v;if($('kmLastBackup'))$('kmLastBackup').textContent=localStorage.getItem('km_last_backup')||'Never';if($('kmLastSync'))$('kmLastSync').textContent=localStorage.getItem('km_last_sync')||'Not yet';if($('kmFirebaseState'))$('kmFirebaseState').textContent=navigator.onLine?'Online / cached':'Offline cache';}
async function openRecycleBin(){
  try{
    const [cs,ss,ps]=await Promise.all([fetchLegacyCollection('customers'),fetchLegacyCollection('stock_items'),fetchLegacyCollection('suppliers')]);
    const groups=[['Customer','customers',cs.filter(x=>x.deletedAt)],['Stock','stock_items',ss.filter(x=>x.deletedAt)],['Supplier','suppliers',ps.filter(x=>x.deletedAt)]];
    const rows=groups.flatMap(([label,kind,arr])=>arr.map(x=>({label,kind,...x}))).sort((a,b)=>toMillis(b.deletedAt)-toMillis(a.deletedAt));
    const body=rows.length?rows.map(x=>`<div class="km-recycle-row"><span class="km-list-icon">${x.kind==='customers'?'👤':x.kind==='stock_items'?'📦':'🏪'}</span><span class="km-list-main"><b>${idText(x.name||x.shopName||x.id)}</b><small>${x.label} · ${dateLabel(x.deletedAt)}</small></span><button class="km-restore-btn" onclick="KMFeatures.restoreRecycle('${x.kind}','${x.id}')">↩ Restore</button></div>`).join(''):'<div class="km-empty">Recycle Bin khaali hai.</div>';
    showModal(`<div class="km-form"><h3 class="km-modal-title">🗑️ Recycle Bin</h3><p class="km-modal-sub">Deleted customers, stock aur suppliers yahan se restore ho sakte hain. Financial history soft-delete par preserve rehti hai.</p><div class="km-recycle-list">${body}</div><div class="km-note">Permanent purge automatic nahi rakha gaya, taa-ke accidental data loss na ho. Production policy mein retention period add kiya ja sakta hai.</div><button class="km-btn ghost" style="width:100%;margin-top:12px" onclick="closeModal()">Close</button></div>`);
  }catch(e){showToast('❌ Recycle Bin: '+e.message,'error');}
}
async function restoreRecycle(kind,id){
  try{const c=core(),f=c.firebase;await f.updateDoc(f.doc(c.db,kind,id),{deletedAt:null,deletedAtMs:0,restoredAt:f.serverTimestamp(),restoredBy:c.user.email});void audit('recycle_restore',{kind,id});closeModal();showToast('↩️ Record restore ho gaya','success');}
  catch(e){showToast('❌ Restore: '+e.message,'error');}
}
function normalize(value){
  if(value===null||value===undefined) return value;
  if(value?.toDate) return value.toDate().toISOString();
  if(value instanceof Date) return value.toISOString();
  if(Array.isArray(value)) return value.map(normalize);
  if(typeof value==='object'){const o={};for(const [k,v] of Object.entries(value))o[k]=normalize(v);return o;}
  return value;
}
async function fetchLegacyCollection(name, ownerScoped=true){
  const c=core(), f=c.firebase, ref=f.collection(c.db,name);
  const q=ownerScoped ? f.query(ref,f.where('workspaceKey','==',`${c.user.email}::${workspaceId()}`),f.where('ownerEmail','==',c.user.email)) : f.query(ref);
  const snap=await f.getDocs(q);
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function sha256Hex(text){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function buildBackup(){
  await smartRefresh(workspace()?.category==='personal'?['km_loans','km_loan_payments','km_salary','km_personal_expenses']:COLLECTIONS,true,true);
  const all=await LocalDB.all(), c=core();
  // Complete backup is intentionally on-demand; normal screens stay cached/windowed.
  const [customersAll,txAll,stockAll,suppliersAll,movesAll,paymentsAll,itemsAll]=await Promise.all([
    fetchLegacyCollection('customers'), fetchLegacyCollection('transactions'), fetchLegacyCollection('stock_items'),
    fetchLegacyCollection('suppliers'), fetchLegacyCollection('stock_movements'), fetchLegacyCollection('supplier_payments'),
    fetchLegacyCollection('items',false)
  ]);
  const txGrouped={}; txAll.forEach(t=>{const k=t.customerId||'_unassigned';(txGrouped[k]||(txGrouped[k]=[])).push(t);});
  const payload=normalize({format:'hisab360-backup',schemaVersion:APP.schema,appVersion:APP.version,exportedAt:nowISO(),owner:{uid:c.user.uid,email:c.user.email},workspace:{id:workspaceId(),category:workspace()?.category,name:shopName()},shop:c.userData||{},legacy:{customers:customersAll,transactions:txGrouped,stockItems:stockAll,suppliers:suppliersAll,stockMovements:movesAll,supplierPayments:paymentsAll,items:itemsAll},records:all.map(({key,owner,ownerKind,...r})=>r)});
  payload.integrity={algo:'SHA-256',checksum:await sha256Hex(JSON.stringify(payload))};
  return payload;
}
async function verifyBackup(data){
  if(!data?.integrity?.checksum)return {ok:true,legacy:true};
  const copy=structuredClone(data); const expected=copy.integrity.checksum; delete copy.integrity;
  const actual=await sha256Hex(JSON.stringify(copy)); return {ok:actual===expected,expected,actual};
}
async function deriveKey(password,salt,usage){const enc=new TextEncoder();const base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:180000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,[usage]);}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function makeBackupBlob(secure=false){
  const data=await buildBackup();
  if(!secure)return {blob:new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),name:`Hisab360-${todayKey()}.json`};
  const password=prompt('Secure backup password (kam az kam 6 characters):'); if(!password||password.length<6)throw new Error('Secure backup cancel / password too short');
  const enc=new TextEncoder(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await deriveKey(password,salt,'encrypt'),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(data))),b64=a=>{const u=new Uint8Array(a);let out='';for(let i=0;i<u.length;i+=0x8000)out+=String.fromCharCode(...u.subarray(i,i+0x8000));return btoa(out);},wrapper={format:'hisab360-encrypted',schemaVersion:APP.schema,kdf:'PBKDF2-SHA256-180000',cipher:'AES-256-GCM',salt:b64(salt),iv:b64(iv),data:b64(cipher)};
  return {blob:new Blob([JSON.stringify(wrapper)],{type:'application/json'}),name:`Hisab360-Secure-${todayKey()}.h360backup`};
}
async function exportBackup(secure=false){try{const {blob,name}=await makeBackupBlob(secure);if(Capacitor.isNativePlatform()){await Filesystem.requestPermissions();await Filesystem.writeFile({path:'Hisab360/Backups/'+Date.now()+'_'+name,data:await blob.text(),encoding:Encoding.UTF8,directory:Directory.Documents,recursive:true});}else downloadBlob(blob,name);localStorage.setItem('km_last_backup',new Date().toLocaleString('en-PK'));renderSettingsAddon();void audit('backup_exported',{secure});showToast(secure?'🔐 Secure backup saved':'📦 Backup saved · Hisab360/Backups','success');}catch(e){showToast('❌ '+e.message,'error');}}
function cloudProviderLabel(){return localStorage.getItem('h360_cloud_provider')||'Google Drive';}
function openCloudBackupMenu(){
  const current=cloudProviderLabel();
  const html=`<div class="km-form"><h3 class="km-modal-title">☁️ Cloud Backup</h3><p class="km-modal-sub">Backup file ko phone ke secure share sheet se cloud app mein save karein. Isse Firebase par extra storage/read load nahi padta.</p>
  <div class="km-cloud-grid"><button onclick="KMFeatures.shareCloudBackup('Google Drive')"><b>🔺 Google Drive</b><span>${current==='Google Drive'?'Default · ':''}Drive app choose karein</span></button><button onclick="KMFeatures.shareCloudBackup('OneDrive')"><b>☁️ OneDrive</b><span>${current==='OneDrive'?'Default · ':''}Microsoft cloud</span></button><button onclick="KMFeatures.shareCloudBackup('Dropbox')"><b>📦 Dropbox</b><span>${current==='Dropbox'?'Default · ':''}Dropbox app</span></button><button onclick="KMFeatures.shareCloudBackup('Other cloud')"><b>📁 Other</b><span>Files / NAS / any provider</span></button></div>
  <div class="km-note">Phone ke share menu mein apni cloud app choose karein. Backup ko aisi jagah rakhein jahan dobara access kar sakein.</div><button class="km-btn ghost" style="width:100%;margin-top:12px" onclick="closeModal()">Close</button></div>`;
  showModal(html);
}
async function shareCloudBackup(provider='Google Drive'){
  try{
    localStorage.setItem('h360_cloud_provider',provider); const {blob,name}=await makeBackupBlob(false); const file=new File([blob],name,{type:'application/json'});
    if(Capacitor.isNativePlatform()){
      const saved=await Filesystem.writeFile({path:'Hisab360/'+Date.now()+'_'+name,data:await blob.text(),encoding:Encoding.UTF8,directory:Directory.Cache,recursive:true});await Share.share({title:'Hisab360 Backup',text:`Save this backup in ${provider}.`,files:[saved.uri],dialogTitle:'Save Backup'});
    }else if(navigator.share&&navigator.canShare?.({files:[file]})){
      await navigator.share({title:`Hisab360 Backup → ${provider}`,text:`Save this backup in ${provider}.`,files:[file]}); localStorage.setItem('km_last_backup',new Date().toLocaleString('en-PK')); renderSettingsAddon(); void audit('backup_shared_cloud',{provider});
    }else{downloadBlob(blob,name);showToast(`${provider} share unavailable — backup phone par save kar di`,'info');}
  }catch(e){if(e.name!=='AbortError')showToast('❌ '+e.message,'error');}
}
async function parseBackupFile(file){
  if(!file)throw new Error('File select nahi hui'); const obj=JSON.parse(await file.text()); let data=obj;
  if(obj.format==='hisab360-encrypted'){const password=prompt('Backup password:');if(!password)throw new Error('Password required');const dec=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),salt=dec(obj.salt),iv=dec(obj.iv),key=await deriveKey(password,salt,'decrypt'),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,dec(obj.data));data=JSON.parse(new TextDecoder().decode(plain));}
  const check=await verifyBackup(data); if(!check.ok)throw new Error('Backup checksum mismatch — file corrupt ya modified hai'); return data;
}
async function previewRestore(file){
  try{
    const data=await parseBackupFile(file); if(data.format!=='hisab360-backup')throw new Error('Ye Hisab360 backup file nahi'); window.__kmRestore=data; const legacy=data.legacy||{},rows=data.records||[];
    const counts={customers:(legacy.customers||[]).length,transactions:Object.values(legacy.transactions||{}).flat().length,stock:(legacy.stockItems||[]).length,suppliers:(legacy.suppliers||[]).length,sales:rows.filter(x=>x.kind==='km_sales'||x.invoiceNo).length,purchases:rows.filter(x=>x.kind==='km_purchases').length,expenses:rows.filter(x=>x.kind==='km_expenses').length,loans:rows.filter(x=>x.kind==='km_loans'||(x.principal!==undefined&&x.person)).length,records:rows.length};
    const html=`<div class="km-form"><h3 class="km-modal-title">♻️ Restore Preview</h3><p class="km-modal-sub">Backup: ${idText(data.exportedAt||'')} · schema v${data.schemaVersion||'?'}</p><div class="km-summary-box"><div><span>Customers</span><b>${counts.customers}</b></div><div><span>Transactions</span><b>${counts.transactions}</b></div><div><span>Stock</span><b>${counts.stock}</b></div><div><span>Suppliers</span><b>${counts.suppliers}</b></div><div><span>Sales / Purchases</span><b>${counts.sales} / ${counts.purchases}</b></div><div><span>Expenses / Loans</span><b>${counts.expenses} / ${counts.loans}</b></div></div><div class="km-note">${data.integrity?.checksum?'Backup integrity verified.':'Legacy backup: checksum available nahi.'} Target workspace: <b>${idText(shopName())}</b>. Restore existing IDs ko merge/overwrite karega. Auth/password restore nahi hote; automatic delete nahi hoga.</div><div class="km-btn-row"><button class="km-btn ghost" onclick="closeModal()">Cancel</button><button class="km-btn green" onclick="KMFeatures.restoreBackup()">Restore Now</button></div></div>`; showModal(html);
  }catch(e){showToast('❌ Restore file: '+e.message,'error');}finally{if($('kmRestoreFile'))$('kmRestoreFile').value='';}
}
function reviveForFirestore(obj){if(Array.isArray(obj))return obj.map(reviveForFirestore);if(!obj||typeof obj!=='object')return obj;const out={};for(const [k,v] of Object.entries(obj)){if(typeof v==='string'&&/(At|Date)$/.test(k)&&/^\d{4}-\d{2}-\d{2}T/.test(v))out[k]=new Date(v);else out[k]=reviveForFirestore(v);}return out;}
async function restoreBackup(){try{const data=window.__kmRestore;if(!data)throw new Error('No restore data');if(data.workspace?.category&&data.workspace.category!==workspace()?.category)throw new Error('Backup category current workspace se match nahi karti');if(!confirm('Restore '+shopName()+' mein start karein? Existing records overwrite/merge ho sakte hain.'))return;const c=core(),f=c.firebase;showToast('♻️ Restore chal raha hai…','info');const chunks=[];const push=(ref,payload)=>chunks.push([ref,payload]);for(const x of data.legacy?.customers||[])if(x.id)push(f.doc(c.db,'customers',x.id),{...x,ownerEmail:c.user.email,...workspaceFields()});for(const arr of Object.values(data.legacy?.transactions||{}))for(const x of arr)if(x.id)push(f.doc(c.db,'transactions',x.id),{...x,ownerEmail:c.user.email,...workspaceFields()});for(const x of data.legacy?.stockItems||[])if(x.id)push(f.doc(c.db,'stock_items',x.id),{...x,ownerEmail:c.user.email,...workspaceFields()});for(const x of data.legacy?.suppliers||[])if(x.id)push(f.doc(c.db,'suppliers',x.id),{...x,ownerEmail:c.user.email,...workspaceFields()});for(const x of data.legacy?.stockMovements||[])if(x.id)push(f.doc(c.db,'stock_movements',x.id),{...x,ownerEmail:c.user.email,...workspaceFields()});for(const x of data.legacy?.supplierPayments||[])if(x.id)push(f.doc(c.db,'supplier_payments',x.id),{...x,ownerEmail:c.user.email,...workspaceFields()});for(const x of (c.isMaster()?data.legacy?.items||[]:[]))if(x.id)push(f.doc(c.db,'items',x.id),x);for(let i=0;i<chunks.length;i+=350){const batch=f.writeBatch(c.db);for(const [ref,payload] of chunks.slice(i,i+350)){const clean=reviveForFirestore({...payload});delete clean.id;batch.set(ref,clean,{merge:true});}await batch.commit();}
    for(const r of data.records||[]){const kind=r.kind||inferKind(r);if(!kind||!r.id)continue;const clean={...r,...workspaceFields()};delete clean.key;delete clean.owner;delete clean.ownerKind;await f.setDoc(f.doc(c.db,'km_users',c.user.uid,'workspaces',workspaceId(),kind,r.id),{...clean,updatedAtMs:Date.now(),updatedAt:f.serverTimestamp()},{merge:true});await LocalDB.put(kind,clean);} void audit('backup_restored',{legacyWrites:chunks.length,records:(data.records||[]).length});closeModal();showToast('✅ Restore complete — app data refresh ho raha hai','success');setTimeout(()=>location.reload(),900);
  }catch(e){showToast('❌ Restore failed: '+e.message,'error');}}
function inferKind(r){if(r.invoiceNo)return'km_sales';if(r.principal!==undefined&&r.person)return'km_loans';if(r.category&&r.amount!==undefined)return'km_expenses';if(r.supplierName&&r.stockId)return'km_purchases';if(r.expected!==undefined&&r.actual!==undefined)return'km_closings';if(r.loanId)return'km_loan_payments';return'';}

async function syncNow(){try{if(!navigator.onLine)return showToast('Offline: internet connect karke sync karein','error');await smartRefresh(workspace()?.category==='personal'?['km_loans','km_loan_payments','km_salary','km_personal_expenses']:workspace()?.category==='hybrid'?['km_sales','km_purchases','km_expenses','km_loans','km_loan_payments','km_closings','km_salary','km_personal_expenses']:['km_sales','km_purchases','km_expenses','km_closings'],true);localStorage.setItem('km_last_sync',new Date().toLocaleString('en-PK'));renderSettingsAddon();showToast('☁️ Smart sync complete','success');renderBusinessLocalOnly();renderPersonalLocalOnly();}catch(e){showToast('❌ Sync: '+e.message,'error');}}


// ---------- Back behavior hardening ----------
function installBackGuard(){
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('modal')?.style.display==='flex'){stopScanner();}});
  const original=window.handleBackPress;
  window.KMBackToHome=()=>{ if(document.getElementById('modal')?.style.display==='flex'){stopScanner();closeModal();return true;} if(window._currentTab&&window._currentTab!=='list'){const home=document.querySelector('.tab[data-tab="list"]'); if(home)window.switchTab('list',home);return true;} return original?.()||false; };
}
installBackGuard();

// public API
window.KMFeatures={localDB:LocalDB,refresh:smartRefresh,renderBusiness,renderPersonal,renderSalary,openSalaryIncome,saveSalaryIncome,openPersonalExpense,savePersonalExpense,openSalaryReport,renderSettingsAddon,openSale,addSaleLine,removeSaleLine,saleItemChanged,calcSale,saveSale,shareSale,openSaleReceipt,openPurchase,savePurchase,openExpense,saveExpense,openClosing,calcClosing,saveClosing,openBarcodeScanner,lookupBarcode,startScanner,stopScanner,openLoan,saveLoan,openLoanDetail,openLoanPayment,saveLoanPayment,shareLoanReminder,setTheme,setCompact,exportBackup,openCloudBackupMenu,shareCloudBackup,previewRestore,restoreBackup,openRecycleBin,restoreRecycle,audit,syncNow};

console.log('✅ Hisab360 feature layer loaded v'+APP.version);

async function updateBusinessMetrics(){
 const [sales,expenses]=await Promise.all([LocalDB.list('km_sales'),LocalDB.list('km_expenses')]);const day=todayKey();
 const current=sales.filter(x=>!x.deletedAt&&localDateKey(new Date(x.createdAtISO))===day);
 $('kmTodaySales').textContent=money(current.reduce((s,x)=>s+Number(x.total||0),0));$('kmTodayOrders').textContent=current.length+' bills';
 $('kmTodayProfit').textContent=money(current.reduce((s,x)=>s+Number(x.grossProfit||0),0));
 $('kmTodayExpense').textContent=money(expenses.filter(x=>!x.deletedAt&&localDateKey(new Date(x.createdAtISO))===day).reduce((s,x)=>s+Number(x.amount||0),0));
}
