// Маршрут новичка — строка под тремя входами на старте (мокап блока 3): пять шагов, отмечаются
// сами; щелчок по шагу ведёт туда, где его сделать. Скрывается крестиком.

import type { ReactElement } from 'react';
import { setMode } from '../mode';
import { ROUTE_STEPS, setRouteHidden, useRoute, type RouteStep } from './route';
import styles from './Start.module.css';

export interface RouteActions {
  onOpenExample: (() => void) | null;
  onAsk: () => void;
  onOpenBranch: (() => void) | null;
  onOpenLabs: () => void;
}

export function RouteRow(props: RouteActions): ReactElement | null {
  const { done, hidden } = useRoute();
  if (hidden) {
    return null;
  }
  const close = <RouteClose />;
  if (done.length === ROUTE_STEPS.length) {
    return (
      <div className={styles.route}>
        <b>✓ Маршрут пройден</b>
        <span className={styles.routeCount}>
          дальше — свои вопросы, ветки и лаборатории в любом порядке
        </span>
        {close}
      </div>
    );
  }
  const next = ROUTE_STEPS.find((step) => !done.includes(step.id))?.id ?? null;
  const actions = actionsOf(props);
  return (
    <div className={styles.route} aria-label="Маршрут новичка">
      <b>
        Маршрут новичка{' '}
        <span className={styles.routeCount}>
          {done.length} из {ROUTE_STEPS.length}
        </span>
      </b>
      <span className={styles.routeSteps}>
        {ROUTE_STEPS.map((step) => (
          <button
            key={step.id}
            type="button"
            className={styles.routeStep}
            aria-label={done.includes(step.id) ? `${step.label} — сделано` : step.label}
            data-done={done.includes(step.id)}
            data-next={step.id === next}
            disabled={actions[step.id] === null}
            onClick={() => actions[step.id]?.()}
          >
            <span className={styles.routeBox} aria-hidden>
              {done.includes(step.id) ? '✓' : ''}
            </span>
            {step.label}
          </button>
        ))}
      </span>
      {close}
    </div>
  );
}

function RouteClose(): ReactElement {
  return (
    <button
      type="button"
      className={styles.routeHide}
      aria-label="Скрыть маршрут"
      onClick={() => {
        setRouteHidden(true);
      }}
    >
      ×
    </button>
  );
}

// Прогресс одной ссылкой — для строки, когда введение скрыто.
export function useRouteProgress(): string | null {
  const { done, hidden } = useRoute();
  if (hidden || done.length === ROUTE_STEPS.length) {
    return null;
  }
  return `Маршрут · ${String(done.length)} из ${String(ROUTE_STEPS.length)}`;
}

function actionsOf(props: RouteActions): Record<RouteStep, (() => void) | null> {
  return {
    tour: props.onOpenExample,
    question: props.onAsk,
    branch: props.onOpenBranch,
    lab: props.onOpenLabs,
    research: () => {
      setMode('research');
    },
  };
}
