import { describe, expect, it } from 'vitest';
import { EventLog, sessionStarted } from '../projections/testEvents';
import { delayBefore, elapsedAt, MAX_DELAY_MS, MIN_DELAY_MS, stepCursor } from './playback';

// В фабрике событий между соседними событиями 100 мс.
function log(): EventLog {
  return new EventLog()
    .add(sessionStarted())
    .add({ type: 'mcp_server_log', serverName: 'kedr', text: 'старт' })
    .add({
      type: 'network_request',
      host: 'api.deepseek.com',
      route: 'direct',
      viaProxy: false,
      rule: null,
      proxyUrl: null,
    })
    .add({ type: 'user_message', text: 'удалёнка' })
    .add({ type: 'assistant_message', text: 'ответ' });
}

describe('delayBefore', () => {
  it('пауза как в записи, делённая на скорость', () => {
    expect(delayBefore(log().events, 1, 1)).toBe(100);
    expect(delayBefore(log().events, 1, 0.5)).toBe(200);
  });

  it('не короче минимума и не длиннее максимума', () => {
    expect(delayBefore(log().events, 1, 4)).toBe(MIN_DELAY_MS);
    const slow = log().events.map((event, index) =>
      index === 1 ? { ...event, timestamp: '2026-10-25T10:00:00.000Z' } : event,
    );
    expect(delayBefore(slow, 1, 1)).toBe(MAX_DELAY_MS);
  });
});

describe('stepCursor', () => {
  it('вперёд — к следующему значимому событию, служебные насквозь', () => {
    // После session_started (курсор 1) идут mcp_server_log и network_request, потом user_message.
    expect(stepCursor(log().events, 1, 'forward')).toBe(4);
  });

  it('назад — так же, а до начала — к нулю', () => {
    expect(stepCursor(log().events, 4, 'back')).toBe(1);
    expect(stepCursor(log().events, 1, 'back')).toBe(0);
  });

  it('с конца вперёд не уходит', () => {
    expect(stepCursor(log().events, 5, 'forward')).toBe(5);
  });
});

describe('elapsedAt', () => {
  it('время события под курсором от начала', () => {
    expect(elapsedAt(log().events, 4)).toBe(300);
    expect(elapsedAt(log().events, 0)).toBe(0);
  });
});
