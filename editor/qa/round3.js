/* Oct 8 night round: no up/down arrows, start page is never an ending, map icon toolbar, key above Start, dice tab icon, first-time tour, new checker rules. */
const which=process.argv[2]||'firefox';const B=require('./engine').pick(which);
const fs=require('fs');
const FILE=require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
const KEEP=fs.readFileSync(require('path').join(__dirname, '..', 'keepers-light.project.json'),'utf8');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
(async()=>{
const b=await B.launch();
const SET={chosen:true,remember:true,advanced:{write:true,map:true,items:true,game:true}};
async function fresh(o={}){const w=o.w||1280,h=o.h||900;
 const ctx=await b.newContext({viewport:{width:w,height:h}});
 await ctx.addInitScript(([set,proj])=>{if(!sessionStorage.getItem('r3')){sessionStorage.setItem('r3','1');if(set)localStorage.setItem('story-editor-v1-settings',JSON.stringify(set));if(proj)localStorage.setItem('story-editor-v1',proj);}},[o.noSet?null:SET,o.proj||null]);
 await ctx.addInitScript(()=>{window.__toasts=[];setInterval(()=>{const t=document.getElementById('toast');if(t&&t.textContent&&!window.__toasts.includes(t.textContent))window.__toasts.push(t.textContent)},40)});
 const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')pg.errs.push(m.text())});
 await pg.goto(FILE);await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});await pg.waitForTimeout(300);return pg;}
const P=pg=>pg.evaluate(()=>JSON.parse(JSON.stringify(window.__editor.project)));
const withProj=f=>{const p=JSON.parse(KEEP);f(p);return JSON.stringify(p)};

/* ---- 1. arrows gone, keyboard reorder, dice icon ---- */
let pg=await fresh();
ok(await pg.locator('button[title^="Move this"], button[title^="Move paragraph"]').count()===0,'no Move up/down buttons in the Write tab');
ok(await pg.locator('#tabs [data-tab=game] svg circle').count()===5,'Game tab icon is the dice (5 pips)');
let pr=await P(pg);const st=pr.passages.find(p=>p.id===pr.start);const l0=st.choices.map(c=>c.label);
await pg.locator('.choice input[type=text], .choice input:not([type])').first().focus();
await pg.keyboard.press('Alt+ArrowDown');await pg.waitForTimeout(250);
pr=await P(pg);const l1=pr.passages.find(p=>p.id===pr.start).choices.map(c=>c.label);
ok(l1[0]===l0[1]&&l1[1]===l0[0],'Alt+Down moves the focused choice down');
const bl0=pr.passages.find(p=>p.id===pr.start).blocks.map(x=>x.text);
await pg.locator('.block textarea').first().focus();await pg.keyboard.press('Alt+ArrowDown');await pg.waitForTimeout(250);
pr=await P(pg);const bl1=pr.passages.find(p=>p.id===pr.start).blocks.map(x=>x.text);
ok(bl1[0]===bl0[1]&&bl1[1]===bl0[0],'Alt+Down moves the focused paragraph down');
/* a one-paragraph page: no grip, no arrows */
await pg.click('button:has-text("+ New page")');await pg.waitForTimeout(300);
ok(await pg.locator('.block').count()===1&&await pg.locator('.block .grip').count()===0,'a new one-paragraph page shows no paragraph grip');

