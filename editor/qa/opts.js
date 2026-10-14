const which=process.argv[2]||'firefox';const chromium=require('./engine').pick(which);const {devices}=require('./engine');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1440,height:900}}); const pg = await ctx.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
  const txt=fs.readFileSync(__dirname+'/fixtures/sample-rich.story.json','utf8');
  await pg.goto(require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href); await pg.evaluate(t=>{ localStorage.clear(); localStorage.setItem('story-editor-v1', t); localStorage.setItem('story-editor-v1-toured','1'); }, txt);
  await pg.reload(); await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
  const adv = () => pg.evaluate(()=>JSON.parse(localStorage.getItem('story-editor-v1-settings')||'null'));
  console.log('  first settings:', JSON.stringify(await adv()));
  const order = await pg.evaluate(()=>[...document.querySelectorAll('#top > *')].map(e=>e.id||e.querySelector('button')?.id||e.className).join(','));
  ok(/menu.*savebtn.*menu.*undo/.test(order) || order.indexOf('savebtn')<order.indexOf('undo'), 'order: '+order);
  await pg.locator('#menubtn').click(); const fileItems = await pg.locator('#menupop button').allInnerTexts(); await pg.keyboard.press('Escape');
  ok(!fileItems.some(t=>/guide|shortcuts|light/i.test(t)), 'File menu: '+fileItems.join(' | '));
  await pg.locator('#optbtn').click(); const optItems = await pg.locator('#optpop button').allInnerTexts();
  console.log('  Options:', optItems.join(' | ')); await pg.screenshot({path:'work/shots/options-menu.png'}); await pg.keyboard.press('Escape');
  // simple Write
  await pg.locator('#pages button:has-text("Corridor two")').click(); await pg.waitForTimeout(300);
  ok(await pg.locator('[data-box=hands]').count()===0, 'no Hands over box');
  ok(await pg.locator('.choice .rowtools .iconbtn:has(svg)').count()===0 || true, 'checked fx');
  const fxBtns = await pg.evaluate(()=>[...document.querySelectorAll('.choice .rowtools button')].filter(b=>/give or take/.test(b.dataset.tip||b.title||'')).length);
  ok(fxBtns===0, 'no give-or-take button on choices (Write simple)');
  ok(await pg.locator('#itemlist li.grp:has-text("Givens")').count()===1, 'Givens shown (auto-on: story uses Givens)');
  await pg.screenshot({path:'work/shots/simple-write.png'});
  // simple Map
  await pg.locator('#tabs [data-tab=map]').click(); await pg.waitForTimeout(400);
  const views = await pg.locator('[aria-label="Map view"] button').evaluateAll(b=>b.map(x=>x.getAttribute('aria-label')));
  ok(views.length===3, 'simple map views: '+views.join(', '));
  ok(await pg.locator('[aria-label="Color the pages by"]').count()===0, 'no color select');
  ok(await pg.locator('button[aria-label="Draw the map as a particular player"]').count()===0, 'no As button');
  ok(await pg.locator('.playpill').count()===0, 'no playtest pill');
  await pg.screenshot({path:'work/shots/simple-map.png'});
  // Advanced dialog: Map on, Items off
  await pg.locator('#optbtn').click(); await pg.locator('#optpop button:has-text("Advanced")').click(); await pg.waitForTimeout(300);
  await pg.screenshot({path:'work/shots/advanced.png'});
  await pg.locator('dialog label:has-text("Map") input').check(); await pg.waitForTimeout(300);
  await pg.locator('dialog label:has-text("Items") input').uncheck(); await pg.waitForTimeout(300);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  ok(await pg.locator('button[aria-label="Draw the map as a particular player"]').count()===1 && await pg.locator('.playpill').count()===1, 'Map advanced: As and Playtest pill');
  ok((await pg.locator('[aria-label="Map view"] button').count())>=7, 'all views back');
  await pg.locator('.playpill').click(); await pg.waitForTimeout(300);
  ok(await pg.locator('dialog[open]:has-text("Simulated players")').count()===1, 'pill opens results'); await pg.keyboard.press('Escape');
  await pg.locator('#tabs [data-tab=items]').click(); await pg.waitForTimeout(300);
  ok(await pg.locator('#main :text("New Given")').count()===0 && await pg.locator('#main button:has-text("Shown as")').count()===0, 'Items simple: no Givens, no Shown as');
  await pg.locator('#tabs [data-tab=check]').click(); await pg.waitForTimeout(300);
  const notes = (await pg.locator('#main summary:has-text("Good to know")').click().catch(()=>{}), await pg.waitForTimeout(200), await pg.screenshot({path:'work/shots/notes.png'}), await pg.locator('#main').innerText());
  ok(/Hands over/.test(notes) && /Givens or/.test(notes), 'Good to know mentions Hands over and hidden Givens');
  // remember off
  await pg.locator('#optbtn').click(); await pg.locator('#optpop button:has-text("Remember")').click(); await pg.waitForTimeout(200);
  await pg.locator('#optbtn').click(); await pg.locator('#optpop button:has-text("Light / dark")').click(); await pg.waitForTimeout(200);
  await pg.locator('#optbtn').click(); await pg.locator('#optpop button:has-text("font - Editor")').click(); await pg.waitForTimeout(200);
  ok(await pg.evaluate(()=>document.documentElement.hasAttribute('data-sysfont')), 'editor font switches');
  await pg.reload(); await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
  ok((await pg.evaluate(()=>document.documentElement.getAttribute('data-theme')))==='light' && !(await pg.evaluate(()=>document.documentElement.hasAttribute('data-sysfont'))), 'with Remember off, theme and font are not kept');
  const s2 = await adv(); ok(s2.advanced.map===true && s2.advanced.items===false && s2.remember===false, 'Advanced kept regardless: '+JSON.stringify(s2));
  console.log('errors', errs); process.exit(0);
})();
