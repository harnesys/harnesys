import type { Provider } from './container';
import type { UnknownClass } from './injectable';
import type { DynamicModule } from './module';
import { getModuleOptions, isGlobalModule } from './module';

export interface ModuleNode {
  ref: UnknownClass;
  imports: UnknownClass[];
  controllers: UnknownClass[];
  providers: Provider[];
  exports: Set<unknown>;
  global: boolean;
}

export interface ModuleGraph {
  nodes: ModuleNode[];
  root: UnknownClass;
  multi: Set<unknown>;
  nodeOf(ref: UnknownClass): ModuleNode | undefined;
  ownerOf(token: unknown): UnknownClass | undefined;
  canSee(from: UnknownClass, token: unknown): boolean;
}

type ModuleEntry = UnknownClass | DynamicModule;

interface ModuleDefinition {
  ref: UnknownClass;
  imports: unknown[];
  controllers: unknown[];
  providers: Provider[];
  exports: unknown[];
  global: boolean;
}

export function isDynamicModule(entry: unknown): entry is DynamicModule {
  return typeof entry === 'object' && entry !== null && 'module' in entry;
}

export function moduleRefOf(entry: ModuleEntry): UnknownClass {
  return isDynamicModule(entry) ? entry.module : entry;
}

export function providerToken(provider: Provider): unknown {
  return typeof provider === 'function' ? provider : provider.provide;
}

export function describeToken(token: unknown): string {
  if (typeof token === 'function') {
    return (token as { name: string }).name || 'anonymous class';
  }
  if (typeof token === 'string') {
    return `"${token}"`;
  }
  if (typeof token === 'symbol') {
    return token.description ?? token.toString();
  }
  return String(token);
}

function asArray<T>(value: T[] | undefined): T[] {
  return value ?? [];
}

function toModuleEntry(entry: unknown): ModuleEntry {
  if (isDynamicModule(entry)) {
    return entry;
  }
  if (typeof entry === 'function') {
    return entry as UnknownClass;
  }
  throw new Error(`Invalid module entry ${describeToken(entry)}: expected a module class`);
}

function toClassEntry(entry: unknown, role: string): UnknownClass {
  if (typeof entry === 'function') {
    return entry as UnknownClass;
  }
  throw new Error(`Invalid ${role} entry ${describeToken(entry)}: expected a class`);
}

function readDefinition(entry: ModuleEntry): ModuleDefinition {
  const ref = moduleRefOf(entry);
  const options = getModuleOptions(ref);
  const dynamic = isDynamicModule(entry) ? entry : undefined;
  return {
    ref,
    imports: [...asArray(options.imports), ...asArray(dynamic?.imports)],
    controllers: [...asArray(options.controllers), ...asArray(dynamic?.controllers)],
    providers: [...asArray(options.providers), ...asArray(dynamic?.providers)],
    exports: [...asArray(options.exports), ...asArray(dynamic?.exports)],
    global: dynamic?.global ?? isGlobalModule(ref),
  };
}

function sameTokens(left: Set<unknown>, right: Set<unknown> | undefined): boolean {
  if (right === undefined || left.size !== right.size) {
    return false;
  }
  for (const token of left) {
    if (!right.has(token)) {
      return false;
    }
  }
  return true;
}

interface Visibility {
  visible: Map<UnknownClass, Set<unknown>>;
  exported: Map<UnknownClass, Set<unknown>>;
}

function collectOwnTokens(node: ModuleNode): Set<unknown> {
  const own = new Set<unknown>();
  for (const provider of node.providers) {
    own.add(providerToken(provider));
  }
  for (const controller of node.controllers) {
    own.add(controller);
  }
  return own;
}

function growTokens(target: Set<unknown>, source: Set<unknown> | undefined): boolean {
  let changed = false;
  for (const token of source ?? []) {
    if (!target.has(token)) {
      target.add(token);
      changed = true;
    }
  }
  return changed;
}

function exportedTokensOf(
  node: ModuleNode,
  owners: Map<unknown, UnknownClass>,
  visible: Map<UnknownClass, Set<unknown>>,
): Set<unknown> {
  const exp = new Set<unknown>();
  for (const token of node.exports) {
    if (owners.get(token) === node.ref || (visible.get(node.ref)?.has(token) ?? false)) {
      exp.add(token);
    }
  }
  return exp;
}

