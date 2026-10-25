// Поток событий сессии. Харнесс отправляет сюда события,
// а подписчики (консоль, файл трейса, токеномика, позже — браузер) их получают.
//
// У субагента (этап 6c) — свой вид того же потока: forAgent. Номера событий и подписчики общие,
// а к каждому событию добавляется agentId — так в одном трейсе видно, кто что делал.

import type { HarnessEvent, HarnessEventPayload, ModelDelta } from './harnessEvents.js';

export type EventListener = (event: HarnessEvent) => void;
export type DeltaListener = (delta: ModelDelta) => void;

interface SharedStream {
  listeners: EventListener[];
  // Подписчики кусочков ответа (этап 8d.2): трейс среди них не бывает.
  deltaListeners: DeltaListener[];
  nextSequence: number;
}

export class EventStream {
  readonly sessionId: string;
  // null — главный агент.
  readonly agentId: string | null;
  private readonly shared: SharedStream;
  // Только для вида субагента: видит его события (так копится его токеномика).
  private readonly observer: EventListener | null;

  constructor(
    sessionId: string,
    scope: { agentId: string; shared: SharedStream; observer: EventListener | null } | null = null,
  ) {
    this.sessionId = sessionId;
    this.agentId = scope?.agentId ?? null;
    this.shared = scope?.shared ?? { listeners: [], deltaListeners: [], nextSequence: 1 };
    this.observer = scope?.observer ?? null;
  }

  subscribe(listener: EventListener): void {
    this.shared.listeners.push(listener);
  }

  subscribeDeltas(listener: DeltaListener): void {
    this.shared.deltaListeners.push(listener);
  }

  // Кусочек ответа модели — мимо трейса и без номера события.
  emitDelta(delta: Pick<ModelDelta, 'requestId' | 'kind' | 'text'>): void {
    const full: ModelDelta = {
      type: 'model_delta',
      sessionId: this.sessionId,
      ...(this.agentId === null ? {} : { agentId: this.agentId }),
      ...delta,
    };
    for (const listener of this.shared.deltaListeners) {
      listener(full);
    }
  }

  // Поток субагента: те же номера и подписчики, события помечены его agentId.
  forAgent(agentId: string, observer: EventListener | null = null): EventStream {
    return new EventStream(this.sessionId, { agentId, shared: this.shared, observer });
  }

  emit(payload: HarnessEventPayload): HarnessEvent {
    const event: HarnessEvent = {
      ...payload,
      sequence: this.shared.nextSequence,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      ...(this.agentId === null ? {} : { agentId: this.agentId }),
    };
    this.shared.nextSequence += 1;
    this.observer?.(event);
    for (const listener of this.shared.listeners) {
      listener(event);
    }
    return event;
  }
}
