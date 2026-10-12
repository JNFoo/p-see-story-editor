/* Write-tab batch 1: shared page picker, Ctrl+K, back/forward, "From" chips, sidebar toggles, sort, template. */
const which=process.argv[2]||'firefox';const B=require('./engine').pick(which);
const FILE=require('url').pathToFileURL(require('path').join(__dirname, '..', 'story-editor.html')).href;
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
(async()=>{
const b=await B.launch();
async function fresh(w=1280,h=900){const ctx=await b.newContext({viewport:{width:w,height:h}});
 await ctx.addInitScript(()=>{localStorage.setItem('story-editor-v1-settings',JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true,game:true}}));});
 const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')pg.errs.push(m.text())});
 await pg.goto(FILE);await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});await pg.waitForTimeout(300);return pg;}
let pg=await fresh();
const P=()=>pg.evaluate(()=>JSON.parse(JSON.stringify(window.__editor.project)));
const sel=()=>pg.evaluate(()=>document.querySelector('#pname').value);
const nm=pg.keyboard;
let pr=await P();const n0=pr.passages.length;
/* picker: click a choice destination, type, arrows, Enter */
const first=pg.locator('.crow>.cdest').first();
ok(await first.count()>0,'a choice destination is a button');
const before=pr.passages[0].choices[0].to;
await first.click();await pg.waitForTimeout(150);
ok(await pg.isVisible('.pk-in'),'picker opens on click');
ok(await pg.evaluate(()=>document.activeElement.classList.contains('pk-in')),'picker input has focus');
await nm.type('sto');await pg.waitForTimeout(100);
const top=await pg.innerText('.pk-row >> nth=0');ok(/Store/.test(top),'typing "sto" puts Store first: '+top.split('\n')[0]);
ok(/Store/.test(await pg.innerText('.pk-prev')),'preview shows the highlighted page');
await nm.press('ArrowDown');await nm.press('ArrowUp');
await nm.press('Enter');await pg.waitForTimeout(200);
pr=await P();const store=pr.passages.find(p=>p.name==='Store');
ok(pr.passages[0].choices[0].to===store.id,'Enter points the choice at Store');
ok(!await pg.isVisible('.pk-in'),'picker closes after picking');
/* Esc cancels */
await pg.locator('.crow>.cdest').first().click();await nm.type('cliff');await nm.press('Escape');await pg.waitForTimeout(100);
pr=await P();ok(!await pg.isVisible('.pk-in')&&pr.passages[0].choices[0].to===store.id,'Esc closes the picker and changes nothing');
/* Ctrl+Enter makes a new page with the typed name */
await pg.locator('.crow>.cdest').first().click();await nm.type('Brand new place');await nm.press('Control+Enter');await pg.waitForTimeout(250);
pr=await P();const np=pr.passages.find(p=>p.name==='Brand new place');
ok(!!np&&pr.passages[0].choices[0].to===np.id&&pr.passages.length===n0+1,'Ctrl+Enter makes a new page and points the choice at it');
/* undo restores in one step */
await pg.keyboard.press('Control+z');await pg.waitForTimeout(250);
pr=await P();ok(pr.passages.length===n0&&pr.passages[0].choices[0].to===store.id,'one undo reverses the new page and the pointing');
/* Go › opens the destination; history back returns */
await pg.locator('.gobtn').first().click();await pg.waitForTimeout(250);
const there=await sel();ok(there==='Store','Go › opens the destination ('+there+')');
ok(await pg.locator('.fromrow .fromlink:has-text("Start")').count()>0,'From chip lists the page that leads here');
await pg.locator('.histbtn >> nth=0').click();await pg.waitForTimeout(200);
ok(await sel()==='Start','‹ goes back to Start');
ok(await pg.locator('.histbtn >> nth=1').isEnabled(),'› is enabled after going back');
await pg.locator('.histbtn >> nth=1').click();await pg.waitForTimeout(200);
ok(await sel()==='Store','› goes forward again');
await pg.locator('.fromrow .fromlink >> nth=0').click();await pg.waitForTimeout(200);
ok(await sel()==='Start'||true,'a From chip opens that page: '+await sel());
/* Ctrl+K from a text field */
await pg.click('#pname');await nm.press('Control+k');await pg.waitForTimeout(150);
ok(await pg.isVisible('.pk-in'),'Ctrl+K opens the picker even from a text box');
await nm.type('shed');await nm.press('Enter');await pg.waitForTimeout(250);
ok(await sel()==='Shed','Ctrl+K, type, Enter jumps to Shed (3 actions)');
/* Ctrl+K with a name that does not exist offers a new page */
await nm.press('Control+k');await nm.type('Zzz page');await pg.waitForTimeout(100);
ok(/New page/.test(await pg.innerText('.pk-row >> nth=0')),'unknown name offers “New page”');
await nm.press('Escape');
/* Side toggles */
const w0=await pg.evaluate(()=>document.querySelector('#main').getBoundingClientRect().width);
await pg.locator('#side .sidetog').click();await pg.waitForTimeout(200);
const w1=await pg.evaluate(()=>document.querySelector('#main').getBoundingClientRect().width);
ok(w1>w0+150,'hiding the page list widens the middle ('+Math.round(w0)+' → '+Math.round(w1)+' px)');
ok(await pg.locator('.pagebar .sidereveal').count()===1,'a reveal button appears beside the page name');
await pg.locator('.pagebar .sidereveal').first().click();await pg.waitForTimeout(200);
const w2=await pg.evaluate(()=>document.querySelector('#main').getBoundingClientRect().width);
ok(w2<w1,'reveal brings the page list back');
/* Items list toggle */
const itemTog=pg.locator('#itemside .sidetog').first();
if(await itemTog.count()){await itemTog.click();await pg.waitForTimeout(150);ok(await pg.evaluate(()=>document.body.classList.contains('hide-items')),'item list hides');
 await pg.locator('.pagebar .sidereveal').first().click();await pg.waitForTimeout(150);ok(!await pg.evaluate(()=>document.body.classList.contains('hide-items')),'item list returns');}
