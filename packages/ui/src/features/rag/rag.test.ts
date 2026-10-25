import { describe, expect, it } from 'vitest';
import { chunkParagraphs, paragraphsOf } from './chunking';
import { cosine, pca } from './vectors';

describe('vectors', () => {
  it('косинус: одинаковое направление — 1, перпендикуляр — 0', () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 3])).toBeCloseTo(0);
  });

  it('PCA кладёт точки, разнесённые по главной оси, по разные стороны первой оси', () => {
    const { points, extra } = pca(
      [
        [1, 0, 0],
        [2, 0.1, 0],
        [-1, 0, 0],
        [-2, -0.1, 0],
      ],
      [[3, 0, 0]],
    );
    const [right, , left] = points;
    expect(Math.sign(right?.[0] ?? 0)).toBe(-Math.sign(left?.[0] ?? 0));
    expect(Math.abs(extra[0]?.[0] ?? 0)).toBeGreaterThan(Math.abs(right?.[0] ?? 0));
  });
});

describe('chunking', () => {
  it('абзацы из фрагментов — без повторов перекрытия', () => {
    expect(paragraphsOf(['# Заголовок\n\nА', 'А\n\nБ'])).toEqual(['# Заголовок', 'А', 'Б']);
  });

  it('заголовок в конце куска переходит в следующий, перекрытие — по желанию', () => {
    const pieces = [
      '# Регламент',
      'Первый абзац текста.',
      'Второй абзац текста.',
      '## Раздел',
      'Третий.',
    ];
    expect(chunkParagraphs(pieces, 32, true)).toEqual([
      ['# Регламент', 'Первый абзац текста.'],
      ['Второй абзац текста.'],
      ['## Раздел', 'Третий.'],
    ]);
    expect(chunkParagraphs(pieces, 60, true)[1]?.[0]).toBe('Второй абзац текста.');
    expect(chunkParagraphs(['А'.repeat(30), 'Б'.repeat(30), 'В'.repeat(10)], 70, true)).toEqual([
      ['А'.repeat(30), 'Б'.repeat(30)],
      ['Б'.repeat(30), 'В'.repeat(10)],
    ]);
  });
});
