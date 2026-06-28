import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initAuth, signIn, signOut, getAccessToken, isUserAuthenticated } from '../../src/js/auth.js';

const VALID_TOKENINFO = {
  ok: true,
  json: async () => ({
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'email',
      'profile',
    ].join(' '),
    expires_in: '3599',
  }),
};

describe('Auth Module', () => {
  beforeEach(() => {
    // Mock DOM elements
    document.body.innerHTML = `
      <div class="sync-status"><span></span><span></span></div>
      <div data-page="login"></div>
      <button class="shell-nav-link" data-route="login">Login</button>
    `;
    
    // Clear session storage
    sessionStorage.clear();
    
    // Mock Google Identity Services global object
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn().mockReturnValue({
            requestAccessToken: vi.fn()
          }),
          revoke: vi.fn((token, callback) => callback())
        }
      }
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize correctly when no token exists', () => {
    initAuth();
    expect(isUserAuthenticated()).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it('should auto-authenticate if token exists in sessionStorage', async () => {
    sessionStorage.setItem('bp_access_token', 'fake_token_123');
    global.fetch = vi.fn().mockResolvedValue(VALID_TOKENINFO);

    const onSuccess = vi.fn();
    initAuth(onSuccess);

    await vi.waitFor(() => expect(isUserAuthenticated()).toBe(true));
    expect(getAccessToken()).toBe('fake_token_123');
    expect(onSuccess).toHaveBeenCalledWith('fake_token_123');
  });

  it('should trigger Google consent on signIn', () => {
    initAuth();
    signIn();
    
    // Access the mocked initTokenClient return value
    const mockClient = window.google.accounts.oauth2.initTokenClient();
    expect(mockClient.requestAccessToken).toHaveBeenCalledWith({ prompt: 'consent' });
  });

  it('should clear session and state on signOut', async () => {
    sessionStorage.setItem('bp_access_token', 'fake_token_123');
    global.fetch = vi.fn().mockResolvedValue(VALID_TOKENINFO);
    initAuth();

    await vi.waitFor(() => expect(isUserAuthenticated()).toBe(true));

    signOut();

    expect(isUserAuthenticated()).toBe(false);
    expect(getAccessToken()).toBeNull();
    expect(sessionStorage.getItem('bp_access_token')).toBeNull();
    expect(window.google.accounts.oauth2.revoke).toHaveBeenCalled();
  });
});
