// Сходство двух векторов. Векторы модели нормализованы до длины 1 (см. TextEmbedder),
// а у таких векторов косинус угла между ними равен скалярному произведению:
// 1 — одно направление, 0 — ничего общего.

export function cosineSimilarity(first: number[], second: number[]): number {
  let sum = 0;
  for (let index = 0; index < first.length; index += 1) {
    sum += (first[index] ?? 0) * (second[index] ?? 0);
  }
  return sum;
}
