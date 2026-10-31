import type { GraphRoute } from '../domain/agent-definition.ts';
import { type Slots, substitutePrompt } from './expr-eval.ts';

export interface RouteNodeSpec {
  type: 'control:route';
  prompt?: string;
  routes: GraphRoute[];
  minConfidence?: number;
}
export interface RouteDecision {
  key: string;
  confidence?: number;
}
const ROUTE_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
export function isValidRouteKey(key: unknown): key is string {
  return typeof key === 'string' && ROUTE_KEY_RE.test(key);
}
export function routeOutputSchema(routes: GraphRoute[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      route: { type: 'string', enum: routes.map((route) => route.key) },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['route'],
    additionalProperties: false,
  };
}
export function routeInstruction(spec: RouteNodeSpec, slots: Slots): string {
  const lines: string[] = [];
  const custom = typeof spec.prompt === 'string' ? spec.prompt.trim() : '';
  if (custom !== '') {
    lines.push(substitutePrompt(custom, slots));
  }
  lines.push('Decide which single route fits the state best.');
  lines.push('Routes:');
  for (const route of spec.routes) {
    const label = route.label ?? route.key;
    const description = route.description ? ` — ${route.description}` : '';
    lines.push(`- ${route.key} (${label})${description}`);
  }
  lines.push('Reply with JSON only: {"route": "<key>", "confidence": <0..1>}');
  return lines.join('\n');
}
export function parseRouteDecision(
  text: string,
  routes: GraphRoute[],
  minConfidence?: number,
): RouteDecision | undefined {
  const parsed = parseJsonCandidate(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  const key = record.route;
  if (!isValidRouteKey(key) || !routes.some((route) => route.key === key)) {
    return undefined;
  }
  const raw = record.confidence;
  const confidence =
    typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : undefined;
  if (minConfidence !== undefined && confidence !== undefined && confidence < minConfidence) {
    return undefined;
  }
  return { key, ...(confidence !== undefined ? { confidence } : {}) };
}
function parseJsonCandidate(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') {
    return undefined;
  }
  for (const candidate of jsonCandidates(trimmed)) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {}
  }
  return undefined;
}
function jsonCandidates(trimmed: string): string[] {
  if (!trimmed.startsWith('```')) {
    return [trimmed];
  }
  const withoutFence = trimmed.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '');
  return [withoutFence.trim()];
}
