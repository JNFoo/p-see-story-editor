/* Write-tab batch 3: drag grips, split page, paste a scene, word count, smart quotes, text size, wide layout. */
const which=process.argv[2]||'firefox';const B=require('./engine').pick(which);
const FILE=require('url').pathToFileURL(require('path').join(__dirname, '..', 'story-editor.html')).href;
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
(async()=>{
const b=await B.launch();
async function fresh(w=1280,h=900){const ctx=await b.newContext({viewport:{width:w,height:h}});
 await ctx.addInitScript(()=>{localStorage.setItem('story-editor-v1-settings',JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true,game:true}}));});
 const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')pg.errs.push(m.text())});
 await pg.goto(FILE);await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});await pg.waitForTimeout(300);return pg;}
const drag=async(pg,src,sn,dst,dn,dy)=>{const a=await pg.evaluate(([s,n])=>{const r=document.querySelectorAll(s)[n].getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]},[src,sn]);
 const b=await pg.evaluate(([s,n])=>{const r=document.querySelectorAll(s)[n].getBoundingClientRect();return [r.x+r.width/2,r.y,r.height]},[dst,dn]);
 await pg.mouse.move(a[0],a[1]);await pg.mouse.down();await pg.mouse.move(a[0],a[1]+8);await pg.mouse.move(b[0],b[1]+(dy<0?b[2]+dy:dy),{steps:5});await pg.mouse.up();};
