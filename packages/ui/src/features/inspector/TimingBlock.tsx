import { ModelActor } from '../models/ModelActor';
// Время запроса к модели по фазам (этап 8d.3): полоса, отметки, четыре цифры и сравнение
// шагов сессии в одном масштабе. Фазы пишет харнесс в model_response.timing с этапа 8d.2.

import type { ReactElement } from 'react';
import { AgentChip } from '../agents/AgentChip';
import { Term } from '../../help/HelpLinks';
import { inferenceTiming, type InferenceTiming } from '../../projections/inferenceTiming';
import type { ModelCall } from '../../projections/sessionView';
import { formatMilliseconds, formatSeconds } from '../../text/formatDuration';
import { PhaseBar, PhaseLegend, answerWord } from './PhaseBar';
import styles from './TimingBlock.module.css';
import { formatRu } from '../../text/formatNumber';

interface TimingBlockProps {
  call: ModelCall;
  // Все запросы сессии — для сравнения шагов.
  calls: ModelCall[];
}

export function TimingBlock({ call, calls }: TimingBlockProps): ReactElement | null {
  if (call.response === null) {
    return null;
  }
  const timing = inferenceTiming(call.response);
  if (timing === null) {
    return (
      <p className={styles.empty}>
        Фазы не записаны: ответ пришёл целиком (трейс до этапа 8d.2 или выключен{' '}
        <code>model.stream</code>) — известно только общее время{' '}
        {formatSeconds(call.response.durationMs)}.
      </p>
    );
  }
  return (
    <section className={styles.block} aria-label="Время запроса по фазам">
      <span className={styles.title}>
        Время запроса по фазам <Term topic="inference">инференса</Term>
      </span>
      <PhaseBar timing={timing} />
      <Ticks timing={timing} />
      <PhaseLegend />
      <Stats timing={timing} missTokens={call.response.reply.usage.inputCacheMissTokens} />
      <p className={styles.hint}>
        «До первого токена» — не только prefill: сюда входят сеть и очередь у провайдера, снаружи их
        не разделить.
      </p>
      <Comparison current={call} calls={calls} />
    </section>
  );
}

function Ticks({ timing }: { timing: InferenceTiming }): ReactElement {
  const at = (ms: number): string => `${String((ms / timing.totalMs) * 100)}%`;
  return (
    <span className={styles.ticks} aria-hidden="true">
      <span style={{ left: 0 }}>0</span>
      <span style={{ left: at(timing.firstMs) }}>{formatMilliseconds(timing.firstMs)}</span>
      {timing.reasoningMs > 0 && (
        <span style={{ left: at(timing.answerAtMs) }}>{formatRu(timing.answerAtMs)}</span>
      )}
      <span style={{ left: '100%' }}>{formatMilliseconds(timing.totalMs)}</span>
    </span>
  );
}

function Stats({
  timing,
  missTokens,
}: {
  timing: InferenceTiming;
  missTokens: number;
}): ReactElement {
  return (
    <div className={styles.stats}>
      <Stat label="до первого токена" value={formatSeconds(timing.waitMs)}>
        {formatRu(missTokens)} токенов prompt не из кэша
      </Stat>
      <Stat label="рассуждение" value={formatSeconds(timing.reasoningMs)}>
        {tokensAndRate(timing.reasoningTokens, timing.reasoningRate)}
      </Stat>
      <Stat label={answerWord(timing)} value={formatSeconds(timing.answerMs)}>
        {tokensAndRate(timing.answerTokens, timing.answerRate)}
      </Stat>
      <Stat label="после последнего токена" value={formatMilliseconds(timing.tailMs)}>
        usage и конец потока
      </Stat>
    </div>
  );
}

function Stat(props: { label: string; value: string; children: React.ReactNode }): ReactElement {
  return (
    <div className={styles.stat}>
      <small>{props.label}</small>
      <b>{props.value}</b>
      <span>{props.children}</span>
    </div>
  );
}

function tokensAndRate(tokens: number, rate: number | null): string {
  const count = `${formatRu(tokens)} ток.`;
  return rate === null ? count : `${count} · ≈${String(rate)} ток/с`;
}

// Все запросы сессии с фазами — в одном масштабе: видно, что тянет время, prompt или ответ.
function Comparison({
  current,
  calls,
}: {
  current: ModelCall;
  calls: ModelCall[];
}): ReactElement | null {
  const rows = calls.flatMap((call) => {
    const timing = inferenceTiming(call.response);
    return timing === null || call.response === null
      ? []
      : [{ call, timing, response: call.response }];
  });
  if (rows.length < 2) {
    return null;
  }
  const scaleMs = Math.max(...rows.map((row) => row.timing.totalMs));
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption>Запросы сессии в одном масштабе</caption>
        <thead>
          <tr>
            <th scope="col">Запрос</th>
            <th scope="col">Фазы</th>
            <th scope="col">до 1-го токена</th>
            <th scope="col">prompt не из кэша</th>
            <th scope="col">output</th>
            <th scope="col">всего</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ call, timing, response }) => (
            <tr key={call.requestId} data-current={call.requestId === current.requestId}>
              <th scope="row">
                <AgentChip agentId={call.agentId} /> {stepLabel(call)}{' '}
                <ModelActor requestId={call.requestId} />
              </th>
              <td className={styles.barCell}>
                <PhaseBar timing={timing} scaleMs={scaleMs} mini />
              </td>
              <td>{formatSeconds(timing.waitMs)}</td>
              <td>{formatRu(response.reply.usage.inputCacheMissTokens)}</td>
              <td>{formatRu(response.reply.usage.outputTokens)}</td>
              <td>{formatSeconds(timing.totalMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function stepLabel(call: ModelCall): string {
  return call.iteration === null ? 'служебный' : `шаг ${String(call.iteration)}`;
}
