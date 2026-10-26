// Проверки кодом (code-based graders) — по трейсу попытки. Трейс — источник правды: проверку
// можно пересчитать в любой момент, без модели и без денег. Честна она ровно настолько,
// насколько предсказуем формат ответа (урок 11): «28 дней» найдётся, «двадцать восемь» — нет.

import type { HarnessEvent } from '../events/harnessEvents.js';
import { checkGrounding } from '../grounding/checkGrounding.js';
import { collectSeenSources, normalizeReference } from '../grounding/collectSeenSources.js';
import { describeCheck, type EvalCheck } from './evalSet.js';

export interface CheckResult {
  kind: EvalCheck['kind'];
  label: string;
  // null — проверку не делали: судью выключили или он не ответил.
  passed: boolean | null;
  // Что нашли на деле: «2 запроса», «не видел», объяснение судьи.
  detail: string;
}

export interface TrialFacts {
  answer: string | null;
  modelRequests: number;
  toolCalls: string[];
  costUsd: number | null;
  durationMs: number;
}

export function readTrialFacts(events: readonly HarnessEvent[]): TrialFacts {
  const finished = events.find((event) => event.type === 'session_finished');
  const answers = events.filter((event) => event.type === 'assistant_message');
  return {
    answer: answers.at(-1)?.text ?? null,
    modelRequests: events.filter(
      (event) => event.type === 'model_request' && event.purpose === 'agentStep',
    ).length,
    toolCalls: events.flatMap((event) => (event.type === 'tool_call' ? [event.toolName] : [])),
    costUsd: finished?.type === 'session_finished' ? (finished.modelCost?.total ?? null) : null,
    durationMs: finished?.type === 'session_finished' ? finished.durationMs : 0,
  };
}

// Все проверки, кроме судьи: его вердикт приходит отдельно (judgeAnswers.ts).
export function runCodeCheck(check: EvalCheck, events: HarnessEvent[]): CheckResult {
  const facts = readTrialFacts(events);
  const result = (passed: boolean | null, detail: string): CheckResult => ({
    kind: check.kind,
    label: describeCheck(check),
    passed,
    detail,
  });
  switch (check.kind) {
    case 'answerIncludes':
    case 'answerExcludes':
      return result(...checkAnswer(check, facts.answer));
    case 'documentSeen':
    case 'documentRead':
    case 'documentCited':
      return result(...checkDocument(check, events));
    case 'toolCalled':
    case 'toolNotCalled':
      return result(...checkTool(check, facts.toolCalls));
    case 'judge':
      return result(null, 'судью не звали');
    default:
      return result(...checkLimit(check, facts));
  }
}

type Outcome = [passed: boolean | null, detail: string];

function checkAnswer(check: EvalCheck, answer: string | null): Outcome {
  if (answer === null) {
    return [false, 'ответа нет'];
  }
  const text = answer.toLowerCase();
  if (check.kind === 'answerIncludes') {
    const found = check.anyOf.find((needle) => text.includes(needle.toLowerCase()));
    return found === undefined ? [false, 'не нашлось'] : [true, `нашлось «${found}»`];
  }
  if (check.kind === 'answerExcludes') {
    const found = check.noneOf.find((needle) => text.includes(needle.toLowerCase()));
    return found === undefined ? [true, 'нет'] : [false, `нашлось «${found}»`];
  }
  return [null, ''];
}

const LEVEL_NAMES = {
  full: 'прочитал целиком',
  fragment: 'видел фрагмент',
  catalog: 'видел только в списке',
  notSeen: 'не видел',
} as const;

function checkDocument(check: EvalCheck, events: HarnessEvent[]): Outcome {
  if (!('document' in check)) {
    return [null, ''];
  }
  const id = normalizeReference(check.document);
  const level = collectSeenSources(events).get(id)?.level ?? 'notSeen';
  if (check.kind === 'documentCited') {
    const cited = checkGrounding(events).references.some(
      (reference) => normalizeReference(reference.reference) === id,
    );
    return [cited, cited ? 'назван' : `не назван (${LEVEL_NAMES[level]})`];
  }
  const passed = check.kind === 'documentRead' ? level === 'full' : level !== 'notSeen';
  return [passed && level !== 'catalog', LEVEL_NAMES[level]];
}

function checkTool(check: EvalCheck, calls: string[]): Outcome {
  if (!('tool' in check)) {
    return [null, ''];
  }
  const count = calls.filter(
    (name) => name === check.tool || name.endsWith(`__${check.tool}`),
  ).length;
  const detail = count === 0 ? 'ни разу' : `${String(count)} раз`;
  return [check.kind === 'toolCalled' ? count > 0 : count === 0, detail];
}

function checkLimit(check: EvalCheck, facts: TrialFacts): Outcome {
  switch (check.kind) {
    case 'maxModelRequests':
      return [facts.modelRequests <= check.value, `${String(facts.modelRequests)} запросов`];
    case 'maxToolCalls':
      return [facts.toolCalls.length <= check.value, `${String(facts.toolCalls.length)} вызовов`];
    case 'maxCostUsd':
      return facts.costUsd === null
        ? [null, 'цена неизвестна']
        : [facts.costUsd <= check.value, `${facts.costUsd.toFixed(6)} USD`];
    default:
      return [null, ''];
  }
}
