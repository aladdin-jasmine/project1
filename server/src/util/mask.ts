// Mask a secret key for safe logging / API responses.
// Shows prefix + last 4 chars, e.g. sk-abc...1234
export function maskKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••';
  const prefix = trimmed.slice(0, Math.min(6, trimmed.length - 4));
  const suffix = trimmed.slice(-4);
  return `${prefix}…${suffix}`;
}

// Reveal only on explicit fetch (never in list responses)
export function revealKey(key: string): string {
  return key;
}
