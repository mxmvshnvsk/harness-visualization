// Что можно открыть: сессии этого запуска сервера и записанные трейсы из traces/; примеры
// из репозитория (examples/traces) — отдельно, в раскрывашке под своими трейсами.

import type { SessionSummary, TraceSummary } from '@harness-visualization/server';
import { useState, type ReactElement, type ReactNode } from 'react';
import type { Selection } from '../app/useSelection';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { plural } from '../text/plural';
import styles from './SourceList.module.css';
import { nestBranches, type BranchNode } from '../projections/branchTree';
import { ImportTrace } from './ImportTrace';

interface SourceSectionProps {
  title: string;
  error: string | null;
  onReload: () => void;
  children: ReactNode;
  // Под списком, вне прокрутки.
  footer?: ReactNode;
}

function SourceSection(props: SourceSectionProps): ReactElement {
  const { title, error, onReload, children } = props;
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <Button onClick={onReload}>обновить</Button>
      </div>
      {error !== null && <div className={styles.error}>Не загрузилось: {error}</div>}
      <ul className={styles.list}>{children}</ul>
      {props.footer}
    </section>
  );
}

interface SessionListProps {
  sessions: SessionSummary[];
  error: string | null;
  selection: Selection | null;
  onReload: () => void;
  onSelect: (selection: Selection) => void;
}

export function SessionList(props: SessionListProps): ReactElement {
  const { sessions, selection, onSelect } = props;
  // Свежие сверху: сервер отдаёт в порядке запуска.
  const items = [...sessions].reverse();
  return (
    <SourceSection title="Сессии сервера" error={props.error} onReload={props.onReload}>
      {items.length === 0 && <li className={styles.empty}>Пока ни одной</li>}
      {items.map((session) => (
        <li key={session.sessionId}>
          <button
            type="button"
            className={styles.item}
            aria-current={
              selection?.kind === 'session' && selection.sessionId === session.sessionId
            }
            onClick={() => {
              onSelect({ kind: 'session', sessionId: session.sessionId });
            }}
          >
            <span className={styles.itemTitle}>{session.question}</span>
            <span className={styles.meta}>
              {session.sessionId} · {describeStatus(session.status)} ·{' '}
              {countEvents(session.eventCount)}
            </span>
          </button>
        </li>
      ))}
    </SourceSection>
  );
}

interface TraceListProps {
  traces: TraceSummary[];
  error: string | null;
  selection: Selection | null;
  onReload: () => void;
  onSelect: (selection: Selection) => void;
}

export function TraceList(props: TraceListProps): ReactElement {
  const { traces, selection, onSelect } = props;
  const own = traces.filter((trace) => !trace.example);
  const examples = traces.filter((trace) => trace.example);
  const exampleFiles = new Set(examples.map((trace) => trace.file));
  const selectedFile = selection?.kind === 'trace' ? selection.file : null;
  const [examplesOpen, toggleExamples] = useExamplesOpen(
    own.length > 0,
    selectedFile !== null && exampleFiles.has(selectedFile) ? selectedFile : null,
  );
  const row = (node: BranchNode): ReactElement => (
    <TraceRow
      key={node.trace.file}
      node={node}
      current={selectedFile === node.trace.file}
      fromExample={
        !node.trace.example &&
        node.trace.branch !== null &&
        exampleFiles.has(node.trace.branch.sourceFile)
      }
      onSelect={onSelect}
    />
  );
  return (
    <SourceSection
      title="Трейсы"
      error={props.error}
      onReload={props.onReload}
      footer={
        <ImportTrace
          onImported={(file) => {
            props.onReload();
            onSelect({ kind: 'trace', file });
          }}
        />
      }
    >
      {own.length === 0 && (
        <li className={styles.empty}>
          Своих трейсов пока нет — задайте вопрос агенту или откройте пример ниже.
        </li>
      )}
      {nestBranches(own).map(row)}
      {examples.length > 0 && (
        <ExamplesGroup
          count={examples.length}
          open={examplesOpen}
          onToggle={toggleExamples}
          rows={nestBranches(examples).map(row)}
        />
      )}
    </SourceSection>
  );
}

interface ExamplesGroupProps {
  count: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  rows: ReactElement[];
}

