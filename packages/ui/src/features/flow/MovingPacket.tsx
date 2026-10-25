// Пакет текущего события: вылетает из участника и останавливается на середине связи —
// так видно, куда он идёт, а название узла не закрыто. Анимация — Web Animations API.
// Событие внутри участника (from === to) — пакет всплывает над узлом.
// Если пользователь просил меньше движения (prefers-reduced-motion) — пакет сразу на месте.

import { useEffect, useRef, type ReactElement } from 'react';
import { FLOW_NODES } from './flowGraph';
import styles from './FlowView.module.css';
import type { Packet } from './eventToPacket';

const LABEL_LIMIT = 36;
const BASE_DURATION_MS = 700;

interface MovingPacketProps {
  packet: Packet;
  speed: number;
}

export function MovingPacket({ packet, speed }: MovingPacketProps): ReactElement {
  const ref = useRef<SVGGElement>(null);
  const label =
    packet.label.length > LABEL_LIMIT ? `${packet.label.slice(0, LABEL_LIMIT)}…` : packet.label;
  const width = Math.min(280, label.length * 7 + 28);
  const from = FLOW_NODES[packet.from];
  const to = FLOW_NODES[packet.to];
  const self = packet.from === packet.to;
  const start = `translate(${String(from.x)}px, ${String(from.y)}px)`;
  const end = self
    ? `translate(${String(to.x)}px, ${String(to.y - to.height / 2 - 20)}px)`
    : `translate(${String((from.x + to.x) / 2)}px, ${String((from.y + to.y) / 2)}px)`;

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element.style.transform = end;
      return undefined;
    }
    const animation = element.animate(
      self
        ? [
            { transform: `translate(${String(to.x)}px, ${String(to.y)}px)`, opacity: 0 },
            { transform: end, opacity: 1 },
          ]
        : [
            { transform: start, opacity: 0.4 },
            { transform: end, opacity: 1 },
          ],
      {
        duration: Math.min(1400, Math.max(200, BASE_DURATION_MS / speed)),
        easing: 'ease-in-out',
        fill: 'forwards',
      },
    );
    return () => {
      animation.cancel();
    };
  }, [start, end, self, speed, to.x, to.y]);

  return (
    <g ref={ref} className={styles.packet} data-group={packet.group} style={{ transform: start }}>
      <rect x={-width / 2} y={-14} width={width} height={28} rx={14} />
      <text x={0} y={4} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}
