const operations=new WeakMap();
let busy=false;
function form(){return document.querySelector('#modalBox .km-form')||document.getElementById('modalBox')?.firstElementChild||document.getElementById('tab-add');}
function state(scope){const node=form();if(!node)throw new Error('Entry form dobara kholein');let map=operations.get(node);if(!map){map=new Map();operations.set(node,map);}if(!map.has(scope))map.set(scope,{id:crypto.randomUUID()});return map.get(scope);}
function recordId(scope){return state(scope).id;}
function wrap(original){return async function(...args){
 if(busy)return;
 if(!navigator.onLine){window.showToast?.('Internet connect karke entry save karein','error');return;}
 busy=true;
 const node=form(),box=node?.closest('#modalBox')||node,controls=[...box?.querySelectorAll('button,input,select,textarea')||[]].map(el=>({el,disabled:el.disabled,text:el.textContent}));
 const saveButtons=controls.filter(({el})=>el.tagName==='BUTTON'&&/save|add karein/i.test(el.textContent));
 controls.forEach(({el})=>el.disabled=true);saveButtons.forEach(({el})=>{el.textContent='Saving…';el.setAttribute('aria-busy','true');});
 box?.setAttribute('aria-busy','true');
 const message=document.createElement('p');message.className='save-progress';message.setAttribute('role','status');message.textContent='Entry save ho rahi hai. Dobara tap karne ki zaroorat nahi.';box?.append(message);
 const timer=setTimeout(()=>{message.textContent='Cloud confirmation ka wait hai. Yeh entry dobara submit na karein.';},8000);
 try{return await original.apply(this,args);}finally{
  clearTimeout(timer);busy=false;message.remove();box?.removeAttribute('aria-busy');controls.forEach(({el,disabled,text})=>{el.disabled=disabled;if(saveButtons.some(x=>x.el===el)){el.textContent=text;el.removeAttribute('aria-busy');}});
 }
};}
window.H360Save={get busy(){return busy;},recordId,wrap};
function install(){
 if(!window.KMFeatures)return setTimeout(install,50);
 for(const name of ['saveSale','savePurchase','saveExpense','saveClosing','saveLoan','saveLoanPayment','saveSalaryIncome','savePersonalExpense']){const fn=window.KMFeatures[name];if(fn&&!fn.__saveGuard){const guarded=wrap(fn);guarded.__saveGuard=true;window.KMFeatures[name]=guarded;}}
 for(const name of ['addCustomer','saveTxn','saveStockItem','saveStockIn','saveStockOut','saveSupplier','saveSupplierPayment','saveEditedCustomer']){const fn=window[name];if(fn&&!fn.__saveGuard){const guarded=wrap(fn);guarded.__saveGuard=true;window[name]=guarded;}}
}
setTimeout(install,100);
document.addEventListener('click',e=>{if(busy&&e.target.id==='modal'){e.preventDefault();e.stopImmediatePropagation();}},true);
