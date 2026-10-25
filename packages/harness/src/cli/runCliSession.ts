// Сессия из терминала: события печатаются в консоль, разрешение спрашивается в терминале.
// Сама сессия — startSession в ядре харнесса; здесь только то, что относится к CLI.
// Тихий режим — для pnpm compare-runs: без консоли, а действия, требующие разрешения,
// запрещаются — спросить некого.

import type { PermissionAnswer } from '../agent/agentDependencies.js';
import { stdin } from 'node:process';
import { askConfirmation } from './askConfirmation.js';
import { askQuestion } from './askQuestion.js';
import { createConsolePrinter } from '../events/createConsolePrinter.js';
import { startSession, type SessionInput, type SessionResult } from '../session/startSession.js';

export interface CliSessionInput extends SessionInput {
  verbose: boolean;
  quiet: boolean;
}

export type CliSessionResult = SessionResult;

export async function runCliSession(input: CliSessionInput): Promise<CliSessionResult> {
  const session = await startSession(input, {
    confirmAction: input.quiet ? denyWithoutAsking : askConfirmation,
    listeners: input.quiet ? [] : [createConsolePrinter({ verbose: input.verbose })],
    log: input.quiet ? ignoreMessage : printMessage,
    // Диалог — только когда есть кого спросить: тихий режим и запуск без терминала — один вопрос.
    ...(input.quiet || !stdin.isTTY ? {} : { nextQuestion: askNextQuestion }),
  });
  const result = await session.completion;
  if (!input.quiet) {
    console.log(`Трейс сессии: ${result.tracePath}`);
  }
  return result;
}

// Пустая строка — закончить диалог.
async function askNextQuestion(): Promise<string | null> {
  const answer = await askQuestion('\nСледующий вопрос (Enter — закончить): ');
  return answer === '' ? null : answer;
}

// В тихой сессии спросить некого, а молчание — не согласие.
function denyWithoutAsking(): Promise<PermissionAnswer> {
  return Promise.resolve({ approved: false, answeredBy: 'noOneToAsk' });
}

function printMessage(message: string): void {
  console.log(message);
}

// В тихой сессии служебные сообщения не нужны: у команды, которая её запустила, свой вывод.
function ignoreMessage(): void {
  return undefined;
}
