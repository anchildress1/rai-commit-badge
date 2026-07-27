import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'coverage/', 'reports/', '**/CHANGELOG.md'] },
  eslint.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  prettierConfig,
];
