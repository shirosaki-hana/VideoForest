import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'eslint/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/prisma/migrations/**',
      '**/src/generated/**'
    ],
  },
  // Base recommended configs
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Backend TypeScript rules
  {
    files: ['backend/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      parser: tseslint.parser,
      parserOptions: { tsconfigRootDir: __dirname },
      globals: { ...globals.node, ...globals.es2022 },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-process-exit': 'error',
      'no-sync': 'warn',
    },
  },
  // Backend JavaScript rules
  {
    files: ['backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-process-exit': 'error',
      'no-sync': 'warn',
    },
  },
  // Frontend TypeScript / TSX rules
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      parser: tseslint.parser,
      parserOptions: { tsconfigRootDir: __dirname },
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@mui/material',
              message:
                'Import individual components for better tree shaking. Example: import Button from "@mui/material/Button"',
            },
            {
              name: '@mui/icons-material',
              message:
                'Import individual icons for better tree shaking. Example: import MenuIcon from "@mui/icons-material/Menu"',
            },
          ],
        },
      ],
    },
  }
]);


