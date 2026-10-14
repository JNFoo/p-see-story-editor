// Firefox smoke test: the editor and an exported game must load without errors in real Gecko.
const { firefox } = require('../../packages/qa-kit/src/bidi.js');
(async()=>{
  const b = await firefox.launch(); const pg = await b.newPage({viewport:{width:1300,height:850}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await pg.goto(require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href); await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:20000});
  console.log('ua', await pg.evaluate(()=>navigator.userAgent));
  for (const t of ['map','items','check','play','write']) { await pg.locator(`#tabs [data-tab=${t}]`).click(); await pg.waitForTimeout(500); }
  await pg.locator('#optbtn').click(); await pg.waitForTimeout(200);
  console.log('options', (await pg.locator('#optpop button').allInnerTexts()).length);
  await pg.screenshot({path:'work/shots/ff-write.png'});
  console.log('errors', errs); await b.close();
})();
