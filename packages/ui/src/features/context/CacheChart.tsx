// Второй график, под главным: какая доля prompt пришла из кэша провайдера. Отдельная ось
// в процентах — две разные величины на одной оси не смешиваем.

import type { ReactElement } from 'react';
import type { ContextRequest } from '../../projections/projectContext';
import styles from './Context.module.css';
import { cachePercent } from './contextScale';
import { LEFT, type Columns } from './geometry';

const HEIGHT = 120;
const TOP = 22;
const PLOT = 80;
const BASE = TOP + PLOT;

interface CacheChartProps {
  requests: readonly ContextRequest[];
  columns: Columns;
  shown: number;
  hovered: string | null;
  onHover: (requestId: string | null) => void;
  onSeek: (request: ContextRequest) => void;
}

export function CacheChart(props: CacheChartProps): ReactElement {
  const { requests, columns } = props;
  const labelled = requests.length <= 24;
  return (
    <svg
      className={styles.chart}
      width={columns.width}
      height={HEIGHT}
      role="img"
      aria-label="Доля prompt из кэша по запросам"
      onMouseLeave={() => {
        props.onHover(null);
      }}
    >
      {[0, 50, 100].map((tick) => (
        <g key={tick}>
          <line
            className={styles.grid}
            x1={LEFT}
            x2={columns.width}
            y1={yOf(tick)}
            y2={yOf(tick)}
          />
          <text className={styles.tick} x={LEFT - 8} y={yOf(tick) + 4} textAnchor="end">
            {tick} %
          </text>
        </g>
      ))}
      {requests.map((request, position) => (
        <CacheColumn
          key={request.requestId}
          {...props}
          request={request}
          center={columns.centerOf(position)}
          labelled={labelled}
        />
      ))}
    </svg>
  );
}

interface CacheColumnProps extends CacheChartProps {
  request: ContextRequest;
  center: number;
  labelled: boolean;
}

function CacheColumn(props: CacheColumnProps): ReactElement {
  const { request, center, columns } = props;
  const percent = cachePercent(request);
  return (
    <g
      className={styles.column}
      data-future={request.index >= props.shown ? 'true' : undefined}
      data-hovered={request.requestId === props.hovered ? 'true' : undefined}
      onMouseEnter={() => {
        props.onHover(request.requestId);
      }}
      onClick={() => {
        props.onSeek(request);
      }}
    >
      <rect
        className={styles.hit}
        x={center - columns.step / 2}
        y={0}
        width={columns.step}
        height={HEIGHT}
        rx={8}
      />
      {percent !== null && (
        <rect
          className={styles.cacheBar}
          x={center - columns.bar / 2}
          y={yOf(percent)}
          width={columns.bar}
          height={Math.max(1, BASE - yOf(percent))}
          rx={3}
        />
      )}
      {props.labelled && percent !== null && (
        <text className={styles.cacheLabel} x={center} y={yOf(percent) - 5} textAnchor="middle">
          {percent}
        </text>
      )}
    </g>
  );
}

function yOf(percent: number): number {
  return BASE - (percent / 100) * PLOT;
}
