// Разбирает аргументы командной строки:
//   pnpm chat "Сколько дней отпуска положено?"
//   pnpm chat --effort off "вопрос"   — уровень рассуждений: off, low, high, max
//   pnpm chat --verbose "вопрос"      — печатать и полные события в JSON

import { parseArgs } from 'node:util';
import { REASONING_EFFORTS, type ReasoningEffort } from '../model/chatTypes.js';

export interface CliOptions {
  // null — вопрос не передан, спросим его интерактивно.
  question: string | null;
  // null — флаг не передан, берём уровень из harness.config.json.
  reasoningEffort: ReasoningEffort | null;
  verbose: boolean;
}

export function parseCliArguments(argumentList: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argumentList,
    allowPositionals: true,
    options: {
      effort: { type: 'string' },
      verbose: { type: 'boolean', default: false },
    },
  });
  const question = positionals.join(' ').trim();
  return {
    question: question === '' ? null : question,
    reasoningEffort: values.effort === undefined ? null : parseReasoningEffort(values.effort),
    verbose: values.verbose,
  };
}

function parseReasoningEffort(value: string): ReasoningEffort {
  const matchingEffort = REASONING_EFFORTS.find((effort) => effort === value);
  if (matchingEffort === undefined) {
    throw new Error(
      `Неизвестный уровень рассуждений «${value}». Допустимые: ${REASONING_EFFORTS.join(', ')}.`,
    );
  }
  return matchingEffort;
}
