import { describe, expect, it } from 'vitest';
import { continuationFacts } from '@harness-visualization/harness/branch';
import { EventLog, modelRequest, modelResponse, usage } from '../projections/testEvents';

describe('continuation metrics', () => {
  it('charges fresh services and agents, excluding prefix and later questions', () => {
    const log = new EventLog()
      .add(modelRequest('prefix', 1))
      .add(modelResponse('prefix', { usage: usage(1, 0), costUsd: 1 }))
      .add({ type: 'assistant_message', text: 'prefix' })
      .add({ type: 'user_message', text: 'current' })
      .add(modelRequest('selected', 1))
      .add(modelResponse('selected', { usage: usage(1, 0), costUsd: 2 }))
      .add(modelRequest('service', null, 'queryRewrite'))
      .add(modelResponse('service', { usage: usage(1, 0), costUsd: 3 }))
      .add({ type: 'assistant_message', text: 'current answer' })
      .add({ type: 'user_message', text: 'later' })
      .add(modelRequest('later', 1))
      .add(modelResponse('later', { usage: usage(1, 0), costUsd: 100 }))
      .add({ type: 'assistant_message', text: 'later answer' });
    expect(continuationFacts(log.events, 2)).toMatchObject({
      answer: 'current answer',
      modelRequests: 2,
      costUsd: 5,
    });
  });
  it('keeps cost unknown if a response has no price or is pending', () => {
    const log = new EventLog().add(modelRequest('r', 1));
    expect(continuationFacts(log.events).costUsd).toBeNull();
    log.add(modelResponse('r', { usage: usage(1, 0), costUsd: null }));
    expect(continuationFacts(log.events).costUsd).toBeNull();
  });
});
