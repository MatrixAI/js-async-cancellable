#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = { cwd: root, stdio: 'inherit', windowsHide: true };
execFileSync(
  process.execPath,
  [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '-p',
    path.join(root, 'tsconfig.build.json'),
  ],
  options,
);
execFileSync(
  process.execPath,
  [
    '--experimental-vm-modules',
    path.join(root, 'node_modules/jest/bin/jest.js'),
    ...process.argv.slice(2),
  ],
  options,
);
