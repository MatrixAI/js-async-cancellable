import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const seen = new Set();
const dependencyBuiltins = new Set();
const builtins = new Set(
  builtinModules.flatMap((name) => [name, `node:${name}`]),
);

function visit(path) {
  if (seen.has(path)) return;
  seen.add(path);
  const source = readFileSync(path, 'utf8');
  const imports = source.matchAll(
    /(?:\bfrom\s*|\bimport\s*\(|\bimport\s*)['"]([^'"]+)['"]/g,
  );
  for (const [, specifier] of imports) {
    if (builtins.has(specifier)) {
      assert(
        path.includes('/node_modules/'),
        `Node builtin in cancellation source: ${specifier} from ${path}`,
      );
      dependencyBuiltins.add(specifier);
      continue;
    }
    assert(
      !specifier.includes('/ambient/node'),
      `Node ambient adapter: ${specifier}`,
    );
    const target = fileURLToPath(
      import.meta.resolve(specifier, pathToFileURL(path).href),
    );
    if (target.endsWith('.js') || target.endsWith('.mjs')) visit(target);
  }
}

visit(fileURLToPath(new URL('../dist/index.js', import.meta.url)));
mkdirSync('tmp', { recursive: true });
writeFileSync(
  'tmp/portable-imports.json',
  JSON.stringify(
    {
      sourceBoundary: 'node-builtin-free',
      nodeAmbientAdapter: 'excluded',
      modules: seen.size,
      dependencyBuiltins: [...dependencyBuiltins].sort(),
      browserCompatibility: 'not-established',
    },
    null,
    2,
  ),
);
process.stdout.write(
  `Cancellation source boundary checked: ${
    seen.size
  } modules; transitive Node dependencies: ${[...dependencyBuiltins].join(
    ', ',
  )} (browser compatibility not established)\n`,
);
