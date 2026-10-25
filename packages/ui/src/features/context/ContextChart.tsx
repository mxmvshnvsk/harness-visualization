// Главный график: столбик на запрос — из чего состоял prompt (оценка по частям), черта —
// точный размер по usage ответа, линии порога и лимита, значки того, что харнесс сделал
// с контекстом перед запросом, и границы вопросов.

import type { ReactElement } from 'react';
import { requestLabel, type ContextRequest } from '../../projections/projectContext';
import styles from './Context.module.css';
import { formatTick, formatTokens, PARTS, type Scale, partTokens } from './contextScale';
import { LEFT, type Columns } from './geometry';

export const CHART_HEIGHT = 300;
const TOP = 30;
const BOTTOM = 48;
const PLOT = CHART_HEIGHT - TOP - BOTTOM;
const BASE = TOP + PLOT;

export interface ChartState {
  requests: readonly ContextRequest[];
  scale: Scale;
  columns: Columns;
  shown: number;
  current: string | null;
  selected: string | null;
  hovered: string | null;
}

interface ChartHandlers {
  onHover: (requestId: string | null) => void;
  onSeek: (request: ContextRequest) => void;
}

export function ContextChart(props: ChartState & ChartHandlers): ReactElement {
  const { requests, columns } = props;
  return (
    <svg
      className={styles.chart}
      width={columns.width}
      height={CHART_HEIGHT}
      role="img"
      aria-label="Размер prompt по запросам к модели"
      onMouseLeave={() => {
        props.onHover(null);
      }}
    >
      <Axis scale={props.scale} width={columns.width} />
      <TurnMarks requests={requests} columns={columns} />
      {requests.map((request, position) => (
        <Bar key={request.requestId} request={request} position={position} {...props} />
      ))}
      <Guides scale={props.scale} width={columns.width} request={requests[0]} />
    </svg>
  );
}

function yOf(value: number, scale: Scale): number {
  return BASE - (value / scale.max) * PLOT;
}

function Axis({ scale, width }: { scale: Scale; width: number }): ReactElement {
  return (
    <g>
      {scale.ticks.map((tick) => (
        <g key={tick}>
          <line
            className={styles.grid}
            x1={LEFT}
            x2={width}
            y1={yOf(tick, scale)}
            y2={yOf(tick, scale)}
          />
          <text className={styles.tick} x={LEFT - 8} y={yOf(tick, scale) + 4} textAnchor="end">
            {formatTick(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

interface GuidesProps {
  scale: Scale;
  width: number;
  request: ContextRequest | undefined;
}

function Guides({ scale, width, request }: GuidesProps): ReactElement | null {
  if (request === undefined) {
    return null;
  }
  const { limitTokens, thresholdTokens } = request.budget;
  return (
    <g>
      {scale.showThreshold && (
        <Guide
          y={yOf(thresholdTokens, scale)}
          width={width}
          dashed
          label={`порог ${formatTokens(thresholdTokens)}`}
        />
      )}
      {scale.showLimit && (
        <Guide
          y={yOf(limitTokens, scale)}
          width={width}
          dashed={false}
          label={`лимит ${formatTokens(limitTokens)}`}
        />
      )}
    </g>
  );
}

function Guide(props: { y: number; width: number; dashed: boolean; label: string }): ReactElement {
  return (
    <g>
      <line
        className={props.dashed ? styles.threshold : styles.limit}
        x1={LEFT}
        x2={props.width - 90}
        y1={props.y}
        y2={props.y}
      />
      <text className={styles.guideLabel} x={props.width - 84} y={props.y + 4}>
        {props.label}
      </text>
    </g>
  );
}

// Перед первым запросом каждого вопроса — вертикальная черта и подпись «вопрос N».
function TurnMarks({
  requests,
  columns,
}: {
  requests: readonly ContextRequest[];
  columns: Columns;
}): ReactElement {
  return (
    <g>
      {requests.map((request, position) => {
        if (position > 0 && requests[position - 1]?.turn === request.turn) {
          return null;
        }
        const x = columns.centerOf(position) - columns.step / 2;
        return (
          <g key={request.requestId}>
            {position > 0 && (
              <line className={styles.turnLine} x1={x} x2={x} y1={TOP - 20} y2={BASE + 40} />
            )}
            <text className={styles.turnLabel} x={x + 6} y={BASE + 38}>
              вопрос {request.turn}
            </text>
          </g>
        );
      })}
    </g>
  );
}

interface BarProps extends ChartState, ChartHandlers {
  request: ContextRequest;
  position: number;
}

function Bar(props: BarProps): ReactElement {
  const { request, columns, scale } = props;
  const center = columns.centerOf(props.position);
  const top = yOf(request.budget.estimate.total, scale);
  return (
    <g
      className={styles.column}
      data-future={request.index >= props.shown ? 'true' : undefined}
      data-current={request.requestId === props.current ? 'true' : undefined}
      data-selected={request.requestId === props.selected ? 'true' : undefined}
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
        y={TOP - 24}
        width={columns.step}
        height={PLOT + 48}
        rx={8}
      />
      <Segments request={request} scale={scale} x={center - columns.bar / 2} width={columns.bar} />
      {request.exactTokens !== null && (
        <line
          className={styles.exact}
          x1={center - columns.bar / 2 - 5}
          x2={center + columns.bar / 2 + 5}
          y1={yOf(request.exactTokens, scale)}
          y2={yOf(request.exactTokens, scale)}
        />
      )}
      <text
        className={styles.marks}
        x={center}
        y={Math.min(top, yOf(request.exactTokens ?? 0, scale)) - 8}
        textAnchor="middle"
      >
        {marksOf(request)}
      </text>
      <text className={styles.barLabel} x={center} y={BASE + 18} textAnchor="middle">
        {requestLabel(request)}
      </text>
    </g>
  );
}

// Значки над столбиком: ✂ — обрезал результат, ⌫ — убрал старые, ≡ — сжал в сводку.
export function marksOf(request: ContextRequest): string {
  return [
    request.truncated > 0 ? '✂' : '',
    request.cleared > 0 ? '⌫' : '',
    request.compacted ? '≡' : '',
  ].join('');
}

interface SegmentsProps {
  request: ContextRequest;
  scale: Scale;
  x: number;
  width: number;
}

// Части снизу вверх; между ними зазор 2px цвета фона, верхняя часть скруглена сильнее.
function Segments({ request, scale, x, width }: SegmentsProps): ReactElement {
  return (
    <g>
      {stackOf(request, scale).map((segment, index, all) => (
        <rect
          key={segment.key}
          x={x}
          y={segment.y}
          width={width}
          height={Math.max(1, segment.height - (index > 0 ? 2 : 0))}
          rx={index === all.length - 1 ? 4 : 1}
          fill={segment.color}
        />
      ))}
    </g>
  );
}

interface Segment {
  key: string;
  color: string;
  y: number;
  height: number;
}

function stackOf(request: ContextRequest, scale: Scale): Segment[] {
  const { estimate } = request.budget;
  const segments: Segment[] = [];
  for (const part of PARTS) {
    const height = (partTokens(estimate, part.key) / scale.max) * PLOT;
    if (height > 0) {
      const bottom = segments.at(-1)?.y ?? BASE;
      segments.push({ key: part.key, color: part.color, y: bottom - height, height });
    }
  }
  return segments;
}
