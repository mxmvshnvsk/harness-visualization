// Что именно ушло в модель в выбранном запросе: полоса — сколько места занимает каждое
// сообщение, ниже — сами сообщения по порядку. Отметки показывают, что нового с прошлого
// запроса и что харнесс подменил: заглушки, сводку, обрезанные результаты.

import { useState, type CSSProperties, type ReactElement } from 'react';
import { requestLabel, type ContextRequest } from '../../projections/projectContext';
import styles from './Context.module.css';
import { formatTokens, PARTS } from './contextScale';
import { promptContents, type PromptItem, type PromptMark } from './promptItems';

interface PromptContentsProps {
  request: ContextRequest;
  previous: ContextRequest | null;
}

const MARK_LABELS: Record<PromptMark, string> = {
  new: 'новое',
  stub: 'заглушка',
  summary: 'сводка',
  truncated: 'обрезан',
};

export function PromptContents({ request, previous }: PromptContentsProps): ReactElement {
  const items = promptContents(request.body, request.budget.charsPerToken, previous?.body ?? null);
  const total = items.reduce((sum, item) => sum + item.tokens, 0);
  const fresh = items.filter((item) => item.marks.includes('new')).length;
  return (
    <section className={styles.contents} aria-label="Содержимое prompt">
      <div className={styles.contentsHead}>
        <h3 className={styles.contentsTitle}>
          prompt запроса {requestLabel(request)} · ≈ {formatTokens(total)} токенов
        </h3>
        <span className={styles.contentsMeta}>
          сообщений:{' '}
          {
            items.filter((item) => item.part !== 'tools' && !item.label.startsWith('system ·'))
              .length
          }
          {previous !== null && ` · новых с прошлого запроса: ${String(fresh)}`}
        </span>
      </div>
      {request.budget.reconstructed !== undefined && (
        <p className={styles.contentsMeta}>
          История собрана заново по записи. В начале prompt было ещё ≈{' '}
          {formatTokens(request.budget.reconstructed.hiddenTokens)} токенов — system prompt и
          описания тулов того харнесса; их текста в записи нет.
        </p>
      )}
      <div className={styles.strip} role="img" aria-label="Доля каждого сообщения в prompt">
        {items.map((item, index) => (
          <span
            // Сообщения в запросе не переставляются — порядковый номер годится как ключ.
            key={index}
            className={styles.stripPart}
            data-new={item.marks.includes('new') ? 'true' : undefined}
            title={`${item.label} ≈ ${formatTokens(item.tokens)}`}
            style={{ flexGrow: Math.max(item.tokens, 1), background: colorOf(item) }}
          />
        ))}
      </div>
      <div className={styles.rows}>
        {items.map((item, index) => (
          <PromptRow key={index} item={item} />
        ))}
      </div>
    </section>
  );
}

function PromptRow({ item }: { item: PromptItem }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={styles.row}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className={styles.rowSummary} style={{ '--swatch': colorOf(item) } as CSSProperties}>
        <span className={styles.rowRole}>{item.label}</span>
        <span className={styles.rowPreview}>{item.text}</span>
        <span className={styles.rowMarks}>
          {item.marks.map((mark) => (
            <span key={mark} className={styles.badge} data-mark={mark}>
              {MARK_LABELS[mark]}
            </span>
          ))}
        </span>
        <span className={styles.rowTokens}>≈ {formatTokens(item.tokens)}</span>
      </summary>
      {open && <pre className={styles.rowText}>{item.text}</pre>}
    </details>
  );
}

function colorOf(item: PromptItem): string {
  return PARTS.find((part) => part.key === item.part)?.color ?? 'var(--muted)';
}
