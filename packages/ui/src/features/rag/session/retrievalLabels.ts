// Подписи вида «RAG»: способы поиска, режимы, цвета видов документов.

import type { RetrievalAction, SearchKind } from '../../../projections/projectRetrieval';

export const SEARCH_LABELS: Record<SearchKind, { name: string; letter: string }> = {
  words: { name: 'по словам', letter: 'С' },
  meaning: { name: 'по смыслу', letter: 'В' },
  hybrid: { name: 'гибрид', letter: 'Г' },
};

export const READ_LABEL = { name: 'чтение целиком', letter: 'Ч' };

export function actionLabel(action: RetrievalAction): { name: string; letter: string } {
  return action.kind === 'read' ? READ_LABEL : SEARCH_LABELS[action.search];
}

export const MODE_LABELS: Record<string, { name: string; text: string }> = {
  tool: {
    name: 'модель ищет сама',
    text: 'Харнесс ничего не ищет заранее: модель сама решает, какими тулами и что искать.',
  },
  auto: {
    name: 'поиск до модели',
    text: 'Харнесс ищет по вопросу пользователя и кладёт найденное в запрос до первого шага модели.',
  },
  rewrite: {
    name: 'переписать вопрос',
    text: 'Модель сначала переписывает вопрос в поисковый запрос, харнесс ищет по нему и кладёт найденное в запрос. Дальше модель может искать и сама.',
  },
};

// Цвет вида документа — палитра лаборатории (--rag-*): регламент, FAQ, встреча, остальное.
export function kindColor(documentType: string): string {
  if (documentType === 'regulation' || documentType === 'faq' || documentType === 'meeting') {
    return `var(--rag-${documentType})`;
  }
  return 'var(--rag-other)';
}

// Где в сессии: «до модели» или «шаг 2»; в диалоге — с номером вопроса.
export function placeOf(action: RetrievalAction, turns: number): string {
  const step = action.step === null ? 'до модели · харнесс' : `шаг ${String(action.step)} · модель`;
  return turns > 1 ? `вопрос ${String(action.turn)} · ${step}` : step;
}

export function formatSimilarity(value: number): string {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
