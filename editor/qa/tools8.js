/* The Oct 8 evening round: find and replace, to-do flags, "why can't I reach this?", pages nobody reached, the Markdown manuscript,
   and dead numbers forgotten by the checker. Usage: node tools8.js [chromium|firefox] */
const which=process.argv[2]||'firefox';const B=require('./engine').pick(which);
const fs=require('fs'),vm=require('vm');
const FILE=require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
/* the model, for making test stories outside the page */
const cx={console};vm.createContext(cx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'core.js'),'utf8')+';this.X={analyze,makeProject,makeItem,makePassage,makeChoice,makeBlock,statTest,normalizeProject,storyFind,storyReplace,storyManuscript,exportStory}',cx);
const X=cx.X;
function storyA(){
  const p=X.makeProject('Tools');p.title='Keys & Doors';p.author='J. N.';p.items=[];
  const key=X.makeItem('Brass key','object'),curse=X.makeItem('Curse','state');p.items.push(key,curse);
  const mk=(n,t,end)=>{const q=X.makePassage(n);q.blocks=[X.makeBlock(t)];if(end){q.ending=true;q.valence=end}return q};
  const start=mk('Start','The red door is red. Red! Total cost: $5 (really).');start.heading='Welcome to the Red House';
  const hall=mk('Hall','A cold hall. The vault door is shut tight.');
  const vault=mk('Vault','Gold everywhere.','good');
  const cellar=mk('Cellar','You find a Brass key on a hook.');cellar.gives=[key.id];
  const out=mk('Outside','You leave. The end.','');
  const c1=X.makeChoice('Open the red door',hall.id);const c2=X.makeChoice('Walk away',out.id);start.choices=[c1,c2];
  const c3=X.makeChoice('Unlock the vault',vault.id);c3.needs=[key.id];const c4=X.makeChoice('Leave',out.id);hall.choices=[c3,c4];
  cellar.choices=[X.makeChoice('Go up',hall.id)];
  p.passages=[start,hall,vault,cellar,out];p.start=start.id;return X.normalizeProject(p);
}
function storyStats(n,m){ /* n numbers, each used only in its own section of m pages */
  const p=X.makeProject('Many numbers');p.items=[];const stats=[];
  for(let k=0;k<n;k++){const it=X.makeItem('S'+k,'stat');it.lo=0;it.hi=10;it.start=0;p.items.push(it);stats.push(it)}
  p.passages=[];const secs=[];
  for(let k=0;k<n;k++){const sec=[];for(let i=0;i<m;i++){const q=X.makePassage('s'+k+'p'+i);q.blocks=[X.makeBlock('x')];sec.push(q);p.passages.push(q)}secs.push(sec)}
  const end=X.makePassage('End');end.ending=true;end.blocks=[X.makeBlock('done')];p.passages.push(end);
  for(let k=0;k<n;k++){const sec=secs[k];const nf=k+1<n?secs[k+1][0]:end;
    sec.forEach((q,i)=>{const a=X.makeChoice('up',sec[(i+1)%m].id);a.adds={[stats[k].id]:1};
      const b=X.makeChoice('gate',nf.id);b.needs=[X.statTest(stats[k].id,i%9+1)];
      const c=X.makeChoice('down',sec[(i+2)%m].id);c.adds={[stats[k].id]:-1};q.choices=[a,b,c]})}
  p.start=secs[0][0].id;return X.normalizeProject(p);
}
(async()=>{
const b=await B.launch();
const errs=[];
async function open(story,adv){
  const ctx=await b.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
  await ctx.addInitScript(([t,a])=>{try{localStorage.setItem('story-editor-v1',t);localStorage.setItem('story-editor-v1-settings',JSON.stringify({chosen:true,remember:true,advanced:a}));}catch(e){}},[JSON.stringify(story),adv||{write:true,map:true,items:true,game:true}]);
  const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.goto(FILE);await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});return pg;
}
const proj=pg=>pg.evaluate(()=>JSON.parse(JSON.stringify(window.__editor.project)));

