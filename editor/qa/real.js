const which=process.argv[2]||'firefox';const chromium=require('./engine').pick(which);const {devices}=require('./engine');
const fs=require('fs');
const FILE=require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
(async()=>{
const b=await chromium.launch();
/* ===== desktop ===== */
const ctx=await b.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
/* a stand-in for the system Save window: waits 600 ms (the person choosing), then records what is written */
await ctx.addInitScript(()=>{ if(!localStorage.getItem('story-editor-v1-settings')) localStorage.setItem('story-editor-v1-settings', JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true}})); window.__saves=[]; window.__pickerOpen=0;
  window.showSaveFilePicker=function(o){ window.__pickerOpen++; return new Promise(r=>setTimeout(()=>r({createWritable:()=>Promise.resolve({ _c:'', write(b){ return b.text().then(t=>{this._c+=t;}); }, close(){ window.__saves.push({name:o.suggestedName,text:this._c}); return Promise.resolve(); } })}),600)); }; });
const pg=await ctx.newPage();
const logs=[];pg.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.type()+': '+m.text())});pg.on('pageerror',e=>logs.push('PAGEERR '+e.message));
const reqs=[];pg.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))reqs.push(r.url())});
await pg.goto(FILE);await pg.waitForTimeout(300);
const P=()=>pg.evaluate(()=>JSON.parse(JSON.stringify(window.__editor.project)));
const page=async n=>{const pr=await P();return pr.passages.find(p=>p.name===n)};
// start on Keeper's Light; click page
await pg.click('#pages button:has-text("Shore")');
ok(await pg.inputValue('#pname')==='Shore','click page in list opens it');
// drag item onto Gets box
await pg.dragAndDrop('#itemlist button:has-text("Flare pistol")','[data-box=gets]');
let sh=await page('Shore'); ok(sh.gives.includes('i_flare'),'drag object onto Gets');
await pg.dragAndDrop('#itemlist button:has-text("Dealt with Pell")','[data-box=gets]');
sh=await page('Shore'); ok(sh.gives.includes('i_pell'),'drag state onto the same Gets box');
await pg.dragAndDrop('#itemlist button:has-text("Can of oil")','[data-box=loses]');
sh=await page('Shore'); ok(sh.takes.includes('i_oil')&&!sh.sends.i_oil,'drag onto Loses');
ok(!(await pg.$('[data-box=hands]')),'Hands over is hidden for now');
ok((await pg.$$('#itemlist button.moved')).length===0,'no "where things went" list while Hands over is hidden');
// drag page onto a choice dest
const nChoices=sh.choices.length;
await pg.dragAndDrop('#pages button:has-text("Cliff")','.choice >> nth=0');
sh=await page('Shore'); ok(sh.choices[0].to==='p_cliff','drag page onto a choice relinks it');
// drag page into empty area of choices => adds
await pg.dragAndDrop('#pages button:has-text("Hall")','section.sect >> nth=1 >> .sech');
sh=await page('Shore'); ok(sh.choices.length===nChoices+1,'drop page on Choices header adds a linked choice');
// Enter adds a choice
await pg.click('.clabel >> nth=0');await pg.keyboard.press('Enter');await pg.waitForTimeout(120);
sh=await page('Shore'); ok(sh.choices.length===nChoices+2,'Enter in a choice adds another');
ok(await pg.evaluate(()=>document.activeElement.classList.contains('clabel')),'focus moves to the new choice');
// reorder pages by drag
const before=(await P()).passages.map(p=>p.name);
let after=before;
for(let tries=0;tries<3&&after.indexOf('Hall')!==after.indexOf('Shore')-1;tries++){ /* a real mouse drag now and then starts before the page list is ready to accept it; drag again if nothing moved */
  if(which==='chromium'){ /* a real mouse: press, move in small steps (Chromium starts a drag only after some movement), release */
    const boxOf=async s=>{let r=null;for(let k=0;k<30&&!r;k++){r=await pg.locator(s).boundingBox();if(!r)await pg.waitForTimeout(100);}return r;}; /* the page list is redrawn after every edit; wait until the button is there again */
    const a=await boxOf('#pages button:has-text("Hall")'),z=await boxOf('#pages button:has-text("Shore")');
    await pg.mouse.move(a.x+20,a.y+a.height/2);await pg.mouse.down();await pg.mouse.move(a.x+25,a.y+a.height/2+4,{steps:4});await pg.mouse.move(z.x+20,z.y+2,{steps:12});await pg.mouse.up();
  } else await pg.dragAndDrop('#pages button:has-text("Hall")','#pages button:has-text("Shore")',{targetPosition:{x:20,y:2}});
  for(let k=0;k<10&&after.indexOf('Hall')!==after.indexOf('Shore')-1;k++){await pg.waitForTimeout(100);after=(await P()).passages.map(p=>p.name);}
}
ok(after.indexOf('Hall')===after.indexOf('Shore')-1&&after.length===before.length,'reorder page list by drag');
// page type segmented control: 1 click to make ending
await pg.click('.seg label:has-text("Good ending")');
for(let k=0;k<20&&!(await page('Shore')).ending;k++)await pg.waitForTimeout(100); /* the change is saved a moment after the click */
sh=await page('Shore'); ok(sh.ending&&sh.valence==='good','page type: good ending in one click');
await pg.click('.seg label:has-text("Page")');
// ctx menu on map
for(let k=0;k<3;k++){ /* a tab click that lands while the editor redraws can be lost; click again */
  await pg.click('#tabs button:has-text("Map")');
  if(await pg.waitForSelector('.mapbox g.node',{timeout:2500}).then(()=>true,()=>false))break;
}
await pg.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:15000});
await pg.evaluate(()=>{const n=document.querySelector('.mapbox g.node.start'),r=n.getBoundingClientRect();n.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:2}))});
ok(await pg.isVisible('.ctx'),'right-click opens page menu on the map');
await pg.click('.ctx button:has-text("Page type")');
ok(await pg.locator('.ctx >> nth=1 >> button:has-text("Bad ending")').isDisabled(),'the start page cannot be made an ending from the map menu');
for(let k=0;k<4&&await pg.isVisible('.ctx');k++){await pg.keyboard.press('Escape');await pg.waitForTimeout(150);}
const bad0=(await P()).passages.filter(p=>p.ending&&p.valence==='bad').length;
await pg.click('.mapbox g.node:not(.start):not(.ending) >> nth=0',{button:'right'});
await pg.click('.ctx button:has-text("Page type")');
await pg.click('.ctx >> nth=1 >> button:has-text("Bad ending")');
await pg.waitForTimeout(300);
ok((await P()).passages.filter(p=>p.ending&&p.valence==='bad').length===bad0+1&&!(await page('Start')).ending,'map menu sets bad ending on another page');
await pg.keyboard.press('Control+z');
// search + zoom
await pg.fill('input[aria-label="Search the map"]','flare');
ok((await pg.$$('.mapbox g.node.hit')).length>=5,'map search highlights matching pages');
// help dialog
await pg.click('#help');ok(await pg.isVisible('.dlg.guide'),'quick guide opens');await pg.keyboard.press('Escape');
// export and play offline
await pg.click('#export');await pg.click('#export');          // a double click
await pg.waitForTimeout(150);
ok(await pg.evaluate(()=>window.__saves.length===0 && ![...document.querySelectorAll('#toast:not([hidden]) .toastbtn')].some(b=>b.textContent.trim()!=='Redo')),'export writes nothing (and says nothing) while the Save window is open');
await pg.waitForTimeout(700);
ok(await pg.evaluate(()=>window.__saves.length===1 && window.__pickerOpen===1),'export saves exactly once, after the choice, even after a double click');
ok(await pg.isVisible('#toast .toastbtn'),'one-click export offers "Show the code"');
const outp=__dirname+'/work/exported.html';
fs.writeFileSync(outp, await pg.evaluate(()=>window.__saves[0].text));await pg.keyboard.press('Escape');
const saved=fs.readFileSync(outp,'utf8');const exp=require('./unzip').plain(saved);
ok(require('./unzip').isZipped(saved)&&saved.length<exp.length*0.8,'exported game is saved zipped ('+Math.round(saved.length/1024)+' KB against '+Math.round(exp.length/1024)+' KB plain)');
ok(!/https?:\/\//.test(exp.replace(/<script type="application\/json"[\s\S]*?<\/script>/,'')),'exported game contains no http(s) URLs outside the story data');
ok(/Content-Security-Policy/.test(exp),'export carries a CSP');
const g=await ctx.newPage();const glogs=[];g.on('console',m=>{if(m.type()==='error')glogs.push(m.text())});g.on('pageerror',e=>glogs.push(e.message));
await g.goto('file://'+outp);await g.waitForSelector('.kl-choices button');
ok((await g.$$('.kl-choices button')).length>0,'exported game plays');
{ /* a browser without DecompressionStream must still open it (the built-in unzipper takes over) */
  const oc=await b.newContext();await oc.addInitScript(()=>{try{delete window.DecompressionStream;}catch(e){window.DecompressionStream=undefined;}});
  const og=await oc.newPage();await og.goto('file://'+outp);await og.waitForSelector('.kl-choices button');
  ok(await og.evaluate(()=>typeof window.DecompressionStream==='undefined')&&(await og.$$('.kl-choices button')).length>0,'exported game opens without DecompressionStream (fallback unzipper)');
  await oc.close(); }
await g.click('.kl-choices button >> nth=0');
ok(glogs.length===0,'exported game: no console errors '+glogs.join('|'));
ok(/font-family:'Inter Tight'/.test(exp),'export embeds its typeface');
// Givens: create one, it is asked before page one, it cannot go into Gets, and the recap starts with it
await pg.click('#tabs button:has-text("Items")');await pg.click('#main button:has-text("+ New Given")');
await pg.fill('.dlg input >> nth=0','Who are you?');await pg.fill('.dlg input >> nth=1','Fox, Owl');await pg.click('.dlg button.primary');
ok(await pg.evaluate(()=>window.__editor.project.givens.length===1&&window.__editor.project.givens[0].options.length===2),'a Given with two answers is created');
await pg.waitForFunction(()=>!document.querySelector('.dlg')); /* the dialog must be gone before the next click */
await pg.click('#tabs button:has-text("Play")');await pg.waitForSelector('button:has-text("Play from the beginning")');await pg.click('button:has-text("Play from the beginning")');
ok((await pg.textContent('.playbox .kl-head'))==='Who are you?','the Given is asked before page one');
await pg.click('.playbox .kl-choices button:has-text("Owl")');
ok(await pg.evaluate(()=>{const h=document.querySelector('.playbox .kl-head');return !h||h.textContent!=='Who are you?';}),'answering starts the story');
await pg.selectOption('.gpick select',{label:'Fox'});await pg.waitForTimeout(100);
ok(await pg.evaluate(()=>{const h=document.querySelector('.playbox .kl-head');return !h||h.textContent!=='Who are you?';}),'a session answer skips the question');
await pg.click('#tabs button:has-text("Write")');
ok(await pg.evaluate(()=>![...document.querySelector('[data-box=gets] select').options].some(o=>/Owl|Fox/.test(o.text))),'Givens are not offered in Gets');
// one-click extras: play button, Ctrl+Enter, page notes, map double-click
await pg.click('#tabs button:has-text("Write")');
await pg.click('#main .pbrow button[title^="Play from this page"]');
ok(await pg.$('.playbox .kl-page')!==null,'▶ plays from the page');
for(let k=0;k<3;k++){ /* a tab click that arrives while the play view is still settling can be lost; click again */
  await pg.click('#tabs button:has-text("Write")');
  if(await pg.waitForSelector('#main button:has-text("+ Choice")',{timeout:2500}).then(()=>true,()=>false))break;
}
const nBefore=(await pg.evaluate(()=>window.__editor.project.passages.length));
await pg.click('#main button:has-text("+ Choice")');await pg.keyboard.type('Climb the tower');await pg.keyboard.press('Control+Enter');await pg.waitForTimeout(200);
ok(await pg.evaluate(n=>window.__editor.project.passages.length===n+1&&document.querySelector('#pname').value==='Climb the tower',nBefore),'Ctrl+Enter creates and opens the linked page');
await pg.waitForTimeout(800);
ok(await pg.isVisible('#pagenotes .pn'),'checker notes show under the page bar');
await pg.click('#tabs button:has-text("Map")');
await pg.dblclick('.mapbox',{position:{x:1215,y:200}});
ok(await pg.isVisible('.dlg input'),'double-click on the map asks for a new page');await pg.keyboard.press('Escape');
// backup download
await pg.click('#menubtn');
await pg.click('#menupop button:has-text("Save as")');await pg.waitForTimeout(800);
ok(await pg.evaluate(()=>/\.story\.json$/.test(window.__saves[window.__saves.length-1].name)),'backup saves as .story.json');
const nPick=await pg.evaluate(()=>window.__pickerOpen), nSave=await pg.evaluate(()=>window.__saves.length);
await pg.click('#tabs button:has-text("Write")');await pg.fill('#main .block textarea >> nth=0','Changed for the save test.');await pg.waitForTimeout(100);
ok(await pg.evaluate(()=>document.querySelector('#savebtn').classList.contains('dirty')),'the Save button shows unsaved changes');
await pg.click('#savebtn');await pg.waitForTimeout(300);
ok(await pg.evaluate(([a,b])=>window.__pickerOpen===a && window.__saves.length===b+1,[nPick,nSave]),'Save writes straight to the remembered file, with no window');
ok(await pg.evaluate(()=>!document.querySelector('#savebtn').classList.contains('dirty')),'after saving, no unsaved-changes dot');
await pg.keyboard.press('Control+s');await pg.waitForTimeout(300);
ok(await pg.evaluate(b=>window.__saves.length===b+2,nSave),'Ctrl+S saves too');
await pg.keyboard.press('Escape');
// dark mode screenshot, sample story write view
ok(logs.length===0,'no console errors/warnings (incl. CSP) '+logs.join('|'));
ok(reqs.length===0,'no network requests '+reqs.join(','));
await ctx.close();

/* ===== phone (iPhone-class touch): Chromium's phone emulation only; Firefox has none ===== */
if(which==='chromium'){
const iph=devices['iPhone 13'];
const c2=await b.newContext({...iph});
const ph=await c2.newPage();const plogs=[];ph.on('pageerror',e=>plogs.push(e.message));ph.on('console',m=>{if(m.type()==='error')plogs.push(m.text())});
await ph.goto(FILE);await ph.waitForTimeout(300);
ok(await ph.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'phone: no horizontal page scroll');
await ph.waitForFunction(()=>{const s=document.querySelector('#side');return s&&s.getBoundingClientRect().width>0;}); /* wait until the editor has drawn the page list */
{const bb=await ph.locator('#side').boundingBox();ok(bb.x+bb.width<=0,'phone: page list is off-screen until opened');}
await ph.tap('#drawerbar button >> nth=0');await ph.waitForTimeout(300);
ok(await ph.isVisible('#side'),'phone: Pages drawer opens');
await ph.tap('#pages button:has-text("Shore")');await ph.waitForTimeout(300);
ok(await ph.inputValue('#pname')==='Shore','phone: choosing a page opens it and closes the drawer');
// add item via select on touch (no drag); on a phone the effects boxes are folded under "Page type and effects"
await ph.tap('#main .fxfold > summary');await ph.waitForTimeout(200);
await ph.selectOption('[data-box=gets] select','i_flare');
ok((await ph.evaluate(()=>window.__editor.project.passages.find(p=>p.name==='Shore').gives)).includes('i_flare'),'phone: add item via menu');
// long press menu on page in drawer
await ph.waitForFunction(()=>document.querySelector('#side').getBoundingClientRect().right<=0); /* the drawer must be shut again before the button is tapped (the button toggles it) */
await ph.tap('#drawerbar button >> nth=0');await ph.waitForFunction(()=>{const s=document.querySelector('#side');return s&&s.getBoundingClientRect().left>=0&&s.getBoundingClientRect().width>0;}); /* the drawer has finished sliding in */
await ph.waitForTimeout(100);
let box=null;for(let k=0;k<30&&!box;k++){box=await ph.locator('#pages button:has-text("Hall")').boundingBox();if(!box)await ph.waitForTimeout(100);} /* wait until the button is drawn */
const cdp=await c2.newCDPSession(ph);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+40,y:box.y+10}]});
await ph.waitForTimeout(800);
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await ph.waitForTimeout(200);
ok(await ph.isVisible('.ctx'),'phone: long-press opens the page menu');
ok(plogs.length===0,'phone: no errors '+plogs.join('|'));
await ph.screenshot({path:'work/shots/phone2.png'});await ph.keyboard.press('Escape');await ph.tap('#scrim',{position:{x:360,y:300},force:true}).catch(()=>{});await ph.waitForTimeout(300);await ph.screenshot({path:'work/shots/phone3.png'});
await c2.close();
}
await b.close();
console.log(fails?('FAILURES '+fails):'ALL PASSED');
})().catch(e=>{console.log('SCRIPT ERROR',e.message);process.exit(1)});
