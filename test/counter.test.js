const assert = require('node:assert/strict');
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path').join(__dirname,'..')+'/';
// --- fake supabase-js: tables as arrays of rows, chainable query builder ---
const T={stewards:[{email:'hello@lundbech.me',name:'Tyson',role:'admin'}],items:[],sales:[],movements:[],
  // as migrate-notion.sql would leave them
  customers:[
    {id:'c1',name:'Kim & Daryl Example',email:'kim@example.com',phone:'0400 000 001',note:null,from_notion:true,shop_known:false,since:'2025-11-05'},
    {id:'c2',name:'Lori',email:null,phone:'0400 000 002',note:null,from_notion:true,shop_known:true,since:'2026-03-27'}],
  daily_history:[
    {day:'2026-10-15',studio:'mont-albert',total:80,day_type:'Steady',source:'notion-steward-logs'},
    {day:'2026-10-16',studio:'mont-albert',total:13,day_type:'Quiet',source:'notion-steward-logs'}]};
const listeners=[];
function from(table){
  const q={_f:[],_op:null,_payload:null,
    select(){q._op='select';return q;}, order(){return q;}, limit(){return q;},
    eq(c,v){q._f.push(r=>String(r[c])===String(v));return q;},
    insert(row){q._op='insert';q._payload=row;return q;},
    update(patch){q._op='update';q._payload=patch;return q;},
    maybeSingle(){return q._run().then(res=>({data:(res.data||[])[0]||null,error:res.error}));},
    _run(){
      const match=()=>T[table].filter(r=>q._f.every(f=>f(r)));
      if(q._op==='insert'){
        const rows=Array.isArray(q._payload)?q._payload:[q._payload];
        for(const r of rows){
          const pk = table==='daily_history' ? 'day' : 'id';
          if(T[table].some(x=>x[pk]===r[pk])) return Promise.resolve({data:null,error:{message:'duplicate key value violates unique constraint'}});
          if(table==='customers'&&T[table].some(x=>(x.name||'').toLowerCase()===(r.name||'').toLowerCase())) return Promise.resolve({data:null,error:{message:'duplicate key value violates unique constraint "customers_name_key"'}});
          if(table==='items'&&r.sku&&T[table].some(x=>x.sku===r.sku)) return Promise.resolve({data:null,error:{message:'duplicate key value violates unique constraint "items_sku_key"'}});
          T[table].push(JSON.parse(JSON.stringify(r)));
        }
        listeners.forEach(l=>l(table));
        return Promise.resolve({data:rows,error:null});
      }
      if(q._op==='update'){
        const rows=match();
        if(!q._f.length) return Promise.resolve({data:null,error:{message:'unfiltered update refused by test harness'}});
        rows.forEach(r=>Object.assign(r,JSON.parse(JSON.stringify(q._payload))));
        listeners.forEach(l=>l(table));
        return Promise.resolve({data:rows,error:null});
      }
      return Promise.resolve({data:match(),error:null});
    },
    then(res,rej){return q._run().then(res,rej);}
  };
  return q;
}
let authCb=null;
const sbClient={from,
  channel(){const ch={on(ev,cfg,fn){listeners.push(t=>{if(t===cfg.table)fn();});return ch;},subscribe(){return ch;}};return ch;},
  auth:{getSession:async()=>({data:{session:{user:{id:'u-1',email:'hello@lundbech.me'}}}}),
        onAuthStateChange:cb=>{authCb=cb;}, signInWithOtp:async()=>({error:null}), signOut:async()=>({error:null})}};

