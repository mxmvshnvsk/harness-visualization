// План: последняя версия к моменту повтора и все версии лентой — видно, как модель вела задачу.

import type { ReactElement } from 'react';
import type { Moment, PlanVersion, SkillsMemoryView } from '../../projections/projectSkillsMemory';
import { CallLink } from './CallLink';
import styles from './SkillsMemory.module.css';

interface CardProps {
  view: SkillsMemoryView;
  shown: number;
  focused: string | null;
  onSeek: (moment: Moment) => void;
}

const MARKS: Record<PlanVersion['steps'][number]['status'], string> = {
  pending: 'впереди',
  in_progress: 'в работе',
  done: 'сделано',
  blocked: 'не выходит',
};

export function PlanCard({ view, shown, focused, onSeek }: CardProps): ReactElement | null {
  if (view.plans.length === 0) {
    return null;
  }
  const reached = view.plans.filter((plan) => plan.index < shown);
  // Пришли по ссылке на версию плана — показываем её, а не последнюю.
  const current =
    reached.find((plan) => focused !== null && plan.toolCallId === focused) ??
    reached.at(-1) ??
    null;
  return (
    <section
      className={styles.card}
      aria-label="План"
      data-focused={focused !== null && current?.toolCallId === focused}
    >
      <header className={styles.head}>
        <h2 className={styles.title}>План</h2>
        <div className={styles.versions}>
          {view.plans.map((plan) => (
            <button
              key={plan.index}
              type="button"
              className={styles.version}
              aria-pressed={plan.index === current?.index}
              data-future={plan.index >= shown ? 'true' : undefined}
              onClick={() => {
                onSeek(plan);
              }}
            >
              v{plan.version} · {plan.place}
            </button>
          ))}
        </div>
      </header>
      {current === null ? (
        <p className={styles.muted}>Повтор ещё не дошёл до первого плана.</p>
      ) : (
        <>
          <CallLink moment={current} />
          <Plan plan={current} />
        </>
      )}
    </section>
  );
}

function Plan({ plan }: { plan: PlanVersion }): ReactElement {
  const done = plan.steps.filter((step) => step.status === 'done').length;
  return (
    <>
      <p className={styles.goal}>
        {plan.goal}{' '}
        <span className={styles.meta}>
          — сделано {done} из {plan.steps.length}
        </span>
      </p>
      <ol className={styles.steps}>
        {plan.steps.map((step, index) => (
          // Шаги версии не переставляются — номер годится как ключ.
          <li key={index} data-status={step.status}>
            <span className={styles.stepStatus}>{MARKS[step.status]}</span>
            <span>{step.title}</span>
            {step.note !== null && <span className={styles.detail}>{step.note}</span>}
          </li>
        ))}
      </ol>
    </>
  );
}
