// Системный промпт: базовые правила, инструкции MCP-серверов, скиллы (этап 6b) и дата.
// Память (memo.md) добавится на следующем шаге этапа 6b.

// Инструкции, которые MCP-сервер прислал при рукопожатии.
export interface McpServerInstructions {
  serverName: string;
  text: string;
}

const BASE_INSTRUCTIONS = [
  'Ты — ассистент учебного проекта Harness Visualization.',
  'Отвечай кратко и по делу, на языке пользователя.',
  'У тебя есть рабочая папка с документами компании «Кедр Софт».',
  'Пути к файлам указывай относительно корня рабочей папки.',
  'Если для ответа нужны данные из файлов, найди и прочитай их тулами — не придумывай содержимое.',
  'Для сведений из интернета используй web_search, а чтобы прочитать страницу — fetch_url.',
  'Указывай, откуда взяты сведения: путь к файлу или адрес страницы.',
];

// Модель не знает, какое сегодня число: её знания заканчиваются датой обучения.
// Без даты свежие сведения из интернета кажутся ей «будущим» или подделкой.
//
// Дата — с точностью до дня и в самом конце промпта. Кэш промпта работает по общему
// началу запроса: дата меняется раз в сутки, а всё, что выше неё, остаётся в кэше.
// Время с минутами сломало бы кэш в каждом запросе.
export interface SystemPromptParts {
  mcpInstructions: McpServerInstructions[];
  // Раздел скиллов: каталог и инструкции always (skills/skillPrompt.ts).
  skills: string[];
}

export function buildSystemPrompt(now: Date, parts: SystemPromptParts): string {
  return [
    ...BASE_INSTRUCTIONS,
    ...describeMcpInstructions(parts.mcpInstructions),
    ...parts.skills,
    describeToday(now),
  ].join('\n');
}

// Инструкции пишет автор сервера, а не пользователь, — модель должна это видеть.
// Харнесс вставляет их в системный промпт, то есть доверяет им почти как своим.
function describeMcpInstructions(mcpInstructions: McpServerInstructions[]): string[] {
  if (mcpInstructions.length === 0) {
    return [];
  }
  return [
    '',
    'Инструкции MCP-серверов (их написали авторы серверов):',
    ...mcpInstructions.map((instructions) => `[${instructions.serverName}] ${instructions.text}`),
    '',
  ];
}

function describeToday(now: Date): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const humanDate = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  return `Сегодня ${humanDate} (${formatIsoDate(now)}), часовой пояс ${timeZone}.`;
}

// Дата в формате 2026-10-24 по местному времени — однозначна для модели на любом языке.
function formatIsoDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
