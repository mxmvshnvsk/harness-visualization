// Системный промпт: базовые правила, инструкции MCP-серверов, скиллы и память (этап 6b), дата.
// Порядок — от постоянного к меняющемуся: кэш prompt совпадает по общему началу, а memo.md
// меняется чаще каталога скиллов.

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
  // Раздел памяти: как с ней работать и memo.md на начало сессии (memory/memoryPrompt.ts).
  memory: string[];
}

// Сессия без демо-проекта: ничего о «Кедр Софт» и о правилах проекта — только песочница, веб
// и дата. Так видно, как модель ведёт себя сама, без нашей установки.
const BLANK_INSTRUCTIONS = [
  'Ты — ассистент. Отвечай на языке пользователя.',
  'У тебя есть рабочая папка — песочница этой сессии, в начале она пустая. Файлы в ней можно читать и создавать тулами.',
];

// Про веб — только то, что есть: веб-поиск выключен без ключа, и звать его модели незачем.
export function buildBlankSystemPrompt(now: Date, toolNames: readonly string[]): string {
  const web = [
    ...(toolNames.includes('web_search') ? ['Для сведений из интернета есть web_search.'] : []),
    ...(toolNames.includes('fetch_url') ? ['Прочитать страницу по адресу — fetch_url.'] : []),
  ];
  return [...BLANK_INSTRUCTIONS, ...web, describeToday(now)].join('\n');
}

export function buildSystemPrompt(now: Date, parts: SystemPromptParts): string {
  return [
    ...BASE_INSTRUCTIONS,
    ...describeMcpInstructions(parts.mcpInstructions),
    ...parts.skills,
    ...parts.memory,
    describeToday(now),
  ].join('\n');
}

// Инструкции пишет автор сервера, а не пользователь, — модель должна это видеть.
// Харнесс вставляет их в системный промпт, то есть доверяет им почти как своим.
export function describeMcpInstructions(mcpInstructions: McpServerInstructions[]): string[] {
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

export function describeToday(now: Date): string {
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
