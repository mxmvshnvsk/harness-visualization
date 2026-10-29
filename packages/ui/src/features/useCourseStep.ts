// Шаг урока лаборатории (RAG, MCP): номер на экране и id в адресе (?step=check). Открыли по ссылке
// на шаг — начинаем с него; листаем шаги — адрес идёт следом, не плодя записей в истории.

import { useState } from 'react';
import { markRouteStep } from '../app/start/route';

export function useCourseStep(
  steps: readonly { id: string }[],
  initialStep: string | null,
  onStepChange: (id: string) => void,
): [number, (index: number) => void] {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      steps.findIndex((step) => step.id === initialStep),
    ),
  );
  const go = (next: number): void => {
    setIndex(next);
    // Дошли до последнего шага урока — шаг «Одна лаборатория» маршрута новичка пройден.
    if (next === steps.length - 1) {
      markRouteStep('lab');
    }
    window.scrollTo({ top: 0 });
    const id = steps[next]?.id;
    if (id !== undefined) {
      onStepChange(id);
    }
  };
  return [index, go];
}
