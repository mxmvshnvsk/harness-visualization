// Поток событий сессии или трейса по SSE (формат — docs/events.md).
// Браузерный EventSource сам переподключается после обрыва и присылает Last-Event-ID,
// а сервер досылает пропущенное. Конец потока — именованное событие end: после него
// закрываем EventSource сами, иначе он переподключится к законченной сессии.
//
// Трейс приходит сотнями событий подряд. Чтобы не перерисовывать экран на каждое,
// события копятся и попадают в состояние раз в кадр (requestAnimationFrame).

import type { HarnessEvent } from '@harness-visualization/harness';
import { useEffect, useState } from 'react';

export type StreamState = 'idle' | 'open' | 'reconnecting' | 'ended';

export interface EventStream<End> {
  events: HarnessEvent[];
  // Содержимое event: end; null — поток ещё идёт.
  end: End | null;
  state: StreamState;
}

function initialStream<End>(url: string | null): EventStream<End> {
  return { events: [], end: null, state: url === null ? 'idle' : 'open' };
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
    const buffer = createFrameBuffer((events) => {
      setStream((current) => ({ ...current, events: [...current.events, ...events] }));
    });
    source.onmessage = (message: MessageEvent<string>) => {
      buffer.push(JSON.parse(message.data) as HarnessEvent);
    };
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

interface FrameBuffer {
  push: (event: HarnessEvent) => void;
  flush: () => void;
  cancel: () => void;
}

function createFrameBuffer(deliver: (events: HarnessEvent[]) => void): FrameBuffer {
  let pending: HarnessEvent[] = [];
  let frame: number | null = null;
  const flush = (): void => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    if (pending.length > 0) {
      deliver(pending);
      pending = [];
    }
  };
  return {
    push: (event) => {
      pending.push(event);
      frame ??= requestAnimationFrame(flush);
    },
    flush,
    cancel: () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      pending = [];
    },
  };
}
