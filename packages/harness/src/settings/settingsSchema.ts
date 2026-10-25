// Схема файла harness.config.json.
// Zod проверяет файл при запуске и сразу даёт TypeScript-типы,
// поэтому ошибка в конфиге видна до первого запроса к модели.

import { z } from 'zod';
import { REASONING_EFFORTS } from '../model/chatTypes.js';
import { PERMISSION_DECISIONS, TOOL_EFFECTS } from '../permissions/permissionTypes.js';

const modelSettingsSchema = z.object({
  // Человекочитаемое имя провайдера — только для отображения.
  providerName: z.string().min(1),
  baseUrl: z.url(),
  model: z.string().min(1),
  // Имя переменной окружения, в которой лежит ключ (или ссылка keychain:...).
  apiKeyVariable: z.string().min(1),
  requestTimeoutMs: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  // Как провайдер управляет рассуждениями: deepseek — параметры thinking и reasoning_effort,
  // none — провайдер не умеет регулировать рассуждения, уровень effort не передаётся.
  reasoningStyle: z.enum(['deepseek', 'none']).default('none'),
  defaultReasoningEffort: z.enum(REASONING_EFFORTS).default('high'),
  // Поля, которые понимает только конкретный провайдер.
  // Добавляются в тело запроса как есть.
  requestExtras: z.record(z.string(), z.unknown()).default({}),
});

const weekdaySchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

const hourRangeSchema = z.object({
  // Начало включительно, конец не включительно: { fromHour: 1, toHour: 4 } — это 01:00–03:59.
  fromHour: z.number().int().min(0).max(23),
  toHour: z.number().int().min(1).max(24),
});

const tariffScheduleSchema = z.object({
  weekdaysUtc: z.array(weekdaySchema).min(1),
  hoursUtc: z.array(hourRangeSchema).min(1),
});

const tariffSchema = z.object({
  name: z.string().min(1),
  inputCacheHitPerMillion: z.number().nonnegative(),
  inputCacheMissPerMillion: z.number().nonnegative(),
  outputPerMillion: z.number().nonnegative(),
  // Тариф без расписания действует всё остальное время.
  schedule: tariffScheduleSchema.optional(),
});

const modelPricesSchema = z.object({
  currency: z.string().min(1),
  // Цены меняются, поэтому храним, когда и где их проверили.
  checkedAt: z.string().min(1),
  source: z.url(),
  tariffs: z.array(tariffSchema).min(1),
});

const tracesSettingsSchema = z.object({
  directory: z.string().min(1),
});

const agentSettingsSchema = z.object({
  // Сколько раз подряд агент может обратиться к модели за один ход.
  // Защищает от бесконечного цикла, если модель зациклится на тулах.
  maxIterations: z.number().int().positive().default(10),
});

// Контекст (этап 6): сколько харнесс отводит prompt. Лимит задаёт харнесс, а не провайдер —
// чтобы обрезка и компакция были видны на коротких учебных сессиях.
const contextSettingsSchema = z.object({
  preset: z.enum(['demo', 'stress', 'real']).default('demo'),
  // Лимиты пресетов, в токенах: demo — компакция на 3–4-м вопросе диалога, stress — обрезка уже
  // на первом вопросе с поиском, real — окно модели (deepseek-flash — 1M токенов по странице
  // цен DeepSeek, проверено 25.10.2026). Числа — по трейсам автора, docs/plan.md, этап 6.
  limits: z
    .object({
      demo: z.number().int().positive(),
      stress: z.number().int().positive(),
      real: z.number().int().positive(),
    })
    .default({ demo: 12000, stress: 6000, real: 1000000 }),
  // Сколько токенов может занять один результат тула (этап 6.3); больше — харнесс обрезает.
  // demo: поиск hybrid_search отдаёт до ~2 000 токенов — его и обрежет; stress — почти любой
  // поиск; real — только огромные страницы.
  toolResultLimits: z
    .object({
      demo: z.number().int().positive(),
      stress: z.number().int().positive(),
      real: z.number().int().positive(),
    })
    .default({ demo: 1500, stress: 800, real: 25000 }),
  // Порог — доля лимита, с которой харнесс начнёт освобождать место (этапы 6.4–6.5).
  thresholdPercent: z.number().min(10).max(100).default(80),
  // До какой доли лимита чистить старые результаты тулов, если порог пройден (этап 6.4):
  // сразу пачкой, чтобы кэш prompt ломался реже.
  clearTargetPercent: z.number().min(5).max(100).default(60),
  // Модель для компакции истории (этап 6.5); null — та же, что у агента.
  compactionModel: z.string().min(1).nullable().default(null),
  // Символов на токен в оценке разбивки (context/promptBudget.ts): подобрано по трейсам.
  charsPerToken: z.number().positive().default(3.24),
});

