/** G&S Counter — private Apps Script mail worker. No public web deployment. */
const COUNTER_URL = 'https://tinyforests.github.io/gs-counter/';
const SUPABASE_URL = 'https://etusezzqkjvbyackadag.supabase.co';
const PUBLIC_API_KEY = 'sb_publishable_l39cEER1HlCOOZ_rBXS9HQ_EElvijk5';

/** Run once yourself, approve Google permissions, and retain the execution log. */
function setupMailer() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('COUNTER_MAILER_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('COUNTER_MAILER_TOKEN', token);
  }
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8);
  const hash = digest.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  console.log('COUNTER_MAILER_TOKEN_HASH=' + hash);
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'deliverCounterMail')) {
    ScriptApp.newTrigger('deliverCounterMail').timeBased().everyMinutes(1).create();
  }
  console.log('Minute trigger installed. The database must be configured before delivery starts.');
}

function counterRpc_(name, payload) {
  const token = PropertiesService.getScriptProperties().getProperty('COUNTER_MAILER_TOKEN');
  if (!token) throw new Error('Run setupMailer first.');
  const response = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'post', contentType: 'application/json',
    headers: { apikey: PUBLIC_API_KEY },
    payload: JSON.stringify(Object.assign({ p_mailer_token: token }, payload || {})),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() >= 300) {
    // Never log the response body: queued sign-in tokens are credentials.
    throw new Error('Counter mail API returned HTTP ' + response.getResponseCode());
  }
  return JSON.parse(response.getContentText() || 'null');
}

function counterMessage_(job) {
  if (!['signup', 'magiclink', 'recovery', 'invite'].includes(job.action)) throw new Error('Unsupported email action');
  if (!/^[a-f0-9]+$/i.test(job.token_hash) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.email)) throw new Error('Invalid mail job');
  const url = SUPABASE_URL + '/auth/v1/verify?token=' + encodeURIComponent(job.token_hash) +
    '&type=' + encodeURIComponent(job.action) + '&redirect_to=' + encodeURIComponent(COUNTER_URL);
  const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return {
    to: job.email, name: 'Gardener & Son — Counter', subject: 'Your G&S Counter sign-in link',
    body: 'Sign in to the Gardener & Son counter:\n\n' + url + '\n\nIf you did not request this link, ignore this email. Do not forward this link.',
    htmlBody: '<div style="font-family:Georgia,serif;max-width:520px;margin:32px auto;color:#27352a"><p>Gardener &amp; Son</p><h1>The counter.</h1><p>Use this link to sign in on this device.</p><p style="margin:32px 0"><a style="background:#27352a;color:white;padding:14px 22px;text-decoration:none" href="' + escape(url) + '">Sign in to the counter</a></p><p style="font:13px Arial,sans-serif;color:#666">If you did not request this link, ignore this email. Do not forward this link.</p></div>',
  };
}

function deliverCounterMail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const quota = MailApp.getRemainingDailyQuota();
    if (quota < 1) { console.warn('Google daily email quota exhausted; queued mail will wait.'); return; }
    const jobs = counterRpc_('counter_claim_mail', { p_limit: Math.min(10, quota) });
    let delivered = 0;
    for (const job of jobs) {
      const marker = 'SENT_' + job.id;
      let sent = !!props.getProperty(marker);
      if (!sent) {
        try {
          MailApp.sendEmail(counterMessage_(job));
          sent = true;
          props.setProperty(marker, String(Date.now()));
        } catch (e) {
          console.warn('An email could not be sent; it will retry.');
        }
      }
      // If acknowledgement fails, keep the marker so the next lease does not resend.
      counterRpc_('counter_finish_mail', { p_id: job.id, p_lease: job.lease, p_sent: sent });
      if (sent) delivered++;
    }
    for (const [key, value] of Object.entries(props.getProperties())) {
      if (key.startsWith('SENT_') && Date.now() - Number(value) > 86400000) props.deleteProperty(key);
    }
    if (jobs.length) console.log('Counter mail processed: ' + jobs.length + '; delivered: ' + delivered);
  } finally { lock.releaseLock(); }
}
