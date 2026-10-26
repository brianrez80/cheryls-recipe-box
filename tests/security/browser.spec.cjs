const {test,expect,devices}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'../..');
const sdk=fs.readFileSync(path.join(root,'node_modules/@supabase/supabase-js/dist/umd/supabase.js'),'utf8');
const storageKey='sb-knpovxbqoohsddquiyjv-auth-token';
function makeSession(name) {
 const id=`10000000-0000-4000-8000-00000000000${{brian:1,cheryl:2,stranger:3}[name]}`;
 const exp=Math.floor(Date.now()/1000)+3600;
 const payload={sub:id,role:'authenticated',exp,session_id:`20000000-0000-4000-8000-00000000000${{brian:1,cheryl:2,stranger:3}[name]}`};
 const token=[{alg:'HS256',typ:'JWT'},payload].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.synthetic-test-signature';
 return {access_token:token,refresh_token:`synthetic-refresh-${name}`,token_type:'bearer',expires_in:3600,expires_at:exp,
  user:{id,email:`${name}@example.invalid`,email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}}};
}
function fixture() {
 const sessions=Object.fromEntries(['brian','cheryl','stranger'].map(n=>[n,makeSession(n)]));
 return {sessions,otp:[],verifies:[],usedCodes:new Set(),reads:0,imageReads:0,publicImageReads:0,revoked:new Set(),recipes:[{
  id:'30000000-0000-4000-8000-000000000001',name:'Synthetic family soup',main_category:'Soup',ethnicity:'American',notes:'Shared preserved recipe',status:'approved',
  member_id:'00000000-0000-4000-8000-000000000001',image_url:JSON.stringify(['https://knpovxbqoohsddquiyjv.supabase.co/storage/v1/object/public/recipe-images/recipes/legacy.png']),original_image_urls:['historical-original'],ocr_text:'Preserved OCR'
 }],labels:[{id:'00000000-0000-4000-8000-000000000001',display_name:'Cheryl',active:true}]};
}
async function connect(page,state,name) {
 if(name) await page.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:storageKey,session:state.sessions[name]});
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:route.request().url().includes('supabase')?sdk:'window.Tesseract = {};'}));
 await page.route('https://knpovxbqoohsddquiyjv.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),method=req.method();
  const token=(req.headers().authorization||'').replace('Bearer ','');
  const name=Object.keys(state.sessions).find(n=>state.sessions[n].access_token===token&&!state.revoked.has(n));
  const allowed=name==='brian'||name==='cheryl';
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
  if(method==='OPTIONS') return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  if(url.pathname.endsWith('/auth/v1/otp')) {state.otp.push(req.postDataJSON());return json({});}
  if(url.pathname.endsWith('/auth/v1/verify')) {
   const body=req.postDataJSON();state.verifies.push(body);
   const who=Object.keys(state.sessions).find(n=>state.sessions[n].user.email===body.email);
   const expected={brian:'012345',cheryl:'654321',stranger:'333333'}[who];
   if(body.type!=='email'||body.token!==expected||state.usedCodes.has(body.token))return json({code:'otp_expired',msg:'Synthetic invalid or expired code'},403);
   if(state.verifyGate){state.verifyWaiting=true;await state.verifyGate;}
   state.usedCodes.add(body.token);state.revoked.delete(who);return json(state.sessions[who]);
  }
  if(url.pathname.endsWith('/auth/v1/token')) {
   const body=req.postDataJSON(); const who=body.auth_code==='synthetic-brian'?'brian':Object.keys(state.sessions).find(n=>state.sessions[n].refresh_token===body.refresh_token);
   if(body.auth_code&&!body.code_verifier)return json({code:'bad_code_verifier',error:'invalid_grant'},400);
   return who&&!state.revoked.has(who)?json(state.sessions[who]):json({error:'invalid_grant',error_description:'Synthetic expired code'},400);
  }
  if(url.pathname.endsWith('/auth/v1/user')) return name?json(state.sessions[name].user):json({message:'Invalid session'},401);
  if(url.pathname.endsWith('/auth/v1/logout')) {if(name)state.revoked.add(name);return json({});}
  if(url.pathname.endsWith('/rpc/recipe_box_access')) return json(allowed);
  if(url.pathname.includes('/storage/v1/object/')) {
   if(url.pathname.includes('/object/public/'))state.publicImageReads++;
   if(!allowed)return json({message:'Access denied'},403);
   if(method==='POST')return json({Id:'40000000-0000-4000-8000-000000000001',Key:'recipe-images/recipes/synthetic-upload.png'});
   if(method==='DELETE')return json([]);
   state.imageReads++;
   (state.imagePaths ||= []).push(url.pathname);
   if(state.failImages)return json({message:'Synthetic transient failure'},503);
   if(state.imageGate){state.imageWaiting=true;await state.imageGate;}
   return route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ZkAAAAASUVORK5CYII=','base64')});
  }
  if(!allowed)return json({message:'Access denied'},403);
  if(url.pathname.endsWith('/family_members')) return json(state.labels);
  if(url.pathname.endsWith('/recipes')) {
   if(method==='GET') {
    state.reads++;
    if(state.readGate){state.readWaiting=true;await state.readGate;}
    return json(state.recipes.filter(r=>!url.searchParams.has('status')||r.status===url.searchParams.get('status').slice(3)));
   }
   const id=url.searchParams.get('id')?.slice(3);
   if(method==='POST') {state.recipes.push(...req.postDataJSON());return json(null,201);}
   if(method==='PATCH') {state.recipes=state.recipes.map(r=>r.id===id?{...r,...req.postDataJSON()}:r);return json(null);}
   if(method==='DELETE') {state.recipes=state.recipes.filter(r=>r.id!==id);return json(null);}
  }
  return json({message:'Unexpected fixture route'},404);
 });
}