/* ---- 2. start page is never an ending ---- */
ok(await pg.locator('input[name=ptype]').evaluateAll(r=>r.filter(x=>x.disabled).length)===0,'(on a normal page all four page types are on offer)');
await pg.click('#pages button:has-text("Shore")');await pg.waitForTimeout(200);
await pg.click('label.bad');await pg.waitForTimeout(250);
await pg.click('button[aria-label="Make this the first page"]');await pg.waitForTimeout(250);
pr=await P(pg);ok(pr.start!==pr.passages.find(p=>p.name==='Shore').id,'an ending page cannot be made the start');
await pg.click('#pages button:has-text("Start")');await pg.waitForTimeout(250);
const dis=await pg.locator('input[name=ptype]').evaluateAll(r=>r.map(x=>x.disabled));
ok(dis.filter(Boolean).length===3&&!dis[0],'on the start page Ending, Good and Bad are disabled: '+dis);
await pg.close();
/* an old file whose first page is an ending: fixed, with a note */
{const proj=withProj(p=>{const s=p.passages.find(x=>x.id===p.start);s.ending=true;s.valence='good';s.choices=[];});
 const ctx=await b.newContext({viewport:{width:1280,height:900}});
 await ctx.addInitScript(([set,pj])=>{if(!sessionStorage.getItem('r3')){sessionStorage.setItem('r3','1');localStorage.setItem('story-editor-v1-settings',JSON.stringify(set));localStorage.setItem('story-editor-v1',pj);}},[SET,proj]);
 pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));await pg.goto(FILE);
 let seen='';for(let i=0;i<60&&!seen;i++){await pg.waitForTimeout(100);seen=await pg.evaluate(()=>{const t=document.getElementById('toast');return t?t.textContent:''}).catch(()=>'');}
 await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});await pg.waitForTimeout(300);
 pr=await P(pg);const s0=pr.passages.find(p=>p.id===pr.start);
 ok(!s0.ending,'opening a file whose start page was an ending un-ends it');
 ok(/cannot be an ending/.test(seen),'and says so in a message');}
const an=await pg.evaluate(()=>JSON.stringify(window.__editor.analysis));
ok(!/is an ending, but it is also where the story starts/.test(an),'(no leftover checker complaint after the fix)');
await pg.close();

/* ---- 3. checker: new rules ---- */
const bad=withProj(p=>{
 const a=p.passages;a[1].name=a[2].name;                       // duplicate page names
 a[3].blocks[0].text='TODO write this scene scene';               // placeholder + repeated word
 a[4].choices.push({...JSON.parse(JSON.stringify(a[4].choices[0]||{id:'dup1',label:'x',to:a[0].id})),id:'dupc'});   // duplicate choice label
 a[5].blocks.push({...JSON.parse(JSON.stringify(a[5].blocks[0])),id:'emp1',text:''}); // empty paragraph
 a[6].blocks[0].orPrev=true;                                     // 'otherwise' with nothing above
 p.title='Untitled story';                                      // no real title
});
pg=await fresh({proj:bad});await pg.waitForTimeout(500);
const msgs=await pg.evaluate(()=>{const a=window.__editor.analysis;const all=[].concat(a.problems||[],a.warnings||[],a.notes||[]);return all.map(x=>x.msg)});
const has=re=>msgs.some(m=>re.test(m));
ok(has(/are all called/),'checker: duplicate page names');
ok(has(/placeholder word/),'checker: TODO placeholder');
ok(has(/repeats a word/),'checker: repeated word');
ok(has(/two choices that both say/),'checker: duplicate choice labels');
ok(has(/empty paragraph/),'checker: empty paragraph');
ok(has(/“otherwise” to text above/),'checker: otherwise on the first paragraph');
ok(has(/has no title/),'checker: no story title');
await pg.click('#tabs [data-tab=check]');await pg.waitForTimeout(400);
ok((await pg.locator('#main').innerText()).includes('are all called'),'Check tab lists the new warnings');
ok(pg.errs.length===0,'no errors on the Check tab '+pg.errs.join('|'));
await pg.close();

