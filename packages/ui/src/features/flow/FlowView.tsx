// Экран «Поток»: участники сессии и пакет текущего события между ними.
// Пакет — событие под курсором плеера; повтор и перемотка двигают его сами.
// Схема — упрощение: харнесс один узел, хотя внутри у него prompt, политика и цикл агента;
// что именно произошло внутри — подпись пакета и строка «сейчас» под схемой.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useMemo, type ReactElement } from 'react';
import { describeEvent } from '../../events/describeEvent';
import { eventGroup } from '../../events/eventGroups';
import { countFlow } from './flowCounters';
import { FLOW_EDGES, FLOW_NODES, VIEW_HEIGHT, VIEW_WIDTH, type FlowNode } from './flowGraph';
import styles from './FlowView.module.css';
import { eventToPacket, modelHostOf, type Packet } from './eventToPacket';
import { MovingPacket } from './MovingPacket';
import { HelpButton } from '../../help/HelpLinks';

interface FlowViewProps {
  // События до курсора плеера.
  events: readonly HarnessEvent[];
  speed: number;
}

export function FlowView({ events, speed }: FlowViewProps): ReactElement {
  const context = useMemo(() => ({ modelHost: modelHostOf(events) }), [events]);
  const counters = useMemo(() => countFlow(events, context), [events, context]);
  const current = events.at(-1) ?? null;
  const packet = current === null ? null : eventToPacket(current, context);
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
        >
          {FLOW_EDGES.map(([fromId, toId]) => (
            <line
              key={`${fromId}-${toId}`}
              className={styles.edge}
              data-active={isActiveEdge(packet, fromId, toId)}
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
              activeGroup={packet?.to === node.id ? packet.group : null}
            />
          ))}
          {packet !== null && current !== null && (
            <MovingPacket key={current.sequence} packet={packet} speed={speed} />
          )}
        </svg>
      </div>
      <CurrentEvent event={current} shown={packet !== null} />
    </div>
  );
}

interface NodeBoxProps {
  node: FlowNode;
  counter: string;
  activeGroup: Packet['group'] | null;
}

function NodeBox({ node, counter, activeGroup }: NodeBoxProps): ReactElement {
  return (
    <g
      className={styles.node}
      data-group={activeGroup ?? undefined}
      data-active={activeGroup !== null}
    >
      <rect
        x={node.x - node.width / 2}
        y={node.y - node.height / 2}
        width={node.width}
        height={node.height}
        rx={18}
      />
      <text className={styles.nodeTitle} x={node.x} y={node.y - 10} textAnchor="middle">
        {node.title}
      </text>
      <text className={styles.nodeRole} x={node.x} y={node.y + 8} textAnchor="middle">
        {node.role}
      </text>
      <text className={styles.nodeCounter} x={node.x} y={node.y + 26} textAnchor="middle">
        {counter}
      </text>
    </g>
  );
}

function CurrentEvent({
  event,
  shown,
}: {
  event: HarnessEvent | null;
  shown: boolean;
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
      {!shown && <span className={styles.mono}>(служебное, на схеме не показано)</span>}
    </div>
  );
}

function isActiveEdge(packet: Packet | null, fromId: string, toId: string): boolean {
  if (packet === null) {
    return false;
  }
  return (
    (packet.from === fromId && packet.to === toId) || (packet.from === toId && packet.to === fromId)
  );
}
