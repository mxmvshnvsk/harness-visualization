// Экран «Поток»: участники сессии и то, что между ними ходит. Харнесс — контейнер с частями
// (цикл агента, контекст, политика, retrieval, исполнение тулов), рамка «агент» обводит цикл и
// модель. Каждое действие — точка по маршруту: туда, ожидание у адресата, обратно.
// Кадр считает computeFrame по часам повтора, а рисуется он прямо в SVG — без перерисовки React.

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { HelpButton } from '../../help/HelpLinks';
import { computeFrame } from '../../timeline/frame';
import type { Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { drawFrame, DOT_POOL, LABEL_POOL, TRAIL, type FlowElements } from './drawFrame';
import {
  AGENT_BOX,
  FLOW_EDGES,
  FLOW_NODES,
  HARNESS_BOX,
  LANES,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type FlowNode,
  type FlowNodeId,
} from './flowGraph';
import styles from './FlowView.module.css';

interface FlowViewProps {
  clock: TimelineClock;
  schedule: Schedule;
  // Начало записи (мс эпохи) — для счётчика ожидания в живой сессии; null — повтор записи.
  liveStartedAt: number | null;
}

const LANE_KEYS = FLOW_EDGES.flatMap(([fromId, toId]) => [
  { key: `${fromId}>${toId}`, ends: [fromId, toId] },
  { key: `${toId}>${fromId}`, ends: [fromId, toId] },
]);

export function FlowView({ clock, schedule, liveStartedAt }: FlowViewProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<FlowNodeId | null>(null);
  // Кто в этой сессии вообще работал — остальные части приглушены.
  const used = useMemo(
    () => new Set(schedule.actions.flatMap((item) => item.action.route)),
    [schedule],
  );
  useFrames(rootRef, clock, schedule, liveStartedAt);
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
          aria-label="Схема: пользователь, харнесс с частями внутри, агент — модель и цикл харнесса, MCP-сервер, интернет"
          data-focus={focus ?? ''}
        >
          <Backdrop />
          {LANE_KEYS.map(({ key, ends }) => (
            <path
              key={key}
              className={styles.lane}
              d={LANES[key]?.path}
              data-lane={key}
              data-near={focus !== null && ends.includes(focus)}
            />
          ))}
          {Object.values(FLOW_NODES).map((node) => (
            <NodeBox key={node.id} node={node} idle={!used.has(node.id)} onFocus={setFocus} />
          ))}
          <Pools />
        </svg>
        {focus !== null && <NodeTip node={FLOW_NODES[focus]} />}
      </div>
      <div className={styles.caption} aria-live="polite">
        <span className={styles.what} data-caption="what" />
        <span className={styles.detail} data-caption="detail" />
      </div>
    </div>
  );
}

// Подписка на часы: каждый кадр — computeFrame и отрисовка в готовые элементы SVG.
function useFrames(
  rootRef: React.RefObject<HTMLDivElement | null>,
  clock: TimelineClock,
  schedule: Schedule,
  liveStartedAt: number | null,
): void {
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
  }, [rootRef, clock, schedule, liveStartedAt]);
}

// Точечная сетка холста, контейнер харнесса и рамка агента.
function Backdrop(): ReactElement {
  return (
    <>
      <defs>
        <pattern id="flow-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle className={styles.gridDot} cx="1.2" cy="1.2" r="1.2" />
        </pattern>
        <filter id="flow-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#flow-dots)" />
      <rect className={styles.harness} {...HARNESS_BOX} rx={30} />
      <text className={styles.harnessTitle} x={HARNESS_BOX.x + 28} y={HARNESS_BOX.y + 38}>
        Харнесс
      </text>
      <text className={styles.harnessSub} x={HARNESS_BOX.x + 28} y={HARNESS_BOX.y + 58}>
        программа вокруг модели
      </text>
      <rect className={styles.agent} {...AGENT_BOX} rx={24} />
      <text
        className={styles.agentLabel}
        x={AGENT_BOX.x + AGENT_BOX.width - 255}
        y={AGENT_BOX.y + AGENT_BOX.height - 10}
        textAnchor="middle"
      >
        агент = модель + цикл харнесса
      </text>
    </>
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

interface NodeBoxProps {
  node: FlowNode;
  idle: boolean;
  onFocus: (node: FlowNodeId | null) => void;
}

// Участник: наведение или фокус подсвечивают его связи и показывают, что он делает.
function NodeBox({ node, idle, onFocus }: NodeBoxProps): ReactElement {
  const left = node.x - node.width / 2;
  const top = node.y - node.height / 2;
  const enter = (): void => {
    onFocus(node.id);
  };
  const leave = (): void => {
    onFocus(null);
  };
  return (
    <g
      className={node.part ? `${styles.node} ${styles.part}` : styles.node}
      data-node={node.id}
      data-idle={idle}
      tabIndex={0}
      aria-label={`${node.title}: ${node.about}`}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onFocus={enter}
      onBlur={leave}
    >
      <NodeFrame node={node} left={left} top={top} />
      <text className={styles.title} x={node.x} y={node.y - 8} textAnchor="middle">
        {node.title}
      </text>
      <text className={styles.sub} x={node.x} y={node.y + 12} textAnchor="middle">
        {idle ? 'в этой сессии не работал' : node.role}
      </text>
      <HeatBar node={node} left={left} top={top} />
    </g>
  );
}

interface PlacedNode {
  node: FlowNode;
  left: number;
  top: number;
}

// Рамка участника и бегущее кольцо, пока он работает.
function NodeFrame({ node, left, top }: PlacedNode): ReactElement {
  return (
    <>
      <rect
        className={styles.ring}
        x={left - 6}
        y={top - 6}
        width={node.width + 12}
        height={node.height + 12}
        rx={22}
      />
      <rect
        className={styles.box}
        x={left}
        y={top}
        width={node.width}
        height={node.height}
        rx={16}
      />
    </>
  );
}

// Полоска внизу: какую долю сессии участник был занят. Ширину ставит кадр.
function HeatBar({ node, left, top }: PlacedNode): ReactElement {
  const y = top + node.height - 12;
  return (
    <>
      <rect
        className={styles.heatTrack}
        x={left + 16}
        y={y}
        width={node.width - 32}
        height={3}
        rx={1.5}
      />
      <rect className={styles.heat} x={left + 16} y={y} width={0} height={3} rx={1.5} />
    </>
  );
}

function NodeTip({ node }: { node: FlowNode }): ReactElement {
  // Подсказка — сбоку от участника, чтобы не закрывать соседей: правее, если он в левой части.
  const right = node.x < VIEW_WIDTH / 2;
  const x =
    ((right ? node.x + node.width / 2 + 14 : node.x - node.width / 2 - 14) / VIEW_WIDTH) * 100;
  const y = (node.y / VIEW_HEIGHT) * 100;
  return (
    <div
      className={styles.tip}
      data-side={right ? 'right' : 'left'}
      style={{ left: `${String(x)}%`, top: `${String(y)}%` }}
      role="tooltip"
    >
      <b>{node.title}</b>
      {node.about}
    </div>
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
          <circle className={styles.halo} r={14} filter="url(#flow-soft)" data-part="halo" />
          {Array.from({ length: TRAIL }, (_trail, trailIndex) => (
            <circle
              key={trailIndex}
              className={styles.trail}
              opacity={0}
              r={5.5 - trailIndex * 0.6}
              data-part="trail"
            />
          ))}
          <circle className={styles.dot} r={6.5} data-part="head" />
        </g>
      ))}
    </>
  );
}
