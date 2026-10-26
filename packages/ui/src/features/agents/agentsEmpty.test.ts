import { describe, expect, it } from 'vitest';
import { EventLog, sessionStarted, subagentStarted } from '../../projections/testEvents';
import { describeNoAgents } from './AgentsView';

describe('пустая вкладка «Агенты»', () => {
  it('субагенты не включены — так и написано, и как их получить', () => {
    const log = new EventLog().add(sessionStarted('tool'));
    expect(describeNoAgents(log.events, log.length)).toMatch(/мультиагентности нет/u);
  });

  it('включены, а модель ответила сама', () => {
    const log = new EventLog()
      .add(sessionStarted('tool', { agents: ['researcher'], parallel: true }))
      .add({ type: 'assistant_message', text: 'ответ' });
    expect(describeNoAgents(log.events, log.length)).toMatch(/модель справилась сама/u);
  });

  it('поручения есть дальше в записи — повтор до них не дошёл', () => {
    const log = new EventLog()
      .add(sessionStarted('tool', { agents: ['researcher'], parallel: true }))
      .add(subagentStarted('researcher-1', 'call-1'));
    expect(describeNoAgents(log.events, 1)).toMatch(/повтор до поручений не дошёл/u);
  });
});
