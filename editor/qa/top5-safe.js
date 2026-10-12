/* Lessons 5 and 7 (Oct 7 night): safe saves with a spare copy (editor and game), save on hide, the error log in the Speed report.
   Usage: node top5-safe.js [chromium|firefox] */
const which=process.argv[2]||'firefox';const B=require('./engine').pick(which);
const fs=require('fs');
const D=__dirname+'/work/';
require('child_process').execSync('cp "'+require('path').join(__dirname, '..', 'story-editor.html')+'" '+D+'ed.html');const FILE='http://127.0.0.1:'+(process.env.QA_PORT||8765)+'/ed.html'; /* qa.js starts a server on a port of its own and says which in QA_PORT */
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const S1='story-editor-v1',S1B='story-editor-v1-backup',S1D='story-editor-v1-damaged';
(async()=>{
const b=await B.launch();
const settings=()=>{if(!localStorage.getItem('story-editor-v1-settings'))localStorage.setItem('story-editor-v1-settings',JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true,game:true}}));};
const errs=[];
/* ---------- editor: spare copy ---------- */
let ctx=await b.newContext({viewport:{width:1200,height:850}});await ctx.addInitScript(settings);
let ed=await ctx.newPage();ed.on('pageerror',e=>errs.push('ED '+e.message));
await ed.goto(FILE);await ed.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
const title=async t=>{await ed.fill('#title',t);await ed.waitForTimeout(900);};
await title('First title');await title('Second title');
let ls=await ed.evaluate(([a,c])=>({main:localStorage.getItem(a),bak:localStorage.getItem(c)}),[S1,S1B]);
ok(JSON.parse(ls.main).title==='Second title','autosave wrote the latest story');
ok(ls.bak&&JSON.parse(ls.bak).format==='story-editor','a spare copy exists after the second save ('+(ls.bak&&JSON.parse(ls.bak).title)+')');
await title('Third title');
ls=await ed.evaluate(([a,c])=>({main:JSON.parse(localStorage.getItem(a)).title,bak:JSON.parse(localStorage.getItem(c)).title}),[S1,S1B]);
ok(ls.main==='Third title'&&ls.bak!=='Third title','the spare is not renewed on every save (main '+ls.main+', spare '+ls.bak+')');
/* damage the main save, keep the spare */
const spareTitle=ls.bak;
await ed.evaluate(([a])=>localStorage.setItem(a,'{"format":"story-editor","passages":[{"id":'),[S1]);
await ed.evaluate(()=>{window.__noHide=1;});
await ed.reload();await ed.waitForTimeout(1500);
const toastText=await ed.innerText('#toast');
await ed.waitForTimeout(3200);
let t=await ed.inputValue('#title');
ok(t===spareTitle,'a damaged save is replaced by the spare copy (title '+t+')');
ok(/earlier copy was restored/.test(toastText),'the person is told: '+toastText.slice(0,50));
const dm=await ed.evaluate(k=>localStorage.getItem(k),S1D);
ok(dm&&dm.indexOf('"passages":[{"id":')>0,'the unreadable text is kept aside');
/* no spare and damaged: the example opens */
await ed.evaluate(([a,c])=>{localStorage.setItem(a,'not json at all');localStorage.removeItem(c);},[S1,S1B]);
await ed.reload();await ed.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
t=await ed.inputValue('#title');
ok(t.length>0&&(await ed.locator('#side').innerText()).length>20,'damaged save and no spare still starts the editor ('+t+')');
/* hidden tab saves a pending edit */
await ed.fill('#title','Hidden save');
await ed.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
const saved=await ed.evaluate(k=>JSON.parse(localStorage.getItem(k)).title,S1);
ok(saved==='Hidden save','a pending edit is written when the tab is hidden');
/* ---------- error log in the speed report ---------- */
await ed.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{error:new Error('boom for the log'),message:'boom'})));
await ed.click('#optbtn');await ed.waitForTimeout(200);
await ed.evaluate(()=>[...document.querySelectorAll('#optpop button, #optpop [role=menuitem]')].find(x=>/Speed report/.test(x.textContent)).click());await ed.waitForTimeout(300);
const rep=await ed.$eval('dialog textarea',e=>e.value);
ok(/Recent errors \(last 5\)/.test(rep)&&/uncaught: boom for the log/.test(rep),'the report lists the error: '+(rep.match(/uncaught:[^\n]*/)||[''])[0].slice(0,80));
ed.removeAllListeners('pageerror');
await ctx.close();
/* a clean editor reports no errors */
ctx=await b.newContext({viewport:{width:1200,height:850}});await ctx.addInitScript(settings);
ed=await ctx.newPage();ed.on('pageerror',e=>errs.push('ED2 '+e.message));
await ed.goto(FILE);await ed.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
await ed.click('#optbtn');await ed.waitForTimeout(200);
await ed.evaluate(()=>[...document.querySelectorAll('#optpop button, #optpop [role=menuitem]')].find(x=>/Speed report/.test(x.textContent)).click());await ed.waitForTimeout(300);
ok(/No errors since the page opened/.test(await ed.$eval('dialog textarea',e=>e.value)),'a fresh editor reports no errors');
/* ---------- the game ---------- */
const built=await ed.evaluate(()=>{
  const parts=JSON.parse(document.getElementById('game-parts').textContent);
  const p=normalizeProject(STARTERS[5].make());
  return buildGameHtml(p,{parts,fonts:''});
});
fs.writeFileSync(D+'safe.html',built);
const g=await ctx.newPage();g.on('pageerror',e=>errs.push('GAME '+e.message));
await g.goto(FILE.replace('ed.html','safe.html'));await g.evaluate(()=>localStorage.clear());await g.reload();await g.waitForTimeout(250);
const keys=()=>g.evaluate(()=>({play:Object.keys(localStorage).filter(k=>k.startsWith('story-editor-play')),bak:Object.keys(localStorage).filter(k=>k.startsWith('story-editor-bak'))}));
const pidOf=(k)=>g.evaluate(x=>{const v=localStorage.getItem(x);return v&&JSON.parse(v).pid},k);
const click=async()=>{await g.evaluate(()=>document.querySelector('.kl-choices button:not([disabled])').click());await g.waitForTimeout(150);};
await click();
let kk=await keys();
ok(kk.play.length===1,'game wrote a save after the first move');
await click();await click();
kk=await keys();
ok(kk.bak.length===1&&kk.bak[0]===kk.play[0].replace('story-editor-play:','story-editor-bak:'),'a spare save sits under its own key ('+kk.bak[0]+')');
const mainPid=await pidOf(kk.play[0]),sparePid=await pidOf(kk.bak[0]);
ok(mainPid&&sparePid&&mainPid!==sparePid,'the spare is one step behind ('+sparePid+' then '+mainPid+')');
/* damage the latest save (in a fresh browser profile seeded with the saves, so the page cannot rewrite it on the way out) */
const seed=await g.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage[k]])));
seed[kk.play[0]]='{"pid":';
const ctx3=await b.newContext();
await ctx3.addInitScript(s=>{if(!localStorage.getItem('__seeded')){for(const k in s)localStorage.setItem(k,s[k]);localStorage.setItem('__seeded','1');}},seed);
const g3=await ctx3.newPage();g3.on('pageerror',e=>errs.push('G3 '+e.message));
await g3.goto(FILE.replace('ed.html','safe.html'));await g3.waitForTimeout(400);
const resumed=await g3.evaluate(k=>JSON.parse(localStorage.getItem(k)).pid,kk.play[0]);
ok(resumed===sparePid,'damaged latest save: the game carries on from the spare page ('+resumed+' vs spare '+sparePid+')');
/* no save at all: a leftover spare must not bring an old place back (a new player, or storage cleared except the spare) */
const seedB=Object.assign({},seed);const goodMain=await g.evaluate(k=>localStorage.getItem(k),kk.play[0]);
delete seedB[kk.play[0]];seedB[kk.bak[0]]=goodMain;
const ctx4=await b.newContext();
await ctx4.addInitScript(s=>{if(!localStorage.getItem('__seeded')){for(const k in s)localStorage.setItem(k,s[k]);localStorage.setItem('__seeded','1');}},seedB);
const g4=await ctx4.newPage();g4.on('pageerror',e=>errs.push('G4 '+e.message));
await g4.goto(FILE.replace('ed.html','safe.html'));await g4.waitForTimeout(400);
const fresh=await g4.evaluate(k=>{const v=localStorage.getItem(k);return v&&JSON.parse(v).pid},kk.play[0]);
ok(fresh!==null&&fresh==='0'&&JSON.parse(goodMain).pid!=='0','no main save and a spare present: the game starts fresh, not from the spare (page '+fresh+', spare page '+JSON.parse(goodMain).pid+')');
/* hiding the page writes the current place */
await g.evaluate(k=>localStorage.setItem(k,JSON.stringify({pid:'zz-not-a-page',flags:{}})),kk.play[0]);
await g.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));});
const still=await g.evaluate(k=>JSON.parse(localStorage.getItem(k)).pid,kk.play[0]);
ok(still&&still!=='zz-not-a-page','hiding the page writes the current place ('+still+')');
ok(errs.length===0,'no page errors '+errs.join(' | '));
await b.close();console.log(fails?fails+' FAILED':'ALL PASSED');process.exit(fails?1:0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
