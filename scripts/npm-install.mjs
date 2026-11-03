#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

const [npm, flock, planPath, ...args] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const sections = ['dependencies', 'devDependencies', 'optionalDependencies'];
const commands = new Set([
  'install',
  'i',
  'add',
  'ci',
  'update',
  'up',
  'upgrade',
  'uninstall',
  'un',
  'remove',
  'rm',
  'prune',
  'dedupe',
  'ddp',
]);

async function run(command, argv, env = process.env) {
  const child = spawn(command, argv, { stdio: 'inherit', env });
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => [
    signal,
    () => child.kill(signal),
  ]);
  for (const [signal, forward] of signals) process.on(signal, forward);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        resolve(code ?? 128 + os.constants.signals[signal]);
      });
    });
  } finally {
    for (const [signal, forward] of signals) process.off(signal, forward);
  }
}

function isArchive(spec, root, archive) {
  return (
    typeof spec === 'string' &&
    spec.startsWith('file:') &&
    path.resolve(root, decodeURIComponent(spec.slice(5))) === archive
  );
}

function writeJSON(file, value, original) {
  const text = isDeepStrictEqual(value, JSON.parse(original))
    ? original
    : `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(file, text);
}

async function install(root) {
  const recovery = fs
    .readdirSync(path.join(root, 'tmp'))
    .filter((name) => name.startsWith('npm-manifests-'));
  if (recovery.length > 0) {
    const recoveryPath = path.join(root, 'tmp', recovery[0]);
    throw new Error(
      `Recover manifests from ${recoveryPath} before installing again`,
    );
  }
  const files = ['package.json', 'package-lock.json'];
  const originals = files.map((file) =>
    fs.readFileSync(path.join(root, file), 'utf8'),
  );
  const [manifest, lock] = originals.map((text) => JSON.parse(text));
  const sources = Object.entries(plan.sources);
  for (const [modulePath, source] of sources) {
    const locked = lock.packages[modulePath];
    if (
      locked?.resolved !== source.locked.resolved ||
      locked?.version !== source.locked.version
    ) {
      throw new Error(
        `${source.name}: source pin changed; reload the Nix shell before installing`,
      );
    }
    for (const key of [
      'dependencies',
      'peerDependencies',
      'peerDependenciesMeta',
      'optionalDependencies',
      'engines',
      'bin',
    ]) {
      if (!isDeepStrictEqual(locked[key], source.locked[key])) {
        throw new Error(
          `${source.name}: locked metadata changed; reload the Nix shell before installing`,
        );
      }
    }
    if (modulePath === `node_modules/${source.name}`) {
      for (const section of sections) {
        if (
          manifest[section]?.[source.name] !==
          lock.packages[''][section]?.[source.name]
        ) {
          throw new Error(
            `${source.name}: manifest and lock selection differ; resolve the new source pin before prepared installation`,
          );
        }
      }
    }
  }

  const patchedManifest = structuredClone(manifest);
  const patchedLock = structuredClone(lock);
  const rewrittenEdges = [];
  // Resolve each dependency from its own package scope. A nested copy of the
  // same name need not select the top-level producer.
  function selectedSource(modulePath, name) {
    let scope = modulePath;
    while (true) {
      const candidate =
        scope === '' ? `node_modules/${name}` : `${scope}/node_modules/${name}`;
      if (lock.packages[candidate] != null) {
        return plan.sources[candidate];
      }
      if (scope === '') return undefined;
      const parent = scope.lastIndexOf('/node_modules/');
      scope = parent < 0 ? '' : scope.slice(0, parent);
    }
  }
  for (const [modulePath, module] of Object.entries(patchedLock.packages)) {
    if (modulePath === '') continue;
    for (const section of sections) {
      for (const [name, spec] of Object.entries(module[section] ?? {})) {
        if (!/^(?:git|github:)/.test(spec)) continue;
        const source = selectedSource(modulePath, name);
        if (source == null) continue;
        // Only the install-time constraint changes. The locked resolution still
        // selects the reviewed archive; no producer manifest is rewritten.
        module[section][name] = source.locked.version;
        rewrittenEdges.push({ modulePath, section, name, spec });
      }
    }
  }
  for (const [modulePath, source] of sources) {
    const spec = `file:${source.archive}`;
    patchedLock.packages[modulePath].resolved = spec;
    delete patchedLock.packages[modulePath].integrity;
    if (modulePath === `node_modules/${source.name}`) {
      for (const section of sections) {
        if (patchedManifest[section]?.[source.name] != null) {
          patchedManifest[section][source.name] = spec;
          patchedLock.packages[''][section][source.name] = spec;
        }
      }
    }
  }

  const npmArgs = args.map((arg) => {
    for (const [, source] of sources) {
      if (arg === source.name && ['install', 'i', 'add'].includes(args[0])) {
        return `${source.name}@file:${source.archive}`;
      }
      if (arg.startsWith(`${source.name}@`)) {
        throw new Error(
          `Change ${source.name}'s canonical pin and reload the shell to select another producer revision`,
        );
      }
    }
    return arg;
  });
  // Keep recovery copies on disk if the process is killed without cleanup.
  const backup = fs.mkdtempSync(path.join(root, 'tmp/npm-manifests-'));
  files.forEach((file, index) =>
    fs.writeFileSync(path.join(backup, file), originals[index]),
  );
  let result = 1;
  try {
    writeJSON(path.join(root, files[0]), patchedManifest, originals[0]);
    writeJSON(path.join(root, files[1]), patchedLock, originals[1]);
    result = await run(npm, npmArgs, {
      ...process.env,
      MATRIXAI_NPM_INSTALL_ACTIVE: root,
    });
  } finally {
    try {
      const current =
        result === 0
          ? files.map((file) =>
              JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')),
            )
          : [manifest, lock];
      const [nextManifest, nextLock] = current;
      for (const { modulePath, section, name, spec } of rewrittenEdges) {
        const module = nextLock.packages[modulePath];
        if (
          module?.[section]?.[name] ===
          patchedLock.packages[modulePath][section][name]
        ) {
          module[section][name] = spec;
        }
      }
      for (const [modulePath, source] of sources) {
        if (
          isArchive(
            nextLock.packages[modulePath]?.resolved,
            root,
            source.archive,
          )
        ) {
          nextLock.packages[modulePath].resolved = source.locked.resolved;
          if (source.locked.integrity == null) {
            delete nextLock.packages[modulePath].integrity;
          } else {
            nextLock.packages[modulePath].integrity = source.locked.integrity;
          }
        }
        for (const section of sections) {
          if (
            isArchive(
              nextManifest[section]?.[source.name],
              root,
              source.archive,
            )
          ) {
            nextManifest[section][source.name] =
              manifest[section]?.[source.name] ??
              manifest.dependencies?.[source.name] ??
              manifest.devDependencies?.[source.name] ??
              manifest.optionalDependencies?.[source.name];
          }
          if (
            isArchive(
              nextLock.packages[''][section]?.[source.name],
              root,
              source.archive,
            )
          ) {
            nextLock.packages[''][section][source.name] =
              nextManifest[section][source.name];
          }
        }
      }
      for (const source of Object.values(plan.sources)) {
        JSON.stringify(current, (_, value) => {
          if (isArchive(value, root, source.archive)) {
            throw new Error(`Unrestored archive reference for ${source.name}`);
          }
          return value;
        });
      }
      files.forEach((file, index) =>
        writeJSON(path.join(root, file), current[index], originals[index]),
      );
      fs.rmSync(backup, { recursive: true });
    } catch (error) {
      for (const file of files) {
        fs.copyFileSync(path.join(root, file), path.join(backup, `${file}.attempt`));
      }
      files.forEach((file, index) =>
        fs.writeFileSync(path.join(root, file), originals[index]),
      );
      // A recovery failure takes precedence over an interrupted installation.
      // eslint-disable-next-line no-unsafe-finally
      throw new Error(`Manifest recovery copies retained at ${backup}`, {
        cause: error,
      });
    }
  }
  return result;
}

