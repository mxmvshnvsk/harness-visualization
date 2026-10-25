// Пакет последнего видимого события: точка летит от края одного узла к краю другого
// (Web Animations API) и остаётся у адресата, а подпись стоит у связи неподвижно и проявляется:
// движущийся текст трудно читать. Событие внутри узла — подпись над узлом, без полёта.
// Если пользователь просил меньше движения (prefers-reduced-motion) — точка сразу у адресата.

import { useEffect, useRef, type ReactElement } from 'react';
import { boundaryPoint, FLOW_NODES, labelAnchor } from './flowGraph';
import styles from './FlowView.module.css';
import type { ShownPacket } from './flowState';

const LABEL_LIMIT = 34;
export const TRAVEL_MS = 600;

interface PacketLayerProps {
  packet: ShownPacket;
  speed: number;
}

export function PacketLayer({ packet, speed }: PacketLayerProps): ReactElement {
  const from = FLOW_NODES[packet.from];
  const to = FLOW_NODES[packet.to];
  const anchor = labelAnchor(from, to);
  const label =
    packet.label.length > LABEL_LIMIT ? `${packet.label.slice(0, LABEL_LIMIT)}…` : packet.label;
  const width = Math.min(260, label.length * 7 + 28);
  return (
    <g data-group={packet.group} className={styles.packet}>
      <g
        className={styles.packetLabel}
        transform={`translate(${String(anchor.x)} ${String(anchor.y)})`}
      >
        <rect x={-width / 2} y={-14} width={width} height={28} rx={14} />
        <text x={0} y={4} textAnchor="middle">
          {label}
        </text>
      </g>
      {from.id !== to.id && <TravellingDot packet={packet} speed={speed} />}
    </g>
  );
}

function TravellingDot({ packet, speed }: PacketLayerProps): ReactElement {
  const ref = useRef<SVGCircleElement>(null);
  const from = FLOW_NODES[packet.from];
  const to = FLOW_NODES[packet.to];
  const start = boundaryPoint(from, to);
  const end = boundaryPoint(to, from);

  useEffect(() => {
    const dot = ref.current;
    if (dot === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }
    const animation = dot.animate(
      [
        { transform: `translate(${String(start.x - end.x)}px, ${String(start.y - end.y)}px)` },
        { transform: 'translate(0px, 0px)' },
      ],
      {
        duration: Math.max(150, TRAVEL_MS / speed),
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'backwards',
      },
    );
    return () => {
      animation.cancel();
    };
  }, [start.x, start.y, end.x, end.y, speed]);

  // Точка нарисована у адресата, анимация лишь приводит её туда от отправителя.
  return <circle ref={ref} className={styles.dot} cx={end.x} cy={end.y} r={6} />;
}
