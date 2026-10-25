import { describe, expect, it } from 'vitest';
import { plural } from './plural';

const REQUESTS = { one: 'запрос', few: 'запроса', many: 'запросов' };

describe('plural', () => {
  it('выбирает форму слова по числу', () => {
    expect([0, 1, 2, 5, 11, 21, 22, 25].map((count) => plural(count, REQUESTS))).toEqual([
      '0 запросов',
      '1 запрос',
      '2 запроса',
      '5 запросов',
      '11 запросов',
      '21 запрос',
      '22 запроса',
      '25 запросов',
    ]);
  });
});
