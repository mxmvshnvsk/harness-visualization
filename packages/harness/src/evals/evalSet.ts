// Набор задач для evals (этап 8e): задача — вопрос агенту и проверки, по которым видно,
// справился ли он. Термины — из статьи Anthropic «Demystifying evals for AI agents»: задача
// (task), попытка (trial), трейс (transcript), проверка (grader). Набор лежит JSON-файлом
// в evals/ — его правят руками, как тесты.
//
// Проверки кодом смотрят не только на текст ответа, но и на трейс: какие тулы вызывал агент,
// что прочитал, сколько шагов сделал и сколько потратил. Судья — модель, читает ответ
// по рубрике; он недетерминирован, поэтому его вердикт показывается отдельно.

import { z } from 'zod';

const label = z.string().min(1).optional();

export const evalCheckSchema = z.discriminatedUnion('kind', [
  // В ответе есть хотя бы одна из строк (без учёта регистра).
  z.object({ kind: z.literal('answerIncludes'), anyOf: z.array(z.string().min(1)).min(1), label }),
  // В ответе нет ни одной из строк.
  z.object({ kind: z.literal('answerExcludes'), noneOf: z.array(z.string().min(1)).min(1), label }),
  // Агент видел документ — хотя бы фрагментом в выдаче поиска или в подмешанном.
  z.object({ kind: z.literal('documentSeen'), document: z.string().min(1), label }),
  // Агент прочитал документ целиком.
  z.object({ kind: z.literal('documentRead'), document: z.string().min(1), label }),
  // Ответ называет документ — id в обратных кавычках, как его ищет check-grounding.
  z.object({ kind: z.literal('documentCited'), document: z.string().min(1), label }),
  // Агент вызвал тул (имя целиком или окончание: «search» подходит к «kedr__search»).
  z.object({ kind: z.literal('toolCalled'), tool: z.string().min(1), label }),
  z.object({ kind: z.literal('toolNotCalled'), tool: z.string().min(1), label }),
  // Харнесс не искал в базе до ответа (context_retrieved). В режиме auto он ищет всегда —
  // даже на «17 × 23»: модель тулов не звала, а поиск был (первый прогон evals, 26.10.2026).
  z.object({ kind: z.literal('noRetrieval'), label }),
  z.object({ kind: z.literal('maxModelRequests'), value: z.number().int().positive(), label }),
  z.object({ kind: z.literal('maxToolCalls'), value: z.number().int().nonnegative(), label }),
  z.object({ kind: z.literal('maxCostUsd'), value: z.number().positive(), label }),
  // Код-арена (этап 10): приёмка харнесса пройдена — исходные видимые и скрытые тесты зелёные.
  z.object({ kind: z.literal('acceptancePassed'), label }),
  // Код-арена: агент не оставил в копии новых файлов вне test/ — временных скриптов и прочего
  // (в прогоне 26.10.2026 так было в 3 попытках из 6 с run_tests).
  z.object({ kind: z.literal('noStrayFiles'), label }),
  // Модель-судья читает вопрос и ответ и решает, выполнена ли рубрика.
  z.object({ kind: z.literal('judge'), rubric: z.string().min(1), label }),
]);

export type EvalCheck = z.infer<typeof evalCheckSchema>;

// regression — агент это уже умеет, доля успехов должна держаться около 100 %: «не сломали ли».
// capability — трудное, начинает с низкой доли: цель для улучшений («чему ещё не научился»).
export const EVAL_SUITES = ['regression', 'capability'] as const;

export type EvalSuite = (typeof EVAL_SUITES)[number];

export const evalTaskSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/u, 'id: латиница в нижнем регистре, цифры и дефис'),
  question: z.string().min(1),
  // Откуда задача: урок или трейс стенда, на котором агент ошибался.
  origin: z.string().min(1),
  suite: z.enum(EVAL_SUITES).default('regression'),
  // Задача Код-арены (этап 10): попытка — прогон этой задачи из arena/tasks, а не вопрос.
  arenaTask: z.string().min(1).optional(),
  checks: z.array(evalCheckSchema).min(1),
});

export type EvalTask = z.infer<typeof evalTaskSchema>;

export const evalSetSchema = z.object({
  // questions — вопросы к агенту «Кедр Софт»; arena — задачи Код-арены, конфигурации — её режимы.
  kind: z.enum(['questions', 'arena']).default('questions'),
  name: z.string().min(1),
  description: z.string().min(1),
  tasks: z.array(evalTaskSchema).min(1),
});

export type EvalSet = z.infer<typeof evalSetSchema>;

// Подпись проверки для отчёта: своя из набора или по виду проверки.
export function describeCheck(check: EvalCheck): string {
  if (check.label !== undefined) {
    return check.label;
  }
  switch (check.kind) {
    case 'answerIncludes':
      return `в ответе: ${check.anyOf.map((text) => `«${text}»`).join(' или ')}`;
    case 'answerExcludes':
      return `в ответе нет: ${check.noneOf.map((text) => `«${text}»`).join(', ')}`;
    case 'documentSeen':
      return `видел ${check.document}`;
    case 'documentRead':
      return `прочитал ${check.document} целиком`;
    case 'documentCited':
      return `назвал \`${check.document}\` в ответе`;
    case 'toolCalled':
      return `вызвал ${check.tool}`;
    case 'toolNotCalled':
      return `не вызывал ${check.tool}`;
    default:
      return FIXED_LABELS[check.kind] ?? describeLimit(check);
  }
}

// Проверки без параметров — подпись одна на вид.
const FIXED_LABELS: Partial<Record<EvalCheck['kind'], string>> = {
  noRetrieval: 'харнесс не искал в базе до ответа',
  acceptancePassed: 'приёмка харнесса пройдена',
  noStrayFiles: 'не оставил лишних файлов',
};

function describeLimit(check: EvalCheck): string {
  switch (check.kind) {
    case 'maxModelRequests':
      return `запросов к модели ≤ ${String(check.value)}`;
    case 'maxToolCalls':
      return `вызовов тулов ≤ ${String(check.value)}`;
    case 'maxCostUsd':
      return `стоимость ≤ ${String(check.value)} USD`;
    case 'judge':
      return `рубрика: ${check.rubric.length > 60 ? `${check.rubric.slice(0, 60)}…` : check.rubric}`;
    default:
      return check.kind;
  }
}
