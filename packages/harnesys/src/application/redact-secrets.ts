export type RedactionKind = 'bearer' | 'pem' | 'api-key' | 'assignment';

const PEM_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g;
const API_KEY_RE =
  /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g;
const ASSIGNMENT_RE =
  /(?<![A-Za-z])(api[_-]?key|secret|token|password|passwd)\b(\s*)([:=])(\s*)("[^"\n]{8,}"|'[^'\n]{8,}'|[^\s,;&)]{8,})/gi;

export function redactSecrets(text: string): string {
  return text
    .replace(PEM_RE, '[REDACTED:pem]')
    .replace(BEARER_RE, '[REDACTED:bearer]')
    .replace(API_KEY_RE, '[REDACTED:api-key]')
    .replace(ASSIGNMENT_RE, '[REDACTED:assignment]');
}
