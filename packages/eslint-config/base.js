const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', '**/.turbo/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-interface': 'off',
    },
  },
);
