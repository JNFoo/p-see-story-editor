const which=process.argv[2]||'firefox';const chromium=require('./engine').pick(which);const {devices}=require('./engine');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({viewport:{width:1500,height:950}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
  const txt=fs.readFileSync(__dirname+'/fixtures/sample-rich.story.json','utf8');
  await pg.addInitScript(t=>{ if(!sessionStorage.getItem('x')){ localStorage.clear(); localStorage.setItem('story-editor-v1', t); localStorage.setItem('story-editor-v1-settings', JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true}})); sessionStorage.setItem('x','1'); } }, txt);
  await pg.goto(require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href); await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
  await pg.locator('#tabs button:has-text("Map")').click(); await pg.waitForTimeout(300);
  // hover highlight
  const hog = pg.locator('g.node[data-id="p_hall"]');
  ok(await pg.locator('g.node.run').count()>=1, 'runs fold by default');
  ok((await pg.locator('button[aria-label="Merge"]').getAttribute('aria-pressed'))==='true', 'Merge on by default');
  await hog.hover(); await pg.waitForTimeout(150);
  ok(await pg.locator('.mapbox.nh').count()===1, 'hover lights neighbours');
  const lit = await pg.locator('g.node.nh-on').count(); ok(lit>=5, `lit pages ${lit}`);
  console.log('   count:', await pg.locator('.mapcount').innerText());
  await pg.mouse.move(5,900); await pg.waitForTimeout(150);
  ok(await pg.locator('.mapbox.nh').count()===0, 'leave clears');
  // search
  await pg.fill('.mapsearch','cellar'); await pg.waitForTimeout(150);
  const hits = await pg.locator('g.node.hit').count(), dims = await pg.locator('g.node.dim').count();
  ok(hits>0 && dims>10, `search hits ${hits} dims ${dims}`);
  console.log('   ', await pg.locator('.mapcount').innerText());
  const op = await pg.locator('g.node.dim').first().evaluate(e=>getComputedStyle(e).opacity); ok(+op<0.3, 'dimmed opacity '+op);
  await pg.press('.mapsearch','Escape'); await pg.waitForTimeout(100);
  ok(await pg.locator('g.node.dim').count()===0, 'Esc clears search');
  // bad path
  await pg.locator('.critpills .pb').click(); await pg.waitForTimeout(100);
  ok(await pg.locator('path.edge.pb').count()>0, 'bad path drawn');
  await pg.locator('.critpills .pb').click();
  // fold, open, refold
  const runs = await pg.locator('g.node.run').count(); ok(runs>=1, 'runs folded '+runs);
  await pg.locator('g.node.run').first().click(); await pg.waitForTimeout(250);
  ok(await pg.locator('g.foldbtn').count()===1, 'opened run shows Fold button');
  await pg.locator('g.foldbtn').click(); await pg.waitForTimeout(250);
  ok(await pg.locator('g.node.run').count()===runs, 'refolded');
  // colours
  for (const c of ['odds','heat']) { await pg.click(`button[aria-label="Color by ${c==='odds'?'ending odds':'playtest heat'}"]`); await pg.waitForTimeout(300); await pg.screenshot({path:`work/shots/col-${c}.png`}); }
  const opts = await pg.locator('[aria-label="Color the pages by"] button').evaluateAll(b=>b.map(x=>x.getAttribute('aria-label'))); console.log('   colour options', opts.join(' | '));
  await pg.click('button[aria-label="Follow an object, state or number"]'); await pg.waitForTimeout(150); await pg.locator('.ctxmenu button, .ctx button, [role=menu] [role=menuitem], [role=menu] button').nth(2).click(); await pg.waitForTimeout(300); await pg.screenshot({path:'work/shots/col-track.png'});
  ok(await pg.locator('g.node.tk').count()>0, 'track marks pages');
  await pg.click('button[aria-label="Color by page type"]');
  ok(await pg.locator('button[aria-label^="Fisheye"], button[aria-label^="Fold"]').count()===0, 'Fold and Fisheye switches gone');
  // compare
  await pg.locator('.scorechip:not(.playpill)').click(); await pg.waitForTimeout(400);
  ok(await pg.locator('dialog[open] table.scores tr').count()>=6, 'compare table'); await pg.screenshot({path:'work/shots/compare.png'});
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  ok(await pg.locator('dialog[open]').count()===0, 'Esc closes dialog');
  // click opens page
  await pg.locator('g.node[data-id="p_hall"]').click(); await pg.waitForTimeout(300);
  ok(await pg.locator('#pname').inputValue()==='Hall', 'click opens page in Write');
  // show on map from page list
  await pg.locator('#pages button:has-text("Logbook")').click({button:'right'}); await pg.waitForTimeout(150);
  await pg.locator('button:has-text("Show on the map")').click(); await pg.waitForTimeout(400);
  ok(await pg.locator('g.node.nh-me').count()===1, 'Show on the map pins page');
  // shape stretch click
  await pg.click('[aria-label="Map view"] button[aria-label="Story shape"]'); await pg.waitForTimeout(300);
  await pg.locator('g.stretch').first().click(); await pg.waitForTimeout(400);
  ok((await pg.locator('[aria-label="Map view"] button.on').getAttribute('aria-label'))==='Flow' && await pg.locator('g.node.hit').count()>5, 'stretch lights its pages in Flow');
  console.log('errors', errs);
  // phone (touch: Chromium's phone emulation only; Firefox has none)
  if (which==='chromium') {
  const ctx = await b.newContext({...devices['Pixel 7']}); const ph = await ctx.newPage();
  ph.on('pageerror',e=>errs.push('phone '+e.message));
  await ph.addInitScript(t=>{ localStorage.setItem('story-editor-v1', t); localStorage.setItem('story-editor-v1-settings', JSON.stringify({chosen:true,remember:true,advanced:{write:true,map:true,items:true}})); }, txt);
  await ph.goto(require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href); await ph.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
  await ph.locator('#tabs button:has-text("Map")').click(); await ph.waitForTimeout(400);
  ok(await ph.evaluate(()=>document.documentElement.scrollWidth - innerWidth)===0, 'phone: no sideways scroll');
  await ph.screenshot({path:'work/shots/phone-map.png'});
  const n1 = ph.locator('g.node[data-id="p_hall"]'); await n1.tap(); await ph.waitForTimeout(250);
  ok(await ph.locator('.mapbox.nh').count()===1 && await ph.locator('#pname').count()===0, 'phone: first tap lights');
  await n1.tap(); await ph.waitForTimeout(300);
  ok(await ph.locator('#pname').count()===1, 'phone: second tap opens');
  }
  console.log('errors', errs);
  process.exit(0);
})();
