// Экран «Поток»: участники сессии, пакет последнего видимого события и то, что сейчас ждёт ответа.
// Всё — функция событий до курсора плеера (flowStateAt), поэтому повтор и перемотка работают сами.
// Схема — упрощение: харнесс один узел, хотя внутри у него prompt, политика и цикл агента;
// что именно произошло внутри — подпись пакета и строка «сейчас» под схемой.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useMemo, type ReactElement } from 'react';
import { describeEvent } from '../../events/describeEvent';
import { eventGroup } from '../../events/eventGroups';
import { HelpButton } from '../../help/HelpLinks';
import { countFlow } from './flowCounters';
import {
  FLOW_EDGES,
  FLOW_NODES,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type FlowNode,
  type FlowNodeId,
} from './flowGraph';
import { flowStateAt, type ShownPacket, type Waiting } from './flowState';
import styles from './FlowView.module.css';
import { modelHostOf, type FlowContext } from './eventToPacket';
import { PacketLayer, TRAVEL_MS } from './PacketLayer';

interface FlowViewProps {
  // События до курсора плеера.
  events: readonly HarnessEvent[];
  context: FlowContext;
  speed: number;
}

export function FlowView({ events, context, speed }: FlowViewProps): ReactElement {
  const counters = useMemo(() => countFlow(events, context), [events, context]);
  const state = useMemo(() => flowStateAt(events, context), [events, context]);
  const { packet, waiting } = state;
  return (
    <div className={styles.flow}>
      <div className={styles.stage}>
        <div className={styles.toolbar}>
          <HelpButton topic="flow" />
        </div>
        <svg
          className={styles.diagram}
          viewBox={`0 0 ${String(VIEW_WIDTH)} ${String(VIEW_HEIGHT)}`}
          role="img"
          aria-label="Схема потока данных: пользователь, харнесс, модель, MCP-сервер, тулы, интернет"
          style={{ ['--travel' as string]: `${String(Math.max(150, TRAVEL_MS / speed))}ms` }}
        >
          {FLOW_EDGES.map(([fromId, toId]) => (
            <line
              key={`${fromId}-${toId}`}
              className={styles.edge}
              data-active={isActiveEdge(packet, waiting, fromId, toId)}
              x1={FLOW_NODES[fromId].x}
              y1={FLOW_NODES[fromId].y}
              x2={FLOW_NODES[toId].x}
              y2={FLOW_NODES[toId].y}
            />
          ))}
          {Object.values(FLOW_NODES).map((node) => (
            <NodeBox
              key={node.id}
              node={node}
              counter={counters[node.id]}
              packet={packet?.to === node.id ? packet : null}
              waiting={waiting.find((item) => item.node === node.id) ?? null}
            />
          ))}
          {packet !== null && <PacketLayer key={packet.sequence} packet={packet} speed={speed} />}
        </svg>
      </div>
      <CurrentEvent event={events.at(-1) ?? null} packet={packet} />
    </div>
  );
}

// Контекст схемы (хост модели) — из всех событий, а не из среза: он не меняется по ходу сессии.
export function useFlowContext(events: readonly HarnessEvent[]): FlowContext {
  const modelHost = useMemo(() => modelHostOf(events), [events]);
  return useMemo(() => ({ modelHost }), [modelHost]);
}

interface NodeBoxProps {
  node: FlowNode;
  counter: string;
  // Пакет, адресованный этому узлу: узел вспыхивает, когда точка долетит.
  packet: ShownPacket | null;
  waiting: Waiting | null;
}

function NodeBox({ node, counter, packet, waiting }: NodeBoxProps): ReactElement {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  return (
    <g
      className={styles.node}
      data-group={packet?.group ?? waiting?.group}
      data-active={packet !== null || waiting !== null}
    >
      <rect x={x} y={y} width={node.width} height={node.height} rx={18} />
      {packet !== null && (
        <rect
          key={packet.sequence}
          className={styles.pulse}
          x={x}
          y={y}
          width={node.width}
          height={node.height}
          rx={18}
        />
      )}
      {waiting !== null && (
        <rect
          className={styles.waiting}
          x={x - 5}
          y={y - 5}
          width={node.width + 10}
          height={node.height + 10}
          rx={22}
        />
      )}
      <text className={styles.nodeTitle} x={node.x} y={node.y - 10} textAnchor="middle">
        {node.title}
      </text>
      <text className={styles.nodeRole} x={node.x} y={node.y + 8} textAnchor="middle">
        {node.role}
      </text>
      <text
        className={waiting === null ? styles.nodeCounter : styles.nodeWaiting}
        x={node.x}
        y={node.y + 26}
        textAnchor="middle"
      >
        {waiting === null ? counter : waiting.label}
      </text>
    </g>
  );
}

function CurrentEvent({
  event,
  packet,
}: {
  event: HarnessEvent | null;
  packet: ShownPacket | null;
}): ReactElement {
  if (event === null) {
    return <div className={styles.current}>Сессия ещё не началась — нажмите «Воспроизвести».</div>;
  }
  return (
    <div className={styles.current}>
      <span className={styles.mono}>{event.sequence}</span>
      <span className={styles.type} data-group={eventGroup(event.type)}>
        {event.type}
      </span>
      <span className={styles.text}>{describeEvent(event)}</span>
      {packet?.sequence !== event.sequence && (
        <span className={styles.mono}>(на схеме не показано — там последнее видимое событие)</span>
      )}
    </div>
  );
}

// Активна связь последнего пакета и связи к тем, кого сейчас ждут.
function isActiveEdge(
  packet: ShownPacket | null,
  waiting: Waiting[],
  fromId: FlowNodeId,
  toId: FlowNodeId,
): boolean {
  const uses = (first: FlowNodeId, second: FlowNodeId): boolean =>
    (first === fromId && second === toId) || (first === toId && second === fromId);
  if (packet !== null && uses(packet.from, packet.to)) {
    return true;
  }
  return waiting.some((item) => uses(item.node === 'network' ? 'tools' : 'harness', item.node));
}
