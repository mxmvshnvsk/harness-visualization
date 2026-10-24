// Поток событий сессии. Харнесс отправляет сюда события,
// а подписчики (консоль, файл трейса, токеномика, позже — браузер) их получают.

import type { HarnessEvent, HarnessEventPayload } from './harnessEvents.js';

export type EventListener = (event: HarnessEvent) => void;

export class EventStream {
  readonly sessionId: string;
  private readonly listeners: EventListener[] = [];
  private nextSequence = 1;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  subscribe(listener: EventListener): void {
    this.listeners.push(listener);
  }

  emit(payload: HarnessEventPayload): HarnessEvent {
    const event: HarnessEvent = {
      ...payload,
      sequence: this.nextSequence,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
    };
    this.nextSequence += 1;
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }
}
