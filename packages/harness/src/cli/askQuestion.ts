// Спрашивает вопрос в терминале, если его не передали аргументом.

import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

export async function askQuestion(): Promise<string> {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await terminal.question('Ваш запрос: ');
    return answer.trim();
  } finally {
    terminal.close();
  }
}
