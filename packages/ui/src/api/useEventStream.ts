// Поток событий сессии или трейса по SSE (формат — docs/events.md).
// Браузерный EventSource сам переподключается после обрыва и присылает Last-Event-ID,
// а сервер досылает пропущенное. Конец потока — именованное событие end: после него
// закрываем EventSource сами, иначе он переподключится к законченной сессии.
//
// Трейс приходит сотнями событий подряд. Чтобы не перерисовывать экран на каждое,
// события копятся и попадают в состояние раз в кадр (requestAnimationFrame).
//
// Кроме событий, живая сессия присылает кусочки ответа модели (этап 8d.2) — именованное
// событие delta без id. Они складываются по requestId в текст рассуждения и ответа, чтобы
// «Диалог» печатал ответ вживую; в события они не попадают.

import type { HarnessEvent, ModelDelta } from '@harness-visualization/harness';
import { useEffect, useState } from 'react';

export type StreamState = 'idle' | 'open' | 'reconnecting' | 'ended';

export interface LiveText {
  reasoning: string;
  answer: string;
}

export type LiveDeltas = Readonly<Record<string, LiveText>>;

export interface EventStream<End> {
  events: HarnessEvent[];
  // Напечатанное моделью по запросам, пока ответ идёт (этап 8d.3).
  deltas: LiveDeltas;
  // Содержимое event: end; null — поток ещё идёт.
  end: End | null;
  state: StreamState;
}

function initialStream<End>(url: string | null): EventStream<End> {
  return { events: [], deltas: {}, end: null, state: url === null ? 'idle' : 'open' };
}

export function useEventStream<End>(url: string | null): EventStream<End> {
  const [stream, setStream] = useState<EventStream<End>>(() => initialStream(url));
  // Адрес сменился — начинаем с пустого потока прямо при отрисовке, а не в эффекте:
  // так React не рисует лишний кадр со старыми событиями (образец из документации React:
  // «Adjusting some state when a prop changes»).
  const [streamUrl, setStreamUrl] = useState(url);
  if (url !== streamUrl) {
    setStreamUrl(url);
    setStream(initialStream(url));
  }

  useEffect(() => {
    if (url === null) {
      return undefined;
    }
    const source = new EventSource(url);
    const buffer = createFrameBuffer((events, deltas) => {
      setStream((current) => ({
        ...current,
        events: events.length === 0 ? current.events : [...current.events, ...events],
        deltas: deltas.length === 0 ? current.deltas : appendDeltas(current.deltas, deltas),
      }));
    });
    source.onmessage = (message: MessageEvent<string>) => {
      buffer.push(JSON.parse(message.data) as HarnessEvent);
    };
    source.addEventListener('delta', (message: MessageEvent<string>) => {
      buffer.pushDelta(JSON.parse(message.data) as ModelDelta);
    });
    source.addEventListener('end', (message: MessageEvent<string>) => {
      source.close();
      buffer.flush();
      setStream((current) => ({
        ...current,
        end: JSON.parse(message.data) as End,
        state: 'ended',
      }));
    });
    source.onopen = () => {
      setStream((current) => ({ ...current, state: 'open' }));
    };
    source.onerror = () => {
      if (source.readyState === EventSource.CONNECTING) {
        setStream((current) => ({ ...current, state: 'reconnecting' }));
      }
    };
    return () => {
      source.close();
      buffer.cancel();
    };
  }, [url]);

  return stream;
}

function appendDeltas(current: LiveDeltas, deltas: ModelDelta[]): LiveDeltas {
  const next: Record<string, LiveText> = { ...current };
  for (const delta of deltas) {
    const text = next[delta.requestId] ?? { reasoning: '', answer: '' };
    next[delta.requestId] = { ...text, [delta.kind]: text[delta.kind] + delta.text };
  }
  return next;
}

interface FrameBuffer {
  push: (event: HarnessEvent) => void;
  pushDelta: (delta: ModelDelta) => void;
  flush: () => void;
  cancel: () => void;
}

function createFrameBuffer(
  deliver: (events: HarnessEvent[], deltas: ModelDelta[]) => void,
): FrameBuffer {
  let pending: HarnessEvent[] = [];
  let pendingDeltas: ModelDelta[] = [];
  let frame: number | null = null;
  const flush = (): void => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    if (pending.length > 0 || pendingDeltas.length > 0) {
      deliver(pending, pendingDeltas);
      pending = [];
      pendingDeltas = [];
    }
  };
  const schedule = (): void => {
    frame ??= requestAnimationFrame(flush);
  };
  return {
    push: (event) => {
      pending.push(event);
      schedule();
    },
    pushDelta: (delta) => {
      pendingDeltas.push(delta);
      schedule();
    },
    flush,
    cancel: () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      pending = [];
      pendingDeltas = [];
    },
  };
}
