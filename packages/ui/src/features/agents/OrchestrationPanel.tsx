// «Как шла работа» (этап 6d.4) — по мокапу, одобренному автором: режим оркестрации, шаги каркаса,
// которые задал код, план и что стало с каждой задачей — поручение, отчёты по кругам, приёмка.

import { useState, type ReactElement } from 'react';
import { HelpButton } from '../../help/HelpLinks';
import { MarkdownView } from '../../help/MarkdownView';
import type {
  OrchestrationStepView,
  OrchestrationTask,
  OrchestrationView,
  StepState,
  TaskState,
} from '../../projections/projectOrchestration';
import type { SubagentRun } from '../../projections/projectSubagents';
import { formatSeconds } from './agentFormat';
import agents from './Agents.module.css';
import styles from './Orchestration.module.css';

const MODES = {
  pipeline: { name: 'пайплайн', who: 'порядок шагов задал код' },
  superagent: { name: 'суперагент', who: 'план, поручения и приёмку решала модель' },
  hybrid: { name: 'гибрид', who: 'каркас задал код, внутри шагов решала модель' },
} as const;

const STEP_STATES: Record<StepState, string> = {
  future: 'впереди',
  running: 'идёт',
  done: 'готово',
  warning: 'с замечанием',
  failed: 'сбой',
};

const TASK_STATES: Record<TaskState, string> = {
  planned: 'в плане',
  running: 'в работе',
  reported: 'отчёт',
  rework: 'на доработке',
  accepted: 'принято',
  failed: 'без отчёта',
};

export function OrchestrationPanel({ view }: { view: OrchestrationView }): ReactElement {
  const [chosen, setChosen] = useState<string | null>(null);
  const task = view.tasks.find((item) => item.taskId === chosen) ?? view.tasks[0];
  return (
    <section className={agents.card} aria-label="Как шла работа">
      <div className={agents.cardHead}>
        <h2 className={agents.title}>Как шла работа</h2>
        <span className={styles.side}>
          <span className={styles.mode}>
            {MODES[view.mode].name} · {MODES[view.mode].who}
          </span>
          <HelpButton topic="orchestration" />
        </span>
      </div>
      {view.steps.length > 0 && <Steps steps={view.steps} />}
      {view.tasks.length === 0 ? (
        <p className={agents.muted}>Плана ещё нет.</p>
      ) : (
        <div className={styles.split}>
          <TaskList tasks={view.tasks} chosen={task?.taskId ?? null} onChoose={setChosen} />
          {task !== undefined && <TaskTrail task={task} />}
        </div>
      )}
      {view.unplanned.length > 0 && (
        <p className={agents.muted}>
          Поручения вне плана (без taskId): {view.unplanned.map((run) => run.subagentId).join(', ')}
          .
        </p>
      )}
    </section>
  );
}

function Steps({ steps }: { steps: OrchestrationStepView[] }): ReactElement {
  return (
    <ol className={styles.steps} aria-label="Шаги каркаса">
      {steps.map((step, index) => (
        <li key={step.stepId} className={styles.step} data-state={step.state} data-kind={step.kind}>
          <span className={styles.stepHead}>
            <span className={agents.mono}>{String(index + 1)}</span>
            <b>{step.title}</b>
          </span>
          <span className={styles.badge} data-state={step.state}>
            {STEP_STATES[step.state]}
            {step.durationMs === null ? '' : ` · ${formatSeconds(step.durationMs)}`}
          </span>
          {step.summary !== null && (
            <span className={styles.summary} title={step.summary}>
              {step.summary}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function TaskList(props: {
  tasks: OrchestrationTask[];
  chosen: string | null;
  onChoose: (taskId: string) => void;
}): ReactElement {
  return (
    <ul className={styles.tasks} aria-label="План">
      {props.tasks.map((task) => (
        <li key={task.taskId}>
          <button
            type="button"
            className={styles.task}
            aria-pressed={task.taskId === props.chosen}
            onClick={() => {
              props.onChoose(task.taskId);
            }}
          >
            <span className={styles.taskHead}>
              <span className={agents.mono}>{task.taskId}</span>
              <span className={styles.author}>{task.author === 'code' ? 'код' : 'модель'}</span>
              <span className={styles.badge} data-state={task.state}>
                {TASK_STATES[task.state]}
              </span>
            </span>
            <span className={styles.taskTitle}>{task.title}</span>
            {task.runs.length > 0 && (
              <span className={styles.who}>
                {task.runs.map((run) => (
                  <span key={run.subagentId} className={styles.chip} data-color={run.color}>
                    {run.subagentId}
                  </span>
                ))}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

// Цепочка передачи по задаче: поручение → отчёт → приёмка (→ доработка → отчёт → приёмка).
function TaskTrail({ task }: { task: OrchestrationTask }): ReactElement {
  if (task.runs.length === 0) {
    return <p className={agents.muted}>Задача в плане, но ещё никому не поручена.</p>;
  }
  return (
    <div className={styles.trail}>
      {task.runs.map((run) => (
        <RunTrail key={run.subagentId} run={run} task={task} />
      ))}
    </div>
  );
}

function RunTrail({ run, task }: { run: SubagentRun; task: OrchestrationTask }): ReactElement {
  const reviews = task.reviews.filter((review) => review.subagentId === run.subagentId);
  return (
    <>
      <Card kind="assign" color={run.color} head={`поручение → ${run.subagentId}`}>
        <p className={agents.quote}>{run.task}</p>
      </Card>
      {run.reports.map((round) => {
        const review = reviews.find((item) => item.round === round.round);
        return (
          <div key={round.round} className={styles.round}>
            {round.feedback !== null && (
              <Card kind="rework" color="main" head={`замечание · отчёт ${String(round.round)}`}>
                <p className={agents.quote}>{round.feedback}</p>
              </Card>
            )}
            <Card
              kind="report"
              color={run.color}
              head={`отчёт ${String(round.round)} · ${run.subagentId}`}
            >
              <Report text={round.report} />
            </Card>
            {review !== undefined && (
              <Card
                kind={review.verdict === 'accepted' ? 'accept' : 'rework'}
                color="main"
                head={
                  review.verdict === 'accepted'
                    ? 'приёмка · принято'
                    : 'приёмка · вернуть на доработку'
                }
              >
                <p className={agents.quote}>{review.comment}</p>
              </Card>
            )}
          </div>
        );
      })}
    </>
  );
}

function Card(props: {
  kind: 'assign' | 'report' | 'accept' | 'rework';
  color: string;
  head: string;
  children: ReactElement;
}): ReactElement {
  return (
    <div className={styles.card} data-kind={props.kind} data-color={props.color}>
      <span className={agents.eyebrow}>{props.head}</span>
      {props.children}
    </div>
  );
}

function Report({ text }: { text: string | null }): ReactElement {
  const [whole, setWhole] = useState(false);
  if (text === null) {
    return <p className={agents.muted}>Отчёта нет — пока работает или не дошёл до отчёта.</p>;
  }
  return (
    <>
      <div className={agents.report} data-whole={whole}>
        <MarkdownView text={text} />
      </div>
      <button
        type="button"
        className={agents.more}
        aria-expanded={whole}
        onClick={() => {
          setWhole(!whole);
        }}
      >
        {whole ? 'свернуть' : 'показать целиком'}
      </button>
    </>
  );
}
