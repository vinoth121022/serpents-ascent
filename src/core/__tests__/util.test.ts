import { describe, expect, it } from 'vitest';
import { must } from '../util';

describe('must', () => {
  it('returns the value when present', () => {
    expect(must(5)).toBe(5);
    expect(must('x')).toBe('x');
    expect(must(0)).toBe(0); // falsy but not nullish
  });

  it('throws on null with the default message', () => {
    expect(() => must(null)).toThrow('unexpected nullish value');
  });

  it('throws on undefined with a custom message', () => {
    expect(() => must(undefined, 'boom')).toThrow('boom');
  });
});
