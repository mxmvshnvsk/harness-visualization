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

export interface PromptBreakdown {
  // Системные сообщения: system prompt и инструкции MCP-серверов.
  system: number;
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
}

// Оценка по телу запроса — тому, что действительно уходит модели (wire format провайдера).
export function estimatePromptBudget(
  body: Record<string, unknown>,
  settings: BudgetSettings,
): PromptBudget {
  const messages = Array.isArray(body.messages) ? (body.messages as WireMessage[]) : [];
  const chars = { system: 0, tools: jsonLength(body.tools ?? []), dialog: 0, toolResults: 0 };
  for (const message of messages) {
    chars[partOf(message.role)] += jsonLength(message);
  }
  const toTokens = (count: number): number => Math.round(count / settings.charsPerToken);
  const estimate = {
    system: toTokens(chars.system),
    tools: toTokens(chars.tools),
    dialog: toTokens(chars.dialog),
    toolResults: toTokens(chars.toolResults),
    total: toTokens(chars.system + chars.tools + chars.dialog + chars.toolResults),
  };
  return {
    preset: settings.preset,
    limitTokens: settings.limitTokens,
    thresholdTokens: Math.round((settings.limitTokens * settings.thresholdPercent) / 100),
    charsPerToken: settings.charsPerToken,
    estimate,
  };
}

function partOf(role: unknown): 'system' | 'dialog' | 'toolResults' {
  if (role === 'system') {
    return 'system';
  }
  return role === 'tool' ? 'toolResults' : 'dialog';
}

function jsonLength(value: unknown): number {
  return JSON.stringify(value).length;
}
