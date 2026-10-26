// Optional public-CDN smoke test. All Supabase traffic is intercepted; no
// emails, accounts, recipes, or images are sent to the live project.
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
test('real OCR worker reads a synthetic image under the application CSP',async({page})=>{
 test.setTimeout(120000);
 const sdk=fs.readFileSync(path.join(__dirname,'../../node_modules/@supabase/supabase-js/dist/umd/supabase.js'),'utf8');
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@*/**',route=>route.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:sdk}));
 await page.route('https://knpovxbqoohsddquiyjv.supabase.co/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{"message":"Synthetic signed-out fixture"}'}));
 await page.goto('/');
 await expect.poll(()=>page.evaluate(()=>Boolean(window.Tesseract?.createWorker))).toBe(true);
 const raw=await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=460;
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,460);ctx.fillStyle='black';ctx.font='36px Arial';
  ['SYNTHETIC SOUP','Ingredients','2 cups water','1 cup rice','Instructions','Boil water. Add rice. Cook for 20 minutes.'].forEach((line,index)=>ctx.fillText(line,40,55+index*55));
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const result=await performOCR([new File([blob],'synthetic-recipe.png',{type:'image/png'})]);
  return result.rawText;
 });
 expect(raw).toMatch(/SYNTHETIC SOUP/i);expect(raw).toMatch(/rice/i);
});
