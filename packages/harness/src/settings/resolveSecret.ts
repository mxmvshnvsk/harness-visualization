// Превращает значение из .env в настоящий секрет.
// Поддерживаются два варианта:
//   DEEPSEEK_API_KEY=sk-...                         — ключ прямо в файле;
//   DEEPSEEK_API_KEY=keychain:harness-deepseek      — ключ в связке ключей macOS.
// Второй вариант надёжнее: открытого ключа на диске нет вообще.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const KEYCHAIN_PREFIX = 'keychain:';

const runCommand = promisify(execFile);

export async function resolveSecret(rawValue: string): Promise<string> {
  if (!rawValue.startsWith(KEYCHAIN_PREFIX)) {
    return rawValue;
  }
  const serviceName = rawValue.slice(KEYCHAIN_PREFIX.length);
  return readFromMacKeychain(serviceName);
}

async function readFromMacKeychain(serviceName: string): Promise<string> {
  if (process.platform !== 'darwin') {
    throw new Error(
      `Ссылка keychain:${serviceName} работает только на macOS. На этой системе положите ключ прямо в .env.`,
    );
  }
  try {
    const { stdout } = await runCommand('security', [
      'find-generic-password',
      '-s',
      serviceName,
      '-w',
    ]);
    return stdout.trim();
  } catch {
    throw new Error(
      `Не удалось прочитать ключ «${serviceName}» из связки ключей. ` +
        `Добавить его можно так: security add-generic-password -s ${serviceName} -a "$USER" -w`,
    );
  }
}
