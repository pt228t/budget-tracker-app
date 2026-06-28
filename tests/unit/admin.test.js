/**
 * tests/unit/admin.test.js
 * Unit tests for src/js/admin.js (B-038)
 */

import { describe, it, expect } from 'vitest';
import { validateAdminEmail, renderAdminPanel } from '../../src/js/admin.js';

// ─── validateAdminEmail ───────────────────────────────────────────────────────

describe('validateAdminEmail', () => {
  it('returns true for valid email', () => {
    expect(validateAdminEmail('user@example.com')).toBe(true);
  });

  it('returns true for email with subdomain', () => {
    expect(validateAdminEmail('user@mail.example.com')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(validateAdminEmail('')).toBe(false);
  });

  it('returns false for string without @', () => {
    expect(validateAdminEmail('notanemail')).toBe(false);
  });

  it('returns false for string without domain', () => {
    expect(validateAdminEmail('user@')).toBe(false);
  });

  it('trims whitespace before validating', () => {
    expect(validateAdminEmail('  user@example.com  ')).toBe(true);
  });
});

// ─── renderAdminPanel ─────────────────────────────────────────────────────────

describe('renderAdminPanel', () => {
  it('renders a list item for each authorized user', () => {
    const html = renderAdminPanel(['a@x.com', 'b@x.com'], 'a@x.com');
    expect(html).toContain('a@x.com');
    expect(html).toContain('b@x.com');
  });

  it('includes remove button for users other than currentUser', () => {
    const html = renderAdminPanel(['a@x.com', 'b@x.com'], 'a@x.com');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const removeButtons = doc.querySelectorAll('[data-remove-user]');
    expect(removeButtons.length).toBe(1);
    expect(removeButtons[0].dataset.removeUser).toBe('b@x.com');
  });

  it('does not include remove button for currentUser (cannot remove self)', () => {
    const html = renderAdminPanel(['a@x.com'], 'a@x.com');
    expect(html).not.toContain('data-remove-user');
  });

  it('renders add-user form with email input and submit button', () => {
    const html = renderAdminPanel([], 'a@x.com');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    expect(doc.querySelector('[data-admin-add-form]')).not.toBeNull();
    expect(doc.querySelector('[data-admin-email-input]')).not.toBeNull();
    expect(doc.querySelector('[data-admin-submit]')).not.toBeNull();
  });

  it('renders empty-state message when no users', () => {
    const html = renderAdminPanel([], 'a@x.com');
    expect(html).toContain('No authorized users');
  });
});
