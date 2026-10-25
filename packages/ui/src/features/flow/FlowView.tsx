// Экран «Поток»: участники сессии и то, что между ними ходит. Каждое действие — обмен
// (точка уходит по верхней полосе, ждёт, пока адресат работает, возвращается по нижней),
// сообщение в одну сторону или событие внутри харнесса. Кадр считает computeFrame по часам
// повтора, а рисуется он прямо в SVG: 60 кадров в секунду без перерисовки React.
// Схема — упрощение: харнесс один узел, хотя внутри у него prompt, политика и цикл агента.

import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';
import { HelpButton } from '../../help/HelpLinks';
import { computeFrame } from '../../timeline/frame';
import type { Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { drawFrame, DOT_POOL, LABEL_POOL, TRAIL, type FlowElements } from './drawFrame';
import { FLOW_EDGES, FLOW_NODES, LANES, VIEW_HEIGHT, VIEW_WIDTH, type FlowNode } from './flowGraph';
import styles from './FlowView.module.css';

interface FlowViewProps {
  clock: TimelineClock;
  schedule: Schedule;
  // Начало записи (мс эпохи) — для счётчика ожидания в живой сессии; null — повтор записи.
  liveStartedAt: number | null;
}

const LANE_KEYS = FLOW_EDGES.flatMap(([fromId, toId]) => [
  `${fromId}>${toId}`,
  `${toId}>${fromId}`,
]);

export function FlowView({ clock, schedule, liveStartedAt }: FlowViewProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (rootRef.current === null) {
      return undefined;
    }
    const elements = collectElements(rootRef.current);
    const draw = (): void => {
      const state = clock.getState();
      const liveReal =
        liveStartedAt !== null && state.following ? Date.now() - liveStartedAt : null;
      drawFrame(elements, computeFrame(schedule, state.time, liveReal));
    };
    draw();
    return clock.subscribe(draw);
  }, [clock, schedule, liveStartedAt]);
  return (
    <div className={styles.flow} ref={rootRef}>
      <div className={styles.stage}>
        <div className={styles.toolbar}>
          <HelpButton topic="flow" />
        </div>
        <svg
          className={styles.diagram}
          viewBox={`0 0 ${String(VIEW_WIDTH)} ${String(VIEW_HEIGHT)}`}
          role="img"
          aria-label="Схема потока данных: пользователь, харнесс, модель, MCP-сервер, тулы, интернет"
        >
          {LANE_KEYS.map((key) => (
            <path key={key} className={styles.lane} d={LANES[key]?.path} data-lane={key} />
          ))}
          {Object.values(FLOW_NODES).map((node) => (
            <NodeBox key={node.id} node={node} />
          ))}
          <Pools />
        </svg>
      </div>
      <div className={styles.caption} aria-live="polite">
        <span className={styles.what} data-caption="what" />
        <span className={styles.detail} data-caption="detail" />
      </div>
    </div>
  );
}

// Элементы, которые меняет кадр, находим один раз по data-атрибутам разметки.
function collectElements(root: HTMLElement): FlowElements {
  const all = <Type extends Element>(selector: string): Type[] => [
    ...root.querySelectorAll<Type>(selector),
  ];
  return {
    lanes: Object.fromEntries(
      all<SVGPathElement>('[data-lane]').map((path) => [path.dataset.lane ?? '', path]),
    ),
    nodes: Object.fromEntries(
      all<SVGGElement>('[data-node]').map((group) => [group.dataset.node ?? '', group]),
    ),
    labels: all<SVGGElement>('[data-label]'),
    dots: all<SVGGElement>('[data-dot]'),
    what: root.querySelector<HTMLSpanElement>('[data-caption="what"]'),
    detail: root.querySelector<HTMLSpanElement>('[data-caption="detail"]'),
  };
}

function NodeBox({ node }: { node: FlowNode }): ReactElement {
  const left = node.x - node.width / 2;
  const top = node.y - node.height / 2;
  return (
    <g className={styles.node} data-node={node.id}>
      <rect
        className={styles.ring}
        x={left - 6}
        y={top - 6}
        width={node.width + 12}
        height={node.height + 12}
        rx={23}
      />
      <rect
        className={styles.box}
        x={left}
        y={top}
        width={node.width}
        height={node.height}
        rx={18}
      />
      <text className={styles.title} x={node.x} y={node.y - 12} textAnchor="middle">
        {node.title}
      </text>
      <text className={styles.sub} x={node.x} y={node.y + 8} textAnchor="middle">
        {node.role}
      </text>
      <rect
        className={styles.heatTrack}
        x={left + 16}
        y={top + node.height - 16}
        width={node.width - 32}
        height={3}
        rx={1.5}
      />
      <rect
        className={styles.heat}
        x={left + 16}
        y={top + node.height - 16}
        width={0}
        height={3}
        rx={1.5}
      />
    </g>
  );
}

// Пулы подписей и точек: создаются один раз, в кадре только меняются их атрибуты.
function Pools(): ReactElement {
  return (
    <>
      {Array.from({ length: LABEL_POOL }, (_slot, index) => (
        <g key={`label-${String(index)}`} className={styles.label} opacity={0} data-label="">
          <rect y={-12} height={24} rx={12} />
          <text y={4} textAnchor="middle" />
        </g>
      ))}
      {Array.from({ length: DOT_POOL }, (_slot, index) => (
        <g key={`dot-${String(index)}`} opacity={0} data-dot="">
          {Array.from({ length: TRAIL }, (_trail, trailIndex) => (
            <circle
              key={trailIndex}
              className={styles.trail}
              opacity={0}
              r={5.5 - trailIndex * 0.6}
            />
          ))}
          <circle className={styles.dot} r={6.5} />
        </g>
      ))}
    </>
  );
}
