// Переключатель «Обучение / Исследование» — в шапке и на стартовом экране.

import type { ReactElement } from 'react';
import { setMode, useMode } from '../app/mode';
import { Segmented } from './Segmented';

const MODES = [
  { value: 'learn', label: 'Обучение' },
  { value: 'research', label: 'Исследование' },
] as const;

export function ModeToggle(): ReactElement {
  const mode = useMode();
  return (
    <Segmented
      label="Режим интерфейса"
      size="small"
      options={MODES}
      value={mode}
      onChange={setMode}
    />
  );
}
