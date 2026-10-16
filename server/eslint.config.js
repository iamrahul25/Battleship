import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // shared/ is bundled into the app too: no Node APIs, Colyseus, or React allowed.
    files: ['src/shared/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'shared/ must not use Node APIs.' },
            { group: ['@colyseus/*', 'colyseus*'], message: 'shared/ must not depend on Colyseus.' },
            { group: ['react', 'react-native', 'react-*', 'expo*'], message: 'shared/ must not depend on React.' },
            { group: ['express', 'pino*', 'dotenv', 'fs', 'path', 'http', 'crypto', 'os'], message: 'shared/ must stay platform-agnostic.' },
            { group: ['../../*', '!../../shared/*'], message: 'shared/ must not import server code.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'process', 'require', 'Buffer', '__dirname'],
    },
  },
);