function resolveVisibility(nodes: ModuleNode[], owners: Map<unknown, UnknownClass>): Visibility {
  const visible = new Map<UnknownClass, Set<unknown>>();
  const exported = new Map<UnknownClass, Set<unknown>>();
  for (const node of nodes) {
    visible.set(node.ref, collectOwnTokens(node));
    exported.set(node.ref, new Set<unknown>());
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      const vis = visible.get(node.ref) ?? new Set<unknown>();
      for (const source of sourceModules(node, nodes)) {
        if (growTokens(vis, exported.get(source.ref))) {
          changed = true;
        }
      }
      const exp = exportedTokensOf(node, owners, visible);
      if (!sameTokens(exp, exported.get(node.ref))) {
        exported.set(node.ref, exp);
        changed = true;
      }
    }
  }
  return { visible, exported };
}

function sourceModules(node: ModuleNode, nodes: ModuleNode[]): ModuleNode[] {
  const sources: ModuleNode[] = [];
  for (const ref of node.imports) {
    for (const other of nodes) {
      if (other.ref === ref) {
        sources.push(other);
      }
    }
  }
  for (const other of nodes) {
    if (other.global && !sources.includes(other)) {
      sources.push(other);
    }
  }
  return sources;
}

function assertExports(nodes: ModuleNode[], exported: Map<UnknownClass, Set<unknown>>): void {
  for (const node of nodes) {
    for (const token of node.exports) {
      if (!(exported.get(node.ref)?.has(token) ?? false)) {
        throw new Error(
          `Module ${node.ref.name} exports ${describeToken(token)} but does not provide it: ` +
            'export the module that provides the token instead',
        );
      }
    }
  }
}

export function buildModuleGraph(
  roots: Array<UnknownClass | DynamicModule>,
  options: { multi?: unknown[] } = {},
): ModuleGraph {
  const multi = new Set<unknown>(options.multi ?? []);
  const nodes: ModuleNode[] = [];
  const byRef = new Map<UnknownClass, ModuleNode>();
  const owners = new Map<unknown, UnknownClass>();

  const claim = (token: unknown, node: ModuleNode): void => {
    if (multi.has(token)) {
      return;
    }
    const owner = owners.get(token);
    if (owner !== undefined && owner !== node.ref) {
      throw new Error(
        `Token ${describeToken(token)} is provided by both ${owner.name} and ${node.ref.name}: ` +
          'each token must be owned by a single module',
      );
    }
    owners.set(token, node.ref);
  };

  const visit = (entry: ModuleEntry): void => {
    const definition = readDefinition(entry);
    if (byRef.has(definition.ref)) {
      return;
    }
    const node: ModuleNode = {
      ref: definition.ref,
      imports: definition.imports.map((imported) => moduleRefOf(toModuleEntry(imported))),
      controllers: definition.controllers.map((controller) =>
        toClassEntry(controller, 'controller'),
      ),
      providers: definition.providers,
      exports: new Set<unknown>(definition.exports),
      global: definition.global,
    };
    nodes.push(node);
    byRef.set(node.ref, node);
    for (const provider of node.providers) {
      claim(providerToken(provider), node);
    }
    for (const controller of node.controllers) {
      claim(controller, node);
    }
    for (const imported of definition.imports) {
      visit(toModuleEntry(imported));
    }
  };

  for (const root of roots) {
    visit(root);
  }
  const firstRoot = roots[0];
  if (firstRoot === undefined) {
    throw new Error('buildModuleGraph requires at least one root module');
  }

  const { visible, exported } = resolveVisibility(nodes, owners);
  assertExports(nodes, exported);

  return {
    nodes,
    root: moduleRefOf(firstRoot),
    multi,
    nodeOf: (ref) => byRef.get(ref),
    ownerOf: (token) => owners.get(token),
    canSee: (from, token) => {
      const owner = owners.get(token);
      if (owner === undefined || owner === from) {
        return true;
      }
      return visible.get(from)?.has(token) ?? false;
    },
  };
}
