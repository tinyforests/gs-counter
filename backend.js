/* G&S Counter — Supabase backend.
   Presents the same small interface the app was written against
   (window.claude.use("db" | "user" | "downloads")), backed by Postgres.
   Nothing resolves until a steward is signed in and on the allow list. */
(() => {
  const CFG = window.GS_CONFIG || {};
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY ||
      /YOUR-PROJECT-REF/.test(CFG.SUPABASE_URL) || /YOUR-ANON-KEY/.test(CFG.SUPABASE_ANON_KEY)) {
    const showSetup = () => {
      const el = document.createElement("div");
      el.id = "gsGate";
      el.innerHTML = '<div class="gate-card"><div class="brand">Gardener <em>&amp;</em> Son</div><h1>The counter.</h1><p class="lede">Setup required. The studio database has not been connected yet.</p><p class="note">Sales and stock will be available once the Supabase connection and steward access are configured.</p></div>';
      document.body.appendChild(el);
    };
    if (document.body) showSetup(); else document.addEventListener("DOMContentLoaded", showSetup, { once: true });
    window.claude = { use: () => new Promise(() => {}) };
    return;
  }
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  window.GS_SB = sb;

  /* ---------- row <-> doc mapping ---------- */
  // appField: columnName
  const MAPS = {
    items: { name:"name", price:"price", sku:"sku", lowAt:"low_at", archived:"archived", stock:"stock", createdAt:"created_ms" },
    sales: { createdAt:"created_ms", day:"day", studio:"studio", customerName:"customer_name", phone:"phone", email:"email",
             lines:"lines", itemCount:"item_count", total:"total", method:"method", note:"note", stewardId:"steward_id", voided:"voided" },
    movements: { at:"at_ms", studio:"studio", by:"by_steward", type:"type", itemId:"item_id", name:"name", qty:"qty",
                 before:"before_qty", after:"after_qty", note:"note", changed:"changed", netUnits:"net_units", detail:"detail" },
  };
  const NUMERIC = new Set(["price","total","qty","before","after","netUnits","lowAt","itemCount","changed","createdAt","at"]);

  function toDoc(table, row){
    const m = MAPS[table], doc = { id: row.id };
    for (const k in m) {
      let v = row[m[k]];
      if (v === null || v === undefined) continue;
      if (NUMERIC.has(k)) v = Number(v);
      doc[k] = v;
    }
    if (table === "items" && !doc.stock) doc.stock = {};
    return doc;
  }
  function toRow(table, doc){
    const m = MAPS[table], row = {};
    for (const k in doc) { if (k === "id") { row.id = doc.id; continue; } if (m[k] !== undefined) row[m[k]] = doc[k]; }
    return row;
  }

  /* ---------- live collections ---------- */
  const cache = { items: [], sales: [], movements: [] };
  const subs = { items: [], sales: [], movements: [] };
  const QUERY = {
    items:     q => q.order("sku", { ascending: true }),
    sales:     q => q.order("created_ms", { ascending: false }).limit(500),
    movements: q => q.order("at_ms", { ascending: false }).limit(100),
  };
  const snapshot = table => ({ docs: cache[table].map(d => ({ id: d.id, data: () => d })) });

  async function refetch(table){
    const { data, error } = await QUERY[table](sb.from(table).select("*"));
    if (error) { subs[table].forEach(s => s.err && s.err(error)); return; }
    cache[table] = data.map(r => toDoc(table, r));
    subs[table].forEach(s => s.cb(snapshot(table)));
  }

  let wired = false;
  function wireRealtime(){
    if (wired) return; wired = true;
    for (const table of Object.keys(cache)) {
      sb.channel("gs-" + table)
        .on("postgres_changes", { event: "*", schema: "public", table }, () => refetch(table))
        .subscribe();
    }
  }

  function mkErr(error){
    const msg = String((error && error.message) || error || "");
    let code = "unknown";
    if (/row-level security|permission|denied/i.test(msg)) code = "invalid_argument";
    else if (/fetch|network|timeout/i.test(msg)) code = "unavailable";
    const e = new Error(msg); e.code = code; return e;
  }

  function docRef(table, id){
    return {
      id,
      async set(doc){
        const { error } = await sb.from(table).insert(Object.assign({ id }, toRow(table, doc)));
        if (error) throw mkErr(error);
        await refetch(table);
      },
      async update(patch){
        const row = toRow(table, patch);
        // stock is a merge, not a replace — keep the other studio's count
        if (patch.stock) {
          const cur = (cache[table].find(d => d.id === id) || {}).stock || {};
          row.stock = Object.assign({}, cur, patch.stock);
        }
        const { error } = await sb.from(table).update(row).eq("id", id);
        if (error) throw mkErr(error);
        await refetch(table);
      },
    };
  }

  function collection(table){
    const api = {
      orderBy(){ return api; },   // ordering is fixed per table above
      limit(){ return api; },
      doc(id){ return docRef(table, id || crypto.randomUUID()); },
      async add(doc){
        const id = crypto.randomUUID();
        const { error } = await sb.from(table).insert(Object.assign({ id }, toRow(table, doc)));
        if (error) throw mkErr(error);
        await refetch(table);
        return { id };
      },
      onSnapshot(cb, err){
        subs[table].push({ cb, err });
        wireRealtime();
        refetch(table);
        return () => { subs[table] = subs[table].filter(s => s.cb !== cb); };
      },
    };
    return api;
  }

  const db = {
    collection,
    doc(path){ const i = path.indexOf("/"); return docRef(path.slice(0, i), path.slice(i + 1)); },
  };

  const downloads = {
    async save({ filename, data }){
      const blob = new Blob([data], { type: filename.endsWith(".csv") ? "text/csv" : "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
  };

  /* ---------- sign-in gate ---------- */
  let steward = null;
  const ready = new Promise(resolve => { window.__gsReady = resolve; });

  function gate(html){
    let el = document.getElementById("gsGate");
    if (!el) { el = document.createElement("div"); el.id = "gsGate"; document.body.appendChild(el); }
    el.innerHTML = `<div class="gate-card">${html}</div>`;
    return el;
  }
  const closeGate = () => { const el = document.getElementById("gsGate"); if (el) el.remove(); };

  function askEmail(msg){
    gate(`
      <div class="brand">Gardener <em>&amp;</em> Son</div>
      <h1>The counter.</h1>
      <p class="lede">${msg || "Sign in with your studio email. We'll send a link — tap it on this device and you'll stay signed in."}</p>
      <label class="field"><span>Email</span><input class="big" id="gsEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@gardenerandson.com"></label>
      <div class="actions"><button class="btn wide" id="gsSend">Send me a link</button></div>
      <p class="note" id="gsMsg"></p>`);
    const $e = document.getElementById("gsEmail"), $b = document.getElementById("gsSend"), $m = document.getElementById("gsMsg");
    const send = async () => {
      const email = $e.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $m.textContent = "That email doesn't look right."; return; }
      $b.disabled = true; $b.textContent = "Sending…";
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
      $b.disabled = false; $b.textContent = "Send me a link";
      $m.textContent = error ? ("Couldn't send it: " + error.message) : "Link requested. Allow a minute or two for delivery, then check your inbox and tap the link on this device.";
    };
    $b.onclick = send;
    $e.onkeydown = e => { if (e.key === "Enter") send(); };
    setTimeout(() => $e.focus(), 40);
  }

  function notAllowed(email){
    gate(`
      <div class="brand">Gardener <em>&amp;</em> Son</div>
      <h1>Not on the list.</h1>
      <p class="lede">${email} isn't set up as a steward yet. Ask Tyson to add it, then sign in again.</p>
      <div class="actions"><button class="btn ghost wide" id="gsOut">Use a different email</button></div>`);
    document.getElementById("gsOut").onclick = async () => { await sb.auth.signOut(); askEmail(); };
  }

  async function check(session){
    if (!session) { askEmail(); return; }
    const { data, error } = await sb.from("stewards").select("*").eq("email", session.user.email.toLowerCase()).maybeSingle();
    if (error || !data) { notAllowed(session.user.email); return; }
    steward = { id: session.user.id, email: session.user.email, name: data.name || "", role: data.role || "steward" };
    window.GS_STEWARD = steward;
    closeGate();
    window.__gsReady();
  }

  if (CFG.REQUIRE_SIGN_IN === false) {
    // Open mode: no sign-in. The counter is whoever has the link.
    steward = { id: null, email: "", name: "", role: "admin" };
    window.GS_STEWARD = steward;
    window.__gsReady();
  } else {
    sb.auth.getSession().then(({ data }) => check(data.session));
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") setTimeout(() => check(session), 0);
      if (event === "SIGNED_OUT") { steward = null; location.reload(); }
    });
  }

  const user = {
    id: async () => (steward ? steward.id : null),
    me: async () => steward,
    can: async () => true,          // the allow list and RLS decide; refused writes surface as errors
    canEdit: async () => steward && steward.role === "admin",
    isOwner: async () => steward && steward.role === "admin",
  };

  window.claude = {
    use: async name => {
      await ready;
      return name === "db" ? db : name === "user" ? user : name === "downloads" ? downloads : null;
    },
  };

  window.GS_SIGN_OUT = () => sb.auth.signOut();
  window.GS_OPEN_MODE = CFG.REQUIRE_SIGN_IN === false;
})();
