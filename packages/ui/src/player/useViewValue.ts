// Значение из окна ленты для React: перерисовка, только когда оно поменялось.

import { useSyncExternalStore } from 'react';
import type { StripView, StripViewState } from './stripWindow';

export function useViewValue<T>(view: StripView, select: (state: StripViewState) => T): T {
  return useSyncExternalStore(view.subscribe, () => select(view.get()));
}
