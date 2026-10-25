import { describe, expect, it } from 'vitest';
import { HELP_TOPICS, helpText } from './helpTopics';
import { parseMarkdown } from './parseMarkdown';

describe('справка', () => {
  it.each(HELP_TOPICS)('у темы %s есть файл с названием, датой проверки и источниками', (topic) => {
    const text = helpText(topic);

    expect(text).not.toBeNull();
    expect(parseMarkdown(text ?? '')[0]?.kind).toBe('title');
    expect(text).toMatch(/Проверено: \d{2}\.\d{2}\.\d{4}/u);
    expect(text).toContain('## Источники');
  });
});
