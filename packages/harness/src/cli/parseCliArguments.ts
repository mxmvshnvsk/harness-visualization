// Разбирает аргументы командной строки:
//   pnpm chat "Сколько дней отпуска положено?"
//   pnpm chat --verbose "вопрос"     — печатать и полные события в JSON

import { parseArgs } from 'node:util';

export interface CliOptions {
  // null — вопрос не передан, спросим его интерактивно.
  question: string | null;
  verbose: boolean;
}

export function parseCliArguments(argumentList: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argumentList,
    allowPositionals: true,
    options: {
      verbose: { type: 'boolean', default: false },
    },
  });
  const question = positionals.join(' ').trim();
  return {
    question: question === '' ? null : question,
    verbose: values.verbose,
  };
}
