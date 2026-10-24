// Пути пакета. Код собирается в dist, поэтому всё считается от этой папки:
// data и .cache лежат рядом с dist, в папке пакета.

import { fileURLToPath } from 'node:url';

export const DATA_DIRECTORY = fileURLToPath(new URL('../data', import.meta.url));
// Модель эмбеддингов и кэш векторов — в .cache, в git они не попадают.
export const MODEL_DIRECTORY = fileURLToPath(new URL('../.cache/models', import.meta.url));
export const VECTOR_CACHE_PATH = fileURLToPath(new URL('../.cache/vectors.json', import.meta.url));