/* ---- 4. map icon toolbar ---- */
pg=await fresh();
await pg.click('#tabs [data-tab=map]');await pg.waitForTimeout(700);
ok(await pg.locator('#main select').count()===0,'no drop-downs left in the map toolbar');
const vb=pg.locator('[aria-label="Map view"] button');
const nv=await vb.count();ok(nv>=7,'view icons: '+nv);
ok(await vb.evaluateAll(b=>b.every(x=>x.title&&x.getAttribute('aria-label')&&x.querySelector('svg'))),'every view icon has a tooltip, a name and a picture');
await pg.click('[aria-label="Map view"] button[aria-label="Top-down tree"]');await pg.waitForTimeout(500);
ok(await pg.locator('[aria-label="Map view"] button.on').getAttribute('aria-label')==='Top-down tree','clicking a view icon switches the view');
const odds=pg.locator('button[aria-label="Color by ending odds"]');
await odds.click();await pg.waitForTimeout(400);ok(await odds.getAttribute('aria-pressed')==='true','odds color turns on');
await odds.click();await pg.waitForTimeout(400);ok(await odds.getAttribute('aria-pressed')==='false','and off again');
await pg.click('button[aria-label="Color by playtest heat"]');await pg.waitForTimeout(300);
ok(await pg.locator('button[aria-label="Color by playtest heat"]').getAttribute('aria-pressed')==='true','heat color turns on');
await pg.click('button[aria-label="Follow an object, state or number"]');await pg.waitForTimeout(200);
const ent=pg.locator('.ctx button:not([disabled])');ok(await ent.count()>=2,'the follow menu lists the items');
await ent.nth(1).click();await pg.waitForTimeout(400);
ok(await pg.locator('button[aria-label="Follow an object, state or number"]').getAttribute('aria-pressed')==='true','following an item shows it pressed');
await pg.click('button[aria-label="Color by page type"]');await pg.waitForTimeout(300);
const mg=pg.locator('button[aria-label="Merge"]');const m0=await mg.getAttribute('aria-pressed');await mg.click();await pg.waitForTimeout(300);
ok(await pg.locator('button[aria-label="Merge"]').getAttribute('aria-pressed')!==m0,'Merge toggles');
const sz=pg.locator('button[aria-label="Size by traffic"]');const z0=await sz.getAttribute('aria-pressed');await sz.click();await pg.waitForTimeout(300);
ok(await pg.locator('button[aria-label="Size by traffic"]').getAttribute('aria-pressed')!==z0,'Size by traffic toggles');
await pg.click('[aria-label="Map view"] button[aria-label="Arc diagram"]');await pg.waitForTimeout(400);
ok(await pg.locator('button[aria-label="Merge"]').isDisabled(),'Merge is grayed in the Arc view');
await pg.click('[aria-label="Map view"] button[aria-label="Flow"]');await pg.waitForTimeout(400);
const tb=await pg.evaluate(()=>{const g=document.querySelector('[aria-label="Map view"]');const r=g.closest('.maptools,.mapbar,.mapctl,div')||g.parentElement;const q=r.getBoundingClientRect();return Math.round(q.height)});
console.log('   toolbar height (px): '+tb);
/* keyboard: Tab reaches the icons, Enter presses one */
await pg.locator('[aria-label="Map view"] button[aria-label="Matrix"]').focus();await pg.keyboard.press('Enter');await pg.waitForTimeout(400);
ok(await pg.locator('[aria-label="Map view"] button.on').getAttribute('aria-label')==='Matrix','icons work from the keyboard');
await pg.click('[aria-label="Map view"] button[aria-label="Flow"]');await pg.waitForTimeout(500);
/* key above Start on a desktop */
const pos=await pg.evaluate(()=>{const k=document.querySelector('.fkey').getBoundingClientRect(),s=document.querySelector('.node.start').getBoundingClientRect();return {kb:k.bottom,st:s.top,kx:k.left,sx:s.left,sr:s.right,kr:k.right}});
ok(pos.kb<=pos.st+1,'on a desktop the key sits above the Start page ('+Math.round(pos.kb)+' <= '+Math.round(pos.st)+')');
ok(pg.errs.length===0,'no errors on the Map tab '+pg.errs.join('|'));
await pg.close();
pg=await fresh({w:390,h:780});
await pg.click('#tabs [data-tab=map]');await pg.waitForTimeout(700);
const pp=await pg.evaluate(()=>{const k=document.querySelector('.fkey').getBoundingClientRect(),s=document.querySelector('.node.start').getBoundingClientRect();return {kb:k.bottom,st:s.top}});
ok(!(pp.kb<=pp.st+1),'on a phone the key keeps its usual place (not above Start)');
await pg.close();

