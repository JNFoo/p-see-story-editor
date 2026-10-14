const http=require('http'),fs=require('fs'),path=require('path');
const which=process.argv[2]||'firefox';const B=require('./engine').pick(which);
const ED=(process.env.QA_EDITOR||path.join(__dirname,'..','story-editor.html'));
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
(async()=>{
 const srv=http.createServer((q,r)=>{const bad=q.url.startsWith('/cut');let d=fs.readFileSync(ED);if(bad){d=Buffer.from(d);const i=d.indexOf('var s="')+5000;d[i]=d[i]===65?66:65}r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(d)}).listen(0,'127.0.0.1');
 await new Promise(r=>srv.on('listening',r));const port=srv.address().port;const b=await B.launch();
 for(const [name,url] of [['file',require('url').pathToFileURL(ED).href],['http utf-8 header','http://127.0.0.1:'+port+'/']]){
  const ctx=await b.newContext();const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  const t=Date.now();await pg.goto(url);await pg.waitForFunction(()=>window.__editor&&!document.getElementById('splash'),null,{timeout:30000});
  ok(errs.length===0,which+' '+name+': opens, ready in '+(Date.now()-t)+' ms, errors '+errs.length);
  const title=await pg.title();ok(title==='Story Editor','title '+title);await ctx.close();
 }
 const ctx=await b.newContext();const pg=await ctx.newPage();await pg.goto('http://127.0.0.1:'+port+'/cut');await pg.waitForTimeout(1500);
 const txt=await pg.evaluate(()=>document.body.innerText);ok(/was changed|cut short/.test(txt),'a changed payload shows the plain message: '+txt.slice(0,70));
 await b.close();srv.close();process.exit(0);
})();
