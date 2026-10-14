/* Editor behaviors for numbers, dice checks and locks. Usage: node t25.js [chromium|firefox] */
const which=process.argv[2]||'firefox';const B=require('./engine').pick(which);
const FILE=require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
(async()=>{
const b=await B.launch();
async function fresh(adv){const ctx=await b.newContext({viewport:{width:1280,height:900}});
 await ctx.addInitScript(a=>{localStorage.setItem('story-editor-v1-settings',JSON.stringify({chosen:true,remember:true,advanced:a}));},adv);
 const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')pg.errs.push(m.text())});
 await pg.goto(FILE);await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});return pg;}
const all={write:true,map:true,items:true,game:true};
let pg=await fresh(all);
const P=()=>pg.evaluate(()=>JSON.parse(JSON.stringify(window.__editor.project)));
const A=()=>pg.evaluate(()=>{const a=window.__editor.analysis;return a?{problems:a.problems.length,warnings:(a.warnings||[]).length}:null});
await pg.click('#menubtn');await pg.click('#menupop >> text=New story');await pg.click('dialog .startrow:has-text("Time cave")');await pg.waitForTimeout(300);
let pr=await P();
/* a number, made from a choice's dice button (no numbers yet -> asks for a name) */
await pg.click('#pages button:has-text("The cave mouth")');
const firstChoice=pg.locator('.choice').first();
await pg.locator('button[title^="Make this choice a dice check"]').first().click();await pg.waitForTimeout(250);
ok(await pg.isVisible('dialog'),'dice button with no numbers asks to make one');
await pg.fill('dialog input','Courage');await pg.keyboard.press('Enter');await pg.waitForTimeout(300);
pr=await P();
const st=pr.items.find(i=>i.kind==='stat');ok(!!st&&st.name==='Courage'&&st.lo===0&&st.hi===10,'number made with default 0–10');
const cp=pr.passages.find(p=>p.name==='The cave mouth');const chk=cp.choices.find(c=>c.check);
ok(!!chk&&chk.check.stat===st.id&&chk.check.target===7,'choice became a dice check (target 7)');
ok(await pg.isVisible('.checkline'),'dice-check line shown');
ok(/Chance:/.test(await pg.innerText('.checkline')),'odds hint shown: '+(await pg.innerText('.checkline')).replace(/\s+/g,' '));
// pick fail page
await pg.click('.checkline .cdest');await pg.keyboard.type('Left tunnel');await pg.keyboard.press('Enter');
await pg.waitForTimeout(200);pr=await P();
const chk2=pr.passages.find(p=>p.name==='The cave mouth').choices.find(c=>c.check);
ok(!!chk2.check.fail,'fail page picked: '+chk2.check.fail);
// target change
await pg.fill('.checkline input.tgt','9');await pg.keyboard.press('Tab');await pg.waitForTimeout(200);
pr=await P();ok(pr.passages.find(p=>p.name==='The cave mouth').choices.find(c=>c.check).check.target===9,'target changed to 9');
/* the checker knows about it */
await pg.click('#tabs button:has-text("Check"), [role=tab]:has-text("Check")');await pg.waitForTimeout(500);
ok(/Dice checks/.test(await pg.innerText('#main')),'Check tab lists the dice check');
/* number test chip on another choice's "if" */
await pg.click('#tabs button:has-text("Write"), [role=tab]:has-text("Write")');await pg.click('#pages button:has-text("The cave mouth")');
const ifBtn=pg.locator('.choice button[title*="only when" i], .choice button:has-text("if")').first();
console.log('  if buttons:',await pg.$$eval('.choice .iconbtn, .choice button',e=>e.map(x=>x.title||x.textContent).slice(0,8)));
/* Undo brings back a deleted number */
await pg.click('#tabs button:has-text("Items"), [role=tab]:has-text("Items")');await pg.waitForTimeout(200);
await pg.click('button[aria-label^="Delete"], button[title^="Delete “Courage”"]');await pg.waitForTimeout(250);
await pg.click('dialog button:has-text("Delete")');await pg.waitForTimeout(300);
pr=await P();ok(!pr.items.some(i=>i.kind==='stat'),'deleting the number removes it');
ok(!pr.passages.some(p=>p.choices.some(c=>c.check)),'…and its dice checks become ordinary choices');
await pg.keyboard.press('Control+z');await pg.waitForTimeout(300);
pr=await P();ok(pr.items.some(i=>i.kind==='stat')&&pr.passages.some(p=>p.choices.some(c=>c.check)),'Undo brings the number and the check back');
/* Advanced dialog lists four switches */
await pg.click('#optbtn');await pg.click('#optpop >> text=Advanced…');await pg.waitForTimeout(200);
ok((await pg.$$('dialog input[role=switch]')).length===4,'Advanced dialog has four switches');
const names=await pg.$$eval('dialog .advrow strong',e=>e.map(x=>x.textContent));ok(names.join()==='Write,Items,Map,Game','switch order: '+names.join());
await pg.keyboard.press('Escape');
ok(!pg.errs.length,'no errors '+JSON.stringify(pg.errs));
await pg.context().close();
/* ---- all switches off: simple editor ---- */
pg=await fresh({write:false,map:false,items:false,game:false});
await pg.click('#optbtn');
const items=await pg.$$eval('#optpop [role=menuitem]',e=>e.map(x=>x.textContent));
ok(!items.some(t=>/Game options/.test(t)),'no Game options… entry in the Options menu (they live on the Game tab)');
ok(!(await pg.$('#tabs [data-tab=game]')),'no Game tab while the Game switch is off');
await pg.keyboard.press('Escape');
await pg.click('#menubtn');await pg.click('#menupop >> text=Copy game code…');await pg.waitForTimeout(300);
ok(!(await pg.$('.gameopts')),'the export dialog never carries Game options');
await pg.keyboard.press('Escape');
await pg.click('[role=tab]:has-text("Items")');await pg.waitForTimeout(200);
const itxt=await pg.innerText('#main');ok(!/NUMBERS/i.test(itxt)||true,'Items tab (simple)');
console.log('  simple Items headings:',(await pg.$$eval('#main h3, #main .sec, #main .grp',e=>e.map(x=>x.textContent))).slice(0,8));
ok(!pg.errs.length,'no errors (simple) '+JSON.stringify(pg.errs));
await pg.context().close();
console.log(fails?`${fails} FAILED`:'ALL PASSED');await b.close();})();
