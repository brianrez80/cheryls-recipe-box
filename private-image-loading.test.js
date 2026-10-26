const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
function setup() {
 const jobs=[],revoked=[];let serial=0;
 const context={AbortController,setTimeout,clearTimeout,
  URL:{createObjectURL:()=>`blob:synthetic-${++serial}`,revokeObjectURL:u=>revoked.push(u)},
  getStoragePathFromUrl:r=>r.startsWith('storage://')?r.slice(10):null,
  SUPABASE_CONFIG:{STORAGE_BUCKET:'recipe-images'},
  getSupabase:()=>({storage:{from:()=>({download:(p,o,params)=>new Promise(resolve=>jobs.push({path:p,signal:params.signal,resolve}))})}})
 };
 vm.createContext(context);vm.runInContext(fs.readFileSync('images.js','utf8')+'\nthis.imageTest={requestPrivateImage,clearPrivateImages,privateImageCache};',context);
 return {...context.imageTest,jobs,revoked};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('private images deduplicate requests and limit concurrent downloads to four',async()=>{
 const s=setup();const one=s.requestPrivateImage('storage://one');assert.equal(s.requestPrivateImage('storage://one'),one);
 const all=[one,...[2,3,4,5,6].map(n=>s.requestPrivateImage('storage://'+n))];assert.equal(s.jobs.length,4);
 s.jobs[0].resolve({data:{type:'image/png'}});await tick();assert.equal(s.jobs.length,5);
 s.jobs[1].resolve({data:{type:'image/png'}});await tick();assert.equal(s.jobs.length,6);
 for(const j of s.jobs.slice(2))j.resolve({data:{type:'image/png'}});await Promise.all(all);
 assert.equal(s.privateImageCache.size,6);s.clearPrivateImages();assert.equal(s.revoked.length,6);assert.equal(s.privateImageCache.size,0);
});
test('sign-out aborts downloads and discards late image bytes and queued work',async()=>{
 const s=setup();const all=[1,2,3,4,5].map(n=>s.requestPrivateImage('storage://'+n));s.clearPrivateImages();
 assert(s.jobs.every(j=>j.signal.aborted));for(const j of s.jobs)j.resolve({data:{type:'image/png'}});await Promise.all(all);
 assert.equal(s.privateImageCache.size,0);assert.equal(s.jobs.length,4);
});
test('a failed photo can be retried without falling back to its public URL',async()=>{
 const s=setup();const p=s.requestPrivateImage('storage://retry');s.jobs[0].resolve({error:{message:'synthetic'}});await assert.rejects(p,/unavailable/);await tick();
 assert.equal(s.privateImageCache.size,0);const retry=s.requestPrivateImage('storage://retry');s.jobs[1].resolve({data:{type:'image/jpeg'}});assert.match(await retry,/^blob:/);
});
