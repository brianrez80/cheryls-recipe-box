// Supabase verifies identity; PostgreSQL decides collection access.
// No browser flag, display name, or ownership label grants database access.
function createRecipeAuthController({ client, onAuthorized, onLocked, onMessage, redirectTo }) {
  let authorized = false, subject = null, revision = 0, pending = null;
  function lock(message) {
    authorized = false; subject = null; revision += 1;
    onLocked();
    if (message) onMessage(message);
  }
  async function validate() {
    if (pending) return pending;
    const started = revision;
    pending = (async () => {
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
        if (changed) await onAuthorized(data.user);
        return authorized;
      } catch {
        if (started === revision) lock('Your session could not be verified. Check your connection and try again.');
        return false;
      }
    })().finally(() => { pending = null; });
    return pending;
  }
  async function sendLink(email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      onMessage('Enter a valid email address.'); return false;
    }
    try {
      const { error } = await client.auth.signInWithOtp({ email,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
      onMessage(error
        ? 'A sign-in link could not be sent. Check the address, wait a minute, and try again.'
        : 'If this address is enrolled, a sign-in link is on its way. Open it on this browser.');
      return !error;
    } catch { onMessage('A sign-in link could not be sent. Check your connection and try again.'); return false; }
  }
  async function signOut() {
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
  return { validate, sendLink, signOut, lock, isAuthorized: () => authorized, currentUserId: () => authorized ? subject : null };
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
  recipeAuth = createRecipeAuthController({ client,
    redirectTo: callback.origin + callback.pathname, onMessage: setMessage,
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
    event.preventDefault(); const button = document.getElementById('sendLinkButton'); button.disabled = true;
    try { await recipeAuth.sendLink(document.getElementById('authEmail').value.trim()); }
    finally { button.disabled = false; }
  });
  document.getElementById('signOutButton').addEventListener('click', () => { void recipeAuth.signOut(); });
  document.getElementById('clearSessionButton').addEventListener('click', () => { void recipeAuth.signOut(); });
  document.getElementById('retryAuthButton').addEventListener('click', () => { void recipeAuth.validate(); });
  // Keep monitoring active even after a bad callback. INITIAL_SESSION is
  // handled explicitly below, so it cannot hide an invalid-link message.
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') recipeAuth.lock('You are signed out.');
    else if (event !== 'INITIAL_SESSION') setTimeout(() => { void recipeAuth.validate(); }, 0);
  });
  setInterval(() => { void recipeAuth.validate(); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void recipeAuth.validate();
  });
  const code = callback.searchParams.get('code'), callbackError = callback.searchParams.has('error');
  const flowId = callback.searchParams.get('sb_flow_id');
  for (const key of ['code','sb_flow_id','error','error_code','error_description']) callback.searchParams.delete(key);
  callback.hash = '';
  window.history.replaceState({}, '', callback.pathname + callback.search);
  if (callbackError) { setMessage('That sign-in link is invalid or expired. Request a new link.'); return; }
  if (code) {
    try {
      const { error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (error) throw error;
    } catch { setMessage('That link is invalid, expired, or was opened in another browser. Request a new link here.'); return; }
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
