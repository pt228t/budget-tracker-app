import { describe, expect, it } from 'vitest';
import { formatCurrencyINR, formatDateLabel, createElement, generateId } from '../../utils.js';

describe('utils', () => {
  it('formats INR without paise by default', () => {
    expect(formatCurrencyINR(8000)).toBe('₹8,000');
  });

  it('formats dates for UI labels', () => {
    expect(formatDateLabel('2026-06-21T00:00:00+05:30')).toContain('2026');
  });

  it('creates DOM elements with classes and attributes', () => {
    const element = createElement('button', {
      className: 'btn btn-primary',
      text: 'Save',
      attributes: {
        type: 'button',
      },
    });

    expect(element.tagName).toBe('BUTTON');
    expect(element.className).toBe('btn btn-primary');
    expect(element.getAttribute('type')).toBe('button');
    expect(element.textContent).toBe('Save');
  });

  it('generates stable prefixed ids', () => {
    expect(generateId('bp')).toMatch(/^bp-/);
  });
});
