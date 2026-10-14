/* Touch reordering: the ⋮⋮ grips work with a finger on a phone, including across a long list (the list scrolls while the finger is held at the edge). Chromium only (needs touch emulation). */
const pw=require('../../packages/qa-kit/src/resolve.cjs').load('playwright');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
(async()=>{const b=await pw.chromium.launch();const ctx=await b.newContext({...pw.devices['Pixel 7']});
await ctx.addInitScript(()=>{if(!sessionStorage.t1){sessionStorage.t1=1;localStorage.setItem('story-editor-v1-settings',JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true,game:true}}))}});
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href);await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});await pg.waitForTimeout(300);
const cdp=await ctx.newCDPSession(pg);const t=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
const names=(pn,k)=>pg.evaluate(([pn,k])=>{const p=window.__editor.project.passages.find(x=>x.name===pn);return k==='c'?p.choices.map(c=>c.label.slice(0,10)):p.blocks.map(c=>c.text.slice(0,10))},[pn,k]);
const rect=(s,n)=>pg.evaluate(([s,n])=>{const r=document.querySelectorAll(s)[n].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,h:r.height}},[s,n]);
const center=s=>pg.evaluate(s=>document.querySelector(s).scrollIntoView({block:'center'}),s);
ok(await pg.locator('.choice .grip').first().isVisible(),'the grips are shown on a touch screen');
ok((await rect('.choice .grip',0)).h>=30,'and are big enough for a finger ('+Math.round((await rect('.choice .grip',0)).h)+' px tall)');
/* short drag */
await center('.choice');await pg.waitForTimeout(200);
const c0=await names('Start','c');let a=await rect('.choice .grip',0),d=await rect('.choice',1);
await t('touchStart',a.x,a.y);for(let i=1;i<=8;i++){await t('touchMove',a.x,a.y+(d.y+d.h/2-a.y)*i/8);await pg.waitForTimeout(30)}await t('touchEnd');await pg.waitForTimeout(300);
const c1=await names('Start','c');ok(c1[0]===c0[1]&&c1[1]===c0[0],'a finger drag swaps two neighboring choices');
/* paragraphs */
await center('.block');await pg.waitForTimeout(200);
const b0=await names('Start','b');a=await rect('.block .grip',0);d=await rect('.block',1);
await t('touchStart',a.x,a.y);for(let i=1;i<=8;i++){await t('touchMove',a.x,a.y+(d.y+d.h/2-a.y)*i/8);await pg.waitForTimeout(30)}await t('touchEnd');await pg.waitForTimeout(300);
const b1=await names('Start','b');ok(b1[0]===b0[1]&&b1[1]===b0[0],'a finger drag swaps two paragraphs');
/* long list: first choice of an 8-choice page to the very end, finger held still at the bottom edge */
await pg.click('.pagepick');await pg.waitForTimeout(300);await pg.keyboard.type('Lamp');await pg.waitForTimeout(200);await pg.keyboard.press('Enter');await pg.waitForTimeout(500);
await center('.choice');await pg.waitForTimeout(200);
const l0=await names('Lamp','c');a=await pg.evaluate(()=>{const r=document.querySelector('.choice .grip').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,H:innerHeight}});
await t('touchStart',a.x,a.y);await t('touchMove',a.x,a.y+20);
for(let y=a.y+20;y<a.H-12;y+=40){await t('touchMove',a.x,y);await pg.waitForTimeout(20)}
await t('touchMove',a.x,a.H-6);await pg.waitForTimeout(3000);await t('touchEnd');await pg.waitForTimeout(400);
const l1=await names('Lamp','c');ok(l1[l1.length-1]===l0[0]&&l1.length===l0.length,'holding the finger at the bottom edge scrolls the list and drops the first choice last: '+JSON.stringify(l1));
ok(errs.length===0,'no errors '+errs.join('|'));
await b.close();console.log(fails?'FAILED '+fails:'ALL PASSED');process.exit(fails?1:0)})().catch(e=>{console.log('CRASH',e.message);process.exit(2)});
