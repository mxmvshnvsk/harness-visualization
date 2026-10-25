// Спрашивает в терминале разрешение на действие агента.
// Если терминала нет (например, вывод перенаправлен в файл), спросить некого —
// действие запрещается: молчание не считается согласием.

import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { styleText } from 'node:util';
import type { ConfirmationRequest, PermissionAnswer } from '../agent/agentDependencies.js';

const YES_ANSWERS = ['y', 'yes', 'д', 'да'];

export async function askConfirmation(request: ConfirmationRequest): Promise<PermissionAnswer> {
  if (!stdin.isTTY) {
    console.log(styleText('magenta', 'Нет терминала для вопроса — действие запрещено.'));
    return { approved: false, answeredBy: 'noOneToAsk' };
  }
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const question = styleText(
      'magenta',
      `Агент хочет: ${request.actionDescription} (тул ${request.toolName}). Разрешить? [y/N] `,
    );
    const answer = await terminal.question(question);
    return {
      approved: YES_ANSWERS.includes(answer.trim().toLocaleLowerCase()),
      answeredBy: 'user',
    };
  } finally {
    terminal.close();
  }
}
