// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.expo/**',
      'modules/*/nitrogen/**',
      'modules/*/lib/**',
      'src/data/db/migrations/**',
    ],
  },
  {
    // The analysis engine must stay pure TypeScript so it runs in Jest/Node (research R5).
    files: ['src/analysis/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react-native', 'react-native/*', 'react-native-*'], message: 'src/analysis must not import React Native.' },
            { group: ['expo', 'expo-*', 'expo/*'], message: 'src/analysis must not import Expo modules.' },
            { group: ['@/native/*', '@/data/*', '@/capture/*', '@/jobs/*', '@/features/*', '@/ui/*'], message: 'src/analysis must not depend on app layers.' },
          ],
        },
      ],
    },
  },
]);
