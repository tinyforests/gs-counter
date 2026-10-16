/* G&S Counter — site config.
   Fill these two in from Supabase: Project Settings → API.
   The anon key is meant to be public; row-level security in schema.sql is what
   protects the data, so only allow-listed steward emails can read or write it. */
window.GS_CONFIG = {
  SUPABASE_URL: "https://etusezzqkjvbyackadag.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_l39cEER1HlCOOZ_rBXS9HQ_EElvijk5",

  // Studios the counter can be set to. id is stored on every sale — don't rename ids later.
  STUDIOS: [
    { id: "mont-albert", name: "Mont Albert", addr: "2 Churchill Street" },
    { id: "hawthorn",    name: "Hawthorn",    addr: "140 Auburn Road" },
  ],
};
