import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { getDocsFromServer } from 'firebase/firestore';
import {backupDue,commitBackup} from './backup-policy.js';
const kinds=['km_sales','km_purchases','km_expenses','km_loans','km_loan_payments','km_closings','km_salary','km_personal_expenses','km_audit'];
const legacyKinds=['customers','transactions','stock_items','suppliers','stock_movements','supplier_payments'];
let busy=false,retryAfter=0;
const key=(uid,wid)=>`h360_weekly_backup:${uid}:${wid}`;
function normalize(value){if(value?.toDate)return value.toDate().toISOString();if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)]));return value;}
async function snapshot(c,w){
 const f=c.firebase,owner={uid:c.user.uid,email:c.user.email},profile=structuredClone(c.userData);
 const read=async ref=>(await getDocsFromServer(ref)).docs.map(d=>({id:d.id,...normalize(d.data())}));
 const records=[];for(const kind of kinds){const rows=await read(f.collection(c.db,'km_users',owner.uid,'workspaces',w.id,kind));records.push(...rows.map(r=>({...r,kind,workspaceId:w.id})));}
 const legacy={};for(const kind of legacyKinds)legacy[kind]=await read(f.query(f.collection(c.db,kind),f.where('workspaceKey','==',owner.email+'::'+w.id),f.where('ownerEmail','==',owner.email)));
 const grouped={};for(const t of legacy.transactions)(grouped[t.customerId||'_unassigned']??=[]).push(t);
 const data={format:'hisab360-backup',schemaVersion:7,appVersion:'7.2.3',exportedAt:new Date().toISOString(),owner,workspace:{id:w.id,name:w.name,category:w.category},shop:profile,legacy:{customers:legacy.customers,transactions:grouped,stockItems:legacy.stock_items,suppliers:legacy.suppliers,stockMovements:legacy.stock_movements,supplierPayments:legacy.supplier_payments,items:await read(f.collection(c.db,'items'))},records};
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));
 data.integrity={algo:'SHA-256',checksum:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')};return data;
}
async function write(data){
 const clean=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_');
 const path=`Hisab360/Backups/${clean(data.owner.uid)}/${clean(data.workspace.id)}_${Date.now()}.json`,temp=path+'.tmp';
 await Filesystem.writeFile({path:temp,data:JSON.stringify(data,null,2),encoding:Encoding.UTF8,directory:Directory.Documents,recursive:true});
 await Filesystem.rename({from:temp,to:path,directory:Directory.Documents,toDirectory:Directory.Documents});return path;
}
function status(){
 const c=window.KMCore,el=document.getElementById('weeklyBackupStatus');if(!el||!c?.user)return;
 const times=(c.userData?.workspaces||[]).map(w=>Number(localStorage.getItem(key(c.user.uid,w.id))||0));
 el.textContent=busy?'JSON backup save ho raha hai…':times.length&&times.every(Boolean)?`Har 7 din · Aakhri backup: ${new Date(Math.min(...times)).toLocaleString('en-PK')} · Documents/Hisab360/Backups`:'Har 7 din automatic JSON · Phone ke Documents/Hisab360/Backups · Internet zaroori';
}
async function run(force=false){
 const c=window.KMCore;
 if(busy||!c?.user||!c.user.emailVerified||!navigator.onLine||!Capacitor.isNativePlatform())return;
 if(!force&&(document.visibilityState!=='visible'||Date.now()<retryAfter||window.H360Save?.busy||document.getElementById('modal')?.style.display==='flex'))return;
 const uid=c.user.uid,workspaces=structuredClone(c.userData?.workspaces||[]).filter(w=>force||backupDue(localStorage.getItem(key(uid,w.id))));
 if(!workspaces.length)return;busy=true;status();
 try{
  const permission=await Filesystem.checkPermissions();if(permission.publicStorage!=='granted'){const granted=await Filesystem.requestPermissions();if(granted.publicStorage!=='granted')throw new Error('Backup ke liye storage permission dein');}
  for(const w of workspaces){if(c.user?.uid!==uid)throw new Error('Account change hua; backup baad mein chalega');await commitBackup({load:()=>snapshot(c,w),write:async data=>{if(c.user?.uid!==uid)throw new Error('Account change hua');return write(data);},checkpoint:()=>localStorage.setItem(key(uid,w.id),String(Date.now()))});}
  localStorage.setItem('km_last_backup',new Date().toLocaleString('en-PK'));window.KMFeatures?.renderSettingsAddon();window.showToast?.('✅ JSON backup phone ke Hisab360/Backups folder mein save ho gaya','success');
 }catch(e){retryAfter=Date.now()+5*60*1000;window.showToast?.('Backup pending: '+e.message,'error');}finally{busy=false;status();}
}
window.H360WeeklyBackup={run,status,get busy(){return busy;}};
setTimeout(()=>run(),10000);setInterval(()=>{status();run();},60000);
window.addEventListener('online',()=>run());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>run(),1500);});
