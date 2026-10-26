// Экран «Контекст» (этап 6.6): как prompt рос от запроса к запросу, где он упирался в порог
// и что харнесс делал, чтобы освободить место. Показывает события до курсора повтора:
// будущие запросы бледные, текущий выделен, клик по столбику перематывает к запросу.

import type { HarnessEvent } from '@harness-visualization/harness';
import { AgentChip } from '../agents/AgentChip';
import { useAgentLabels } from '../agents/agentLabels';
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
import { PromptContents } from './PromptContents';
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
  const choice = useChosenRequest(requests, shown, (request) => {
    clock.seek(timeAt(schedule, request.at));
  });
  const first = requests[0];
  if (first === undefined) {
    return (
      <div className={styles.empty}>
        Запросов с бюджетом пока нет. В трейсах до этапа 6.2 харнесс бюджет ещё не считал.
      </div>
    );
  }
  const selectedId = choice.selected?.requestId ?? null;
  return (
    <section className={styles.view}>
      <AgentsNote />
      <div className={styles.head}>
        <Summary request={first} count={requests.length} />
        <Segmented
          label="Представление"
          options={MODES}
          value={mode}
          onChange={setMode}
          size="small"
        />
      </div>
      {mode === 'chart' ? (
        <Charts
          requests={requests}
          shown={shown}
          current={choice.current?.requestId ?? null}
          selected={selectedId}
          onSeek={choice.select}
        />
      ) : (
        <ContextTable
          requests={requests}
          shown={shown}
          selected={selectedId}
          onSeek={choice.select}
        />
      )}
      {choice.selected !== null && (
        <PromptContents request={choice.selected} previous={choice.previous} />
      )}
    </section>
  );
}

function Summary({ request, count }: { request: ContextRequest; count: number }): ReactElement {
  const { preset, limitTokens, thresholdTokens, reconstructed } = request.budget;
  if (reconstructed !== undefined) {
    return (
      <p className={styles.summary}>
        <Term topic="context-budget">Бюджет prompt</Term> восстановлен по чужой записи: история
        собрана заново, а system prompt и описания тулов того харнесса — остаток до настоящего input
        (на этом шаге ≈ {formatTokens(reconstructed.hiddenTokens)}). Лимита в записи нет · запросов
        к модели: {count}
      </p>
    );
  }
  return (
    <p className={styles.summary}>
      <Term topic="context-budget">Бюджет prompt</Term>: пресет {preset}, лимит{' '}
      {formatTokens(limitTokens)}, порог {formatTokens(thresholdTokens)} · запросов к модели:{' '}
      {count}
    </p>
  );
}

interface ChosenRequest {
  // Последний запрос, до которого дошёл повтор.
  current: ContextRequest | null;
  // Чей prompt показываем: выбранный кликом, а пока не выбран — текущий.
  selected: ContextRequest | null;
  // Прошлый шаг агента перед выбранным — с ним сравниваем, что в prompt нового.
  previous: ContextRequest | null;
  select: (request: ContextRequest) => void;
}

function useChosenRequest(
  requests: readonly ContextRequest[],
  shown: number,
  seek: (request: ContextRequest) => void,
): ChosenRequest {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = requests.filter((request) => request.index < shown).at(-1) ?? null;
  const id = selectedId ?? current?.requestId;
  const position = requests.findIndex((request) => request.requestId === id);
  return {
    current,
    selected: requests[position] ?? null,
    previous: previousOf(requests, position),
    select: (request) => {
      setSelectedId(request.requestId);
      seek(request);
    },
  };
}

interface ChartsProps {
  requests: readonly ContextRequest[];
  shown: number;
  current: string | null;
  selected: string | null;
  onSeek: (request: ContextRequest) => void;
}

function Charts({ requests, shown, current, selected, onSeek }: ChartsProps): ReactElement {
  const [ref, width] = useWidth<HTMLDivElement>(800);
  const [hovered, setHovered] = useState<string | null>(null);
  const scale = useMemo(() => contextScale(requests), [requests]);
  const columns = columnsOf(width, requests.length);
  const position = requests.findIndex((request) => request.requestId === hovered);
  const hoveredRequest = requests[position];
  const state = { requests, scale, columns, shown, current, selected, hovered };
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

// С чем сравнивать: служебные запросы (сводка) несут свой prompt — их пропускаем,
// иначе после компакции «новым» оказался бы весь prompt шага.
function previousOf(requests: readonly ContextRequest[], position: number): ContextRequest | null {
  return (
    requests
      .slice(0, Math.max(0, position))
      .filter((request) => request.purpose === 'agentStep')
      .at(-1) ?? null
  );
}

// В сессии с субагентами здесь — только главный агент: у каждого субагента своя история.
function AgentsNote(): ReactElement | null {
  const labels = useAgentLabels();
  if (!labels.enabled) {
    return null;
  }
  return (
    <p className={styles.agentsNote}>
      <AgentChip agentId={null} /> Контекст главного агента. У субагентов своя история — их самый
      большой prompt во вкладке «Агенты».
    </p>
  );
}
