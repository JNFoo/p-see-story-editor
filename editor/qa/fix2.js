const which=process.argv[2]||'firefox';const chromium=require('./engine').pick(which);const {devices}=require('./engine');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const up=__dirname+'/fixtures/';
const current=fs.readFileSync(up+'sample.story.json','utf8'), older=fs.readFileSync(up+'sample-older.story.json','utf8');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({viewport:{width:1440,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.addInitScript(([a,c])=>{ if(!sessionStorage.x){ localStorage.clear(); localStorage.setItem('story-editor-v1', a); localStorage.setItem('story-editor-v1-settings', JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true}})); sessionStorage.x=1; } window.__open=c; window.__saves=[];
    window.showSaveFilePicker = async o => ({ name:o.suggestedName, createWritable: async()=>({ write: async blob=>{ window.__saves.push([o.suggestedName, await blob.text()]); }, close: async()=>{} }), queryPermission: async()=>'granted' });
    window.showOpenFilePicker = async () => [{ name:'older.story.json', getFile: async()=>({ size: window.__open.length, text: async()=>window.__open }), createWritable: async()=>({ write: async blob=>{ window.__saves.push(['older.story.json', await blob.text()]); }, close: async()=>{} }), queryPermission: async()=>'granted' }]; }, [current, older]);
  await pg.goto(require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href); await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
  const pos = async () => pg.evaluate(()=>[...document.querySelectorAll('.mapbox g.node[data-id]')].map(g=>g.dataset.id+':'+g.getAttribute('transform')).join('|'));
  await pg.locator('#tabs [data-tab=map]').click(); await pg.waitForTimeout(300);
  const p1 = await pos();
  await pg.locator('#tabs [data-tab=write]').click(); await pg.waitForTimeout(200);
  await pg.locator('#tabs [data-tab=map]').click(); await pg.waitForTimeout(300);
  ok(p1 === await pos(), 'Map → Write → Map: no page moves');
  // edit then undo restores positions
  await pg.locator('#tabs [data-tab=write]').click(); await pg.waitForTimeout(200);
  await pg.locator('#pages button').nth(1).click(); await pg.waitForTimeout(200);
  await pg.locator('button:has-text("+ Choice")').first().click(); await pg.waitForTimeout(200);
  await pg.keyboard.type('Peek outside'); await pg.waitForTimeout(1500);
  await pg.locator('#tabs [data-tab=map]').click(); await pg.waitForTimeout(300);
  const p2 = await pos();
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(300); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
  ok(p1 === await pos(), 'edit then Undo: pages back exactly (changed in between: '+(p1!==p2)+')');
  // open other version (same story id), undo, save -> must not write current story into older file
  await pg.locator('#menubtn').click(); await pg.locator('#menupop button:has-text("Open…")').click(); await pg.waitForTimeout(200);
  await pg.locator('dialog button:has-text("Open it")').click(); await pg.waitForTimeout(400);
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
  await pg.keyboard.press('Control+s'); await pg.waitForTimeout(400);
  const saves = await pg.evaluate(()=>window.__saves.map(s=>[s[0], JSON.parse(s[1]).passages.length]));
  ok(!saves.some(s=>s[0]==='older.story.json'), 'same-id undo: Save asked for a new file: '+JSON.stringify(saves));
  // keyboard File menu
  await pg.locator('#menubtn').focus(); await pg.keyboard.press('ArrowDown'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(()=>!!document.activeElement.closest('#menupop')), 'ArrowDown enters File menu');
  ok((await pg.locator('#menubtn').getAttribute('aria-expanded'))==='true', 'aria-expanded true');
  await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(()=>document.activeElement.id==='menubtn') && await pg.locator('#menupop').isHidden(), 'Esc closes menu, focus back on File');
  // dialog from menu returns focus to File
  await pg.locator('#optbtn').focus(); await pg.keyboard.press('ArrowDown');
  await pg.locator('#optpop button:has-text("Keyboard shortcuts")').focus(); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  ok(await pg.evaluate(()=>document.activeElement.id==='optbtn'), 'dialog from Options gives focus back to Options');
  // dark heat
  await pg.evaluate(()=>document.documentElement.setAttribute('data-theme','dark')); await pg.locator('#tabs [data-tab=map]').click(); await pg.waitForTimeout(300);
  await pg.click('button[aria-label="Color by playtest heat"]'); await pg.waitForTimeout(300);
  await pg.screenshot({path:'work/shots/dark-heat.png'});
  await pg.click('[aria-label="Map view"] button[aria-label="Given lanes"]').catch(()=>{}); 
  await pg.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
  console.log('errors', errs);
  // phone
  const ctx = await b.newContext({...devices['iPhone 13']}); const ph = await ctx.newPage();
  await ph.addInitScript(t=>{ localStorage.setItem('story-editor-v1', t); localStorage.setItem('story-editor-v1-settings', JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true}})); }, fs.readFileSync(up+'sample.story.json','utf8'));
  await ph.goto(require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href); await ph.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
  await ph.locator('#tabs [data-tab=map]').click(); await ph.waitForTimeout(400);
  const hb = await ph.evaluate(()=>{ const r=document.querySelector('.mapbox').getBoundingClientRect(); return [Math.round(r.height), innerHeight]; });
  ok(hb[0] > hb[1]*0.55, 'phone map height '+hb);
  await ph.screenshot({path:'work/shots/phone2.png'});
  process.exit(0);
})();
