/* New-feature test: starters, Game options, export, and playing the exported game. Usage: node t21.js [chromium|firefox] */
const which=process.argv[2]||'firefox';
const B=require('./engine').pick(which);
const fs=require('fs');
const FILE=require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
(async()=>{
const b=await B.launch();
const ctx=await b.newContext({viewport:{width:1280,height:850}});
await ctx.addInitScript(()=>{localStorage.setItem('story-editor-v1-settings',JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true,game:true}}));});
const pg=await ctx.newPage();const logs=[];
pg.on('console',m=>{if(['error'].includes(m.type()))logs.push(m.text())});pg.on('pageerror',e=>logs.push('PAGEERR '+e.message));
await pg.goto(FILE);await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
const P=()=>pg.evaluate(()=>JSON.parse(JSON.stringify(window.__editor.project)));
/* --- starters --- */
await pg.click('#menubtn');await pg.click('#menupop >> text=New story');
ok((await pg.$$('dialog .startrow')).length===7,'New story offers blank + 6 starting points');
await pg.click('dialog .startrow:has-text("Quest with dice")');await pg.waitForTimeout(300);
let pr=await P();
ok(pr.title==='A quest with dice'&&pr.items.some(i=>i.kind==='stat'),'Quest starter loads with a number');
ok(pr.passages.some(p=>p.choices.some(c=>c.check)),'Quest starter has a dice check');
ok(pr.passages.some(p=>p.choices.some(c=>c.lock)),'Quest starter has a locked choice');
/* --- Items: add a number --- */
await pg.click('[role=tab]:has-text("Items"), #tabs button:has-text("Items")');await pg.waitForTimeout(200);
await pg.click('text=+ New number');await pg.waitForTimeout(200);
await pg.fill('dialog input','Luck');await pg.keyboard.press('Enter');await pg.waitForTimeout(300);
pr=await P();ok(pr.items.filter(i=>i.kind==='stat').length===2&&pr.items.some(i=>i.name==='Luck'&&i.kind==='stat'),'+ New number asks for a name and adds it');
const nm=pg.locator('input[aria-label="Number name"]').nth(1);await nm.fill('Fortune');await pg.waitForTimeout(100);
pr=await P();ok(pr.items.some(i=>i.name==='Fortune'&&i.kind==='stat'),'number can be renamed');
// number range boxes
const from=pg.locator('.numf input').nth(3);
/* --- Check tab cards --- */
await pg.click('#tabs button:has-text("Check"), [role=tab]:has-text("Check")');await pg.waitForTimeout(500);
const txt=await pg.innerText('#main');
ok(/Story shape/.test(txt),'Check tab: Story shape card');ok(/Pacing and reading time/.test(txt),'Check tab: pacing card');ok(/Dice checks/.test(txt),'Check tab: dice checks list');
await pg.click('summary:has-text("Dice checks")');await pg.waitForTimeout(100);
ok(/%/.test(await pg.innerText('#main')),'dice checks list shows odds');
/* --- Test from here --- */
await pg.click('#tabs button:has-text("Write"), [role=tab]:has-text("Write")');await pg.click('#pages button:has-text("The cave mouth")');
await pg.click('#tabs button:has-text("Play"), [role=tab]:has-text("Play")');await pg.waitForTimeout(400);
const tfo=await pg.$$eval('select option',o=>o.map(x=>x.textContent).filter(t=>/Test from|Quickest|Choose what/.test(t)));
ok(tfo.length>=2,'Play tab has Test from… ('+tfo.join(' | ')+')');
await pg.selectOption('select[aria-label^="Test from"]','0');await pg.waitForTimeout(300);
const tft=await pg.innerText('.kl');ok(/Courage/.test(tft),'Test from here starts on that page with its numbers: '+tft.replace(/\s+/g,' ').slice(0,90));
/* The Game tab (Game switch on) sits between Check and Play and holds the options */
const tabNames=await pg.$$eval('#tabs [role=tab]',e=>e.map(x=>x.textContent.replace(/[^A-Za-z]/g,'')));
ok(tabNames.join(',')==='Write,Map,Items,Check,Game,Play','Game tab between Check and Play: '+tabNames.join(','));
await pg.click('#tabs [data-tab=game]');await pg.waitForTimeout(400);
ok(await pg.isVisible('.gameopts')&&await pg.isVisible('.playbox .kl'),'Game tab shows the options and a live preview');
await pg.selectOption('.gameopts select','remember');await pg.waitForTimeout(300);
await pg.click('.gameopts input[type=checkbox] >> nth=0');await pg.waitForTimeout(300); // tracker on
await pg.click('.palbtn:has-text("Night")');await pg.waitForTimeout(400);
ok(await pg.getAttribute('.playbox .kl','data-pal')==='night','preview shows Night after choosing it');
await pg.hover('.palbtn:has-text("Forest")');await pg.waitForTimeout(150);
ok(await pg.getAttribute('.playbox .kl','data-pal')==='forest','hovering Forest previews it');
await pg.mouse.move(5,5);await pg.waitForTimeout(150);
ok(await pg.getAttribute('.playbox .kl','data-pal')==='night','moving away returns to the kept colors');
await pg.click('#menubtn');await pg.click('#menupop >> text=Copy game code…');await pg.waitForTimeout(300);
pr=await P();ok(pr.game.back==='remember'&&pr.game.tracker===true&&pr.game.pal==='night','Game options saved with the story');
const html=await pg.inputValue('dialog textarea');fs.writeFileSync(__dirname+'/work/quest-'+which+'.html',html);
ok(html.length>20000&&/data-pal|night/.test(html),'exported game html produced ('+Math.round(html.length/1024)+' KB)');
await pg.keyboard.press('Escape');
/* --- Play the exported game --- */
const g=await ctx.newPage();const glogs=[];
g.on('console',m=>{if(m.type()==='error')glogs.push(m.text())});g.on('pageerror',e=>glogs.push('PAGEERR '+e.message));
await g.goto('file://'+__dirname+'/work/quest-'+which+'.html');await g.waitForTimeout(300);
ok(await g.getAttribute('.kl','data-pal')==='night','game uses the Night palette');
ok(await g.isVisible('.kl-stat'),'stat bar visible');
ok((await g.$$('.kl-choices [aria-disabled=true]')).length+(await g.$$('[aria-disabled=true]')).length>0,'locked choice shown greyed out');
ok(/Needs Courage 6/.test(await g.innerText('.kl')),'locked reason shown');
ok(await g.isVisible('.kl-aa, details.kl-aa'),'Aa reading button present');
ok(await g.isVisible('.kl-found'),'endings tracker present');
// no back at start, play
const choices=()=>g.$$eval('.kl-choices button, .kl-choices a, .kl-choice',e=>e.map(x=>x.textContent.trim()));
console.log('  start choices:',await choices());
await g.click('text=Train for a day');await g.waitForTimeout(150);
console.log('  after train:',(await g.innerText('.kl')).replace(/\s+/g,' ').slice(0,260));
ok(await g.isVisible('text=Back')||await g.isVisible('.kl-back'),'Back button available (mode remember)');
await g.screenshot({path:'work/shots/game-'+which+'.png'});
console.log('page errors:',logs,glogs);
ok(!logs.length&&!glogs.length,'no console errors');
console.log(fails?`${fails} FAILED`:'ALL PASSED');
await b.close();})();
