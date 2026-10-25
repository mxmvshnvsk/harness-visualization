// Экран «Контекст» (этап 6.6): как prompt рос от запроса к запросу, где он упирался в порог
// и что харнесс делал, чтобы освободить место. Показывает события до курсора повтора:
// будущие запросы бледные, текущий выделен, клик по столбику перематывает к запросу.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useMemo, useState, type ReactElement } from 'react';
import { Segmented } from '../../components/Segmented';
import { Term } from '../../help/HelpLinks';
import { projectContext, type ContextRequest } from '../../projections/projectContext';
import { timeAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { CacheChart } from './CacheChart';
import styles from './Context.module.css';
import { ContextChart } from './ContextChart';
import { ContextLegend } from './ContextLegend';
import { ContextTable } from './ContextTable';
import { ContextTooltip } from './ContextTooltip';
import { contextScale, formatTokens } from './contextScale';
import { columnsOf } from './geometry';
import { useWidth } from './useWidth';

interface ContextViewProps {
  events: readonly HarnessEvent[];
  shown: number;
  clock: TimelineClock;
  schedule: Schedule;
}

const MODES = [
  { value: 'chart', label: 'График' },
  { value: 'table', label: 'Таблица' },
] as const;

export function ContextView({ events, shown, clock, schedule }: ContextViewProps): ReactElement {
  const requests = useMemo(() => projectContext(events), [events]);
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  const seek = (request: ContextRequest): void => {
    clock.seek(timeAt(schedule, request.at));
  };
  const first = requests[0];
  if (first === undefined) {
    return (
      <div className={styles.empty}>
        Запросов с бюджетом пока нет. В трейсах до этапа 6.2 харнесс бюджет ещё не считал.
      </div>
    );
  }
  const { preset, limitTokens, thresholdTokens } = first.budget;
  return (
    <section className={styles.view}>
      <div className={styles.head}>
        <p className={styles.summary}>
          <Term topic="context-budget">Бюджет prompt</Term>: пресет {preset}, лимит{' '}
          {formatTokens(limitTokens)}, порог {formatTokens(thresholdTokens)} · запросов к модели:{' '}
          {requests.length}
        </p>
        <Segmented
          label="Представление"
          options={MODES}
          value={mode}
          onChange={setMode}
          size="small"
        />
      </div>
      {mode === 'chart' ? (
        <Charts requests={requests} shown={shown} onSeek={seek} />
      ) : (
        <ContextTable requests={requests} shown={shown} onSeek={seek} />
      )}
    </section>
  );
}

interface ChartsProps {
  requests: readonly ContextRequest[];
  shown: number;
  onSeek: (request: ContextRequest) => void;
}

function Charts({ requests, shown, onSeek }: ChartsProps): ReactElement {
  const [ref, width] = useWidth<HTMLDivElement>(800);
  const [hovered, setHovered] = useState<string | null>(null);
  const scale = useMemo(() => contextScale(requests), [requests]);
  const columns = columnsOf(width, requests.length);
  const current = requests.filter((request) => request.index < shown).at(-1)?.requestId ?? null;
  const position = requests.findIndex((request) => request.requestId === hovered);
  const hoveredRequest = requests[position];
  const state = { requests, scale, columns, shown, current, hovered };
  return (
    <>
      <ContextLegend />
      <div ref={ref} className={styles.scroll}>
        <div className={styles.plots} style={{ width: columns.width }}>
          <ContextChart {...state} onHover={setHovered} onSeek={onSeek} />
          <p className={styles.cacheTitle}>
            Из <Term topic="prompt-cache">кэша</Term>, % prompt
          </p>
          <CacheChart {...state} onHover={setHovered} onSeek={onSeek} />
          {hoveredRequest !== undefined && (
            <ContextTooltip
              request={hoveredRequest}
              left={columns.centerOf(position) - columns.step / 2}
              right={columns.centerOf(position) + columns.step / 2}
              width={columns.width}
            />
          )}
        </div>
      </div>
    </>
  );
}