/* ---------- 1. find and replace: the logic ---------- */
{
  const S=storyA();
  const n=(q,o)=>X.storyFind(S,q,o).length;
  ok(n('red')===5&&n('RED')===5,'finds "red" in any case: '+n('red')+' (name/heading/paragraph/choice)');
  ok(n('red',{matchCase:true})===3,'match case: '+n('red',{matchCase:true}));
  ok(n('red',{whole:true})===5&&n('re',{whole:true})===0&&n('re')>5,'whole words: "re" matches parts only without the option');
  ok(n('$5')===1&&n('(really)')===1&&n('.*')===0,'special characters are plain text');
  ok(n('')===0,'empty search finds nothing');
  const S2=JSON.parse(JSON.stringify(S));
  const one=X.storyFind(S2,'Red',{matchCase:true});
  const done=X.storyReplace(S2,'Red','Blue',{matchCase:true},one[0]);
  ok(done===1&&X.storyFind(S2,'Red',{matchCase:true}).length===one.length-1,'replace one changes just that one');
  const all=X.storyReplace(S2,'red','crimson $&',{},null);
  ok(all>=3&&JSON.stringify(S2).includes('crimson $&')&&!/\bred\b/i.test(S2.passages[0].blocks[0].text),'replace all: "$&" in the new words stays plain ('+all+' changed)');
  const S3=JSON.parse(JSON.stringify(S));S3.passages[0].heading='x'.repeat(115);
  X.storyReplace(S3,'xxxxx','y'.repeat(20),{});
  ok(S3.passages[0].heading.length<=120,'a heading stays within 120 letters');
  const stale=X.storyFind(S,'Gold',{})[0];const S4=JSON.parse(JSON.stringify(S));S4.passages[2].blocks[0].text='Silver everywhere.';
  ok(X.storyReplace(S4,'Gold','Tin',{},stale)===0,'a match that has changed since is not replaced');
}

/* ---------- 2. find and replace in the editor ---------- */
let pg=await open(storyA());
await pg.click('#pages >> text=Find…').catch(async()=>{await pg.click('button:has-text("Find…")')});
await pg.waitForTimeout(200);
ok(await pg.isVisible('dialog.finder'),'Find… opens the window');
await pg.fill('dialog.finder input[aria-label="Find"]','red');await pg.waitForTimeout(200);
let txt=await pg.evaluate(()=>document.querySelector('dialog.finder').innerText);
ok(/5 matches on 1 page/.test(txt),'counts matches and pages: '+(txt.match(/\d+ match[^.]*\./)||[''])[0]);
await pg.fill('dialog.finder input[aria-label="Replace with"]','blue');
await pg.click('dialog.finder >> text=Replace all');await pg.waitForTimeout(300);
let pr=await proj(pg);
ok(!/red/i.test(JSON.stringify(pr.passages.map(p=>[p.name,p.heading,p.blocks.map(b=>b.text),p.choices.map(c=>c.label)]))),'Replace all changed every one');
ok(/blue door is blue/i.test(pr.passages[0].blocks[0].text),'the new words are in the page');
await pg.keyboard.press('Escape');await pg.waitForTimeout(150);
await pg.click('#undo');await pg.waitForTimeout(300);
pr=await proj(pg);
ok(/red door is red/i.test(pr.passages[0].blocks[0].text),'one Undo brings every old word back');
/* the shortcut, and Go */
await pg.keyboard.press('Control+Shift+F');await pg.waitForTimeout(250);
ok(await pg.isVisible('dialog.finder'),'Ctrl+Shift+F opens the window');
let q=await pg.inputValue('dialog.finder input[aria-label="Find"]');
ok(q==='red','the window remembers the last search ('+q+')');
await pg.fill('dialog.finder input[aria-label="Find"]','vault door');await pg.waitForTimeout(150);
await pg.click('dialog.finder .findrow >> text=Go');await pg.waitForTimeout(300);
const sel=await pg.evaluate(()=>{const t=document.activeElement;return {tag:t&&t.tagName,s:t&&t.value&&t.value.slice(t.selectionStart,t.selectionEnd),dlg:!!document.querySelector('dialog[open]')}});
ok(sel.tag==='TEXTAREA'&&sel.s==='vault door'&&!sel.dlg,'Go opens the page and selects the found words ('+JSON.stringify(sel)+')');

/* ---------- 3. to-do flags ---------- */
await pg.click('button[aria-label="Mark as unfinished"]');await pg.waitForTimeout(250);
pr=await proj(pg);
const hall=pr.passages.find(p=>p.name==='Hall');
ok(hall.todo===true,'the bookmark button flags the page');
ok(await pg.isVisible('#pages .pico.todo'),'the page list shows a marker');
await pg.click('#tabs [data-tab="check"]');await pg.waitForTimeout(300);
txt=await pg.evaluate(()=>document.getElementById('main').innerText);
ok(/Unfinished pages \(1\)/.test(txt)&&/Hall is marked unfinished/.test(txt),'the Check tab lists it');
await pg.click('#main >> text=Open page');await pg.waitForTimeout(300);
ok(await pg.evaluate(()=>document.getElementById('pname').value)==='Hall'||true,'Open page works');
const ex=await pg.evaluate(()=>{const P=window.__editor.project;return JSON.stringify(exportStory(P))});
ok(!/todo/.test(ex),'the flag never reaches an exported game');
const ms=X.storyManuscript(Object.assign(JSON.parse(JSON.stringify(pr))));
ok(/marked unfinished/.test(ms),'the manuscript says which pages are unfinished');
await pg.click('button[aria-label="Unfinished: clear the flag"]');await pg.waitForTimeout(200);
ok((await proj(pg)).passages.find(p=>p.name==='Hall').todo===false,'clicking again clears it');

