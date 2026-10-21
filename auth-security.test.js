const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'auth.js'),'utf8');
function controller(client) {
 const context={};vm.createContext(context);vm.runInContext(source,context);
 const events=[];
 return {events,auth:context.createRecipeAuthController({client,redirectTo:'https://example.invalid/',
  onAuthorized:user=>events.push(['open',user.id]),onLocked:()=>events.push(['locked']),onMessage:text=>events.push(['message',text])})};
}
test('an authenticated but unenrolled identity never opens private data',async()=>{
 const {auth,events}=controller({auth:{getUser:async()=>({data:{user:{id:'stranger',email_confirmed_at:'verified'}}})},rpc:async()=>({data:false})});
 assert.equal(await auth.validate(),false);assert.equal(auth.isAuthorized(),false);assert.equal(events.some(e=>e[0]==='open'),false);
});
test('sign-out invalidates an in-flight admission response',async()=>{
 let finish;const admission=new Promise(resolve=>{finish=resolve;});
 const {auth,events}=controller({auth:{getUser:async()=>({data:{user:{id:'brian',email_confirmed_at:'verified'}}}),signOut:async()=>({error:null})},rpc:()=>admission});
 const pending=auth.validate();await new Promise(resolve=>setImmediate(resolve));
 await auth.signOut();finish({data:true});await pending;
 assert.equal(auth.isAuthorized(),false);assert.equal(events.some(e=>e[0]==='open'),false);
});
test('network errors lock an already opened collection',async()=>{
 let offline=false;
 const {auth,events}=controller({auth:{getUser:async()=>{if(offline)throw new Error('offline');return {data:{user:{id:'cheryl',email_confirmed_at:'verified'}}};}},rpc:async()=>({data:true})});
 assert.equal(await auth.validate(),true);offline=true;assert.equal(await auth.validate(),false);
 assert.equal(auth.currentUserId(),null);assert(events.some(e=>e[0]==='locked'));
});
test('zero affected rows cannot be reported as a successful recipe update/delete',async()=>{
 const context={window:{},console:{error(){}}};vm.createContext(context);
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'db.js'),'utf8'),context);
 context.SUPABASE_CONFIG={TABLE_NAME:'recipes'};
 context.getSupabase=()=>({from:()=>({update:()=>({eq:async()=>({error:null,count:0})}),delete:()=>({eq:async()=>({error:null,count:0})})})});
 await assert.rejects(context.updateRecipe('synthetic',{notes:'change'}),/not updated/);
 await assert.rejects(context.deleteRecipe('synthetic'),/not deleted/);
});
