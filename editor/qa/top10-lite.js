/* Lite export against full export: the same story, played with the same dice and the same choices, must look identical.
   Usage: node top10-lite.js [chromium|firefox] */
const which=process.argv[2]||'firefox';const B=require('./engine').pick(which);
const fs=require('fs');
const D=__dirname+'/work/lite-'+which+'/';fs.mkdirSync(D,{recursive:true});
const FILE=require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
const U=__dirname+'/fixtures/';
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
(async()=>{
const b=await B.launch();
const ed=await (await b.newContext({viewport:{width:1100,height:800}})).newPage();
const errs=[];ed.on('pageerror',e=>errs.push(e.message));
await ed.goto(FILE);await ed.waitForTimeout(500);
/* the stories: the starters, the example, a sample story, and Quest with different reader options */
const bol=fs.readFileSync(U+'sample.story.json','utf8');
const built=await ed.evaluate(({bol})=>{
  const parts=JSON.parse(document.getElementById('game-parts').textContent);
  const all=KL_FEATURE_ORDER.slice();const out=[];
  const add=(name,p)=>{p=normalizeProject(JSON.parse(JSON.stringify(p)));
    out.push({name,feats:klFeatures(exportStory(p)),lite:buildGameHtml(p,{parts,fonts:''}),full:buildGameHtml(p,{parts,fonts:'',features:all})});};
  STARTERS.forEach(s=>add(s.name,s.make()));
  add('Example',JSON.parse(document.getElementById('starter-story').textContent));
  add('Sample',JSON.parse(bol));
  const q=()=>STARTERS[5].make();
  [['tracker',{tracker:true}],['back remember',{back:'remember'}],['back reroll',{back:'reroll'}],['back block',{back:'block'}],['Aa off',{comfort:false}],['odds off',{odds:false}],['night + all',{pal:'night',tracker:true,back:'block'}]].forEach(([n,g])=>{const p=q();Object.assign(p.game,g);add('Quest, '+n,p);});
  { /* a hidden number with a number test and a lock, but no bars or dice */
    const p=q();p.items.filter(i=>i.kind==='stat').forEach(i=>i.show=false);add('Quest, hidden number',p); }
  { /* no ending marked as such: tracker option on but nothing to count */
    const p=q();p.game.tracker=true;p.passages.forEach(x=>x.ending=false);add('Quest, tracker without endings',p); }
  { /* negative control: a Quest game with its dice, locks and bars wrongly left out must NOT look like the full one */
    const p=normalizeProject(q());out.push({name:'NEGATIVE CONTROL (modules left out)',feats:['comfort'],expectDiff:true,lite:buildGameHtml(p,{parts,fonts:'',features:['comfort']}),full:buildGameHtml(p,{parts,fonts:'',features:all})}); }
  return out;},{bol});
for(const s of built){fs.writeFileSync(D+s.name.replace(/\W+/g,'_')+'-lite.html',s.lite);fs.writeFileSync(D+s.name.replace(/\W+/g,'_')+'-full.html',s.full);}
console.log('stories:',built.length);
/* One play of one game, done inside the page: no round trip to the test per click (that made this suite take 14 minutes).
   The same random choices as before: a seeded generator picks a choice (or sometimes Back) at each step. */
async function play(file,seed,steps){
  const own=await b.newContext({viewport:{width:900,height:900}}); /* a context of its own per play: a closing page can still write its save, and that write could land after the next page cleared storage */
  const g=await own.newPage();const e=[];g.on('pageerror',x=>e.push(x.message));g.on('console',m=>{if(m.type()==='error')e.push(m.text())});
  await g.addInitScript(sd=>{let a=sd>>>0;Math.random=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};},seed);
  await g.addInitScript(fs.readFileSync(require('path').join(__dirname, '..', '..', 'packages', 'qa-kit', 'src', 'bidi-engine.js'),'utf8')); /* gives the page window.__pwq.idle: wait for the game's own short timers, not a guessed 15 ms */
  await g.goto('file://'+file);
  const log=await g.evaluate(async({seed,steps})=>{
    const rng=sd=>{let a=sd>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
    const r=rng(seed*7+1),log=[],pause=()=>window.__pwq.idle(150);
    for(let i=0;i<steps;i++){
      const srs=[...document.querySelectorAll('.kl-sr')];srs.forEach(x=>{x.style.display='none'});let tx=(document.getElementById('game').innerText||'').replace(/\s+/g,' ');srs.forEach(x=>{x.style.display=''}); /* the screen-reader announcement is compared on its own (Firefox sometimes drops visually hidden text from innerText, and where it sits is not what matters) */
      tx=tx.replace(/Aa$|Aa Start over$/,'').trim()+(srs.length?' | announced: '+srs.map(x=>x.textContent).join(' / '):'');
      log.push(tx);
      const btns=[...document.querySelectorAll('.kl-choices button:not([aria-disabled=true])')];
      const back=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Back');
      if(r()<0.15&&back&&!back.disabled){back.click();log.push('<back>');await pause(15);continue;}
      if(!btns.length)break;
      btns[Math.floor(r()*btns.length)].click();await pause(15);
    }
    return log;},{seed,steps});
  await own.close();return {log,e};}
let steps=0;
/* compare one story's two games on two seeds; stories are compared three at a time (the machine has two cores) */
async function compare(s){
  const T0=Date.now();const f=D+s.name.replace(/\W+/g,'_');let same=true,first='',errsAll=[];
  for(const seed of [1,2]){
    const [A,Z]=await Promise.all([play(f+'-lite.html',seed,30),play(f+'-full.html',seed,30)]);
    steps+=A.log.length;errsAll.push(...A.e,...Z.e);
    const n=Math.max(A.log.length,Z.log.length);
    for(let i=0;i<n;i++)if(A.log[i]!==Z.log[i]){same=false;{const a=A.log[i]||'',z=Z.log[i]||'';let k=0;while(k<a.length&&a[k]===z[k])k++;first=`seed ${seed} step ${i}, first difference at character ${k}\n   lite: …${a.slice(Math.max(0,k-60),k+100)}\n   full: …${z.slice(Math.max(0,k-60),k+100)}`;}break;}
    if(!same)break;
  }
  return {s,same,first,errsAll,ms:Date.now()-T0};
}
const todo=built.filter(s=>!process.env.ONLY||s.name.includes(process.env.ONLY));
const results=new Array(todo.length);let next=0;
await Promise.all([0,1,2].map(async()=>{while(next<todo.length){const i=next++;results[i]=await compare(todo[i]);}}));
for(const {s,same,first,errsAll} of results)ok(s.expectDiff?!same:(same&&!errsAll.length),`${s.name} [${s.feats.join(',')||'none'}] lite = full${same?'':'\n   '+first}${errsAll.length?' errors '+errsAll.slice(0,2):''}`);
console.log('compared steps:',steps);
ok(!errs.length,'no editor errors');
console.log(fails?`${fails} FAILED`:'ALL PASSED');await b.close();})();
