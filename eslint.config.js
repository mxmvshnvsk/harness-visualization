// Конфигурация ESLint для всего монорепозитория.
// Форматирование (отступы, точки с запятой, кавычки) делает Prettier,
// а ESLint проверяет читаемость и корректность кода.

import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typeScriptRules = {
  // Понятные имена: переменные и функции в camelCase, типы в PascalCase,
  // константы можно писать в UPPER_CASE.
  '@typescript-eslint/naming-convention': [
    'error',
    { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
    {
      selector: 'variable',
      modifiers: ['const'],
      format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
    },
    { selector: 'function', format: ['camelCase', 'PascalCase'] },
    { selector: 'typeLike', format: ['PascalCase'] },
    { selector: 'enumMember', format: ['PascalCase'] },
    // Поля внешних API приходят в snake_case (finish_reason, tool_calls).
    { selector: 'typeProperty', format: ['camelCase', 'snake_case'] },
    // Ключи в литералах объектов не проверяем: это HTTP-заголовки, JSON-поля
    // и таблицы по типам событий (session_started: ...).
    { selector: ['objectLiteralProperty', 'objectLiteralMethod'], format: null },
    { selector: 'import', format: null },
  ],
  '@typescript-eslint/explicit-module-boundary-types': 'error',
  '@typescript-eslint/consistent-type-imports': 'error',
};

const readabilityRules = {
  // Фигурные скобки обязательны, однострочных if и for нет.
  curly: ['error', 'all'],
  eqeqeq: ['error', 'always'],
  // Без трюков: битовых операций и неявных преобразований вроде ~index или !!value.
  'no-bitwise': 'error',
  'no-implicit-coercion': 'error',
  'no-nested-ternary': 'error',
  // Без однобуквенных имён, кроме координат.
  'id-length': ['error', { min: 2, exceptions: ['x', 'y'] }],
  'prefer-const': 'error',
  'no-var': 'error',
  // Подсказки, что функцию пора разбить на части.
  'max-depth': ['warn', 3],
  'max-params': ['warn', 4],
  complexity: ['warn', 10],
  'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
};

export default defineConfig([
  globalIgnores(['**/dist/**', '**/coverage/**', '**/node_modules/**']),

  eslint.configs.recommended,

  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: typeScriptRules,
  },

  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Отключает правила, которые спорят с Prettier. Должен идти после остальных наборов.
  prettierConfig,

  // Правило curly отключается в prettierConfig, поэтому включаем его заново после него.
  {
    rules: readabilityRules,
  },
]);
