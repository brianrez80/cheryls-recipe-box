const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function setup(name='brian',overrides={}) {
 const events=[],requests=[],verifications=[],signouts=[];let clock=0;
 const user={id:name,email:name+'@example.invalid',email_confirmed_at:'verified'};
 const client={auth:{getUser:async()=>({data:{user}}),signInWithOtp:async args=>{requests.push(args);return {error:null};},verifyOtp:async args=>{verifications.push(args);return {data:{user,session:{}}};},signOut:async args=>{signouts.push(args);return {error:null};},...overrides.auth},rpc:async()=>({data:name!=='stranger'}),...overrides};
 if(overrides.auth)client.auth={getUser:async()=>({data:{user}}),signInWithOtp:async args=>{requests.push(args);return {error:null};},verifyOtp:async args=>{verifications.push(args);return {data:{user,session:{}}};},signOut:async args=>{signouts.push(args);return {error:null};},...overrides.auth};
 const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('auth.js','utf8'),c);
 const controller=c.createRecipeAuthController({client,now:()=>clock,redirectTo:'https://example.invalid/',onAuthorized:u=>events.push(['open',u.id]),onLocked:()=>events.push(['locked']),onMessage:m=>events.push(['message',m]),onState:s=>events.push(['state',s])});
 return {controller,client,user,events,requests,verifications,signouts,advance:ms=>{clock+=ms;}};
}
for(const name of ['brian','cheryl'])test(name+' verifies a six-digit email OTP before database admission',async()=>{
 const s=setup(name);assert.equal(await s.controller.sendCode(' '+name.toUpperCase()+'@example.invalid '),true);
 assert.equal(s.requests[0].options.shouldCreateUser,false);
 assert.equal(await s.controller.verifyCode('012345'),true);
 assert.equal(s.verifications[0].email,name+'@example.invalid');assert.equal(s.verifications[0].type,'email');assert.equal(s.verifications[0].token,'012345');
 assert.equal(s.controller.currentUserId(),name);assert.equal(JSON.stringify(s.events).includes('012345'),false);
});
test('existing-code entry works with a fresh controller and no request-browser state',async()=>{
 const s=setup();assert(s.controller.beginCodeEntry('brian@example.invalid'));assert.equal(await s.controller.verifyCode('012345'),true);assert.equal(s.requests.length,0);
});
test('invalid code length is rejected locally and resend cooldown prevents duplicate requests',async()=>{
 const s=setup();await s.controller.sendCode('brian@example.invalid');
 for(const value of ['','12345','1234567','abcdef'])assert.equal(await s.controller.verifyCode(value),false);
 assert.equal(s.verifications.length,0);assert.equal(await s.controller.sendCode('brian@example.invalid'),false);assert.equal(s.requests.length,1);
 s.advance(60001);assert.equal(await s.controller.sendCode('brian@example.invalid'),true);assert.equal(s.requests.length,2);
});
test('wrong/expired/reused codes and rate limits never open the collection',async()=>{
 for(const status of [403,429]){
  const s=setup('brian',{auth:{verifyOtp:async()=>({error:{status,code:'otp_expired'}})}});
  s.controller.beginCodeEntry('brian@example.invalid');assert.equal(await s.controller.verifyCode('012345'),false);assert.equal(s.controller.isAuthorized(),false);assert(!s.events.some(e=>e[0]==='open'));
 }
});
test('successful Auth verification does not authorize an unenrolled account',async()=>{
 const s=setup('stranger');s.controller.beginCodeEntry('stranger@example.invalid');assert.equal(await s.controller.verifyCode('333333'),false);assert(!s.events.some(e=>e[0]==='open'));
});
test('sign-out cancels late verification and removes the late SDK session',async()=>{
 let finish;const response=new Promise(resolve=>{finish=resolve;});const s=setup('brian',{auth:{verifyOtp:()=>response}});
 s.controller.beginCodeEntry('brian@example.invalid');const pending=s.controller.verifyCode('012345');
 assert.equal(await s.controller.validate(),false);await s.controller.signOut();finish({data:{user:s.user,session:{}}});
 assert.equal(await pending,false);assert(s.signouts.some(x=>x.scope==='local'));assert(!s.events.some(e=>e[0]==='open'));assert.equal(s.controller.isAuthorized(),false);
});
test('a mismatched verified email is signed out without reading recipes',async()=>{
 const s=setup();s.client.auth.verifyOtp=async()=>({data:{user:{...s.user,email:'other@example.invalid'},session:{}}});
 s.controller.beginCodeEntry('brian@example.invalid');assert.equal(await s.controller.verifyCode('012345'),false);assert(s.signouts.some(x=>x.scope==='local'));assert(!s.events.some(e=>e[0]==='open'));
});
test('send rate limits retain a resend cooldown and never disclose account status',async()=>{
 let calls=0;const s=setup('brian',{auth:{signInWithOtp:async()=>{calls++;return {error:{status:429}};}}});
 assert.equal(await s.controller.sendCode('brian@example.invalid'),false);assert.equal(s.controller.resendDelay(),60000);
 assert.equal(await s.controller.sendCode('brian@example.invalid'),false);assert.equal(calls,1);
 s.advance(60001);assert.equal(await s.controller.sendCode('brian@example.invalid'),false);assert.equal(calls,2);assert(!s.events.some(e=>e[0]==='open'));
});
test('a late initial session check cannot cancel a new successful OTP verification',async()=>{
 let finishInitial,calls=0;const initial=new Promise(resolve=>{finishInitial=resolve;});const s=setup();
 s.client.auth.getUser=async()=>++calls===1?initial:{data:{user:s.user}};
 const old=s.controller.validate();s.controller.beginCodeEntry('brian@example.invalid');
 assert.equal(await s.controller.verifyCode('012345'),true);finishInitial({error:{message:'No old session'}});await old;
 assert.equal(s.controller.isAuthorized(),true);assert.equal(calls,2);
});
