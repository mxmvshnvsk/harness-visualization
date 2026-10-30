// Вкладка «Ветки» (этап 9.2): исходная сессия и её ветки деревом и сравнение двух из них —
// ответы рядом, разница по абзацам, шаги, тулы и цена. Видна всегда, как «Агенты»: веток нет —
// написано, как их сделать.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useContext, useMemo, type ReactElement } from 'react';
import { HelpButton } from '../../help/HelpLinks';
import { branchFamily, type BranchNode } from '../../projections/branchTree';
import { NavigationContext } from './BranchContext';
import { BranchCompare } from './BranchCompare';
import { CURRENT, describeNode } from './branchLabels';
import styles from './Branch.module.css';

interface BranchesViewProps {
  events: readonly HarnessEvent[];
  traceFile: string | null;
  sessionId: string | null;
}

export function BranchesView({ events, traceFile, sessionId }: BranchesViewProps): ReactElement {
  const navigation = useContext(NavigationContext);
  const traces = navigation?.traces;
  const family = useMemo(
    () => familyOf(traces ?? [], events, traceFile, sessionId),
    [traces, events, traceFile, sessionId],
  );
  const current = traceFile ?? currentFile(family, sessionId);
  if (family.length < 2) {
    return (
      <div className={styles.empty}>
        <p>
          У этой сессии веток нет. Ветку делают в «Инспекторе» записанного трейса: «⑂ Ветка отсюда»
          у любого шага — шаги до него replay из записи, с него новый прогон.
        </p>
        <HelpButton topic="branches" />
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      <BranchTree
        family={family}
        current={current}
        onOpen={(file) => navigation?.openTrace(file)}
      />
      <BranchCompare key={current} family={family} current={current} events={events} />
    </div>
  );
}

// Живая ветка ещё не трейс: она — узел под своей исходной, пока сессия не допишется.
function familyOf(
  traces: Parameters<typeof branchFamily>[0],
  events: readonly HarnessEvent[],
  traceFile: string | null,
  sessionId: string | null,
): BranchNode[] {
  const own = traces.find((trace) => trace.file === traceFile || trace.sessionId === sessionId);
  if (own !== undefined) {
    return branchFamily(traces, own.file);
  }
  const branch = events.find((event) => event.type === 'branch_started');
  if (branch?.type !== 'branch_started') {
    return [];
  }
  const sourceFile = branch.sourceTracePath.split('/').at(-1) ?? branch.sourceTracePath;
  const family = branchFamily(traces, sourceFile);
  const parent = family.find((node) => node.trace.file === sourceFile);
  return parent === undefined ? family : [...family, liveNode(parent, branch)];
}

function liveNode(
  parent: BranchNode,
  branch: Extract<HarnessEvent, { type: 'branch_started' }>,
): BranchNode {
  return {
    depth: parent.depth + 1,
    parentFile: parent.trace.file,
    trace: {
      ...parent.trace,
      file: CURRENT,
      model: branch.targetModel?.model ?? null,
      providerName: branch.targetModel?.providerName,
      sessionId: branch.sessionId,
      startedAt: branch.timestamp,
      finished: false,
      branch: { sourceFile: parent.trace.file, step: branch.step, change: branch.change.kind },
    },
  };
}

function currentFile(family: BranchNode[], sessionId: string | null): string {
  return family.find((node) => node.trace.sessionId === sessionId)?.trace.file ?? CURRENT;
}

function BranchTree(props: {
  family: BranchNode[];
  current: string;
  onOpen: (file: string) => void;
}): ReactElement {
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Дерево веток</h2>
      <ul className={styles.tree}>
        {props.family.map((node) => (
          <li
            key={node.trace.file}
            className={styles.node}
            style={{ paddingLeft: `${String(node.depth * 24)}px` }}
            aria-current={node.trace.file === props.current}
          >
            <span className={styles.nodeLabel}>
              <b>
                {describeNode(node)} · {node.trace.model ?? 'модель не указана'}
              </b>
              <span className={styles.muted}>
                {node.trace.sessionId ?? node.trace.file} ·{' '}
                {node.trace.startedAt === null
                  ? '—'
                  : new Date(node.trace.startedAt).toLocaleTimeString('ru-RU')}
                {node.trace.file === CURRENT ? ' · идёт' : ''}
              </span>
            </span>
            {node.trace.file === props.current ? (
              <span className={styles.here}>открыта</span>
            ) : (
              node.trace.file !== CURRENT && (
                <button
                  type="button"
                  className={styles.fork}
                  onClick={() => {
                    props.onOpen(node.trace.file);
                  }}
                >
                  открыть
                </button>
              )
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
