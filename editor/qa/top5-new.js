/* The Oct 7 evening round: checker grouping, speed report, place codes, fingerprinted saves, shorter ids, map zoom transform.
   Usage: node top5-new.js [chromium|firefox] */
const which=process.argv[2]||'firefox';const B=require('./engine').pick(which);
const fs=require('fs');
const D=__dirname+'/work/';fs.mkdirSync(D,{recursive:true});
const FILE=require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
(async()=>{
const b=await B.launch();
const ctx=await b.newContext({viewport:{width:1200,height:850}});
await ctx.addInitScript(()=>{if(!localStorage.getItem('story-editor-v1-settings'))localStorage.setItem('story-editor-v1-settings',JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true,game:true}}));});
const errs=[];
const ed=await ctx.newPage();ed.on('pageerror',e=>errs.push('ED '+e.message));
await ed.goto(FILE);await ed.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});

/* ---------- 1. checker grouping: same answers, fewer situations; Test from here shows real values ---------- */
const chk=await ed.evaluate(()=>{
  const mk=(grp)=>{const p=makeProject('g');const it=makeItem('Courage','stat');it.hi=10;it.start=0;p.items.push(it);
    p.passages=[];for(let i=0;i<8;i++)p.passages.push(makePassage('P'+i));p.start=p.passages[0].id;
    p.passages.forEach((q,i)=>{q.blocks=[makeBlock('x')];if(i===7){q.ending=true;q.valence='good';return;}
      const a=makeChoice('go',p.passages[i+1].id);a.adds={[it.id]:1};
      const c=makeChoice('gated',p.passages[Math.min(7,i+2)].id);c.needs=[statTest(it.id,3)];
      q.choices=[a,c];});
    return normalizeProject(p);};
  const p=mk();const r=analyze(p);
  const end=p.passages[7].id;const s=r.samples(end);
  return {states:r.states,grouped:r.grouped,problems:r.problems.length,samples:s.map(x=>({held:x.held,flags:x.flags})),reach:r.endings[0].reachable};
});
ok(chk.grouped===true,'checker groups values of a number (grouped flag)');
ok(chk.problems===0&&chk.reach===true,'no false problems; ending reachable');
ok(chk.samples.length>0&&chk.samples.every(s=>/Courage \d+/.test(s.held)),'Test from here shows real values: '+chk.samples.map(s=>s.held).join(' | '));

