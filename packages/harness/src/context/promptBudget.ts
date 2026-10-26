// Бюджет prompt (этап 6.2): сколько занимает запрос к модели по частям и сколько ему отведено.
//
// Провайдер возвращает только итог (usage.inputTokens) — и то после ответа. Разбивку харнесс
// оценивает сам и до отправки: делит число символов на коэффициент. Это оценка (≈), а не счёт:
// настоящий токенизатор DeepSeek режет текст на куски по словарю, и на русском, английском и
// JSON у него разное число символов на токен. Эталон — офлайн-токенизатор DeepSeek
// (https://api-docs.deepseek.com/quick_start/token_usage).
//
// Коэффициент подобран по трейсам автора (25.10.2026): 282 запроса, у каждого точный
// inputTokens; символы — JSON сообщений и тулов, как они уходят в теле запроса. 3,24 символа
// на токен, медианная погрешность 2,6 %, худшая 18,5 %. Отдельные коэффициенты для кириллицы
// и остального точнее не стали — оставили один, его проще объяснить.

import { MEMORY_TOOLS, markedCharacters, SKILL_TOOLS } from './promptMarkers.js';

export interface PromptBreakdown {
  // Системные сообщения: system prompt и инструкции MCP-серверов — без скиллов и памяти.
  system: number;
  // Скиллы (этап 6b): каталог и инструкции в system prompt, результаты load_skill и
  // read_skill_file, инструкция по команде «/имя». Нет — трейс до этапа 6b.
  skills?: number;
  // Память (этап 6b): раздел памяти с memo.md и результаты тула memory.
  memory?: number;
  // Описания тулов — «налог» на каждый запрос.
  tools: number;
  // Вопросы пользователя и ответы модели, вместе с просьбами вызвать тулы.
  dialog: number;
  // Результаты тулов — сообщения с ролью tool.
  toolResults: number;
  total: number;
}

export interface PromptBudget {
  // Выбранный пресет лимита и сам лимит, в токенах.
  preset: string;
  limitTokens: number;
  // С какого размера харнесс начнёт освобождать место (этапы 6.4–6.5); пока только показ.
  thresholdTokens: number;
  // Коэффициент оценки: символов на токен.
  charsPerToken: number;
  // Оценка по частям, в токенах (≈).
  estimate: PromptBreakdown;
  // Бюджет восстановлен по чужой записи (адаптер, этап 9.4): тела запроса в ней нет. Видимая
  // часть — оценка по истории, hiddenTokens — остаток до настоящего input из usage: system prompt
  // и описания тулов чужого харнесса, по отдельности их не разделить. Лимита в записи нет — 0.
  reconstructed?: { hiddenTokens: number };
}

export interface BudgetSettings {
  preset: string;
  limitTokens: number;
  // Сколько токенов может занять один результат тула; больше — обрезка (этап 6.3).
  toolResultMaxTokens: number;
  thresholdPercent: number;
  // До какой доли лимита чистить старые результаты тулов (этап 6.4).
  clearTargetPercent: number;
  charsPerToken: number;
}

interface WireMessage {
  role?: unknown;
  content?: unknown;
  tool_call_id?: unknown;
  tool_calls?: unknown;
}

type Part = 'system' | 'skills' | 'memory' | 'tools' | 'dialog' | 'toolResults';

// Оценка по телу запроса — тому, что действительно уходит модели (wire format провайдера).
export function estimatePromptBudget(
  body: Record<string, unknown>,
  settings: BudgetSettings,
): PromptBudget {
  const chars = countCharacters(body);
  const toTokens = (count: number): number => Math.round(count / settings.charsPerToken);
  const total = Object.values(chars).reduce((sum, count) => sum + count, 0);
  const estimate = {
    system: toTokens(chars.system),
    skills: toTokens(chars.skills),
    memory: toTokens(chars.memory),
    tools: toTokens(chars.tools),
    dialog: toTokens(chars.dialog),
    toolResults: toTokens(chars.toolResults),
    total: toTokens(total),
  };
  return {
    preset: settings.preset,
    limitTokens: settings.limitTokens,
    thresholdTokens: Math.round((settings.limitTokens * settings.thresholdPercent) / 100),
    charsPerToken: settings.charsPerToken,
    estimate,
  };
}

// Символы JSON по частям. Сообщение целиком — в свою часть по роли; результаты тулов скиллов
// и памяти — в skills и memory; из текста сообщения куски скиллов и памяти (по пометкам
// харнесса) переходят в свои части — пропорционально их доле в тексте.
function countCharacters(body: Record<string, unknown>): Record<Part, number> {
  const messages = Array.isArray(body.messages) ? (body.messages as WireMessage[]) : [];
  const chars: Record<Part, number> = {
    system: 0,
    skills: 0,
    memory: 0,
    tools: jsonLength(body.tools ?? []),
    dialog: 0,
    toolResults: 0,
  };
  const toolNames = toolNamesById(messages);
  for (const message of messages) {
    const length = jsonLength(message);
    const part = partOf(message, toolNames);
    const text = typeof message.content === 'string' ? message.content : '';
    const marked = part === 'skills' || part === 'memory' ? null : markedCharacters(text);
    if (marked === null || text.length === 0) {
      chars[part] += length;
      continue;
    }
    const skills = Math.round((length * marked.skills) / text.length);
    const memory = Math.round((length * marked.memory) / text.length);
    chars.skills += skills;
    chars.memory += memory;
    chars[part] += length - skills - memory;
  }
  return chars;
}

// id вызова → имя тула: по нему результат load_skill или memory относится к своей части.
function toolNamesById(messages: readonly WireMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    const calls = Array.isArray(message.tool_calls) ? (message.tool_calls as unknown[]) : [];
    for (const call of calls) {
      const record = call as { id?: unknown; function?: { name?: unknown } };
      if (typeof record.id === 'string' && typeof record.function?.name === 'string') {
        names.set(record.id, record.function.name);
      }
    }
  }
  return names;
}

function partOf(message: WireMessage, toolNames: ReadonlyMap<string, string>): Part {
  if (message.role === 'system') {
    return 'system';
  }
  if (message.role !== 'tool') {
    return 'dialog';
  }
  const name =
    typeof message.tool_call_id === 'string' ? toolNames.get(message.tool_call_id) : undefined;
  if (name !== undefined && SKILL_TOOLS.has(name)) {
    return 'skills';
  }
  return name !== undefined && MEMORY_TOOLS.has(name) ? 'memory' : 'toolResults';
}

function jsonLength(value: unknown): number {
  return JSON.stringify(value).length;
}
