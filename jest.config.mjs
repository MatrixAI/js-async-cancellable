import path from 'node:path';
import url from 'node:url';
import tsconfigJSON from './tsconfig.json' with { type: 'json' };

const projectPath = path.dirname(url.fileURLToPath(import.meta.url));

// Global variables that are shared across the jest worker pool
// These variables must be static and serializable
const globals = {
  // Absolute directory to the project root
  projectDir: projectPath,
  // Absolute directory to the test root
  testDir: path.join(projectPath, 'tests'),
  // Default asynchronous test timeout
  defaultTimeout: 20000,
  // Timeouts rely on setTimeout which takes 32 bit numbers
  maxTimeout: Math.pow(2, 31) - 1,
};

// The `globalSetup` and `globalTeardown` cannot access the `globals`
// They run in their own process context
// They can however receive the process environment
// Use `process.env` to set variables

const config = {
  testEnvironment: 'node',
  verbose: true,
  testTimeout: 20000,
  collectCoverage: false,
  coverageProvider: 'v8',
  cacheDirectory: '<rootDir>/tmp/jest',
  coverageDirectory: '<rootDir>/tmp/coverage',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        module: { type: 'es6' },
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: true,
            decorators: true,
            dynamicImport: true,
          },
          target: tsconfigJSON.compilerOptions.target.toLowerCase(),
          keepClassNames: true,
          transform: { decoratorVersion: '2022-03' },
        },
      },
    ],
  },
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/tmp/junit',
        classNameTemplate: '{classname}',
        ancestorSeparator: ' > ',
        titleTemplate: '{title}',
        addFileAttribute: 'true',
        reportTestSuiteErrors: 'true',
      },
    ],
  ],
  collectCoverageFrom: ['dist/**/*.js'],
  coverageReporters: ['text', 'cobertura'],
  globals,
  // Global setup script executed once before all test files
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  // Global teardown script executed once after all test files
  globalTeardown: '<rootDir>/tests/globalTeardown.ts',
  // Setup files are executed before each test file
  // Can access globals
  setupFiles: ['<rootDir>/tests/setup.ts'],
  // Setup files after env are executed before each test file
  // after the jest test environment is installed
  // Can access globals
  setupFilesAfterEnv: ['jest-extended/all', '<rootDir>/tests/setupAfterEnv.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx', '.mts'],
};

export default config;
