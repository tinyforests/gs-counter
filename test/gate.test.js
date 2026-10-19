const assert = require('node:assert/strict');
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path').join(__dirname,'..')+'/';
function run(label,session,stewardRows,requireSignIn,expiry){
  const T={stewards:stewardRows,items:[],sales:[],movements:[]};
  const from=table=>{const q={_f:[],select(){return q;},order(){return q;},limit(){return q;},eq(c,v){q._f.push(r=>String(r[c])===String(v));return q;},
    maybeSingle(){const rows=T[table].filter(r=>q._f.every(f=>f(r)));return Promise.resolve({data:rows[0]||null,error:null});},
    insert(){return q;},update(){return q;},then(res){return Promise.resolve({data:T[table],error:null}).then(res);}};return q;};
  const sbClient={from,channel(){const c={on(){return c;},subscribe(){return c;}};return c;},
    auth:{getSession:async()=>({data:{session}}),onAuthStateChange(){},signInWithOtp:async()=>({error:null}),signOut:async()=>({error:null})}};
  const html=fs.readFileSync(path+'index.html','utf8').replace(/<script src="https:\/\/cdn[^"]*"><\/script>/,'').replace('<script src="config.js"></script>','')
    .replace('<script src="backend.js"></script>','<script>'+fs.readFileSync(path+'backend.js','utf8')+'</script>');
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://counter.gardenerandson.com/',beforeParse(w){
    w.GS_CONFIG={SUPABASE_URL:'x',SUPABASE_ANON_KEY:'y',REQUIRE_SIGN_IN:requireSignIn,PUBLIC_ACCESS_UNTIL:expiry,STUDIOS:[{id:'mont-albert',name:'Mont Albert',addr:'2 Churchill Street'}]};
    w.supabase={createClient:()=>sbClient}; w.crypto={randomUUID:()=>'id'+Math.random()};
  }});
  setTimeout(()=>{const g=dom.window.document.getElementById('gsGate');
    try {
      const expectedGate = (requireSignIn || (expiry && !(Date.now() < Date.parse(expiry)))) && (!session || !stewardRows.some(row => row.email === session.user.email));
      assert.equal(!!g, !!expectedGate, label);
      if (g) assert.equal(g.querySelector('h1').textContent, session ? 'Not on the list.' : 'The counter.');
    } catch (error) { process.exitCode=1; console.error(error); }
    console.log(label+':', g? g.querySelector('h1').textContent+' | '+(g.querySelector('.lede')||{}).textContent.slice(0,60) : 'no gate (signed in)');},250);
}
// Optional open mode is exercised as a regression case; deployment requires sign-in.
run('open mode, no session',null,[],false);

// sign-in mode (REQUIRE_SIGN_IN: true) — flip the flag + run schema.sql's lock-down block
run('locked, no session',null,[],true);
run('locked, not on the list',{user:{id:'u2',email:'random@example.com'}},[{email:'hello@lundbech.me',role:'admin'}],true);
run('locked, allow-listed',{user:{id:'u1',email:'hello@lundbech.me'}},[{email:'hello@lundbech.me',role:'admin'}],true);

run('expired launch, no session',null,[],false,'2000-01-01T00:00:00Z');
run('invalid launch expiry, no session',null,[],false,'invalid');