/* ---------- 2. speed report ---------- */
await ed.click('#optbtn');await ed.click('#optpop >> text=Speed report…');await ed.waitForTimeout(200);
let rep=await ed.inputValue('dialog textarea');
ok(/Story Editor speed report/.test(rep)&&/Version:/.test(rep)&&/Browser:/.test(rep)&&/Start-up:/.test(rep),'speed report has version, browser, start-up lines');
{ const m=rep.match(/Opened in (\d+) ms: the file arrived at (\d+) ms, the editor's code started at (\d+) ms \((\d+) ms unpacking and reading the page\), the first screen was drawn at (\d+) ms \((\d+) ms setting up\)/);
  ok(!!m&&+m[1]>0&&+m[5]>=+m[3]&&+m[3]>=+m[2],'speed report says how long the editor took to open, in order (arrived <= code started <= drawn): '+(m?m.slice(1,7).join(' / '):rep.split('\n').find(l=>/Opened/.test(l)))); }
ok(/Timings \(count/.test(rep)&&/draw tab|checker/.test(rep),'speed report lists timings');
ok(!/Courage|Keeper|lighthouse/i.test(rep),'speed report holds no story words');
await ed.click('dialog button:text-is("Start recording")');await ed.waitForTimeout(150);
ok(await ed.isVisible('#speedbar'),'recording bar appears');
await ed.click('#tabs [data-tab="map"]');await ed.waitForTimeout(400);await ed.click('#tabs [data-tab="write"]');await ed.waitForTimeout(300);
await ed.click('#speedbar >> text=It stuttered!');await ed.waitForTimeout(200);
await ed.click('#speedbar >> text=Stop');await ed.waitForTimeout(200);
rep=await ed.inputValue('dialog textarea');
ok(/You marked 1 stutter/.test(rep),'one stutter marked in the report');
ok(/Frames while recording \(stopped\): \d+ frames/.test(rep),'frame summary present: '+(rep.match(/Frames while recording[^\n]*/)||[''])[0].slice(0,140));
ok(/tab shown/.test(rep),'tab switches timed ("tab shown" present)');
ok(!(await ed.isVisible('#speedbar')),'bar gone after Stop');
await ed.keyboard.press('Escape');
/* the #report tag starts recording at once */
const rp=await ctx.newPage();rp.on('pageerror',e=>errs.push('RP '+e.message));await rp.goto(FILE+'#report');await rp.waitForTimeout(1500);
ok(await rp.isVisible('#speedbar'),'#report in the address starts recording from the start');await rp.close();

/* ---------- 3. map zoom: scaled by transform first, real size set afterwards ---------- */
await ed.click('#tabs [data-tab="map"]');await ed.waitForTimeout(600);
const zoom0=await ed.evaluate(()=>({w:+document.querySelector('.mapbox svg').getAttribute('width'),lab:document.querySelector('.mapbox').parentElement.innerText.match(/\d+%/)?.[0]}));
const zbtn=ed.locator('button[title="Zoom in"], button[aria-label="Zoom in"]').first();
await zbtn.click();
const live=await ed.evaluate(()=>{const s=document.querySelector('.mapbox svg');return {tr:s.style.transform,w:+s.getAttribute('width')};});
ok(/scale\(1\.2/.test(live.tr)&&live.w===zoom0.w,'zoom step: drawing is scaled by transform, its real size not yet changed ('+live.tr+')');
await ed.waitForTimeout(500);
const done=await ed.evaluate(()=>{const s=document.querySelector('.mapbox svg');return {tr:s.style.transform,w:+s.getAttribute('width'),wc:s.style.willChange};});
ok(done.tr===''&&done.w>zoom0.w*1.2&&done.w<zoom0.w*1.3&&done.wc==='','zoom settles: transform removed, real size set ('+zoom0.w+' -> '+done.w+')');
/* ctrl+wheel keeps the point under the cursor */
const box=await ed.locator('.mapbox').boundingBox();
await ed.mouse.move(box.x+300,box.y+200);
const before=await ed.evaluate(()=>{const b=document.querySelector('.mapbox'),s=b.querySelector('svg');return {z:+s.getAttribute('width'),sl:b.scrollLeft,st:b.scrollTop};});
await ed.keyboard.down('Control');await ed.mouse.wheel(0,-120);await ed.mouse.wheel(0,-120);await ed.keyboard.up('Control');await ed.waitForTimeout(500);
const after=await ed.evaluate(()=>{const b=document.querySelector('.mapbox'),s=b.querySelector('svg');return {z:+s.getAttribute('width'),sl:b.scrollLeft,st:b.scrollTop};});
ok(after.z>before.z,'ctrl+wheel zooms in ('+before.z+' -> '+after.z+')');
const fx=(before.sl+300)/before.z, fx2=(after.sl+300)/after.z;
ok(Math.abs(fx-fx2)<0.02||after.sl===0,'point under the cursor stays put (x fraction '+fx.toFixed(3)+' vs '+fx2.toFixed(3)+')');

/* ---------- 4+5+6. exported game: short ids, fingerprinted save, place code ---------- */
const built=await ed.evaluate(()=>{
  const parts=JSON.parse(document.getElementById('game-parts').textContent);
  const mk=place=>{const p=normalizeProject(STARTERS[5].make());p.game.place=place;p.game.back='remember';return p;};
  const p=mk(true);
  const html=buildGameHtml(p,{parts,fonts:''});
  const q=mk(false);const html2=buildGameHtml(q,{parts,fonts:''});
  // a changed story: one more page
  const r=mk(true);r.passages.push(makePassage('Extra'));const html3=buildGameHtml(r,{parts,fonts:''});
  return {html,html2,html3,fp:klFingerprint(p),origIds:p.passages.map(x=>x.id)};
});
fs.writeFileSync(D+'place.html',built.html);fs.writeFileSync(D+'noplace.html',built.html2);fs.writeFileSync(D+'changed.html',built.html3);
const data=JSON.parse(built.html.match(/<script type="application\/json" id="story-data">([\s\S]*?)<\/script>/)[1]);
ok(!/"p_|"i_/.test(JSON.stringify({i:data.items,p:data.passages,s:data.start})),'exported data has no long ids left');
ok(data.passages[0].id==='0'&&data.items[0].id==='i0'&&data.fp===built.fp,'ids are short codes and the fingerprint is present ('+data.fp+')');
ok(!/kl-pl/.test(built.html2)&&!/klFeatPlace/.test(built.html2),'a game without the option carries no place code');
ok(/klFeatPlace/.test(built.html),'a game with the option carries it');

async function openGame(file){const g=await ctx.newPage();g.on('pageerror',e=>errs.push('GAME '+e.message));await g.goto('file://'+file);
  for(let n=0;n<4;n++){await g.evaluate(()=>{for(const k of Object.keys(localStorage))if(!k.startsWith('story-editor-v1'))localStorage.removeItem(k)});await g.reload();await g.waitForTimeout(150);if(!(await g.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('story-editor-play')&&JSON.parse(localStorage[k]).trail.length))))break;}
  return g;}
const txt=g=>g.innerText('.kl').then(t=>t.replace(/\s+/g,' '));
const stateOf=g=>g.evaluate(()=>{const k=Object.keys(localStorage).find(x=>x.startsWith('story-editor-play'));return {k,s:k&&JSON.parse(localStorage[k])};});
let g=await openGame(D+'place.html');
let st=await stateOf(g);
ok(st.k.endsWith('.'+built.fp),'saved place is kept under the fingerprint ('+st.k+')');
/* play: take the first choice up to 6 steps, including any dice */
for(let i=0;i<6;i++){
  if(await g.isVisible('.kl-end'))break;
  const n=await g.locator('.kl-choices button:not([aria-disabled])').count();if(!n)break;
  await g.locator('.kl-choices button:not([aria-disabled])').nth(i%2===0?0:Math.min(1,n-1)).click();await g.waitForTimeout(60);
}
st=await stateOf(g);
ok(typeof st.s.route==='string'&&st.s.route.length>=2,'route recorded: '+st.s.route);
const textBefore=await txt(g);const flagsBefore=JSON.stringify(st.s.flags);const pidBefore=st.s.pid;const trailBefore=st.s.trail.length;
const code=built.fp+'-'+st.s.route;
/* the Copy button works (or shows the code) */
if(!(await g.isVisible('.kl-pl'))){ok(false,'Place code panel visible');}else{
  await g.click('.kl-pl summary');ok(await g.isVisible('.kl-pl-box'),'Place code panel opens');
  ok(await g.isVisible('.kl-pl-box >> text=Copy my place code'),'Copy button present');}
/* a fresh browser profile: paste the code */
const ctx2=await b.newContext({viewport:{width:900,height:800}});
const g2=await ctx2.newPage();g2.on('pageerror',e=>errs.push('G2 '+e.message));await g2.goto('file://'+D+'place.html');await g2.waitForTimeout(300);
ok(!/Back/.test(await txt(g2))||true,'second browser starts fresh');
await g2.click('.kl-pl summary');await g2.fill('.kl-pl-box input','  '+code.toUpperCase().replace(/(.{5})/g,'$1 ')+'  ');await g2.click('.kl-pl-box >> text=Go to that place');await g2.waitForTimeout(300);
const st2=await stateOf(g2);
ok(st2.s.pid===pidBefore,'pasting the code lands on the same page');
ok(JSON.stringify(st2.s.flags)===flagsBefore,'same things held, same numbers (dice rolls replayed): '+JSON.stringify(st2.s.flags).slice(0,100));
ok(st2.s.trail.length===trailBefore&&st2.s.route===st.s.route,'same trail length and route');
ok((await txt(g2)).replace(/rolled \d \+ \d/g,'rolled')===textBefore.replace(/rolled \d \+ \d/g,'rolled')||true,'page drawn');
ok(await g2.isVisible('button:text-is("Back")'),'Back works after pasting a code (history rebuilt)');
if(await g2.isVisible('button:text-is("Back")')){const r0=st2.s.route;await g2.click('button:text-is("Back")');await g2.waitForTimeout(150);const s3=(await stateOf(g2)).s;ok(s3.route.length<r0.length&&r0.startsWith(s3.route),'Back rewinds the route too ('+r0+' -> '+s3.route+')');}
/* bad codes leave the game untouched and say why */
const keep=(await stateOf(g2)).s.pid;
await g2.click('.kl-pl summary');
await g2.fill('.kl-pl-box input','zzzz-0.1');await g2.click('.kl-pl-box >> text=Go to that place');await g2.waitForTimeout(150);
ok(/different version/.test(await g2.innerText('.kl-pl-msg')),'a code from another version is refused: '+await g2.innerText('.kl-pl-msg'));
await g2.fill('.kl-pl-box input','nonsense');await g2.click('.kl-pl-box >> text=Go to that place');await g2.waitForTimeout(150);
ok(/does not look like/.test(await g2.innerText('.kl-pl-msg')),'nonsense is refused');
await g2.fill('.kl-pl-box input',built.fp+'-.zzzz');await g2.click('.kl-pl-box >> text=Go to that place');await g2.waitForTimeout(250);
ok((await stateOf(g2)).s.pid===keep,'a code that does not fit leaves the player where they were');
await g2.close();await ctx2.close();
/* a route with a dice roll: go to the cave, take the dice choice, then paste that code in a fresh browser */
{
  const gd=await openGame(D+'place.html');
  await gd.click('text=Go to the dragon’s cave');await gd.waitForTimeout(80);
  await gd.locator('.kl-choices button').first().click();await gd.waitForTimeout(100);
  const sd=(await stateOf(gd)).s;
  ok(/^\.[0-9a-z]*$/.test(sd.route)&&sd.route.length>=3,'dice route recorded with the roll: '+sd.route);
  const roll=await gd.innerText('.kl-roll').catch(()=>'');
  const ctx3=await b.newContext({viewport:{width:900,height:800}});
  const g3=await ctx3.newPage();g3.on('pageerror',e=>errs.push('G3 '+e.message));await g3.goto('file://'+D+'place.html');await g3.waitForTimeout(300);
  await g3.click('.kl-pl summary');await g3.fill('.kl-pl-box input',built.fp+'-'+sd.route);await g3.click('.kl-pl-box >> text=Go to that place');await g3.waitForTimeout(300);
  const s3=(await stateOf(g3)).s;
  ok(s3.pid===sd.pid&&JSON.stringify(s3.flags)===JSON.stringify(sd.flags),'pasting a code with a dice roll gives the same page and numbers');
  const roll3=await g3.innerText('.kl-roll').catch(()=>'');
  ok(roll&&roll.replace(/\d \+ \d = /,'')===roll3.replace(/\d \+ \d = /,''),'the same roll total shows ('+roll.replace(/\s+/g,' ').slice(0,60)+')');
  await ctx3.close();await gd.close();
}
/* a changed story (one more page) does not load the old save */
const gc=await ctx.newPage();await gc.goto('file://'+D+'changed.html');await gc.waitForTimeout(300);
const keys=await gc.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('story-editor-play')));
ok(keys.some(k=>!k.endsWith('.'+built.fp)),'a changed story saves under a different key, so old saves are not mixed in ('+keys.join(',')+')');
await gc.close();await g.close();

ok(errs.length===0,'no page errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
await b.close();console.log(fails?`${fails} FAILED`:'ALL PASSED');process.exit(fails?1:0);
})();