const workspaceSettingsSchema = z.object({
  // Песочница, в которой работают файловые тулы.
  directory: z.string().min(1),
  // Откуда взять файлы, если песочницы ещё нет.
  seedDirectory: z.string().min(1),
});

const webFetchSettingsSchema = z.object({
  requestTimeoutMs: z.number().int().positive(),
  // Больше этого страницу не скачиваем: огромные страницы не нужны модели и съедают память.
  maxDownloadBytes: z.number().int().positive(),
  // Столько символов текста страницы получит модель, остальное обрезается.
  maxCharacters: z.number().int().positive(),
  maxRedirects: z.number().int().min(0),
  // false — адреса локальной сети и localhost запрещены,
  // чтобы модель не добралась до сервисов на вашем компьютере и в вашей сети.
  allowPrivateNetwork: z.boolean(),
});

// Названия поисковых провайдеров, которые умеет харнесс.
export const SEARCH_PROVIDER_NAMES = ['tavily', 'yandex'] as const;

const tavilySettingsSchema = z.object({
  baseUrl: z.url(),
  // Имя переменной окружения с ключом. Если переменная пуста, провайдер недоступен.
  apiKeyVariable: z.string().min(1),
  requestTimeoutMs: z.number().int().positive(),
  // basic — 1 кредит Tavily за запрос, advanced — 2.
  searchDepth: z.enum(['basic', 'advanced', 'fast', 'ultra-fast']),
});

const yandexSearchPricesSchema = z.object({
  currency: z.string().min(1),
  // Цена за 1000 синхронных запросов: днём и ночью (00:00–08:00 по Москве).
  synchronousDayPerThousand: z.number().nonnegative(),
  synchronousNightPerThousand: z.number().nonnegative(),
  checkedAt: z.string().min(1),
  source: z.url(),
});

const yandexSearchSettingsSchema = z.object({
  baseUrl: z.url(),
  apiKeyVariable: z.string().min(1),
  // Каталог Yandex Cloud у каждого свой, поэтому его ID тоже берётся из .env.
  folderIdVariable: z.string().min(1),
  requestTimeoutMs: z.number().int().positive(),
  // Сегмент поиска: SEARCH_TYPE_RU — русскоязычный, SEARCH_TYPE_COM — международный.
  searchType: z.string().min(1),
  // Сколько фрагментов текста страницы вернуть для каждого результата (1–5).
  maxPassages: z.number().int().min(1).max(5),
  prices: yandexSearchPricesSchema,
});

const searchSettingsSchema = z.object({
  // Какой провайдер использовать по умолчанию; для одного запуска меняется флагом --search.
  provider: z.enum(SEARCH_PROVIDER_NAMES),
  defaultMaxResults: z.number().int().min(1).max(20),
  tavily: tavilySettingsSchema.optional(),
  yandex: yandexSearchSettingsSchema.optional(),
});

const permissionDecisionSchema = z.enum(PERMISSION_DECISIONS);

// Правило по аргументам: срабатывает, если выполнены все заданные условия.
const permissionRuleSchema = z.object({
  // Человекочитаемое описание — его видно в трейсе и в вопросе пользователю.
  description: z.string().min(1),
  tool: z.string().min(1).optional(),
  effect: z.enum(TOOL_EFFECTS).optional(),
  // Шаблон пути в песочнице: regulations/**, notes/*.md.
  pathPattern: z.string().min(1).optional(),
  // Шаблон адреса сайта: example.com, *.example.com.
  hostPattern: z.string().min(1).optional(),
  decision: permissionDecisionSchema,
});

const permissionsSchema = z.object({
  // Для тулов, которые не объявили, что делают (например, тулы чужого MCP-сервера).
  defaultDecision: permissionDecisionSchema,
  // Решение для каждого класса действий.
  effects: z.object({
    read: permissionDecisionSchema,
    write: permissionDecisionSchema,
    delete: permissionDecisionSchema,
    network: permissionDecisionSchema,
    // Поручить задачу субагенту (этап 6c). В конфигах до 6c этого класса нет — allow.
    delegate: permissionDecisionSchema.default('allow'),
  }),
  // Решения для конкретных тулов — важнее классов действий.
  tools: z.record(z.string(), permissionDecisionSchema).default({}),
  // Правила по аргументам — важнее всего; проверяются по порядку.
  rules: z.array(permissionRuleSchema).default([]),
});

// Имя сервера становится префиксом его тулов: kedr → kedr__search.
const MCP_SERVER_NAME_PATTERN = /^[a-z][a-z0-9]*$/;

