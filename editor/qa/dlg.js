const which=process.argv[2]||'firefox';const chromium=require('./engine').pick(which);const {devices}=require('./engine');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({viewport:{width:1300,height:850}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  const bol=fs.readFileSync(__dirname+'/fixtures/sample.story.json','utf8');
  await pg.addInitScript(()=>{ window.__saves=[]; window.showSaveFilePicker = async o => { const h={ name:o.suggestedName, createWritable: async()=>({ write: async blob=>{ window.__saves.push([o.suggestedName, await blob.text()]); }, close: async()=>{} }), queryPermission: async()=>'granted' }; return h; };
    window.showOpenFilePicker = async () => [{ name:'sample.story.json', getFile: async()=>({ size: window.__bol.length, text: async()=>window.__bol }), createWritable: async()=>({ write: async blob=>{ window.__saves.push(['sample.story.json', await blob.text()]); }, close: async()=>{} }), queryPermission: async()=>'granted' }]; });
  await pg.addInitScript(t=>{ window.__bol=t; try{ localStorage.setItem('story-editor-v1-toured','1'); }catch(e){} }, bol); /* no first-time tour popping up 4.6 s in (it used to be hidden by the wait for the opening) */
  await pg.goto(require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href); await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
  // Esc on a prompt resolves; focus returns
  await pg.locator('#menubtn').click(); await pg.locator('button:has-text("New story")').click(); await pg.waitForTimeout(200);
  ok(await pg.locator('dialog[open]').count()===1, 'ask dialog open');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  ok(await pg.locator('dialog').count()===0, 'Esc closes and removes dialog');
  // Shift+Tab stays inside dialog
  await pg.locator('#help').click(); await pg.waitForTimeout(200);
  for (let i=0;i<4;i++) await pg.keyboard.press('Shift+Tab');
  ok(await pg.evaluate(()=>!!document.activeElement.closest('dialog')), 'focus trapped in dialog');
  await pg.keyboard.press('Escape');
  // Open sample from file, undo, save must not write to sample file
  const title0 = await pg.locator('#title').inputValue();
  await pg.locator('#menubtn').click(); await pg.locator('button:has-text("Open…")').click(); await pg.waitForTimeout(200);
  await pg.locator('dialog button:has-text("Open it")').click(); await pg.waitForTimeout(400);
  ok((await pg.locator('#title').inputValue())==="The Keeper’s Light", 'opened Sample');
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(300);
  ok((await pg.locator('#title').inputValue())===title0, 'undo brings back previous story');
  await pg.keyboard.press('Control+s'); await pg.waitForTimeout(400);
  const saves = await pg.evaluate(()=>window.__saves.map(s=>[s[0], JSON.parse(s[1]).title]));
  ok(!saves.some(s=>s[0]==='sample.story.json' && s[1]!=="The Keeper’s Light"), 'Save after undo did not overwrite sample file: '+JSON.stringify(saves));
  // export failure is reported and export works again
  await pg.evaluate(()=>{ window.__realPicker = window.showSaveFilePicker; window.showSaveFilePicker = async o => ({ name:o.suggestedName, createWritable: async()=>{ throw new Error('Disk full'); } }); });
  await pg.locator('#export').click(); await pg.waitForTimeout(400);
  ok(await pg.locator('dialog[open]:has-text("could not be saved")').count()===1, 'failed export is reported');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(1700);
  await pg.evaluate(()=>{ window.showSaveFilePicker = window.__realPicker; });
  await pg.locator('#export').click(); await pg.waitForTimeout(500);
  ok((await pg.evaluate(()=>window.__saves.length))>=2, 'export works after a failure');
  console.log('errors', errs);
  process.exit(0);
})();
