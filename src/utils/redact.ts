import { config } from '../core/config.js';

const MAX_LEN = 200;

/**
 * Redacts sensitive patterns and path prefixes from a string,
 * then truncates to MAX_LEN.
 *
 * Patterns and paths come from the live config so hot-reload is respected.
 */
export function redact(input: string): string {
  if (!input) return '';

  let out = input.slice(0, MAX_LEN * 4); // work on a reasonable slice before patterns

  // Apply regex patterns (e.g. "password", "token")
  for (const pattern of config.redactPatterns) {
    out = out.replace(pattern, '[REDACTED]');
  }

  // Redact recognised path prefixes
  for (const prefix of config.redactPaths) {
    if (!prefix) continue;
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pathRe = new RegExp(`${escaped}[^\\s"']*`, 'g');
    out = out.replace(pathRe, '[PATH]');
  }

  return out.slice(0, MAX_LEN);
}

/**
 * Strip characters that could be used for prompt injection before
 * passing data to an LLM context.
 */
export function sanitizeForLLM(input: string): string {
  return input
    .replace(/`/g, "'")            // backtick → single quote
    .replace(/\$\{[^}]*\}/g, '')   // template literals
    .replace(/\$/g, '')            // remaining dollar signs
    .replace(/[<>]/g, '')          // angle brackets
    .replace(/\n{3,}/g, '\n\n')    // collapse excessive newlines
    .slice(0, MAX_LEN);
}