const mcpServerSettingsSchema = z.object({
  name: z.string().regex(MCP_SERVER_NAME_PATTERN, 'только строчные латинские буквы и цифры'),
  description: z.string().min(1),
  enabled: z.boolean().default(true),
  // Команда запуска сервера. node — тот же Node.js, на котором работает харнесс.
  command: z.string().min(1),
  // Аргументы команды. Сервер запускается в корне проекта, пути — относительно него.
  args: z.array(z.string()).default([]),
  // Какие переменные окружения передать серверу, кроме базовых (PATH, HOME и т. п.).
  // Остальные сервер не увидит: ключи харнесса ему знать незачем.
  environmentVariables: z.array(z.string().min(1)).default([]),
  // Верить ли пометкам тулов сервера (readOnlyHint и другие). Пометки пишет автор сервера:
  // своему серверу можно верить, чужому — нет. false — тулы сервера получают defaultDecision.
  trustAnnotations: z.boolean().default(false),
  // Тулы сервера (имена на сервере, без префикса), которые харнесс не предлагает модели.
  // Харнесс может вызывать их сам — например, для поиска до запроса (retrieval.toolName).
  // Так экспонат не меняет стенд: у модели тот же список тулов и те же описания.
  hiddenTools: z.array(z.string().min(1)).default([]),
});

// Маршруты сети: какой запрос идёт через прокси, какой напрямую.
// Нужно, потому что сервисы доступны по-разному: один — только через VPN (прокси),
// другой через VPN, наоборот, недоступен. Решение принимается по адресу хоста.
export const NETWORK_ROUTES = ['proxy', 'direct'] as const;

const networkRouteSchema = z.enum(NETWORK_ROUTES);

const networkRuleSchema = z.object({
  // Человекочитаемое описание — видно в трейсе и в интерфейсе.
  description: z.string().min(1),
  // Шаблон адреса: api.tavily.com или *.yandex.net.
  hostPattern: z.string().min(1),
  route: networkRouteSchema,
});

const networkSettingsSchema = z.object({
  // Маршрут для хостов, под которые не подошло ни одно правило.
  // proxy означает «через прокси, если он задан в окружении, иначе напрямую».
  defaultRoute: networkRouteSchema.default('proxy'),
  // Правила по адресу, проверяются по порядку; первое подходящее решает.
  rules: z.array(networkRuleSchema).default([]),
});

// Как материал из базы знаний попадает к модели (этап 5.3):
//   tool — модель сама решает, искать ли, и вызывает тул поиска;
//   auto — харнесс до первого запроса к модели сам ищет словами пользователя
//          и кладёт найденное в контекст;
//   rewrite — то же, но запрос для поиска сначала формулирует модель по просьбе харнесса.
// Во всех режимах тулы поиска у модели остаются. Три режима — это урок «кто формулирует запрос».
export const RETRIEVAL_MODES = ['tool', 'auto', 'rewrite'] as const;

const retrievalSettingsSchema = z.object({
  mode: z.enum(RETRIEVAL_MODES).default('tool'),
  // Каким тулом ищет харнесс — имя для модели, с префиксом MCP-сервера.
  // Тул должен принимать аргументы query и limit, как semantic_search.
  toolName: z.string().min(1).default('kedr__semantic_search'),
  // Сколько фрагментов подмешать в контекст.
  limit: z.number().int().min(1).max(20).default(5),
});

// Скиллы (этап 6b): папка с папками скиллов от корня проекта. Режим по умолчанию — on_demand;
// always — инструкция в system prompt сразу, manual — только по команде «/имя» пользователя.
const skillsSettingsSchema = z.object({
  directory: z.string().min(1).default('skills'),
  always: z.array(z.string().min(1)).default([]),
  manual: z.array(z.string().min(1)).default([]),
});

// Сервер для браузера (pnpm serve, этап 7). Адрес не настраивается: сервер слушает только
// 127.0.0.1 — это локальный учебный стенд без авторизации, ключи модели остаются на нём.
const serverSettingsSchema = z.object({
  port: z.number().int().min(1).max(65535).default(4317),
  // Сколько ждать ответа браузера на запрос разрешения. Не ответили — действие запрещается:
  // молчание не согласие, а сессия не должна висеть вечно, если вкладку закрыли.
  permissionTimeoutSeconds: z.number().int().min(5).max(3600).default(120),
  // Сколько диалог ждёт следующего вопроса из браузера (этап 6.1). Не дождался — сессия
  // заканчивается и дописывает трейс.
  questionTimeoutSeconds: z.number().int().min(30).max(86400).default(900),
});

// Проверка опоры ответа (pnpm check-grounding, этап 5b).
const groundingSettingsSchema = z.object({
  // С какого сходства claim и строки увиденного подсвечивать пару как «про то же». Порог
  // приблизительный: у модели e5 сходство сжато — выдуманные claims дают около 0.84–0.86,
  // связанные с источником — 0.87–0.95, причём и верные, и противоречащие. Поэтому отчёт
  // всегда показывает само число, а порог только подсвечивает.
  similarityThreshold: z.number().min(0).max(1).default(0.87),
});

