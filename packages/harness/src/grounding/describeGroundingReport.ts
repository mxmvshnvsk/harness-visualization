// Печатает отчёт об опоре ответа в консоль: по каждой ссылке — что модель видела,
// и итог по уровням. Цвет и значок подсказывают, какой ссылке можно доверять.

import { styleText } from 'node:util';
import {
  SOURCE_LEVELS,
  type CheckedReference,
  type GroundingReport,
  type SourceLevel,
} from './referenceTypes.js';

interface LevelStyle {
  icon: string;
  color: Parameters<typeof styleText>[0];
  describe: (eventSequence: number | null) => string;
}

const LEVEL_STYLES: Record<SourceLevel, LevelStyle> = {
  full: {
    icon: '✓',
    color: 'green',
    describe: (sequence) => `прочитан целиком (событие #${String(sequence)})`,
  },
  fragment: {
    icon: '~',
    color: 'yellow',
    describe: (sequence) =>
      `виден только фрагментом в выдаче поиска (событие #${String(sequence)})`,
  },
  catalog: {
    icon: '!',
    color: 'red',
    describe: (sequence) => `виден только строкой в каталоге (событие #${String(sequence)})`,
  },
  notSeen: {
    icon: '✗',
    color: 'red',
    describe: () => 'не встречался в трейсе — модель на него не опиралась',
  },
};

const LEVEL_SUMMARY_LABELS: Record<SourceLevel, string> = {
  full: 'прочитано целиком',
  fragment: 'только фрагмент',
  catalog: 'только каталог',
  notSeen: 'не видели',
};

export function describeGroundingReport(report: GroundingReport): string[] {
  if (report.references.length === 0) {
    return [
      styleText('dim', 'Ответ не ссылается ни на один источник в обратных кавычках или по адресу.'),
    ];
  }
  const lines = [`Ответ ссылается на источников: ${String(report.references.length)}`];
  for (const checked of report.references) {
    lines.push(describeReference(checked));
  }
  lines.push('', describeSummary(report));
  return lines;
}

function describeReference(checked: CheckedReference): string {
  const style = LEVEL_STYLES[checked.seen.level];
  const head = styleText(style.color, `  ${style.icon} ${checked.reference}`);
  return `${head} — ${style.describe(checked.seen.eventSequence)}`;
}

function describeSummary(report: GroundingReport): string {
  const counts = countByLevel(report);
  const parts = SOURCE_LEVELS.filter((level) => counts[level] > 0).map(
    (level) => `${LEVEL_SUMMARY_LABELS[level]} ${String(counts[level])}`,
  );
  const summary = `Итог: ${parts.join(', ')}`;
  // Самое слабое место определяет цвет итога: ссылка без прочтения хуже фрагмента.
  if (counts.catalog + counts.notSeen > 0) {
    return styleText(
      'red',
      `${summary}. Проверьте ссылки без прочтения: модель могла их выдумать.`,
    );
  }
  // Фрагмент — не подтверждение: утверждения из ответа в нём может не оказаться.
  // Сравнивать утверждение с текстом фрагмента будет этап 5b, пока — глазами.
  if (counts.fragment > 0) {
    return styleText(
      'yellow',
      `${summary}. Проверьте, есть ли утверждения из ответа во фрагментах выдачи.`,
    );
  }
  return styleText('green', `${summary}.`);
}

function countByLevel(report: GroundingReport): Record<SourceLevel, number> {
  const counts: Record<SourceLevel, number> = { full: 0, fragment: 0, catalog: 0, notSeen: 0 };
  for (const checked of report.references) {
    counts[checked.seen.level] += 1;
  }
  return counts;
}
