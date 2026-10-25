// Проекции фрагментов базы на плоскость для карты смыслов. PCA — своя (vectors.ts), UMAP —
// umap-js (Google PAIR, https://github.com/PAIR-code/umap-js) с фиксированным seed, чтобы
// карта не прыгала между открытиями. Запрос на UMAP кладётся через transform: модель уже
// обучена на фрагментах, запрос встаёт к своим соседям.

import type { LabBase, LabDocument } from '@harness-visualization/mcp-server/lab';
import { UMAP } from 'umap-js';
import { pca, seededRandom, type Point } from '../vectors';

export type MapMethod = 'pca' | 'umap';

export interface MapChunk {
  document: LabDocument;
  position: number;
  text: string;
  vector: number[];
}

export function chunksOf(base: LabBase): MapChunk[] {
  return base.documents.flatMap((document) =>
    document.chunks.map((chunk) => ({ document, ...chunk })),
  );
}

export interface MapLayout {
  points: Point[];
  project: (vector: readonly number[]) => Point | null;
}

export function pcaLayout(vectors: readonly number[][]): MapLayout {
  return {
    points: pca(vectors).points,
    // Компоненты PCA зависят только от фрагментов: запрос добавляется как «лишняя» точка.
    project: (vector) => pca(vectors, [[...vector]]).extra[0] ?? null,
  };
}

const UMAP_SEED = 42;

export function umapLayout(vectors: readonly number[][]): MapLayout {
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: 8,
    minDist: 0.15,
    random: seededRandom(UMAP_SEED),
  });
  const points = umap.fit(vectors.map((vector) => [...vector])) as Point[];
  return {
    points,
    project: (vector) => {
      const [point] = umap.transform([[...vector]]);
      return point === undefined ? null : [point[0] ?? 0, point[1] ?? 0];
    },
  };
}
