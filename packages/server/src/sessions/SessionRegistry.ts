import { traceModelNames } from '@harness-visualization/harness/branch';
// Сессии, запущенные через сервер, — в памяти. У каждой — все её события по порядку
// (буфер) и подписчики, которым события идут вживую. Буфер нужен, чтобы браузер, подключившийся
// позже или переподключившийся после обрыва, получил то, что пропустил: по Last-Event-ID.
// Законченные сессии держим ограниченное число: их трейсы и так лежат на диске.

import type { HarnessEvent, ModelDelta } from '@harness-visualization/harness';

const MAX_FINISHED_SESSIONS = 20;

export type SessionStatus = 'running' | 'finished' | 'failed';

export interface SessionSubscriber {
  onEvent: (event: HarnessEvent) => void;
  // Кусочки ответа модели — только вживую, в буфер не попадают.
  onDelta: (delta: ModelDelta) => void;
  onEnd: (summary: SessionSummary) => void;
}

export interface SessionSummary {
  sessionId: string;
  question: string;
  status: SessionStatus;
  startedAt: string;
  eventCount: number;
  // Путь к трейсу от корня проекта; null — сессия ещё идёт.
  tracePath: string | null;
  model?: string;
  providerName?: string;
  models?: string[];
}

interface SessionEntry {
  summary: SessionSummary;
  events: HarnessEvent[];
  subscribers: Set<SessionSubscriber>;
}

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionEntry>();
  // Кто ждёт, пока закончатся все идущие сессии: остановка сервера.
  private idleWaiters: (() => void)[] = [];

  // Сессию регистрирует первое из двух: её первое событие или ответ startSession, —
  // какое придёт раньше, зависит от того, когда харнесс начнёт отправлять события.
  ensure(sessionId: string, question: string): void {
    if (this.sessions.has(sessionId)) {
      return;
    }
    this.sessions.set(sessionId, {
      summary: {
        sessionId,
        question,
        status: 'running',
        startedAt: new Date().toISOString(),
        eventCount: 0,
        tracePath: null,
      },
      events: [],
      subscribers: new Set(),
    });
  }

  record(event: HarnessEvent): void {
    const entry = this.sessions.get(event.sessionId);
    if (entry === undefined) {
      return;
    }
    entry.events.push(event);
    entry.summary.eventCount = entry.events.length;
    if (event.type === 'session_started') {
      entry.summary.model = event.modelLabel ?? event.model;
      entry.summary.providerName = event.providerName;
    }
    if (event.type === 'model_response' || event.type === 'branch_started') {
      entry.summary.models = traceModelNames(entry.events);
    }
    for (const subscriber of entry.subscribers) {
      subscriber.onEvent(event);
    }
  }

  // Кусочек ответа — сразу подписчикам: при переподключении он не нужен,
  // ответ целиком придёт событием model_response.
  relayDelta(delta: ModelDelta): void {
    for (const subscriber of this.sessions.get(delta.sessionId)?.subscribers ?? []) {
      subscriber.onDelta(delta);
    }
  }

  finish(sessionId: string, outcome: { failed: boolean; tracePath: string }): void {
    const entry = this.sessions.get(sessionId);
    if (entry === undefined) {
      return;
    }
    entry.summary.status = outcome.failed ? 'failed' : 'finished';
    entry.summary.tracePath = outcome.tracePath;
    for (const subscriber of entry.subscribers) {
      subscriber.onEnd({ ...entry.summary });
    }
    entry.subscribers.clear();
    this.forgetOldFinished();
    if (this.runningCount() === 0) {
      this.notifyIdle();
    }
  }

  runningCount(): number {
    return [...this.sessions.values()].filter((entry) => entry.summary.status === 'running').length;
  }

  // Ждёт, пока закончатся все идущие сессии, но не дольше timeoutMs.
  // Возвращает, сколько так и не закончилось.
  async waitForRunning(timeoutMs: number): Promise<number> {
    if (this.runningCount() > 0) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        new Promise<void>((resolve) => this.idleWaiters.push(resolve)),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
      clearTimeout(timer);
    }
    return this.runningCount();
  }

  summary(sessionId: string): SessionSummary | null {
    const entry = this.sessions.get(sessionId);
    return entry === undefined ? null : { ...entry.summary };
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()].map((entry) => ({ ...entry.summary }));
  }

  // События после указанного sequence — то, что подписчик пропустил.
  eventsAfter(sessionId: string, sequence: number): HarnessEvent[] {
    const entry = this.sessions.get(sessionId);
    return entry === undefined ? [] : entry.events.filter((event) => event.sequence > sequence);
  }

  // Возвращает функцию отписки: браузер может закрыть поток в любой момент.
  subscribe(sessionId: string, subscriber: SessionSubscriber): () => void {
    const entry = this.sessions.get(sessionId);
    entry?.subscribers.add(subscriber);
    return () => {
      entry?.subscribers.delete(subscriber);
    };
  }

  private notifyIdle(): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }

  private forgetOldFinished(): void {
    const finished = [...this.sessions.values()].filter(
      (entry) => entry.summary.status !== 'running',
    );
    for (const entry of finished.slice(0, Math.max(0, finished.length - MAX_FINISHED_SESSIONS))) {
      this.sessions.delete(entry.summary.sessionId);
    }
  }
}
