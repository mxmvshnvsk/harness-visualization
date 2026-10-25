// Спрашивает вопрос в терминале: первый, если его не передали аргументом, и следующие —
// в диалоге одной сессии.

import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

export async function askQuestion(prompt = 'Ваш запрос: '): Promise<string> {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await terminal.question(prompt);
    return answer.trim();
  } finally {
    terminal.close();
  }
}
