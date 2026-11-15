import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

interface BabelLike {
  version?: string;
  transformSync: (code: string, options: object) => { code: string | null } | null;
}

const repoRoot = join(import.meta.dir, '..');
const webuiRoot = join(repoRoot, 'apps/webui');
const requireFromWebui = createRequire(join(webuiRoot, 'package.json'));

const babelPath = requireFromWebui.resolve('@babel/core');
const compilerPath = requireFromWebui.resolve('babel-plugin-react-compiler');
const babelModule = (await import(pathToFileURL(babelPath).href)) as {
  default?: BabelLike;
} & BabelLike;
const babel = babelModule.default ?? babelModule;
const babelVersion =
  babel.version ?? (requireFromWebui('@babel/core/package.json') as { version: string }).version;

function collectTsx(dir: string, into: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsx(path, into);
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.d.tsx')) {
      into.push(path);
    }
  }
  return into;
}

const files = collectTsx(join(webuiRoot, 'src'), []).sort();
const reasons = new Map<string, string[]>();
let cells = 0;
let assignmentPatternSkips = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const out = babel.transformSync(source, {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['typescript', 'jsx'] },
    plugins: [
      [
        compilerPath,
        {
          target: '19',
          logger: {
            onError() {},
            logEvent(_filename: string, event: { kind: string; detail?: unknown }) {
              if (event.kind !== 'CompileError') {
                return;
              }
              const options = (event.detail as { options?: { reason?: string } } | undefined)
                ?.options;
              const reason = String(options?.reason ?? 'unknown').slice(0, 120);
              if (reason.includes('AssignmentPattern')) {
                assignmentPatternSkips += 1;
              }
              const seen = reasons.get(reason);
              if (seen) {
                seen.push(relative(webuiRoot, file));
              } else {
                reasons.set(reason, [relative(webuiRoot, file)]);
              }
            },
          },
        },
      ],
    ],
  });
  cells += (out?.code?.match(/const \$ = _c\(\d+\)/g) ?? []).length;
}

const major = Number(babelVersion.split('.')[0]);
let failed = false;

if (major !== 7) {
  console.error(
    `compiler-health: webui resolves @babel/core ${babelVersion}, expected 7.x ` +
      '(Babel 8 makes babel-plugin-react-compiler 1.0.0 silently skip every function with destructured default params).',
  );
  failed = true;
}
if (assignmentPatternSkips > 0) {
  console.error(
    `compiler-health: ${assignmentPatternSkips} skip(s) of the AssignmentPattern class ` +
      '(babel-plugin-react-compiler vs Babel version mismatch, see react/react#36868).',
  );
  failed = true;
}
for (const [reason, hitFiles] of reasons) {
  if (reason.includes('AssignmentPattern')) {
    continue;
  }
  console.warn(`compiler-health: skip "${reason}" in ${hitFiles.length} file(s): ${hitFiles.join(', ')}`);
}
if (cells === 0) {
  console.error('compiler-health: React Compiler produced zero memo cells — it is not running.');
  failed = true;
}
if (failed) {
  process.exit(1);
}
console.log(
  `compiler-health: pass (@babel/core ${babelVersion}, ${files.length} files, ${cells} memo cells)`,
);
