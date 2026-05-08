import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock config before importing redact -----------------------------------
vi.mock('../src/core/config.js', () => ({
  config: {
    redactPatterns: [/password/gi, /secret/gi, /token/gi],
    redactPaths: ['/home/user', '/Users/alice'],
  },
}));

// Import AFTER mock is set up
const { redact, sanitizeForLLM } = await import('../src/utils/redact.js');

// ---- Tests -----------------------------------------------------------------

describe('redact()', () => {
  it('returns empty string for empty input', () => {
    expect(redact('')).toBe('');
  });

  it('truncates strings longer than 200 chars', () => {
    const long = 'a'.repeat(300);
    expect(redact(long).length).toBeLessThanOrEqual(200);
  });

  it('redacts matched patterns', () => {
    expect(redact('My password is hunter2')).toContain('[REDACTED]');
    expect(redact('bearer token abc123')).toContain('[REDACTED]');
  });

  it('redacts path prefixes', () => {
    const result = redact('file opened at /home/user/projects/app/src/main.ts');
    expect(result).toContain('[PATH]');
    expect(result).not.toContain('/home/user/projects');
  });

  it('redacts /Users/ path prefix', () => {
    const result = redact('editing /Users/alice/code/main.py');
    expect(result).toContain('[PATH]');
  });

  it('does not alter safe strings', () => {
    expect(redact('IntelliJ IDEA — MyProject')).toBe('IntelliJ IDEA — MyProject');
  });

  it('handles null-ish gracefully (empty string passed)', () => {
    expect(() => redact('')).not.toThrow();
  });

  it('applies multiple patterns independently', () => {
    const result = redact('secret key and token value');
    expect(result.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('sanitizeForLLM()', () => {
  it('removes backticks', () => {
    expect(sanitizeForLLM('`rm -rf /`')).not.toContain('`');
  });

  it('removes dollar signs', () => {
    expect(sanitizeForLLM('${process.env.SECRET}')).not.toContain('$');
  });

  it('removes angle brackets', () => {
    expect(sanitizeForLLM('<script>alert(1)</script>')).not.toContain('<');
  });

  it('truncates to 200 chars', () => {
    expect(sanitizeForLLM('x'.repeat(500)).length).toBeLessThanOrEqual(200);
  });

  it('collapses excessive newlines', () => {
    const result = sanitizeForLLM('line1\n\n\n\n\nline2');
    expect(result).toBe('line1\n\nline2');
  });

  it('keeps safe plain text unchanged', () => {
    expect(sanitizeForLLM('hello world')).toBe('hello world');
  });
});