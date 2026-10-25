import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './parseMarkdown';

describe('parseMarkdown', () => {
  it('разбирает заголовки, абзацы и списки', () => {
    const blocks = parseMarkdown(
      '# Тема\n\nПервая строка\nпродолжение.\n\n## Раздел\n\n- один\n- два\n',
    );

    expect(blocks.map((block) => block.kind)).toEqual(['title', 'paragraph', 'heading', 'list']);
    expect(blocks[1]).toEqual({
      kind: 'paragraph',
      inlines: [{ kind: 'text', text: 'Первая строка продолжение.' }],
    });
    expect(blocks[3]).toMatchObject({
      kind: 'list',
      items: [[{ text: 'один' }], [{ text: 'два' }]],
    });
  });

  it('абзац сразу после списка идёт после него', () => {
    expect(parseMarkdown('- один\nпотом текст').map((block) => block.kind)).toEqual([
      'list',
      'paragraph',
    ]);
  });

  it('список сразу после абзаца — отдельный блок', () => {
    expect(parseMarkdown('Участники:\n- host\n- server').map((block) => block.kind)).toEqual([
      'paragraph',
      'list',
    ]);
  });
});

describe('parseInline', () => {
  it('жирный, код и ссылки', () => {
    expect(parseInline('**кэш** и `usage`, см. [docs](https://example.com/a)')).toEqual([
      { kind: 'strong', text: 'кэш' },
      { kind: 'text', text: ' и ' },
      { kind: 'code', text: 'usage' },
      { kind: 'text', text: ', см. ' },
      { kind: 'link', text: 'docs', href: 'https://example.com/a' },
    ]);
  });

  it('ссылка не на http(s) остаётся текстом', () => {
    expect(parseInline('[нажми](javascript:alert(1))')).toEqual([
      { kind: 'text', text: '[нажми](javascript:alert(1))' },
    ]);
  });
});