let pg=await fresh();
const P=()=>pg.evaluate(()=>JSON.parse(JSON.stringify(window.__editor.project)));
const find=(pr,n)=>pr.passages.find(p=>p.name===n);
const sel=()=>pg.evaluate(()=>document.querySelector('#pname').value);
const open=async n=>{await pg.click('#pages button:has-text("'+n+'")');await pg.waitForTimeout(200)};
/* ---- grips ---- */
let pr=await P();const lab0=find(pr,'Start').choices.map(c=>c.label);
ok(await pg.locator('.choice .grip').count()===2,'each choice has a drag grip');
ok(await pg.locator('button[title^="Move this"]').count()===0,'no up/down arrows are left');
await drag(pg,'.choice .grip',0,'.choice',1,-4);await pg.waitForTimeout(250);
pr=await P();const lab1=find(pr,'Start').choices.map(c=>c.label);
ok(lab1[0]===lab0[1]&&lab1[1]===lab0[0],'dragging the first choice’s grip below the second swaps them');
await pg.keyboard.press('Escape');
const b0=find(pr,'Start').blocks.map(x=>x.text);
await drag(pg,'.block .grip',0,'.block',1,-4);await pg.waitForTimeout(250);
pr=await P();const b1=find(pr,'Start').blocks.map(x=>x.text);
ok(b1[0]===b0[1]&&b1[1]===b0[0],'dragging a paragraph’s grip reorders paragraphs');
/* ---- word count ---- */
const wc=await pg.innerText('#wcount');ok(/\d+ words/.test(wc)&&/read/.test(wc),'word count and reading time: '+wc);
await pg.fill('#main .block >> nth=0 >> textarea','one two three');await pg.waitForTimeout(200);
ok(/^\d+ words/.test(await pg.innerText('#wcount')),'count updates as you type: '+await pg.innerText('#wcount'));
/* ---- split ---- */
await open('Shed');
pr=await P();const shed=find(pr,'Shed');const nch=shed.choices.length;const ntot=pr.passages.length;
await pg.fill('#main .block >> nth=0 >> textarea','First part stays. Second part moves.');
await pg.evaluate(()=>{const t=document.querySelector('#main .block textarea');t.focus();t.setSelectionRange(17,17)});
await pg.keyboard.press('Control+Shift+Enter');await pg.waitForTimeout(300);
pr=await P();const sp=find(pr,'Shed (2)');const sh=find(pr,'Shed');
ok(!!sp&&sp.blocks[0].text==='Second part moves.','Ctrl+Shift+Enter moves the words after the cursor to a new page');
ok(sh.blocks[0].text==='First part stays.','the first part stays');
ok(sp.choices.length===nch&&sh.choices.length===1&&sh.choices[0].to===sp.id&&sh.choices[0].label==='Continue','the choices moved; the old page says “Continue”');
ok(await sel()==='Shed (2)','the new page is open');
await pg.keyboard.press('Escape');await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
await pg.click('#undo');await pg.waitForTimeout(250);
pr=await P();ok(pr.passages.length===ntot&&find(pr,'Shed').choices.length===nch&&find(pr,'Shed').blocks[0].text.startsWith('First part stays. Second'),'one Undo puts it all back');
await open('Shed');
/* split from the ⋯ menu */
await pg.click('#main .block textarea');await pg.evaluate(()=>{const t=document.querySelector('#main .block textarea');t.setSelectionRange(5,5)});await pg.click('.pagebar button[aria-label*="More"], .pagebar button:has-text("⋯")');
await pg.click('[role=menuitem]:has-text("Split this page")');await pg.waitForTimeout(250);
pr=await P();ok(!!find(pr,'Shed (2)'),'the ⋯ menu splits at the last cursor spot '+pr.passages.slice(-2).map(p=>p.name)+' / '+await pg.innerText('#toast'));
await pg.click('#undo');await pg.waitForTimeout(200);
/* ---- paste a scene ---- */
await pg.click('.newmore');await pg.click('[role=menuitem]:has-text("Blank page")');await pg.waitForTimeout(250);
pr=await P();const cn=0;
await pg.click('#main .block >> nth=0 >> textarea');
await pg.evaluate(()=>{const t=document.querySelector('#main .block textarea');t.focus();const dt=new DataTransfer();dt.setData('text/plain','The door creaks open.\nA draft blows.\n\nDarkness waits beyond.\n\n- Step inside\n• Go back\n> Shout hello\n');const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});Object.defineProperty(ev,'clipboardData',{value:{getData:()=>dt.getData('text/plain')}});t.dispatchEvent(ev)});
await pg.waitForTimeout(300);
pr=await P();const ce=find(pr,'Untitled page');
console.log('  cellar',JSON.stringify(ce.blocks.map(b=>b.text)),ce.choices.map(c=>c.label));
ok(ce.blocks.length===2&&ce.blocks[0].text==='The door creaks open. A draft blows.'&&ce.blocks[1].text==='Darkness waits beyond.','pasted scene becomes two paragraphs');
ok(ce.choices.length===3&&ce.choices.slice(-3).map(c=>c.label).join('|')==='Step inside|Go back|Shout hello','lines starting - • > become three choices');
await pg.click('#undo');await pg.waitForTimeout(200);
pr=await P();ok(find(pr,'Untitled page').choices.length===0&&find(pr,'Untitled page').blocks.length===1,'one Undo reverses the paste');
/* plain paste is left alone */
await pg.evaluate(()=>{const t=document.querySelector('#main .block textarea');t.focus();window.__pd=null;const dt=new DataTransfer();dt.setData('text/plain','just words, no markers');const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});Object.defineProperty(ev,'clipboardData',{value:{getData:()=>dt.getData('text/plain')}});t.dispatchEvent(ev);window.__pd=ev.defaultPrevented});
ok(await pg.evaluate(()=>window.__pd)===false,'a paste with no choice lines is left to the browser');
/* ---- smart quotes ---- */
await pg.click('#optbtn');await pg.click('#optpop >> text=Smart quotes');await pg.waitForTimeout(200);
await pg.click('#main .block >> nth=0 >> textarea');await pg.keyboard.press('Control+a');await pg.keyboard.type('"Hi," she said -- it\'s fine.');await pg.waitForTimeout(150);
const sq=await pg.inputValue('#main .block >> nth=0 >> textarea');
ok(sq==='“Hi,” she said — it’s fine.','smart quotes and dash: '+sq);
await pg.click('#optbtn');await pg.click('#optpop >> text=Smart quotes');await pg.waitForTimeout(150);
await pg.click('#main .block >> nth=0 >> textarea');await pg.keyboard.press('Control+a');await pg.keyboard.type('"x"');
ok(await pg.inputValue('#main .block >> nth=0 >> textarea')==='"x"','switched off: straight quotes stay');
/* ---- text size ---- */
const fs0=await pg.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('#main textarea')).fontSize));
await pg.click('#optbtn');await pg.click('#optpop >> text=Writing text size');await pg.waitForTimeout(150);
await pg.click('#optbtn');await pg.click('#optpop >> text=Writing text size');await pg.waitForTimeout(150);
const fs1=await pg.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('#main textarea')).fontSize));
ok(fs1>fs0,'text size grows ('+fs0+' → '+fs1+' px)');
/* ---- wide layout ---- */
ok(!await pg.evaluate(()=>document.querySelector('#main').classList.contains('wide')),'1280 px: not wide (one column)');
console.log('errors',pg.errs);ok(pg.errs.length===0,'no errors');
const wd=await fresh(1700,950);pg=wd;
ok(await pg.evaluate(()=>document.querySelector('#main').classList.contains('wide')),'1700 px: wide layout on');
const bt=await pg.evaluate(()=>{const s=[...document.querySelectorAll('#main .wrap.sheet>section')].map(e=>e.getBoundingClientRect());return s.length>=2?{x0:s[0].x,x1:s[1].x,y0:s[0].y,y1:s[1].y}:null});
ok(bt&&bt.x1>bt.x0+300&&Math.abs(bt.y1-bt.y0)<5,'text and choices sit side by side '+JSON.stringify(bt&&{dx:Math.round(bt.x1-bt.x0),dy:Math.round(bt.y1-bt.y0)}));
await pg.click('#pages button >> nth=3');await pg.waitForTimeout(300);
ok(await pg.evaluate(()=>document.querySelector('#main').classList.contains('wide')),'wide layout survives going to another page');
await pg.click('#side .sidetog');await pg.waitForTimeout(200);
ok(await pg.evaluate(()=>document.querySelector('#main').classList.contains('wide')),'and hiding a list');
ok(wd.errs.length===0,'no errors (wide)');
console.log(fails?fails+' FAILED':'all green');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