test('magic link uses PKCE, prevents signup, persists session and clears private UI on sign-out',async({page})=>{
 const state=fixture();await connect(page,state);
 await page.goto('/');await expect(page.locator('#authScreen')).toBeVisible();
 await expect(page.locator('#authStatus')).toContainText('enrolled email');expect(state.reads).toBe(0);
 await page.locator('#authEmail').fill('brian@example.invalid');await page.locator('#sendCodeButton').click();
 await expect(page.locator('#authStatus')).toContainText('on its way');
 expect(state.otp[0].create_user).toBe(false);expect(state.otp[0].code_challenge).toBeTruthy();
 await page.goto('/?code=synthetic-brian');await expect(page.locator('#authScreen')).toBeHidden();
 expect(page.url()).not.toContain('code=');expect(state.imageReads).toBe(0);
 await page.reload();await expect(page.locator('#authScreen')).toBeHidden();
 await page.locator('[data-action=all]').click();await expect(page.locator('#recipeList')).toContainText('Synthetic family soup');
 await expect(page.locator('#recipeList img')).toHaveAttribute('src',/^blob:/);
 await page.locator('#signOutButton').click();await expect(page.locator('#authScreen')).toBeVisible();
 await expect(page.locator('#recipeList')).toBeEmpty();
 expect(await page.evaluate(()=>privateImageCache.size)).toBe(0);
 expect(await page.evaluate(()=>sessionStorage.getItem('nexusImportState'))).toBeNull();
});