/* ---- 5. first-time tour ---- */
pg=await fresh({noSet:true});
await pg.waitForFunction(()=>document.getElementById('tour'),null,{timeout:15000}).catch(()=>{});
ok(await pg.locator('#tour').count()===1,'the tour starts by itself on a first visit');
ok(/step 1 of \d+/i.test(await pg.innerText('.tour-count')),'it opens on step 1: '+await pg.innerText('.tour-count'));
ok(await pg.locator('.tour-btns button:has-text("Back")').isDisabled(),'Back is off on step 1');
await pg.click('.tour-btns .primary');await pg.waitForTimeout(500);
ok(/step 2/i.test(await pg.innerText('.tour-count')),'Next goes to step 2');
const hb=await pg.evaluate(()=>{const h=document.querySelector('.tour-hole').getBoundingClientRect(),s=document.querySelector('#side').getBoundingClientRect();return Math.abs(h.left-s.left)<12&&h.width>100});
ok(hb,'the spotlight is on the page list');
await pg.keyboard.press('ArrowLeft');await pg.waitForTimeout(300);ok(/step 1/i.test(await pg.innerText('.tour-count')),'ArrowLeft goes back');
await pg.keyboard.press('ArrowRight');await pg.waitForTimeout(300);
const total=+(/of (\d+)/i.exec(await pg.innerText('.tour-count'))[1]);
for(let i=2;i<total;i++){await pg.keyboard.press('ArrowRight');await pg.waitForTimeout(300);
 const inside=await pg.evaluate(()=>{const c=document.querySelector('.tour-card').getBoundingClientRect();return c.left>=0&&c.top>=0&&c.right<=innerWidth&&c.bottom<=innerHeight});
 if(!inside)ok(false,'card stays on screen at step '+(i+1));}
ok(await pg.innerText('.tour-btns .primary')==='Done','the last step offers Done');
await pg.click('.tour-btns .primary');await pg.waitForTimeout(300);
ok(await pg.locator('#tour').count()===0,'Done closes the tour');
ok(await pg.evaluate(()=>!!localStorage.getItem('story-editor-v1-toured')),'the tour is remembered as seen');
await pg.reload();await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});await pg.waitForTimeout(1500);
ok(await pg.locator('#tour').count()===0,'it does not start again after a reload');
await pg.click('#optbtn');await pg.click('#optpop button:has-text("Take the tour")');await pg.waitForTimeout(400);
ok(await pg.locator('#tour').count()===1,'Options → Take the tour starts it again');
await pg.keyboard.press('Escape');await pg.waitForTimeout(300);
ok(await pg.locator('#tour').count()===0,'Esc skips it');
ok(pg.errs.length===0,'no errors from the tour '+pg.errs.join('|'));
await pg.close();
pg=await fresh({noSet:true,w:390,h:780});
await pg.waitForFunction(()=>document.getElementById('tour'),null,{timeout:15000}).catch(()=>{});
ok(await pg.locator('#tour').count()===1,'the tour starts on a phone too');
await pg.click('.tour-btns .primary');await pg.waitForTimeout(600);
ok(await pg.evaluate(()=>document.body.classList.contains('show-side')),'on a phone step 2 slides the page list open');
for(let i=0;i<3;i++){await pg.click('.tour-btns .primary');await pg.waitForTimeout(500);}
ok(await pg.evaluate(()=>!document.body.classList.contains('show-side')&&!document.body.classList.contains('show-items')),'and the lists are put away again');
await pg.click('.tour-skip');await pg.waitForTimeout(300);
ok(await pg.locator('#tour').count()===0,'Skip tour closes it');
ok(pg.errs.length===0,'no errors from the phone tour '+pg.errs.join('|'));
await pg.close();
/* version stamp: year.month.day.time (US Eastern, 24-hour) */
pg=await fresh();await pg.click('#help');await pg.waitForTimeout(300);
const vt=await pg.evaluate(()=>(document.querySelector('dialog.guide .hint')||{}).textContent||'');
ok(/Version \d{4}\.\d\d\.\d\d\.\d{4}\b/.test(vt),'the Quick guide shows the version in the form 2026.10.08.2320: '+vt);
await pg.close();
/* a returning author (Advanced already chosen) is not interrupted */
pg=await fresh();await pg.waitForTimeout(5200);
ok(await pg.locator('#tour').count()===0,'no automatic tour once the Advanced choices were made');
await b.close();
console.log(fails?('FAILED '+fails):'ALL PASSED');process.exit(fails?1:0);
})().catch(e=>{console.log('CRASH',e.message);process.exit(2)});
