// Вычисления лаборатории RAG над векторами — в браузере: векторов около сотни, этого хватает.

export function cosine(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  left.forEach((value, index) => {
    const other = right[index] ?? 0;
    dot += value * other;
    leftNorm += value * value;
    rightNorm += other * other;
  });
  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / Math.sqrt(leftNorm * rightNorm);
}

export type Point = [number, number];

export interface Projection {
  points: Point[];
  // Точки, которые не участвовали в подборе осей (запросы), — спроецированы на те же оси.
  extra: Point[];
}

// PCA — два главных направления разброса, степенным методом по матрице данных.
// Честная линейная проекция: расстояния вдоль осей настоящие, но 382 измерения отброшены.
export function pca(vectors: readonly number[][], extra: readonly number[][] = []): Projection {
  const size = vectors[0]?.length ?? 0;
  const mean = new Array<number>(size).fill(0);
  for (const vector of vectors) {
    vector.forEach((value, index) => {
      mean[index] = (mean[index] ?? 0) + value / vectors.length;
    });
  }
  const centered = vectors.map((vector) =>
    vector.map((value, index) => value - (mean[index] ?? 0)),
  );
  const components: number[][] = [];
  for (let component = 0; component < 2; component += 1) {
    components.push(principalDirection(centered, components, component));
  }
  const project = (vector: readonly number[]): Point => {
    const [first = [], second = []] = components;
    const along = (axis: number[]): number =>
      axis.reduce(
        (sum, value, index) => sum + value * ((vector[index] ?? 0) - (mean[index] ?? 0)),
        0,
      );
    return [along(first), along(second)];
  };
  return { points: vectors.map(project), extra: extra.map(project) };
}

const ITERATIONS = 200;

function principalDirection(rows: number[][], found: number[][], seed: number): number[] {
  const size = rows[0]?.length ?? 0;
  // Детерминированное начало: одна и та же карта при каждом открытии.
  let direction = Array.from({ length: size }, (_unused, index) =>
    Math.sin(index * 7.1 + seed * 3.3),
  );
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const next = new Array<number>(size).fill(0);
    for (const row of rows) {
      const dot = row.reduce((sum, value, index) => sum + value * (direction[index] ?? 0), 0);
      row.forEach((value, index) => {
        next[index] = (next[index] ?? 0) + dot * value;
      });
    }
    for (const axis of found) {
      const dot = next.reduce((sum, value, index) => sum + value * (axis[index] ?? 0), 0);
      axis.forEach((value, index) => {
        next[index] = (next[index] ?? 0) - dot * value;
      });
    }
    const norm = Math.hypot(...next) || 1;
    direction = next.map((value) => value / norm);
  }
  return direction;
}

// Генератор псевдослучайных чисел с seed — для UMAP: одна и та же карта при каждом открытии.
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