test('Brian and Cheryl share recipe CRUD and search on mobile',async({browser})=>{
 const state=fixture();const brian=await browser.newContext({...devices['Galaxy S9+'],viewport:{width:390,height:844}}),cheryl=await browser.newContext();
 try {
  const a=await brian.newPage(),b=await cheryl.newPage();await connect(a,state,'brian');await connect(b,state,'cheryl');
  await a.goto('/');await expect(a.locator('#authScreen')).toBeHidden();
  await a.locator('[data-new-recipe]').click();
  await a.locator('#name').fill('Shared synthetic cake');await a.locator('#mainCategory').selectOption('Dessert');await a.locator('#ethnicity').selectOption('American');await a.locator('#notes').fill('Added by Brian');
  await a.locator('#image').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ZkAAAAASUVORK5CYII=','base64')});
  await a.locator('#recipeForm button[type=submit]').click();await expect(a.locator('#recipeList')).toContainText('Shared synthetic cake');
  expect(JSON.parse(state.recipes.find(r=>r.name==='Shared synthetic cake').image_url)[0]).toMatch(/^storage:\/\/recipe-images\//);
  await b.goto('/');await expect(b.locator('#authScreen')).toBeHidden();
  await b.locator('#recipeSearch').fill('cake');await b.locator('#recipeSearchForm button').click();
  await expect(b.locator('#recipeList')).toContainText('Shared synthetic cake');
  await expect(b.locator('#recipeList img')).toHaveAttribute('src',/^blob:/);
  await b.locator('[data-edit-id]').click();await b.locator('#notes').fill('Edited by Cheryl');await b.locator('#recipeForm button[type=submit]').click();
  await a.reload();await expect(a.locator('#authScreen')).toBeHidden();await a.locator('[data-action=all]').click();
  await expect(a.locator('#recipeList')).toContainText('Edited by Cheryl');
  a.on('dialog',dialog=>dialog.accept());await a.locator('.recipe-item').filter({hasText:'Shared synthetic cake'}).locator('[data-delete-id]').click();
  await expect(a.locator('#recipeList')).not.toContainText('Shared synthetic cake');
  expect(state.recipes.find(r=>r.name==='Synthetic family soup').ocr_text).toBe('Preserved OCR');
  expect(await a.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 } finally {await brian.close();await cheryl.close();}
});

test('unauthorized identity, expired server session, and invalid callback fail closed',async({browser})=>{
 const state=fixture();
 for(const name of ['stranger','brian']) {
  const context=await browser.newContext();const page=await context.newPage();
  try {
   if(name==='brian')state.revoked.add('brian');await connect(page,state,name);await page.goto('/');
   await expect(page.locator('#authScreen')).toBeVisible();await expect(page.locator('#authStatus')).not.toContainText('Checking');
   expect(state.reads).toBe(0);await expect(page.locator('#privateApp')).toHaveAttribute('inert','');
  } finally {await context.close();}
 }
 const context=await browser.newContext();const page=await context.newPage();
 try {await connect(page,state);await page.goto('/?error=access_denied&error_description=untrusted');
  await expect(page.locator('#authStatus')).toContainText('six-digit email code');expect(page.url()).not.toContain('untrusted');expect(state.reads).toBe(0);
  // Recovering from an invalid link must retain Auth event monitoring.
  await page.evaluate(session=>getSupabase().auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token}),state.sessions.cheryl);
  await expect(page.locator('#authScreen')).toBeHidden();
  await page.evaluate(()=>getSupabase().auth.signOut({scope:'local'}));
  await expect(page.locator('#authScreen')).toBeVisible();
  await expect(page.locator('#privateApp')).not.toContainText('Synthetic family soup');
 }finally{await context.close();}
});

test('stored recipe text and malicious image references cannot execute script',async({page})=>{
 const state=fixture();state.recipes[0].name='<img src=x onerror="window.stolen=true">';state.recipes[0].image_url='["javascript:window.stolen=true"]';
 await connect(page,state,'brian');await page.goto('/');await expect(page.locator('#authScreen')).toBeHidden();
 await page.locator('[data-action=all]').click();await expect(page.locator('#recipeList h4')).toContainText('<img');
 expect(await page.evaluate(()=>window.stolen)).toBeUndefined();await expect(page.locator('#recipeList img')).toHaveCount(0);
});

