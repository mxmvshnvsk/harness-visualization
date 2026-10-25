// Загружает настройки харнесса: harness.config.json, .env и ключ модели.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveSecret } from './resolveSecret.js';
import { harnessSettingsSchema, type HarnessSettings } from './settingsSchema.js';

const CONFIG_FILE_NAME = 'harness.config.json';
const ENV_FILE_NAME = '.env';

export interface LoadedSettings {
  settings: HarnessSettings;
  // Ключ держим отдельно от настроек, чтобы настройки можно было
  // спокойно показывать и записывать в трейс.
  modelApiKey: string;
}

export async function loadSettings(projectRoot: string): Promise<LoadedSettings> {
  const settings = await readConfigFile(projectRoot);
  loadEnvFileIfPresent(projectRoot);
  const modelApiKey = await readModelApiKey(settings.model.apiKeyVariable);
  return { settings, modelApiKey };
}

// Только harness.config.json, без .env и ключа модели: команде check-grounding ключ не нужен.
export async function readConfigFile(projectRoot: string): Promise<HarnessSettings> {
  const configPath = join(projectRoot, CONFIG_FILE_NAME);
  const fileText = await readFile(configPath, 'utf8');
  const parsedJson: unknown = JSON.parse(fileText);
  const validation = harnessSettingsSchema.safeParse(parsedJson);
  if (!validation.success) {
    throw new Error(`Ошибка в ${CONFIG_FILE_NAME}:\n${validation.error.message}`);
  }
  return validation.data;
}

function loadEnvFileIfPresent(projectRoot: string): void {
  const envPath = join(projectRoot, ENV_FILE_NAME);
  if (existsSync(envPath)) {
    // Встроенная функция Node: переменные из файла попадают в process.env,
    // уже заданные переменные окружения не перезаписываются.
    process.loadEnvFile(envPath);
  }
}

// Читает необязательный секрет из окружения (после loadSettings в нём уже есть .env).
// null — переменная не задана: например, у пользователя нет ключа этого поисковика.
export async function readOptionalSecret(variableName: string): Promise<string | null> {
  const rawValue = process.env[variableName];
  if (rawValue === undefined || rawValue.trim() === '') {
    return null;
  }
  return resolveSecret(rawValue.trim());
}

async function readModelApiKey(variableName: string): Promise<string> {
  const rawValue = process.env[variableName];
  if (rawValue === undefined || rawValue.trim() === '') {
    throw new Error(
      `Не найден ключ модели: переменная ${variableName} пуста. ` +
        `Скопируйте .env.example в .env и заполните ${variableName}.`,
    );
  }
  return resolveSecret(rawValue.trim());
}
