// Дорожки агентов: запросы к модели, тулы и ожидание отчётов — по настоящему времени событий.
// Наведение или фокус на отрезке — подпись под дорожками: кто, когда и что делал.

import { useState, type ReactElement } from 'react';
import type { AgentLane, AgentSegment, AgentsView } from '../../projections/projectAgents';
import { formatSeconds } from './agentFormat';
import styles from './Agents.module.css';

export function AgentLanes({ view }: { view: AgentsView }): ReactElement {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = Math.max(view.now, 1);
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Кто когда работал</h2>
      <div className={styles.lanes}>
        {view.lanes.map((lane) => (
          <Lane key={lane.id} lane={lane} total={total} now={view.now} onHover={setHovered} />
        ))}
        <div className={styles.axis}>
          <span />
          <div className={styles.ticks}>
            {ticks(total).map((tick) => (
              <span key={tick} style={{ left: `${String((tick / total) * 100)}%` }}>
                {formatSeconds(tick)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className={styles.caption} aria-live="polite">
        {hovered ?? 'Наведите на отрезок — что в нём происходит.'}
      </p>
      <div className={styles.legend}>
        <span>
          <i data-kind="model" /> запрос к модели
        </span>
        <span>
          <i data-kind="tool" /> тул
        </span>
        <span>
          <i data-kind="wait" /> ждёт отчёта
        </span>
        {view.lanes.some((lane) => lane.id === 'steps') && (
          <span>
            <i data-kind="step" /> шаг каркаса — его задал код
          </span>
        )}
        {view.hasRework && (
          <span>
            <i data-kind="rework" /> доработка после возврата
          </span>
        )}
      </div>
    </section>
  );
}

function Lane(props: {
  lane: AgentLane;
  total: number;
  now: number;
  onHover: (label: string | null) => void;
}): ReactElement {
  const { lane, total, now, onHover } = props;
  return (
    <div className={styles.lane} data-color={lane.color}>
      <span className={styles.who}>
        <span className={styles.swatch} aria-hidden="true" />
        {lane.label}
      </span>
      <div className={styles.track} role="group" aria-label={lane.label}>
        {lane.segments.map((segment, index) => {
          const label = describe(lane, segment, now);
          return (
            <button
              key={`${String(segment.start)}-${String(index)}`}
              type="button"
              className={styles.segment}
              data-kind={segment.kind}
              data-rework={segment.rework}
              style={placement(segment, total, now)}
              aria-label={label}
              onPointerEnter={() => {
                onHover(label);
              }}
              onFocus={() => {
                onHover(label);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function placement(
  segment: AgentSegment,
  total: number,
  now: number,
): { left: string; width: string } {
  const end = segment.end ?? now;
  return {
    left: `${String((segment.start / total) * 100)}%`,
    width: `${String(Math.max(((end - segment.start) / total) * 100, 0.6))}%`,
  };
}

function describe(lane: AgentLane, segment: AgentSegment, now: number): string {
  const end = segment.end ?? now;
  const still = segment.end === null ? ' (ещё идёт)' : '';
  const rework = segment.rework ? 'доработка · ' : '';
  return `${lane.label} · ${formatSeconds(segment.start)}–${formatSeconds(end)}${still}: ${rework}${segment.label}`;
}

// Деления оси: 1, 2, 5, 10… секунд — не больше шести.
function ticks(total: number): number[] {
  const steps = [500, 1000, 2000, 5000, 10000, 20000, 30000, 60000, 120000, 300000];
  const step = steps.find((value) => total / value <= 6) ?? 600000;
  const result: number[] = [];
  for (let tick = 0; tick <= total; tick += step) {
    result.push(tick);
  }
  return result;
}
