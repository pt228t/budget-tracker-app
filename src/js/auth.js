/**
 * src/js/auth.js
 * Google Identity Services OAuth 2.0 integration
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly email profile';

let tokenClient;
let accessToken = null;
let isAuthenticated = false;

// Callbacks for the broader app to listen to auth state changes
let authSuccessCallback = null;
let authFailureCallback = null;

/**
 * Initialize Google Identity Services (GIS)
 * Loads the script dynamically if not present in index.html
 */
export function initAuth(onSuccess, onFailure) {
  authSuccessCallback = onSuccess;
  authFailureCallback = onFailure;

  if (!window.google) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = setupClient;
    document.head.appendChild(script);
  } else {
    setupClient();
  }
}

function setupClient() {
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: handleTokenResponse,
  });

  const storedToken = sessionStorage.getItem('bp_access_token');
  if (storedToken) {
    validateAndUseToken(storedToken);
  }
}

const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
];

async function validateAndUseToken(token) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) {
      console.warn('[Auth] Cached token invalid — cleared');
      sessionStorage.removeItem('bp_access_token');
      return;
    }
    const info = await res.json();
    const granted = (info.scope || '').split(' ');
    if (!REQUIRED_SCOPES.every(s => granted.includes(s))) {
      console.warn('[Auth] Cached token missing required scopes — cleared, re-consent needed');
      sessionStorage.removeItem('bp_access_token');
      return;
    }
    accessToken = token;
    isAuthenticated = true;
    updateAuthUI();
    if (authSuccessCallback) authSuccessCallback(token);
  } catch {
    sessionStorage.removeItem('bp_access_token');
  }
}

function handleTokenResponse(tokenResponse) {
  if (tokenResponse.error !== undefined) {
    console.error('OAuth error:', tokenResponse.error);
    if (authFailureCallback) authFailureCallback(tokenResponse);
    return;
  }
  
  accessToken = tokenResponse.access_token;
  isAuthenticated = true;
  
  // Store token for session persistence
  sessionStorage.setItem('bp_access_token', accessToken);
  
  updateAuthUI();
  
  // NOTE: In Phase 2, Sheets API Wrapper (Claude) will now take this token
  // and perform the App_Config.allowed_users check before fully letting the user in.
  if (authSuccessCallback) authSuccessCallback(accessToken);
}

export function signIn() {
  if (!tokenClient) {
    console.warn('Google Identity Services not initialized yet.');
    return;
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

let _reConsentInFlight = false;

export function reRequestConsent() {
  if (_reConsentInFlight) return;
  _reConsentInFlight = true;
  sessionStorage.removeItem('bp_access_token');
  accessToken = null;
  isAuthenticated = false;
  updateAuthUI();
  if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' });
  setTimeout(() => { _reConsentInFlight = false; }, 5000);
}

/**
 * Revoke the token and clear session
 */
export function signOut() {
  if (accessToken && window.google) {
    window.google.accounts.oauth2.revoke(accessToken, () => {
      clearSession();
    });
  } else {
    clearSession();
  }
}

function clearSession() {
  accessToken = null;
  isAuthenticated = false;
  sessionStorage.removeItem('bp_access_token');
  updateAuthUI();
  
  // Force route back to login
  window.location.hash = 'login';
}

/**
 * Interface for Sheets API Wrapper
 */
export function getAccessToken() {
  return accessToken;
}

export function isUserAuthenticated() {
  return isAuthenticated;
}

/**
 * UI State Management (Phase 1 HTML hookups)
 */
function updateAuthUI() {
  const syncStatus = document.querySelector('.sync-status span:last-child');
  const loginSection = document.querySelector('[data-page="login"]');
  const navLinks = document.querySelectorAll('.shell-nav-link');
  
  if (isAuthenticated) {
    if (syncStatus) syncStatus.textContent = 'Connected & Authenticated';
    
    // Update top nav
    navLinks.forEach(link => {
      if (link.dataset.route === 'login') {
        link.textContent = 'Sign Out';
        link.dataset.route = 'logout';
        link.classList.remove('active');
      }
    });
  } else {
    if (syncStatus) syncStatus.textContent = 'Awaiting OAuth and Sheets connection';
    
    // Reset top nav
    navLinks.forEach(link => {
      if (link.dataset.route === 'logout') {
        link.textContent = 'Login';
        link.dataset.route = 'login';
      }
    });
  }
}

// Global click delegation for Auth actions
document.addEventListener('click', (e) => {
  // "Sign in with Google" button on the hero panel
  if (e.target.matches('[data-auth-action="signin"]')) {
    e.preventDefault(); // Prevent direct routing until auth finishes
    signIn();
  }
  
  // "Sign Out" button in nav
  if (e.target.matches('[data-route="logout"]')) {
    e.preventDefault();
    signOut();
  }
});