// Субагент (этап 6c): кому главный агент может поручить задачу тулом delegate_task.
const subagentSchema = z.object({
  // Что умеет — это описание читает модель главного агента, выбирая, кому поручить.
  description: z.string().min(1),
  // Своя инструкция субагенту — в его system prompt после общих правил.
  instructions: z.string().default(''),
  // Тулы субагента — по именам из тулов сессии. delegate_task среди них не бывает: глубина одна.
  tools: z.array(z.string().min(1)).min(1),
  maxIterations: z.number().int().min(1).max(50).default(6),
  reasoningEffort: z.enum(REASONING_EFFORTS).default('low'),
});

const subagentsSettingsSchema = z.object({
  // Несколько delegate_task в одном шаге — параллельно; остальные тулы всегда по очереди.
  parallel: z.boolean().default(true),
  // Нет субагентов — нет и тула delegate_task.
  agents: z.record(z.string().regex(/^[a-z][a-z0-9_-]*$/u), subagentSchema).default({}),
});

export const harnessSettingsSchema = z.object({
  model: modelSettingsSchema,
  agent: agentSettingsSchema,
  context: contextSettingsSchema.default({
    preset: 'demo',
    limits: { demo: 12000, stress: 6000, real: 1000000 },
    toolResultLimits: { demo: 1500, stress: 800, real: 25000 },
    thresholdPercent: 80,
    clearTargetPercent: 60,
    compactionModel: null,
    charsPerToken: 3.24,
  }),
  workspace: workspaceSettingsSchema,
  permissions: permissionsSchema,
  webFetch: webFetchSettingsSchema,
  // Если раздела нет, веб-поиска нет.
  search: searchSettingsSchema.optional(),
  // MCP-серверы, которые харнесс запускает в начале сессии.
  mcpServers: z.array(mcpServerSettingsSchema).default([]),
  // Маршруты сети. Если раздела нет, все запросы идут по маршруту proxy по умолчанию.
  network: networkSettingsSchema.default({ defaultRoute: 'proxy', rules: [] }),
  // Если раздела нет, модель ищет сама (mode: tool).
  retrieval: retrievalSettingsSchema.default({
    mode: 'tool',
    toolName: 'kedr__semantic_search',
    limit: 5,
  }),
  grounding: groundingSettingsSchema.default({ similarityThreshold: 0.87 }),
  skills: skillsSettingsSchema.default({ directory: 'skills', always: [], manual: [] }),
  subagents: subagentsSettingsSchema.default({ parallel: true, agents: {} }),
  server: serverSettingsSchema.default({
    port: 4317,
    permissionTimeoutSeconds: 120,
    questionTimeoutSeconds: 900,
  }),
  prices: z.record(z.string(), modelPricesSchema).default({}),
  traces: tracesSettingsSchema,
});

export type HarnessSettings = z.infer<typeof harnessSettingsSchema>;
export type ModelSettings = z.infer<typeof modelSettingsSchema>;
export type ContextSettings = z.infer<typeof contextSettingsSchema>;
export type ReasoningStyle = ModelSettings['reasoningStyle'];
export type ModelPrices = z.infer<typeof modelPricesSchema>;
export type Tariff = z.infer<typeof tariffSchema>;
export type Weekday = z.infer<typeof weekdaySchema>;
export type WebFetchSettings = z.infer<typeof webFetchSettingsSchema>;
export type PermissionsSettings = z.infer<typeof permissionsSchema>;
export type PermissionRule = z.infer<typeof permissionRuleSchema>;
export type SearchSettings = z.infer<typeof searchSettingsSchema>;
export type SearchProviderName = SearchSettings['provider'];
export type TavilySettings = z.infer<typeof tavilySettingsSchema>;
export type YandexSearchSettings = z.infer<typeof yandexSearchSettingsSchema>;
export type YandexSearchPrices = z.infer<typeof yandexSearchPricesSchema>;
export type McpServerSettings = z.infer<typeof mcpServerSettingsSchema>;
export type NetworkSettings = z.infer<typeof networkSettingsSchema>;
export type NetworkRule = z.infer<typeof networkRuleSchema>;
export type NetworkRoute = z.infer<typeof networkRouteSchema>;
export type ServerSettings = z.infer<typeof serverSettingsSchema>;
export type GroundingSettings = z.infer<typeof groundingSettingsSchema>;
export type RetrievalSettings = z.infer<typeof retrievalSettingsSchema>;
export type SkillsSettings = z.infer<typeof skillsSettingsSchema>;
export type SubagentsSettings = z.infer<typeof subagentsSettingsSchema>;
export type SubagentSettings = z.infer<typeof subagentSchema>;
export type RetrievalMode = RetrievalSettings['mode'];
