// Supabase verifies identity; PostgreSQL decides collection access.
// No browser flag, display name, or ownership label grants database access.
function createRecipeAuthController({ client, onAuthorized, onLocked, onMessage, redirectTo, onState = () => {}, now = Date.now }) {
  let authorized = false, subject = null, revision = 0, pending = null;
  let emailForCode = '', sending = false, verifying = false, resendAt = 0;
  const emit = () => onState({ email: emailForCode, sending, verifying });
  const validEmail = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  function clearCodeEntry() { emailForCode = ''; emit(); }
  function lock(message) {
    authorized = false; subject = null; revision += 1;
    onLocked();
    if (message) onMessage(message);
  }
  async function validate() {
    if (verifying || sending) return false;
    if (pending) return pending;
    const started = revision;
    const work = (async () => {
      try {
        const { data, error } = await client.auth.getUser();
        if (started !== revision) return false;
        if (error || !data?.user?.id || !data.user.email_confirmed_at) {
          lock('Sign in with your enrolled email address to open the recipe box.'); return false;
        }
        const admission = await client.rpc('recipe_box_access');
        if (started !== revision) return false;
        if (admission.error || admission.data !== true) {
          lock('This session cannot open the recipe box. Contact Brian if you need help.'); return false;
        }
        const changed = !authorized || subject !== data.user.id;
        authorized = true; subject = data.user.id;
        if (changed) { onMessage('Opening your recipe box…'); await onAuthorized(data.user); }
        return authorized;
      } catch {
        if (started === revision) lock('Your recipe box could not load. Check your connection and try again.');
        return false;
      }
    })();
    pending = work;
    return work.finally(() => { if (pending === work) pending = null; });
  }
  function beginCodeEntry(email) {
    email = String(email || '').trim().toLowerCase();
    if (sending || verifying) return false;
    if (!validEmail(email)) { onMessage('Enter a valid email address.'); return false; }
    emailForCode = email; emit(); onMessage('Enter the six-digit code from your latest Recipe Box email.'); return true;
  }
  async function sendCode(email) {
    email = String(email || '').trim().toLowerCase();
    if (!validEmail(email)) {
      onMessage('Enter a valid email address.'); return false;
    }
    if (sending || verifying) return false;
    if (now() < resendAt) { onMessage('Please wait a minute before requesting another code.'); return false; }
    const started = ++revision; pending = null; sending = true; emit();
    try {
      const { error } = await client.auth.signInWithOtp({ email,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
      if (started !== revision) return false;
      if (!error) { emailForCode = email; resendAt = now() + 60000; }
      else if (error.status === 429) resendAt = now() + 60000;
      onMessage(error
        ? error.status === 429 ? 'Too many requests. Wait a minute, then try again.' : 'A code could not be sent. Check the address and try again later.'
        : 'If this email is enrolled, a code is on its way. Check your inbox and spam folder.');
      return !error;
    } catch { if (started === revision) onMessage('A code could not be sent. Check your connection and try again.'); return false; }
    finally { sending = false; emit(); }
  }
  async function verifyCode(value) {
    const email = emailForCode, token = String(value || '').trim();
    if (!email || !/^\d{6}$/.test(token)) { onMessage('Enter the six-digit code from your email.'); return false; }
    if (sending || verifying) return false;
    const started = ++revision; pending = null; verifying = true; emit(); onMessage('Checking your code…');
    try {
      const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
      if (started !== revision) {
        await client.auth.signOut({ scope: 'local' }).catch(() => {}); return false;
      }
      if (error || !data?.session || !data?.user) {
        onMessage(error?.status === 429 ? 'Too many attempts. Wait a minute, then request a new code.'
          : 'That code is incorrect, expired, or already used. Try the latest code or request a new one.'); return false;
      }
      if (data.user.email?.toLowerCase() !== email) {
        await client.auth.signOut({ scope: 'local' }).catch(() => {});
        lock('The signed-in email did not match. Request a new code.'); return false;
      }
      emailForCode = '';
    } catch { if (started === revision) onMessage('Sign-in could not finish. Check your connection and try again.'); return false; }
    finally { verifying = false; emit(); }
    return validate();
  }
  async function signOut() {
    clearCodeEntry();
    lock('Signing out…');
    try {
      const { error } = await client.auth.signOut({ scope: 'global' });
      if (error) {
        await client.auth.signOut({ scope: 'local' });
        onMessage('Signed out on this device. Reconnect and sign out again to revoke other sessions.'); return;
      }
      onMessage('You are signed out.');
    } catch {
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
      onMessage('This device is locked. Reconnect to finish revoking your sessions.');
    }
  }
  return { validate, sendCode, verifyCode, beginCodeEntry, clearCodeEntry, signOut, lock,
    resendDelay: () => Math.max(0, resendAt - now()),
    isAuthorized: () => authorized, currentUserId: () => authorized ? subject : null };
}

let recipeAuth = null;
function isUserAuthenticated() { return recipeAuth?.isAuthorized() === true; }
async function initializeAuth() {
  const client = getSupabase();
  const status = document.getElementById('authStatus');
  const setMessage = message => { if (status) status.textContent = message; };
  if (!client) { setMessage('Sign-in is unavailable. Please try again later.'); return; }
  const callback = new URL(window.location.href);
  if (callback.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(callback.hostname)) {
    setMessage('Use the secure HTTPS address to sign in.'); return;
  }
  let authBusy = false, currentCodeEmail = '';
  function updateResend() {
    const seconds = Math.ceil((recipeAuth?.resendDelay() || 0) / 1000);
    document.getElementById('resendCodeButton').disabled = authBusy || seconds > 0;
    document.getElementById('resendCodeButton').textContent = seconds ? `Send another code (${seconds}s)` : 'Send another code';
  }
  recipeAuth = createRecipeAuthController({ client,
    redirectTo: callback.origin + callback.pathname, onMessage: setMessage,
    onState: state => {
      authBusy = state.sending || state.verifying;
      if (currentCodeEmail !== state.email) document.getElementById('authCode').value = '';
      currentCodeEmail = state.email;
      document.getElementById('authForm').hidden = Boolean(state.email);
      document.getElementById('authCodeForm').hidden = !state.email;
      document.getElementById('codeEmailSummary').textContent = state.email ? `Enter the code sent to ${state.email}.` : '';
      for (const id of ['sendCodeButton','haveCodeButton','verifyCodeButton','changeEmailButton']) document.getElementById(id).disabled = authBusy;
      document.getElementById('authCode').disabled = authBusy;
      updateResend();
      if (state.email && !authBusy) document.getElementById('authCode').focus();
    },
    onLocked: lockRecipeInterface,
    onAuthorized: async user => {
      await loadPrivateRecipeCollection();
      if (!isUserAuthenticated()) return;
      document.getElementById('authScreen').hidden = true;
      document.getElementById('privateApp').inert = false;
      document.getElementById('signedInAs').textContent = user.email || 'Signed in';
      document.getElementById('signOutButton').hidden = false;
      document.body.classList.remove('locked');
      window.dispatchEvent(new Event('recipe-box-ready'));
    }
  });
  lockRecipeInterface();
  document.getElementById('authForm').addEventListener('submit', async event => {
    event.preventDefault(); await recipeAuth.sendCode(document.getElementById('authEmail').value);
  });
  document.getElementById('haveCodeButton').addEventListener('click', () => { recipeAuth.beginCodeEntry(document.getElementById('authEmail').value); });
  document.getElementById('authCodeForm').addEventListener('submit', event => {
    event.preventDefault(); const code = document.getElementById('authCode').value;
    document.getElementById('authCode').value = ''; void recipeAuth.verifyCode(code);
  });
  document.getElementById('authCode').addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text').replace(/[\s-]/g, '');
    if (/^\d{6}$/.test(text || '')) { event.preventDefault(); document.getElementById('authCode').value = text; }
  });
  document.getElementById('resendCodeButton').addEventListener('click', () => {
    document.getElementById('authCode').value = ''; void recipeAuth.sendCode(currentCodeEmail);
  });
  document.getElementById('changeEmailButton').addEventListener('click', () => {
    recipeAuth.clearCodeEntry(); document.getElementById('authEmail').focus();
  });
  document.getElementById('signOutButton').addEventListener('click', () => { void recipeAuth.signOut(); });
  document.getElementById('clearSessionButton').addEventListener('click', () => { void recipeAuth.signOut(); });
  document.getElementById('retryAuthButton').addEventListener('click', () => { void recipeAuth.validate(); });
  // Keep monitoring active even after a bad callback. INITIAL_SESSION is
  // handled explicitly below, so it cannot hide an invalid-link message.
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') { recipeAuth.clearCodeEntry(); recipeAuth.lock('You are signed out.'); }
    else if (event !== 'INITIAL_SESSION') setTimeout(() => { void recipeAuth.validate(); }, 0);
  });
  setInterval(updateResend, 1000);
  setInterval(() => { void recipeAuth.validate(); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void recipeAuth.validate();
  });
  const code = callback.searchParams.get('code'), callbackError = callback.searchParams.has('error');
  const flowId = callback.searchParams.get('sb_flow_id');
  for (const key of ['code','sb_flow_id','error','error_code','error_description']) callback.searchParams.delete(key);
  callback.hash = '';
  window.history.replaceState({}, '', callback.pathname + callback.search);
  if (callbackError) { setMessage('That link could not be used here. Request a six-digit email code.'); return; }
  if (code) {
    try {
      const { error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (error) throw error;
    } catch { setMessage('That link could not be used here. Request a six-digit email code.'); return; }
  }
  await recipeAuth.validate();
}
function lockRecipeInterface() {
  document.body.classList.add('locked');
  document.getElementById('authScreen').hidden = false;
  document.getElementById('privateApp').inert = true;
  document.getElementById('signOutButton').hidden = true;
  document.getElementById('signedInAs').textContent = '';
  clearPrivateRecipeState();
}
