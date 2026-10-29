// Дорожки агентов: запросы к модели, тулы и ожидание отчётов — по настоящему времени событий.
// Наведение или фокус на отрезке — подпись под дорожками: кто, когда и что делал. Щелчок
// закрепляет подпись и даёт ссылку в инспектор: у главного агента — на этот запрос или вызов,
// у субагента — на его поручение (внутри субагента инспектор шаги по вызовам не раскрывает).
// Длинную сессию можно приблизить — как ленту плеера (useLanesZoom.ts).

import { useCallback, useRef, useState, type ReactElement } from 'react';
import { createStripView, type StripView, type StripWindow } from '../../player/stripWindow';
import { useViewValue } from '../../player/useViewValue';
import { formatWindow, ZoomControls } from '../../player/ZoomControls';
import type { SearchLink } from '../../app/viewLinks';
import type { AgentLane, AgentSegment, AgentsView } from '../../projections/projectAgents';
import { ChainLinks } from '../ChainLinks';
import { formatSeconds } from './agentFormat';
import styles from './Agents.module.css';
import { useLanesZoom } from './useLanesZoom';

export function AgentLanes({ view }: { view: AgentsView }): ReactElement {
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Pinned | null>(null);
  // Ссылка закреплённого отрезка — пока мышь не над другим отрезком.
  const pinnedLink = hovered === null ? (pinned?.link ?? null) : null;
  const total = Math.max(view.now, 1);
  const [zoom] = useState(createStripView);
  const lanesRef = useRef<HTMLDivElement>(null);
  const pointer = useLanesZoom(lanesRef, zoom, view);
  const describe = useCallback((win: StripWindow) => formatWindow(win.to - win.from), []);
  const head = useCallback(() => view.now, [view]);
  return (
    <section className={styles.card}>
      <div className={styles.lanesHead}>
        <h2 className={styles.title}>Кто когда работал</h2>
        <ZoomControls view={zoom} describe={describe} head={head} />
      </div>
      <div ref={lanesRef} className={styles.lanes} {...pointer}>
        {view.lanes.map((lane) => (
          <Lane
            key={lane.id}
            lane={lane}
            total={total}
            now={view.now}
            pinned={pinned}
            onHover={setHovered}
            onPin={(index) => {
              setPinned({ laneId: lane.id, index, link: linkOf(view, lane, lane.segments[index]) });
            }}
          />
        ))}
        <div className={styles.axis}>
          <span />
          <AxisTicks zoom={zoom} />
        </div>
      </div>
      <p className={styles.caption} aria-live="polite">
        {hovered ??
          pinnedLabel(view, pinned) ??
          'Наведите на отрезок — что в нём происходит; щелчок — ссылка в инспектор.'}
        {pinnedLink !== null && (
          <ChainLinks link={pinnedLink.target} inspector inspectorLabel={pinnedLink.label} />
        )}
      </p>
      <LanesLegend view={view} />
    </section>
  );
}

function LanesLegend({ view }: { view: AgentsView }): ReactElement {
  return (
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
  );
}

interface Pinned {
  laneId: string;
  index: number;
  link: { target: SearchLink; label: string } | null;
}

// Куда ведёт отрезок: у главного — сам запрос или вызов, у субагента — его поручение.
function linkOf(
  view: AgentsView,
  lane: AgentLane,
  segment: AgentSegment | undefined,
): Pinned['link'] {
  if (lane.id !== 'main') {
    const run = view.runs.find((item) => item.subagentId === lane.id);
    return run === undefined
      ? null
      : {
          target: { toolCallId: run.parentToolCallId, query: '' },
          label: 'поручение в инспекторе →',
        };
  }
  if (segment?.requestId !== undefined) {
    return {
      target: { toolCallId: null, query: '', requestId: segment.requestId },
      label: 'запрос в инспекторе →',
    };
  }
  return segment?.toolCallId === undefined
    ? null
    : { target: { toolCallId: segment.toolCallId, query: '' }, label: 'вызов в инспекторе →' };
}

function pinnedLabel(view: AgentsView, pinned: Pinned | null): string | null {
  const lane = view.lanes.find((item) => item.id === pinned?.laneId);
  const segment = pinned === null ? undefined : lane?.segments[pinned.index];
  return lane === undefined || segment === undefined ? null : describe(lane, segment, view.now);
}

interface LaneProps {
  lane: AgentLane;
  total: number;
  now: number;
  pinned: Pinned | null;
  onHover: (label: string | null) => void;
  onPin: (index: number) => void;
}

function Lane(props: LaneProps): ReactElement {
  const { lane, total, now, onHover } = props;
  return (
    <div className={styles.lane} data-color={lane.color}>
      <span className={styles.who}>
        <span className={styles.swatch} aria-hidden="true" />
        {lane.label}
      </span>
      <div className={styles.track} role="group" aria-label={lane.label}>
        <div className={styles.layer} data-zoom-layer="">
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
                aria-pressed={props.pinned?.laneId === lane.id && props.pinned.index === index}
                onClick={() => {
                  props.onPin(index);
                }}
                onPointerEnter={() => {
                  onHover(label);
                }}
                onPointerLeave={() => {
                  onHover(null);
                }}
                onFocus={() => {
                  onHover(label);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Деления оси — по видимому окну: при зуме мельче.
function AxisTicks({ zoom }: { zoom: StripView }): ReactElement {
  const win = useViewValue(zoom, (state) => state.win);
  const span = Math.max(1, win.to - win.from);
  return (
    <div className={styles.ticks}>
      {ticks(win.from, win.to).map((tick) => (
        <span
          key={tick}
          data-start={tick - win.from < span * 0.02 ? '' : undefined}
          style={{ left: `${String(((tick - win.from) / span) * 100)}%` }}
        >
          {formatSeconds(tick)}
        </span>
      ))}
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

// Деления оси: 0,1, 0,2, 0,5, 1, 2, 5, 10… секунд — не больше шести на окно.
function ticks(from: number, to: number): number[] {
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000, 120000, 300000];
  const step = steps.find((value) => (to - from) / value <= 6) ?? 600000;
  const result: number[] = [];
  for (let tick = Math.ceil(from / step) * step; tick <= to; tick += step) {
    result.push(tick);
  }
  return result;
}
