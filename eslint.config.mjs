import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Flat ESLint config for the whole workspace.
 *
 * Type-aware linting is deliberately not enabled: `npm run typecheck` already
 * runs the full compiler over every package, so duplicating that work here
 * would only make linting slow without catching anything new. These rules
 * target the things the compiler does not check.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      'frontend/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'warn',
    },
  },

  // Browser code. The hooks rules matter here: a wrong dependency array is
  // how a polling dashboard ends up with a stale closure or a leaked interval.
  {
    files: ['frontend/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Build and tooling config files run in Node, not the browser.
  {
    files: ['**/*.{mjs,cjs,js}', '*.config.ts', '**/*.config.{ts,mts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // The seed script is a CLI: printing progress is the point.
  {
    files: ['prisma/seed.ts'],
    rules: { 'no-console': 'off' },
  },

  // Tests may assert on loosely typed fixtures.
  {
    files: ['backend/tests/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