// Примеры из репозитория (examples/traces) — отдельно от своих, свёрнуты, пока свои есть.
function ExamplesGroup({ count, open, onToggle, rows }: ExamplesGroupProps): ReactElement {
  return (
    <li className={styles.examples}>
      <details
        open={open}
        onToggle={(event) => {
          onToggle(event.currentTarget.open);
        }}
      >
        <summary className={styles.examplesSummary}>
          <span className={styles.chevron} aria-hidden="true">
            ▸
          </span>
          <span className={styles.examplesTitle}>Примеры из репозитория</span>
          <span className={styles.count}>{count}</span>
          {!open && <span className={styles.examplesHint}>открываются без ключа</span>}
        </summary>
        <ul className={styles.examplesList}>{rows}</ul>
      </details>
    </li>
  );
}

interface TraceRowProps {
  node: BranchNode;
  current: boolean;
  // Своя ветка от примера: родитель — в раскрывашке примеров, а не над ней.
  fromExample: boolean;
  onSelect: (selection: Selection) => void;
}

function TraceRow({ node, current, fromExample, onSelect }: TraceRowProps): ReactElement {
  const { trace, depth } = node;
  return (
    // Ветки (этап 9) — под исходной сессией, с отступом.
    <li style={depth > 0 ? { paddingLeft: `${String(depth * 18)}px` } : undefined}>
      <button
        type="button"
        className={styles.item}
        aria-current={current}
        onClick={() => {
          onSelect({ kind: 'trace', file: trace.file });
        }}
      >
        <span className={styles.itemTitle}>
          {trace.synthetic && <Badge tone="error">синтетический</Badge>}
          {trace.kind !== 'session' && <Badge tone="judge">{trace.kind}</Badge>}
          {trace.branch !== null && (
            <Badge>
              {fromExample ? '⑂ от примера, шаг' : '⑂ шаг'} {trace.branch.step}
            </Badge>
          )}
          {trace.importedFrom !== null && <Badge tone="judge">{trace.importedFrom}</Badge>}
          {trace.title ?? trace.file}
        </span>
        <span className={styles.meta}>
          {formatDate(trace.startedAt)} · {countEvents(trace.eventCount)} ·{' '}
          {describeTraceState(trace)}
        </span>
      </button>
    </li>
  );
}

const EXAMPLES_OPEN_KEY = 'hv-examples-open';

// Раскрыты ли примеры. По умолчанию — только если своих трейсов нет: новичку есть что открыть.
// Раскрыли или свернули руками — запоминаем в браузере. Выбран пример (из адреса, из дерева
// веток) — раскрываем, чтобы выбранный был виден; это не запоминается.
function useExamplesOpen(
  hasOwn: boolean,
  selectedExample: string | null,
): [boolean, (open: boolean) => void] {
  const [stored, setStored] = useState<boolean | null>(readExamplesOpen);
  const [revealed, setRevealed] = useState<string | null>(null);
  if (selectedExample !== null && selectedExample !== revealed) {
    setRevealed(selectedExample);
    setStored(true);
  }
  const open = stored ?? !hasOwn;
  const toggle = (next: boolean): void => {
    if (next !== open) {
      setStored(next);
      writeExamplesOpen(next);
    }
  };
  return [open, toggle];
}

function readExamplesOpen(): boolean | null {
  try {
    const value = window.localStorage.getItem(EXAMPLES_OPEN_KEY);
    return value === null ? null : value === 'true';
  } catch {
    return null;
  }
}

function writeExamplesOpen(open: boolean): void {
  try {
    window.localStorage.setItem(EXAMPLES_OPEN_KEY, String(open));
  } catch {
    // Хранилище недоступно (приватное окно) — просто не запоминаем.
  }
}

export function countEvents(count: number): string {
  return plural(count, { one: 'событие', few: 'события', many: 'событий' });
}

function describeStatus(status: SessionSummary['status']): string {
  switch (status) {
    case 'running':
      return 'идёт';
    case 'finished':
      return 'закончилась';
    case 'failed':
      return 'с ошибкой';
  }
}

function describeTraceState(trace: TraceSummary): string {
  if (trace.hasError) {
    return 'с ошибкой';
  }
  return trace.finished ? 'дописан' : 'оборван';
}

function formatDate(value: string | null): string {
  return value === null ? '—' : new Date(value).toLocaleString('ru-RU');
}