async function main() {
  const locked = args[0] === '--nix-npm-locked';
  if (locked) args.shift();
  if (
    !commands.has(args[0]) ||
    args.some((arg) => arg === '-g' || arg === '--global')
  ) {
    return run(npm, args);
  }
  const locationArgs = args.filter(
    (arg, index) =>
      arg.startsWith('--prefix=') ||
      arg === '--prefix' ||
      args[index - 1] === '--prefix',
  );
  const prefix = spawnSync(npm, ['prefix', ...locationArgs], {
    encoding: 'utf8',
  });
  if (prefix.status !== 0) {
    throw new Error(prefix.stderr || 'Unable to locate npm project');
  }
  const root = prefix.stdout.trim();
  if (!fs.existsSync(path.join(root, 'package.json'))) return run(npm, args);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  if (manifest.name !== plan.packageName) return run(npm, args);
  if (fs.existsSync(path.join(root, 'npm-shrinkwrap.json'))) {
    throw new Error(
      'Prepared installation currently requires package-lock.json, not npm-shrinkwrap.json',
    );
  }
  if (process.env.MATRIXAI_NPM_INSTALL_ACTIVE === root) {
    throw new Error(
      'Recursive npm installation in a lifecycle script is not supported',
    );
  }
  if (locked) return install(root);
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  return run(flock, [
    '--exclusive',
    '--no-fork',
    path.join(root, 'tmp/npm-install.lock'),
    process.execPath,
    process.argv[1],
    npm,
    flock,
    planPath,
    '--nix-npm-locked',
    ...args,
  ]);
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`);
  if (error.cause != null) {
    process.stderr.write(`Caused by: ${error.cause.stack ?? error.cause}\n`);
  }
  process.exitCode = 1;
}
