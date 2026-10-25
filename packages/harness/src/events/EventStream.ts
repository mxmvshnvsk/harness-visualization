// Поток событий сессии. Харнесс отправляет сюда события,
// а подписчики (консоль, файл трейса, токеномика, позже — браузер) их получают.
//
// У субагента (этап 6c) — свой вид того же потока: forAgent. Номера событий и подписчики общие,
// а к каждому событию добавляется agentId — так в одном трейсе видно, кто что делал.

import type { HarnessEvent, HarnessEventPayload } from './harnessEvents.js';

export type EventListener = (event: HarnessEvent) => void;

interface SharedStream {
  listeners: EventListener[];
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
    this.shared = scope?.shared ?? { listeners: [], nextSequence: 1 };
    this.observer = scope?.observer ?? null;
  }

  subscribe(listener: EventListener): void {
    this.shared.listeners.push(listener);
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
