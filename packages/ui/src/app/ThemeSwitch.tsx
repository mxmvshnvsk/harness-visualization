// Переключатель темы в шапке и на стартовом экране.

import type { ReactElement } from 'react';
import { Segmented } from '../components/Segmented';
import { useTheme } from './theme';

const OPTIONS = [
  { value: 'auto', label: 'авто' },
  { value: 'light', label: 'светлая' },
  { value: 'dark', label: 'тёмная' },
] as const;

export function ThemeSwitch(): ReactElement {
  const [choice, setChoice] = useTheme();
  return (
    <Segmented label="Тема" options={OPTIONS} value={choice} onChange={setChoice} size="small" />
  );
}