const html=fs.readFileSync(path+'index.html','utf8')
  .replace(/<script src="https:\/\/cdn[^"]*"><\/script>/,'')
  .replace('<script src="config.js"></script>','')
  .replace('<script src="backend.js"></script>','<script>'+fs.readFileSync(path+'backend.js','utf8')+'</script>');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://counter.gardenerandson.com/',beforeParse(w){
  w.GS_CONFIG={SUPABASE_URL:'x',SUPABASE_ANON_KEY:'y',REQUIRE_SIGN_IN:false,STUDIOS:[{id:'mont-albert',name:'Mont Albert',addr:'2 Churchill Street'},{id:'hawthorn',name:'Hawthorn',addr:'140 Auburn Road'}]};
  w.supabase={createClient:()=>sbClient};
  w.crypto={randomUUID:()=>'id-'+Math.random().toString(36).slice(2,10)};
  w.onerror=(m,s,l,c,e)=>{process.exitCode=1;console.error('ONERROR',m);};
  w.confirm=()=>true;
  w.prompt=()=>'5'; w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
}});
const d=dom.window.document,W=dom.window,wait=ms=>new Promise(r=>setTimeout(r,ms));
// catch the receipt instead of letting jsdom try to open Mail
d.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href^="mailto:"]');if(a){W.__mailto=a.getAttribute('href');e.preventDefault();}},true);
const q=s=>d.querySelector(s);
const S_email=doc=>{const i=doc.getElementById('email');return i?(i.value||'(blank)'):'(skipped the contact step)';};
(async()=>{ try{
  await wait(300);
  console.log('gate gone:', !d.getElementById('gsGate'));
  console.log('1', q('h1').textContent);
  d.querySelector('[data-studio="mont-albert"]').click(); await wait(80);
  console.log('2', q('h1').textContent, '| walk-in button gone:', !d.getElementById('walkin'), '| next disabled with no name:', d.getElementById('next').disabled);
  d.querySelector('[data-view="settings"]').click(); await wait(40);
  d.getElementById('nName').value='Wombat, small'; d.getElementById('nPrice').value='85';
  d.getElementById('nAdd').click(); await wait(120);
  console.log('3 item row:', JSON.stringify(T.items[0]));
  // sale by tag number
  d.querySelector('[data-view="sale"]').click(); await wait(40);
  const n=d.getElementById('name'); n.value='Kim'; n.dispatchEvent(new W.Event('input'));
  await wait(40);
  const sug=[...d.querySelectorAll('#suggest button')];
  assert.equal(sug.length,1); assert.match(sug[0].textContent,/on the list · has email/);
  console.log('2a Notion customer suggested:', sug.map(b=>b.textContent.trim()));
  sug[0].click(); await wait(60);
  assert.equal(d.getElementById('email'),null); assert.ok(d.getElementById('scan'));
  console.log('2b after tapping it:', q('h1').textContent, '| email prefilled:', S_email(d));
  // back out to the name step (items -> contact -> name) and start a clean sale
  d.getElementById('back').click(); await wait(40);
  d.getElementById('back').click(); await wait(40);
  const phoneName=d.getElementById('name'); phoneName.value='Lori'; phoneName.dispatchEvent(new W.Event('input'));
  d.querySelector('#suggest button').click(); await wait(40);
  assert.equal(d.getElementById('phone').value,'0400 000 002'); assert.equal(d.getElementById('email').value,'');
  d.getElementById('back').click(); await wait(40);
  const n1b=d.getElementById('name'); n1b.value='Kim'; n1b.dispatchEvent(new W.Event('input'));
  d.getElementById('next').click(); await wait(30);
  d.getElementById('email').value='kim@example.com'; d.getElementById('email').dispatchEvent(new W.Event('input'));
  d.getElementById('phone').value='0412 345 678'; d.getElementById('phone').dispatchEvent(new W.Event('input'));
  d.getElementById('next').click(); await wait(40);
  const sc=d.getElementById('scan'); sc.value='001'; sc.dispatchEvent(new W.KeyboardEvent('keydown',{key:'Enter'})); await wait(60);
  console.log('4 basket:', (q('.total')||{}).textContent);
  d.getElementById('next').click(); await wait(40);
  d.querySelector('[data-m="square"]').click(); await wait(30);
  d.getElementById('note').value='asked about a front garden'; d.getElementById('note').dispatchEvent(new W.Event('input'));
  d.getElementById('finish').click(); await wait(250);
  assert.ok(d.getElementById('receipt'));
  console.log('5 receipt button:', !!d.getElementById('receipt'));
  if(d.getElementById('receipt')){ d.getElementById('receipt').click(); await wait(30);
    const m=decodeURIComponent((W.__mailto||'').split('&body=')[1]||'');
    assert.match(W.__mailto,/^mailto:kim%40example.com\?/); assert.match(m,/TOTAL\s+\$85/);
    console.log('5a mailto to:', (W.__mailto||'').slice(0,40));
    console.log('5b receipt:\n'+m.split('\n').map(l=>'    '+l).join('\n')); }
  console.log('5c', q('h1').textContent, '| sale row:', JSON.stringify(T.sales[0]));
  // stock: stocktake then receive
  d.querySelector('[data-view="stock"]').click(); await wait(60);
  d.getElementById('startCount').click(); await wait(40);
  const c=d.querySelector('[data-count]'); c.value='12'; c.dispatchEvent(new W.Event('input'));
  d.getElementById('save').click(); await wait(250);
  console.log('6 stock:', JSON.stringify(T.items[0].stock), '| movement:', T.movements[0].type, T.movements[0].net_units);
  d.querySelector('[data-add]').click(); await wait(400);
  console.log('7 after receive 5:', JSON.stringify(T.items[0].stock), '| moves:', T.movements.length);
  // second studio must not clobber the first
  d.getElementById('changeStudio').click(); await wait(40);
  d.querySelector('[data-studio="hawthorn"]').click(); await wait(80);
  d.querySelector('[data-view="stock"]').click(); await wait(60);
  d.getElementById('startCount').click(); await wait(40);
  const c2=d.querySelector('[data-count]'); c2.value='3'; c2.dispatchEvent(new W.Event('input'));
  d.getElementById('save').click(); await wait(250);
  console.log('8 both studios:', JSON.stringify(T.items[0].stock));
  // sales log + void restores stock
  d.querySelector('[data-view="log"]').click(); await wait(60);
  d.querySelectorAll('[data-s]')[0].click(); await wait(60);
  console.log('9 log:', q('.stats').textContent.replace(/\s+/g,' ').trim());
  d.querySelector('[data-void]').click(); await wait(250);
  console.log('10 after void:', T.sales[0].voided, JSON.stringify(T.items[0].stock));
  console.log('11 csv button present:', !!d.getElementById('csv'));
  assert.equal(d.querySelector('[data-receipt]'),null);
  console.log('12 voided sale offers no receipt:', !d.querySelector('[data-receipt]'));
  // a sale with no email at all: the done screen should offer to add one
  d.querySelector('[data-view="sale"]').click(); await wait(40);
  const n2=d.getElementById('name'); n2.value='Daryl'; n2.dispatchEvent(new W.Event('input'));
  d.getElementById('next').click(); await wait(30);
  d.getElementById('skip').click(); await wait(40);
  const sc2=d.getElementById('scan'); sc2.value='001'; sc2.dispatchEvent(new W.KeyboardEvent('keydown',{key:'Enter'})); await wait(60);
  d.getElementById('next').click(); await wait(40);
  d.querySelector('[data-m="cash"]').click(); await wait(30);
  d.getElementById('finish').click(); await wait(250);
  console.log('13 no-email sale offers an email box:', !!d.getElementById('lateEmail'));
  d.getElementById('lateEmail').value='daryl@example.com';
  d.getElementById('saveEmail').click(); await wait(250);
  const daryl=T.sales.find(x=>x.customer_name==='Daryl');
  assert.equal(daryl.email,'daryl@example.com'); assert.ok(W.__mailto.includes('daryl'));
  console.log('14 email written back onto the sale:', daryl && daryl.email, '| receipt opened:', (W.__mailto||'').includes('daryl'));
  d.querySelector('[data-view="log"]').click(); await wait(60);
  console.log('15 live sale offers a resend:', !!d.querySelector('[data-receipt]'));
  // the Notion history shows beside the sales book, and new faces join the list
  const banner=[...d.querySelectorAll('.banner')].find(b=>/Before the counter/.test(b.textContent));
  assert.ok(banner); assert.match(banner.textContent,/\$93 over 2 logged days/); assert.match(banner.textContent,/Assigned to Mont Albert/);
  assert.ok(T.customers.some(c=>c.name==='Daryl' && c.email==='daryl@example.com'));
  console.log('16 history note:', banner?banner.textContent.replace(/\s+/g,' ').trim().slice(0,150):'MISSING');
  console.log('17 customer list now:', (T.customers||[]).map(c=>[c.name,c.email||'-',c.from_notion?'notion':'new',c.shop_known?'shop':'-'].join('/')));
  T.sales.push({...daryl,id:'older-daryl',created_ms:daryl.created_ms-10000,email:'outdated@example.com'});
  listeners.forEach(l=>l('sales')); await wait(80);
  d.querySelector('[data-view="sale"]').click(); await wait(40);
  const lookup=d.getElementById('name'); lookup.value='Daryl'; lookup.dispatchEvent(new W.Event('input'));
  const choice=[...d.querySelectorAll('#suggest button')].find(b=>b.querySelector('span').textContent==='Daryl');
  choice.click(); await wait(40); d.getElementById('back').click(); await wait(40);
  assert.equal(d.getElementById('email').value,'daryl@example.com');
  console.log('18 newest sale contact wins over older sales');
  d.querySelector('[data-view="log"]').click(); await wait(40);
  d.querySelector('[data-s="hawthorn"]').click(); await wait(40);
  assert.ok(![...d.querySelectorAll('.banner')].some(b=>/Before the counter/.test(b.textContent)));
  d.querySelector('[data-s="mont-albert"]').click(); await wait(40);
  assert.ok([...d.querySelectorAll('.banner')].some(b=>/Assigned to Mont Albert/.test(b.textContent)));
  console.log('19 history follows the assigned studio filter');
}catch(e){process.exitCode=1;console.error('TEST ERR',e.message,e.stack.split('\n')[1]);} })();
