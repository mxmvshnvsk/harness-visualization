// Вкладка «Код» (этап 10) — по мокапу, одобренному автором: файлы копии проекта, diff того,
// что поменял агент, запуски тестов и приёмка. Собирается из трейса и идёт за курсором
// повтора: на шаге 3 — код шага 3.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useMemo, useState, type ReactElement } from 'react';
import { HelpButton } from '../../help/HelpLinks';
import { projectCode, type CodeFile, type CodeView as View } from '../../projections/projectCode';
import { countChanges, diffHunks, lineDiff } from '../../projections/lineDiff';
import { AcceptanceCard } from './AcceptanceCard';
import { describeArena, describeNoCode, STATUS_LABELS } from './codeLabels';
import styles from './Code.module.css';

const MARKS = { add: '+', del: '−', same: ' ' } as const;

interface CodeViewProps {
  events: readonly HarnessEvent[];
  shown: number;
}

export function CodeView({ events, shown }: CodeViewProps): ReactElement {
  const view = useMemo(() => projectCode(events, shown), [events, shown]);
  if (view.files.length === 0 && view.testRuns.length === 0 && view.acceptance === null) {
    return (
      <div className={styles.empty}>
        <p>{describeNoCode(events)}</p>
        <HelpButton topic="code-arena" />
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <p className={styles.muted}>
          {view.arena === null ? 'Файлы, которые агент читал и менял.' : describeArena(view.arena)}
        </p>
        <HelpButton topic="code-arena" />
      </div>
      {view.acceptance !== null && <AcceptanceCard acceptance={view.acceptance} />}
      <FilesCard files={view.files} />
      {view.testRuns.length > 0 && <TestRunsCard view={view} />}
    </div>
  );
}

function FilesCard({ files }: { files: readonly CodeFile[] }): ReactElement {
  const [selected, setSelected] = useState<string | null>(null);
  const changed = files.filter((file) => file.status !== 'read');
  const read = files.filter((file) => file.status === 'read');
  const current =
    files.find((file) => file.path === selected) ?? biggest(changed) ?? read[0] ?? null;
  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>Файлы</h3>
      <div className={styles.split}>
        <ul className={styles.files}>
          {changed.length > 0 && <li className={styles.group}>изменены</li>}
          {changed.map((file) => (
            <FileItem key={file.path} file={file} current={current} onSelect={setSelected} />
          ))}
          {read.length > 0 && <li className={styles.group}>только прочитаны</li>}
          {read.map((file) => (
            <FileItem key={file.path} file={file} current={current} onSelect={setSelected} />
          ))}
        </ul>
        {current !== null && <FileDiff file={current} />}
      </div>
    </section>
  );
}

// По умолчанию открыт файл с самой большой правкой — обычно это и есть решение задачи.
function biggest(files: readonly CodeFile[]): CodeFile | undefined {
  const size = (file: CodeFile): number => {
    const changes = countChanges(lineDiff(file.original ?? '', file.current ?? ''));
    return changes.added + changes.removed;
  };
  return [...files].sort((left, right) => size(right) - size(left))[0];
}

function FileItem(props: {
  file: CodeFile;
  current: CodeFile | null;
  onSelect: (path: string) => void;
}): ReactElement {
  const { file } = props;
  const changes = countChanges(lineDiff(file.original ?? '', file.current ?? ''));
  return (
    <li>
      <button
        type="button"
        className={styles.file}
        data-status={file.status}
        aria-current={props.current?.path === file.path}
        onClick={() => {
          props.onSelect(file.path);
        }}
      >
        <span>{file.path}</span>
        {file.status !== 'read' && (
          <span className={styles.counts}>
            <span className={styles.add}>+{changes.added}</span>{' '}
            <span className={styles.del}>−{changes.removed}</span>
          </span>
        )}
      </button>
    </li>
  );
}

function FileDiff({ file }: { file: CodeFile }): ReactElement {
  const lines = lineDiff(file.original ?? '', file.current ?? '');
  const hunks = file.status === 'read' ? [{ kind: 'lines' as const, lines }] : diffHunks(lines);
  return (
    <div>
      <p className={styles.muted}>
        {STATUS_LABELS[file.status]} · шаг {file.step}
        {file.writes > 1 ? ` · записан ${String(file.writes)} раза` : ''}
        {file.status === 'created' && file.original === null
          ? ' · агент записал файл, не прочитав: исходного текста в трейсе нет'
          : ''}
      </p>
      <pre className={styles.diff}>
        {hunks.map((hunk, index) =>
          hunk.kind === 'skip' ? (
            <div key={index} className={styles.skip}>
              ⋯ без изменений: {hunk.count} строк
            </div>
          ) : (
            hunk.lines.map((line, lineIndex) => (
              <div
                key={`${String(index)}-${String(lineIndex)}`}
                className={styles.line}
                data-kind={line.kind}
              >
                <span className={styles.number}>{line.oldNumber ?? ''}</span>
                <span className={styles.number}>{line.newNumber ?? ''}</span>
                <span>{MARKS[line.kind]}</span>
                <span>{line.text}</span>
              </div>
            ))
          ),
        )}
      </pre>
    </div>
  );
}

function TestRunsCard({ view }: { view: View }): ReactElement {
  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>Запуски тестов агентом</h3>
      <p className={styles.muted}>
        Это тесты, которые видит агент, и его решение их запускать. Приёмку харнесс делает сам —
        после ответа.
      </p>
      <ul className={styles.runs}>
        {view.testRuns.map((run, index) => (
          <li key={index} className={styles.run}>
            <span className={styles.runHead}>
              <b>шаг {run.step}</b>
              <span className={run.failed === 0 ? styles.add : styles.del}>
                {run.timedOut
                  ? 'не уложились во время'
                  : `прошло ${String(run.passed)}, упало ${String(run.failed)}`}
              </span>
            </span>
            {run.failedTests.length > 0 && (
              <ul className={styles.failed}>
                {run.failedTests.map((test) => (
                  <li key={`${test.file ?? ''}-${test.name}`}>
                    ✗ {test.name}
                    {test.error === null ? '' : ` — ${test.error}`}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