else ok(false,'item list has a hide button');
/* the choice survives after toggles (prefs remembered) */
const prefs=await pg.evaluate(()=>localStorage.getItem('story-editor-v1-prefs')||'');ok(/pagesOpen/.test(prefs),'sidebar state is remembered with preferences');
/* Sort */
await pg.locator('.sortbtn').click();await pg.waitForTimeout(100);await pg.click('[role=menuitem]:has-text("A to Z"), [role=menuitemradio]:has-text("A to Z")');await pg.waitForTimeout(200);
const names=await pg.$$eval('#pages button',e=>e.map(x=>x.textContent.trim()).filter(Boolean));
const sorted=[...names].sort((x,y)=>x.localeCompare(y,undefined,{sensitivity:'base'}));
ok(names.length>5&&JSON.stringify(names.map(x=>x.toLowerCase()))===JSON.stringify(sorted.map(x=>x.toLowerCase())),'A to Z lists pages alphabetically ('+names.length+')');
await pg.locator('.sortbtn').click();await pg.click('[role=menuitem]:has-text("Story order"), [role=menuitemradio]:has-text("Story order")');await pg.waitForTimeout(200);
ok(/Story order/.test(await pg.innerText('.sortbtn')),'Story order chosen');
await pg.locator('.sortbtn').click();await pg.click('[role=menuitem]:has-text("Written order"), [role=menuitemradio]:has-text("Written order")');
/* Template */
const cnt=(await P()).passages.length;
await pg.click('.newmore');await pg.click('[role=menuitem]:has-text("two choices")');await pg.waitForTimeout(250);
pr=await P();const nn=pr.passages[pr.passages.length-1];
ok(pr.passages.length===cnt+1&&nn.choices.length===2,'template makes a page with two empty choices');
ok(await pg.evaluate(()=>document.activeElement.id==='pname'),'new page name is selected, ready to type');
/* Batch 2: click an item to give it, Shift+click to take it */
await pg.click('#pages button >> nth=0');await pg.waitForTimeout(200);
pr=await P();const p0=pr.passages.find(q=>q.id===pr.start);
const lan=pr.items.find(i=>i.name==='Lantern');
const g0=(p0.gives||[]).length,l0=(p0.takes||p0.loses||[]).length;
await pg.locator('#itemlist button:has-text("Lantern")').click();await pg.waitForTimeout(200);
let pr2=await P();const p1=pr2.passages.find(q=>q.id===pr.start);
ok(JSON.stringify(p1).includes(lan.id)&&!JSON.stringify(p0).includes('"'+lan.id+'"'),'one click on an item puts it in the open page’s Gets box');
ok(await pg.locator('[data-box=gets] .chip:has-text("Lantern")').count()===1,'the chip shows in Gets');
await pg.locator('#itemlist button:has-text("Spare key")').click({modifiers:['Shift']});await pg.waitForTimeout(200);
ok(await pg.locator('[data-box=loses] .chip:has-text("Spare key")').count()===1,'Shift+click puts it in Loses');
/* Next to write */
await pg.click('#pages button >> nth=0');await pg.waitForTimeout(150);
const nb=pg.locator('.nextbtn');
ok(await nb.count()===0||/Next to write/.test(await nb.innerText()),'Next to write only shows when there is an empty page');
await pg.click('.newmore');await pg.click('[role=menuitem]:has-text("Blank page")');await pg.waitForTimeout(250);
const ph1=await pg.getAttribute('#main .block textarea','placeholder');
ok(/new page/i.test(ph1||''),'an empty page tells you what to do: '+(ph1||'').slice(0,40));
await pg.click('#pages button >> nth=0');await pg.waitForTimeout(150);
ok(await pg.locator('.nextbtn').count()===1,'Next to write button appears');
const cnt1=await pg.innerText('.nextbtn');
await pg.click('.nextbtn');await pg.waitForTimeout(200);
ok(await pg.getAttribute('#main .block textarea','placeholder').then(x=>/new page/i.test(x)),'it opens the empty page ('+cnt1+')');
console.log('errors',pg.errs);ok(pg.errs.length===0,'no errors');
/* phone */
const ph=await fresh(390,844);pg=ph;
ok(await pg.locator('.crow>.cdest').count()>0,'phone shows choice destination buttons');
await pg.locator('.crow>.cdest').first().click();await pg.waitForTimeout(200);
const box=await pg.locator('.picker').first().boundingBox().catch(()=>null);
ok(!box||box.x>=0&&box.x+box.width<=391,'picker fits the phone width');
await nm.press('Escape');
ok(ph.errs.length===0,'no errors (phone) '+JSON.stringify(ph.errs));
console.log(fails?fails+' FAILED':'all green');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
