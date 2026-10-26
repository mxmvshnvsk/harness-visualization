// Режимы Код-арены для evals (этап 10.3): что меняет харнесс, а не модель. Как варианты
// compare-runs для вопросов, только про код: дать ли модели тесты, сколько ей думать
// и сколько места и шагов у неё есть.

import type { ReasoningEffort } from '../model/chatTypes.js';
import type { ContextPreset } from '../settings/settingsSchema.js';

export interface ArenaVariant {
  name: string;
  description: string;
  runTests: boolean;
  // null — как в настройках: effort модели по умолчанию, пресет и лимит шагов арены.
  reasoningEffort: ReasoningEffort | null;
  contextPreset: ContextPreset | null;
  maxIterations: number | null;
}

export const ARENA_VARIANTS: ArenaVariant[] = [
  {
    name: 'blind',
    description: 'вслепую: без run_tests — написал и сдал',
    runTests: false,
    reasoningEffort: null,
    contextPreset: null,
    maxIterations: null,
  },
  {
    name: 'tests',
    description: 'с run_tests: может проверять себя',
    runTests: true,
    reasoningEffort: null,
    contextPreset: null,
    maxIterations: null,
  },
  {
    name: 'tests-max',
    description: 'с run_tests и effort max: больше рассуждения',
    runTests: true,
    reasoningEffort: 'max',
    contextPreset: null,
    maxIterations: null,
  },
  {
    name: 'squeezed',
    description: 'с run_tests, харнесс зажат: контекст demo и 10 шагов',
    runTests: true,
    reasoningEffort: null,
    contextPreset: 'demo',
    maxIterations: 10,
  },
];

export const DEFAULT_ARENA_VARIANTS = ['blind', 'tests'];