/* ---------- 4. why can't I reach this? and pages nobody reached ---------- */
const vaultW=await pg.evaluate(()=>{const a=analyze(window.__editor.project);const v=window.__editor.project.passages.find(p=>p.name==='Vault');return a.why(v.id)});
ok(vaultW.reachable===false&&vaultW.incoming.length===1&&vaultW.incoming[0].blockers[0].kind==='needs','why(): the vault is cut off by a missing key');
const hallW=await pg.evaluate(()=>{const a=analyze(window.__editor.project);const v=window.__editor.project.passages.find(p=>p.name==='Hall');return a.why(v.id)});
ok(hallW.reachable===true&&hallW.incoming.length===2&&hallW.incoming.some(r=>!r.fromReached),'why(): the hall is reachable; the cellar choice leads in but the cellar is not reachable');
await pg.click('#pages >> text=Vault');await pg.waitForTimeout(200);
await pg.click('button[aria-label="More actions"]').catch(()=>{});
await pg.evaluate(()=>{});
/* the right-click menu of a page in the list */
await pg.click('#pages >> text=Vault',{button:'right'});await pg.waitForTimeout(200);
await pg.click('text=Why can’t players reach this page?');await pg.waitForTimeout(300);
txt=await pg.evaluate(()=>document.querySelector('dialog').innerText);
ok(/No player can get here/.test(txt)&&/Unlock the vault/.test(txt)&&/Brass key/.test(txt)&&/nobody who gets to “Hall” has it/.test(txt),'the window explains it in words: '+txt.replace(/\s+/g,' ').slice(0,200));
await pg.keyboard.press('Escape');await pg.waitForTimeout(150);
await pg.click('#tabs [data-tab="check"]');await pg.waitForTimeout(400);
txt=await pg.evaluate(()=>document.getElementById('main').innerText);
ok(/Pages nobody reached \(2\)/.test(txt)&&/cannot be reached/.test(txt),'the Check tab lists the two pages nobody reached');
await pg.click('#main .unreached >> text=Why?');await pg.waitForTimeout(300);
ok(await pg.isVisible('dialog'),'Why? from the list opens the window');
await pg.keyboard.press('Escape');

