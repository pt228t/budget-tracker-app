import { renderAppShell } from './app-shell.js';
import { initAuth, signOut } from './auth.js';
import { isUserAllowed } from './sheets-api.js';
import { bootstrapSpreadsheet } from './setup.js';

const appRoot = document.querySelector('#app');

if (!appRoot) {
  throw new Error('Missing #app mount node');
}

// 1. Render the initial UI shell (navbar, login screen, etc.)
appRoot.innerHTML = renderAppShell();

// 2. Wire up the Google OAuth flow
initAuth(
  async (accessToken) => {
    console.log('OAuth successful, checking authorization...');
    
    try {
      // Fetch the user's email to verify against the allowed_users list
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch user profile from Google');
      }
      
      const profile = await response.json();
      
      // Bootstrap the spreadsheet backend (auto-creates if missing, injects creator as allowed)
      const setupReport = await bootstrapSpreadsheet(profile.email);
      if (!setupReport.ready) {
        throw new Error('Failed to bootstrap the backend spreadsheet: ' + setupReport.errors.join(', '));
      }
      
      // Verify authorization
      const allowed = await isUserAllowed(profile.email);
      
      if (!allowed) {
        console.warn(`Access Denied: ${profile.email} is not in the allowed_users list.`);
        alert(`Access Denied: Your email (${profile.email}) is not authorized to use this app. Contact the owner.`);
        signOut(); // Force clear the session
        return;
      }
      
      console.log(`User authorized: ${profile.email}`);
      
      // TODO: Once authorized, initialize the Dashboard and app components here!
      // For example: initDashboard(); initExpenseLogger();
      
    } catch (error) {
      console.error('Authorization check failed:', error);
      alert('Failed to verify your authorization status. Please check your connection and try again.');
      signOut();
    }
  },
  (error) => {
    console.error('Authentication failed:', error);
  }
);
