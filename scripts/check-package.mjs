import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'tmp/package-candidate');
const consumer = path.join(output, 'consumer');
const installed = path.join(consumer, 'node_modules/@matrixai/async-cancellable');
const manifestText = await readFile(path.join(root, 'package.json'), 'utf8');
const lock = JSON.parse(
  await readFile(path.join(root, 'package-lock.json'), 'utf8'),
);
await rm(output, { recursive: true, force: true });
await mkdir(installed, { recursive: true });
execFileSync(
  process.execPath,
  [
    process.env.npm_execpath,
    'pack',
    '--offline',
    '--ignore-scripts',
    '--pack-destination',
    output,
  ],
  { cwd: root, stdio: 'inherit' },
);
const archives = (await readdir(output)).filter((name) =>
  name.endsWith('.tgz'),
);
assert.equal(archives.length, 1);
const archive = path.join(output, archives[0]);
execFileSync('tar', ['-xzf', archive, '-C', installed, '--strip-components=1']);
assert.equal(
  await readFile(path.join(installed, 'package.json'), 'utf8'),
  manifestText,
);
assert.deepEqual((await readdir(installed)).sort(), [
  'LICENSE',
  'README.md',
  'dist',
  'package.json',
]);
assert(!(await readdir(path.join(installed, 'dist'))).includes('tsbuildinfo'));
// Reconstruct the lockfile-selected runtime closure, not an npm installation.
for (const [modulePath, module] of Object.entries(lock.packages)) {
  if (!modulePath.startsWith('node_modules/') || module.dev === true) continue;
  try {
    await cp(path.join(root, modulePath), path.join(consumer, modulePath), {
      recursive: true,
    });
  } catch (error) {
    if (module.optional !== true || error.code !== 'ENOENT') throw error;
  }
}
await writeFile(
  path.join(consumer, 'package.json'),
  '{"private":true,"type":"module"}\n',
);
await cp(
  path.join(root, 'tests/fixtures/package/smoke.mjs'),
  path.join(consumer, 'smoke.mjs'),
);
execFileSync(process.execPath, ['smoke.mjs'], {
  cwd: consumer,
  stdio: 'inherit',
});
await cp(
  path.join(root, 'tests/fixtures/package/types.ts'),
  path.join(consumer, 'types.ts'),
);
await writeFile(
  path.join(consumer, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      types: [],
      lib: ['ES2022', 'DOM', 'ESNext.Disposable'],
      verbatimModuleSyntax: true,
      skipLibCheck: false,
    },
    include: ['types.ts'],
  }),
);
execFileSync(
  process.execPath,
  [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '-p',
    path.join(consumer, 'tsconfig.json'),
  ],
  { stdio: 'inherit' },
);
await writeFile(
  path.join(output, 'report.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      status: 'passed',
      archive: path.basename(archive),
      manifest: 'byte-identical',
      node: process.version,
      checks: [
        'node-imports',
        'exports',
        'directional-cancellation-and-borrowed-wait',
        'provider-owned-context-scope',
        'outstanding-context-requirements',
        'web-declarations-without-node-types',
      ],
    },
    null,
    2,
  ),
);
if (process.argv.includes('--browser')) {
  await cp(
    path.join(root, 'tests/fixtures/browser/runtime.mjs'),
    path.join(consumer, 'browser.js'),
  );
  const bundled = await build({
    entryPoints: [path.join(consumer, 'browser.js')],
    outfile: path.join(output, 'browser.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    tsconfigRaw: {},
    metafile: true,
  });
  assert(
    Object.keys(bundled.metafile.inputs).some((name) =>
      name.endsWith('node_modules/@matrixai/async-cancellable/dist/cancellation.js'),
    ),
  );
  await writeFile(
    path.join(output, 'bundle-inputs.json'),
    JSON.stringify(bundled.metafile, null, 2),
  );
}