test('expired admission and delayed data responses clear the open collection',async({page})=>{
 const state=fixture();await connect(page,state,'brian');await page.goto('/');await expect(page.locator('#authScreen')).toBeHidden();
 await page.locator('[data-action=all]').click();
 let release;state.readGate=new Promise(resolve=>{release=resolve;});
 const delayed=page.evaluate(()=>loadRecipes());
 await expect.poll(()=>state.readWaiting).toBe(true);
 await page.locator('#signOutButton').click();await expect(page.locator('#authScreen')).toBeVisible();
 release();await delayed;
 await expect(page.locator('#privateApp')).not.toContainText('Synthetic family soup');
 expect(await page.evaluate(()=>recipes.length)).toBe(0);
 expect(await page.evaluate(()=>privateImageCache.size)).toBe(0);
});

test('six-digit OTP works across Android browser contexts without the requesting PKCE verifier',async({browser})=>{
 const state=fixture();const requesting=await browser.newContext();
 const mobile=await browser.newContext({...devices['Galaxy S9+'],viewport:{width:412,height:915}});
 try {
  const a=await requesting.newPage(),b=await mobile.newPage();await connect(a,state);await connect(b,state);
  await a.goto('/');await a.locator('#authEmail').fill('brian@example.invalid');await a.locator('#sendCodeButton').click();
  await expect(a.locator('#authCodeForm')).toBeVisible();expect(state.otp[0].create_user).toBe(false);
  await expect(a.locator('#resendCodeButton')).toBeDisabled();
  await b.goto('/?code=synthetic-brian');await expect(b.locator('#authStatus')).toContainText('six-digit email code');
  expect(state.reads).toBe(0);await b.locator('#authEmail').fill('brian@example.invalid');await b.locator('#haveCodeButton').click();
  await expect(b.locator('#authCode')).toHaveAttribute('inputmode','numeric');await expect(b.locator('#authCode')).toHaveAttribute('autocomplete','one-time-code');
  expect(await b.evaluate(()=>navigator.userAgent)).toContain('Android');
  expect(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await b.screenshot({path:test.info().outputPath('otp-entry-mobile.png')});
  await b.setViewportSize({width:412,height:360});
  await b.locator('#verifyCodeButton').scrollIntoViewIfNeeded();await expect(b.locator('#verifyCodeButton')).toBeInViewport();
  expect(await b.locator('#authScreen').evaluate(el=>el.scrollHeight>el.clientHeight&&el.scrollTop>0)).toBe(true);
  await b.locator('#authCode').fill('012345');await b.locator('#verifyCodeButton').click();
  await expect(b.locator('#authScreen')).toBeHidden();expect(state.verifies[0].type).toBe('email');
  await b.setViewportSize({width:412,height:915});
  expect(state.imageReads).toBe(0);expect(b.url()).not.toContain('code=');
  expect(await b.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('012345'))).toBe(false);
  await b.reload();await expect(b.locator('#authScreen')).toBeHidden();
  await b.locator('[data-action=all]').click();await expect(b.locator('#recipeList img')).toHaveAttribute('src',/^blob:/);
  expect(state.publicImageReads).toBe(0);expect(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await b.locator('#signOutButton').click();await expect(b.locator('#authScreen')).toBeVisible();
  await b.locator('#authEmail').fill('brian@example.invalid');await b.locator('#haveCodeButton').click();await b.locator('#authCode').fill('012345');await b.locator('#verifyCodeButton').click();
  await expect(b.locator('#authStatus')).toContainText('already used');await expect(b.locator('#privateApp')).toHaveAttribute('inert','');
 } finally {await requesting.close();await mobile.close();}
});

test('Cheryl can enter a code, recover from a wrong code and change the email',async({page})=>{
 const state=fixture();await connect(page,state);await page.goto('/');
 await page.locator('#authEmail').fill('wrong@example.invalid');await page.locator('#haveCodeButton').click();
 await page.locator('#changeEmailButton').click();await expect(page.locator('#authForm')).toBeVisible();
 await page.locator('#authEmail').fill('cheryl@example.invalid');await page.locator('#haveCodeButton').click();
 await page.locator('#authCode').fill('000000');await page.locator('#verifyCodeButton').click();await expect(page.locator('#authStatus')).toContainText('incorrect');
 await expect(page.locator('#authCode')).toHaveValue('');expect(state.reads).toBe(0);
 await page.locator('#authCode').fill('654321');await page.locator('#verifyCodeButton').click();await expect(page.locator('#authScreen')).toBeHidden();
 await expect(page.locator('#signedInAs')).toHaveText('cheryl@example.invalid');
});

test('a slow private photo never blocks sign-in and is discarded after sign-out',async({page})=>{
 const state=fixture();let release;state.imageGate=new Promise(r=>{release=r;});await connect(page,state,'brian');
 await page.goto('/');await expect(page.locator('#authScreen')).toBeHidden();expect(state.imageReads).toBe(0);
 await page.locator('[data-action=all]').click();await expect(page.locator('#recipeList')).toContainText('Synthetic family soup');
 await expect.poll(()=>state.imageWaiting).toBe(true);await expect(page.locator('#recipeList img')).not.toHaveAttribute('src',/public/);
 await page.locator('#signOutButton').click();release();await expect(page.locator('#authScreen')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>privateImageCache.size)).toBe(0);await expect(page.locator('#recipeList')).toBeEmpty();expect(state.publicImageReads).toBe(0);
});

