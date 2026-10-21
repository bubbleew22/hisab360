const $=id=>document.getElementById(id);
let sending=false,checking=false;
function errorText(e){return e.code==='auth/too-many-requests'?'Firebase ne requests temporarily limit kar di hain. Kuch dair baad resend karein.':e.message;}
function showLegacyVerification(){
 let panel=$('legacyEmailVerify');if(panel)return;
 panel=document.createElement('section');panel.id='legacyEmailVerify';panel.className='otp-panel';panel.innerHTML='<b>Email confirmation zaroori hai</b><p>Email mein verification link kholein. Confirmation ke baad hi account request Master ko bheji jayegi.</p><button type="button" class="km-btn" id="legacySend">Resend verification email</button><button type="button" class="km-btn green" id="legacyCheck">I have verified my email</button><p id="legacyStatus" role="status" aria-live="polite"></p>';$('loginForm').append(panel);
 $('legacySend').onclick=async()=>{if(sending)return;sending=true;$('legacySend').disabled=true;try{await window.H360AuthAPI.sendVerification();$('legacyStatus').textContent='Verification link bhej diya. Inbox aur spam folder check karein.';}catch(e){$('legacyStatus').textContent=errorText(e);}finally{setTimeout(()=>{sending=false;if($('legacySend'))$('legacySend').disabled=false;},60000);}};
 $('legacyCheck').onclick=async()=>{if(checking)return;checking=true;$('legacyCheck').disabled=true;try{if(!await window.H360AuthAPI.refreshVerification())$('legacyStatus').textContent='Email abhi verify nahi hui. Email ka link pehle kholein.';}catch(e){$('legacyStatus').textContent=errorText(e);}finally{checking=false;if($('legacyCheck'))$('legacyCheck').disabled=false;}};
}
function install(){
 const form=$('signupForm');if(!form)return;
 const panel=document.createElement('section');panel.className='otp-panel';panel.id='emailVerificationInfo';panel.innerHTML='<b>Verify your email to get started</b><p>Details bharein. Hum email par confirmation link bhejein ge. Email verify hone se pehle Master ko approval request nahi jayegi.</p>';form.prepend(panel);
 const submit=form.querySelector('.btn-auth span:last-child');if(submit)submit.textContent='Create Account & Verify Email';
 for(const id of ['suPass','suPass2','loginPass']){const input=$(id);const wrap=document.createElement('div');wrap.className='password-wrap';input.parentNode.insertBefore(wrap,input);wrap.append(input);const toggle=document.createElement('button');toggle.type='button';toggle.className='password-toggle';toggle.textContent='Show';toggle.setAttribute('aria-label','Show password');toggle.onclick=()=>{input.type=input.type==='password'?'text':'password';toggle.textContent=input.type==='password'?'Show':'Hide';};wrap.append(toggle);}
 for(const id of ['suHeaderStyle','suReceiptStyle'])$(id)?.closest('.input-group')?.setAttribute('hidden','');
 const bio=$('bioBtn');if(bio)bio.style.display='none';document.querySelector('#signupForm>div[style*="font-size:11px"]')?.remove();
}
window.H360Auth={showLegacyVerification};install();
