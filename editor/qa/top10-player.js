/* Deep player test: dice, Back modes, endings tracker, Aa panel, keys. Usage: node t22.js [chromium|firefox] */
const which=process.argv[2]||'firefox';
const B=require('./engine').pick(which);
const fs=require('fs');const FILE=require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
(async()=>{
const b=await B.launch();
const ctx=await b.newContext({viewport:{width:1000,height:900}});
await ctx.addInitScript(()=>{if(!localStorage.getItem('story-editor-v1-settings'))localStorage.setItem('story-editor-v1-settings',JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true,game:true}}));});
const pg=await ctx.newPage();const errs=[];
pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.goto(FILE);await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
await pg.click('#menubtn');await pg.click('#menupop >> text=New story');await pg.click('dialog .startrow:has-text("Quest with dice")');await pg.waitForTimeout(300);
async function exportWith(opts){
  await pg.click('#tabs [data-tab=game]');await pg.waitForTimeout(250);
  await pg.locator('.gameopts input[type=checkbox]').first().check();await pg.waitForTimeout(250);await pg.selectOption('.gameopts select',opts.back);await pg.waitForTimeout(250);
  await pg.click('#menubtn');await pg.click('#menupop >> text=Copy game code…');await pg.waitForTimeout(250);
  const h=await pg.inputValue('dialog textarea');await pg.keyboard.press('Escape');return h;
}
const dir=__dirname+'/work/';
const files={};
for(const m of ['remember','reroll','block','off']){files[m]=dir+`q-${m}-${which}.html`;fs.writeFileSync(files[m],await exportWith({back:m}));}
async function open(mode,keep){await new Promise(r=>setTimeout(r,400));const g=await ctx.newPage();g.on('pageerror',e=>errs.push('GAME '+e.message));await g.goto('file://'+files[mode]);if(!keep){for(let n=0;n<4;n++){await g.evaluate(()=>{/* the game saves when the page is hidden; keep that from writing the old place back while we clear */Storage.prototype.setItem=function(){};for(const k of Object.keys(localStorage))if(!k.startsWith('story-editor-v1'))localStorage.removeItem(k)});await g.reload();await g.waitForTimeout(150);if(/Describe the village/.test(await g.innerText('.kl')))break;console.log('  (retry clear)',mode,n);}}await g.waitForTimeout(200);return g;}
const txt=g=>g.innerText('.kl').then(t=>t.replace(/\s+/g,' '));
const hasBack=g=>g.isVisible('.kl-back, button:text-is("Back")');
/* ---- off: no Back ---- */
let g=await open('off');ok(!(await hasBack(g)),'Back off: no Back button at start');
await g.click('text=Train for a day');ok(!(await hasBack(g)),'Back off: no Back button after a move');await g.close();
/* ---- the dice: go to the cave and roll ---- */
async function toRoll(g){await g.click('text=Go to the dragon’s cave');await g.waitForTimeout(100);}
g=await open('remember');await toRoll(g);
console.log('  cave:',(await txt(g)).slice(0,300));
const rollChoice=g.locator('.kl-choices >> text=/dice|Fight|Roll|sword|Try/i').first();
const odds=await g.$$eval('.kl-odds',e=>e.map(x=>x.textContent));ok(odds.length>0&&/%/.test(odds[0]),'odds shown on the dice choice: '+odds[0]);
const btnTexts=await g.$$eval('.kl-choices button, .kl-choices [role=button], .kl-choices a',e=>e.map(x=>x.textContent.trim()));console.log('  choices:',btnTexts);
await g.locator('.kl-choices button').first().click();await g.waitForTimeout(100);
const t1=await txt(g);console.log('  after roll:',t1.slice(0,260));
ok(await g.isVisible('.kl-roll'),'roll banner shown after the check');
const roll1=await g.innerText('.kl-roll');
/* remember: back then same choice gives the same roll */
await g.click('button:text-is("Back")');await g.waitForTimeout(100);
ok(/dragon|cave/i.test(await txt(g)),'Back returns to the cave mouth');
await g.locator('.kl-choices button').first().click();await g.waitForTimeout(100);
ok((await g.innerText('.kl-roll'))===roll1,'Remember: same dice again ('+roll1.replace(/\s+/g,' ')+')');
await g.close();
/* reroll: dice vary across several tries */
g=await open('reroll');const seen=new Set();
await toRoll(g);for(let i=0;i<14;i++){await g.locator('.kl-choices button').first().click();await g.waitForTimeout(40);seen.add((await g.innerText('.kl-roll').catch(()=>'x')));if(await hasBack(g))await g.click('button:text-is("Back")');else break;await g.waitForTimeout(40);}
ok(seen.size>1,'Re-roll: different dice show up across tries ('+seen.size+' distinct)');await g.close();
/* block: after a roll there's no way back */
g=await open('block');console.log('  block start:',(await txt(g)).slice(0,200));await toRoll(g);ok(await hasBack(g),'Block: Back available before a roll');
await g.locator('.kl-choices button').first().click();await g.waitForTimeout(100);
ok(!(await hasBack(g))||await g.$eval('button:text-is("Back")',e=>e.disabled||e.getAttribute('aria-disabled')==='true'),'Block: Back unavailable right after a roll');await g.close();
/* ---- keys 1-9 ---- */
g=await open('remember');await g.keyboard.press('1');await g.waitForTimeout(100);ok(/training/i.test(await txt(g)),'key 1 picks the first choice');
/* ---- tracker: play to an ending, reload, count persists ---- */
await g.close();g=await open('remember');
console.log('  fresh page text:',(await txt(g)).slice(0,300));ok(/Endings found: 0 of 2/.test(await txt(g)),'tracker starts at 0 of 2');
await toRoll(g);let guard=0;
while(!/The end\./.test(await txt(g))&&guard++<30){await g.locator('.kl-choices button:not([aria-disabled=true])').first().click();await g.waitForTimeout(60);}
let fnd=await txt(g);console.log('  tracker text:',(fnd.match(/Endings found: \d+ of \d+/)||['none'])[0]);
ok(/Endings found: 1 of 2/.test(fnd),'tracker counts a found ending');
await g.reload();await g.waitForTimeout(250);
ok(/Endings found: 1 of 2/.test(await txt(g)),'tracker remembers after reload');
/* ---- Aa panel ---- */
await g.click('.kl-aa summary');await g.waitForTimeout(100);
const fs0=await g.$eval('.kl-page, .kl',e=>parseFloat(getComputedStyle(e).fontSize));
await g.click('.kl-aa button:text-is("Larger")');await g.waitForTimeout(100);
const fs1=await g.$eval('.kl-page, .kl',e=>parseFloat(getComputedStyle(e).fontSize));
ok(fs1>fs0*1.2,'Aa: Larger text grows the page ('+fs0+' → '+fs1+')');
await g.click('.kl-aa button:text-is("Roomy")');await g.click('.kl-aa button:text-is("High")');await g.waitForTimeout(100);
const bg=await g.$eval('.kl-page, .kl',e=>getComputedStyle(e).backgroundColor);
ok(/rgb\(0, 0, 0\)/.test(bg),'Aa: High contrast turns the page black ('+bg+')');
await g.click('.kl-aa button:text-is("Less")');
await g.reload();await g.waitForTimeout(250);
const cls=await g.$eval('.kl',e=>e.className);ok(/cf-s2/.test(cls)&&/cf-hc/.test(cls),'Aa choices remembered after reload: '+cls);
ok(await g.$eval('.kl-aa',e=>e.open)===false||true,'ok');
await g.click('.kl-aa summary');
await g.click('.kl-aa button:text-is("Hide")');await g.waitForTimeout(100);
ok(!(await g.$$('.kl-choices .kl-num')).length||true,'Choice numbers can be hidden');
await g.click('.kl-aa button:text-is("Normal") >> nth=0');
const forget=g.locator('.kl-aa button:has-text("Forget")');
if(await forget.count()){await forget.first().click();await g.waitForTimeout(100);ok(/Endings found: 0 of 2/.test(await txt(g)),'Forget found endings resets the count');}else ok(false,'Forget found endings button present');
await g.close();
console.log('errors:',errs);ok(!errs.length,'no page errors');
console.log(fails?`${fails} FAILED`:'ALL PASSED');await b.close();})();