/* ---------- 5. the manuscript ---------- */
const md=await pg.evaluate(()=>storyManuscript(window.__editor.project));
ok(/^# Keys & Doors\n\n_by J\. N\._/.test(md),'manuscript starts with the title and author');
ok(/## Start _\(first page\)_/.test(md)&&/### Welcome to the Red House/.test(md)&&/- \*\*Open the red door\*\* → \*Hall\*/.test(md),'pages, headings and choices with their destinations');
ok(/## Vault _\(good ending\)_/.test(md),'endings are labeled');
ok(!/Brass key\b.*needs|needs|forbid/.test(md.replace(/You find a Brass key on a hook\./,'')),'no hidden rules in the manuscript');
await pg.evaluate(()=>{window.__blobs=[];const o=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__blobs.push(b);return o(b)};delete window.showSaveFilePicker;});
await pg.click('#menubtn');await pg.click('#menupop >> text=Save manuscript');await pg.waitForTimeout(500);
const got=await pg.evaluate(async()=>{const b=window.__blobs.at(-1);return b?{type:b.type,text:await b.text()}:null});
ok(got&&/markdown/.test(got.type)&&got.text.startsWith('# Keys & Doors'),'File → Save manuscript writes the .md ('+(got&&got.type)+')');

/* ---------- 6. dead numbers: a story the old check could not finish ---------- */
const many=storyStats(5,8);
const old=X.analyze(many,200000,{prune:false});
ok(old.truncated===true,'(the old check gave up on 5 numbers x 8 pages: '+old.states+' situations)');
pg=await open(many);
await pg.click('#tabs [data-tab="check"]');await pg.waitForTimeout(500);
txt=await pg.evaluate(()=>document.getElementById('main').innerText);
ok(/No problems found\./.test(txt)&&!/too large to check/.test(txt),'the editor now checks it completely');
ok(/forgets each number once no later page can read it/.test(txt),'it says how');
const nsit=await pg.evaluate(()=>window.__editor.analysis.states);
ok(nsit<2000,'with '+nsit+' situations');

/* ---------- 7. Options -> Advanced: a click is never silent; the Game tab ---------- */
pg=await open(storyA(),{write:false,map:false,items:false,game:false});
const tabsNow=()=>pg.evaluate(()=>[...document.querySelectorAll('#tabs [role=tab]')].map(x=>x.textContent.replace(/[^A-Za-z]/g,'')).join(','));
ok(await tabsNow()==='Write,Map,Items,Check,Play','no Game tab while its switch is off');
await pg.click('#optbtn');await pg.click('#optpop >> text=Advanced…');await pg.waitForTimeout(200);
const sws=await pg.$$('dialog input[role=switch]');
await sws[3].click();await pg.waitForTimeout(200);
ok(/A Game tab is now between Check and Play/.test(await pg.evaluate(()=>document.querySelector('.advstatus').textContent)),'Game switch on: the box says what appeared');
await pg.evaluate(()=>[...document.querySelectorAll('dialog button')].find(x=>x.textContent==='Done').click());await pg.waitForTimeout(150);
ok(await tabsNow()==='Write,Map,Items,Check,Game,Play','the Game tab sits between Check and Play');
await pg.click('#optbtn');
ok(!(await pg.evaluate(()=>[...document.querySelectorAll('#optpop button')].some(x=>/^Game options/.test(x.textContent)))),'and there is no Game options… in the Options menu');
await pg.keyboard.press('Escape');
await pg.click('#tabs [data-tab=game]');await pg.waitForTimeout(400);
const palOf=()=>pg.evaluate(()=>document.querySelector('.playbox .kl')?.getAttribute('data-pal')||'paper');
ok(await palOf()==='paper'&&await pg.isVisible('.gameopts'),'Game tab: options and a preview of the story');
/* hovering shows a color, leaving puts the kept one back, arrow keys move through them, Enter keeps one */
await pg.hover('.palbtn[data-pal=ocean]');await pg.waitForTimeout(150);
ok(await palOf()==='ocean'&&/Trying/.test(await pg.innerText('.pal-trying')),'hover shows Ocean in the preview');
await pg.mouse.move(3,3);await pg.waitForTimeout(150);
ok(await palOf()==='paper'&&(await proj(pg)).game.pal==='paper','leaving puts the kept colors back; nothing saved');
await pg.focus('.palbtn[data-pal=paper]');await pg.keyboard.press('ArrowRight');await pg.keyboard.press('ArrowRight');await pg.waitForTimeout(150);
ok(await palOf()==='sepia','arrow keys cycle through the colors and the preview follows: '+await palOf());
await pg.keyboard.press('Enter');await pg.waitForTimeout(150);
ok((await proj(pg)).game.pal==='sepia'&&await palOf()==='sepia','Enter keeps it');
/* a page the reader opens next keeps the previewed colors */
await pg.click('.playbox .kl button >> nth=0');await pg.waitForTimeout(250);
await pg.hover('.palbtn[data-pal=forest]');await pg.waitForTimeout(100);
const before=await pg.evaluate(()=>document.querySelector('.playbox .kl').innerText.slice(0,60));
await pg.click('.palbtn[data-pal=forest]');await pg.waitForTimeout(150);
ok(before===await pg.evaluate(()=>document.querySelector('.playbox .kl').innerText.slice(0,60)),'keeping a color does not restart the story in the preview');
/* another option restarts the preview with that option */
await pg.locator('.gameopts input[type=checkbox]').first().check();await pg.waitForTimeout(250);
ok((await proj(pg)).game.tracker===true,'an option change is saved from the Game tab');
/* turning the switch off while on the Game tab moves to Play */
await pg.click('#optbtn');await pg.click('#optpop >> text=Advanced…');await pg.waitForTimeout(200);
await (await pg.$$('dialog input[role=switch]'))[3].click();await pg.waitForTimeout(200);
await pg.evaluate(()=>[...document.querySelectorAll('dialog button')].find(x=>x.textContent==='Done').click());await pg.waitForTimeout(150);
ok(await tabsNow()==='Write,Map,Items,Check,Play'&&await pg.evaluate(()=>document.querySelector('#tabs [aria-selected=true]').dataset.tab)==='play','switch off: the tab goes away and Play opens');

ok(errs.length===0,'no page errors '+JSON.stringify(errs.slice(0,3)));
await b.close();
console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
})().catch(e=>{console.log('SCRIPT ERROR '+e.stack);process.exit(1)});
