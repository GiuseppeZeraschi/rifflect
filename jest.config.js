/**
 * Two Jest projects (tasks.md T005):
 * - node: pure logic (analysis engine, data layer on better-sqlite3, jobs, helpers). Fast, no RN.
 * - app:  React Native components, using the jest-expo preset.
 */
const moduleNameMapper = { '^@/(.*)$': '<rootDir>/src/$1' };

module.exports = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/tests/analysis/**/*.test.ts',
        '<rootDir>/tests/unit/**/*.test.ts',
        '<rootDir>/tests/helpers/**/*.test.ts',
      ],
      transform: { '^.+\\.[jt]sx?$': ['babel-jest', { configFile: './babel.config.js' }] },
      moduleNameMapper,
    },
    {
      displayName: 'app',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/tests/components/**/*.test.tsx'],
      moduleNameMapper,
    },
  ],
};