test('a failed private photo can be retried without a public URL fallback',async({page})=>{
 const state=fixture();state.failImages=true;await connect(page,state,'brian');await page.goto('/');await expect(page.locator('#authScreen')).toBeHidden();
 await page.locator('[data-action=all]').click();await expect(page.locator('[data-retry-private-image]')).toBeVisible();
 state.failImages=false;await page.locator('[data-retry-private-image]').click();await expect(page.locator('#recipeList img')).toHaveAttribute('src',/^blob:/);
 await expect(page.locator('[data-retry-private-image]')).toBeHidden();expect(state.publicImageReads).toBe(0);
});

test('offscreen photos wait for scrolling instead of downloading the whole collection',async({page})=>{
 const state=fixture();const original=state.recipes[0];state.recipes=Array.from({length:12},(_,i)=>({...original,id:'synthetic-'+i,name:'Synthetic recipe '+i,image_url:JSON.stringify(['storage://recipe-images/recipes/image-'+i+'.png'])}));
 await connect(page,state,'brian');await page.goto('/');await expect(page.locator('#authScreen')).toBeHidden();expect(state.imageReads).toBe(0);
 await page.locator('[data-action=all]').click();await expect(page.locator('#recipeList img').first()).toHaveAttribute('src',/^blob:/);
 expect(state.imageReads).toBeLessThan(12);expect(state.imagePaths.some(p=>p.endsWith('image-11.png'))).toBe(false);
 await page.locator('#recipeList img').last().scrollIntoViewIfNeeded();await expect(page.locator('#recipeList img').last()).toHaveAttribute('src',/^blob:/);
 expect(state.imagePaths.some(p=>p.endsWith('image-11.png'))).toBe(true);
});

test('sign-out during OTP verification cannot open a late authenticated session',async({page})=>{
 const state=fixture();let release;state.verifyGate=new Promise(r=>{release=r;});await connect(page,state);await page.goto('/');
 await page.locator('#authEmail').fill('brian@example.invalid');await page.locator('#haveCodeButton').click();await page.locator('#authCode').fill('012345');await page.locator('#verifyCodeButton').click();
 await expect.poll(()=>state.verifyWaiting).toBe(true);await page.locator('#clearSessionButton').click();release();
 await expect(page.locator('#authStatus')).toContainText('signed out');await expect(page.locator('#authScreen')).toBeVisible();
 await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),storageKey)).toBeNull();expect(state.reads).toBe(0);
});
