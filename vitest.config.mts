import babel, { defineRolldownBabelPreset } from '@rolldown/plugin-babel';
import { defineConfig } from 'vitest/config';

const config = defineConfig({
  cacheDir: './tmp/vitest',
  plugins: [
    babel({
      presets: [
        defineRolldownBabelPreset({
          preset: () => ({
            plugins: [
              ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
            ],
          }),
          rolldown: { filter: { code: '@' } },
        }),
      ],
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    typecheck: {
      enabled: true,
      include: ['tests/**/*.{test,spec}-d.?(c|m)[jt]s?(x)'],
    },
    pool: 'forks',
    maxWorkers: 4,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: ['default', 'junit'],
    outputFile: { junit: './tmp/junit/junit.xml' },
    coverage: {
      provider: 'v8',
      include: ['dist/**/*.js'],
      reportsDirectory: './tmp/coverage',
      reporter: ['text', 'cobertura'],
    },
  },
});

export default config;
