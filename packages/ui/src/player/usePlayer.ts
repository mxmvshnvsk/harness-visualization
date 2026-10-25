// Плеер: какая часть событий показана. Экраны строятся из первых cursor событий, поэтому
// повтор, пауза и перемотка — это просто другой курсор, а не другой код экранов.
//
// following — курсор следует за последним событием: так открывается живая сессия
// (новые события появляются сразу) и любой трейс без ?at= в адресе.
// Позиция хранится в адресе (?at=), чтобы ссылкой можно было показать конкретный момент.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useEffect, useState } from 'react';
import { delayBefore, isNotService, stepCursor, type IsShown, type Speed } from './playback';

export interface Player {
  // Сколько событий показано.
  cursor: number;
  total: number;
  following: boolean;
  playing: boolean;
  speed: Speed;
  play: () => void;
  pause: () => void;
  step: (direction: 'forward' | 'back') => void;
  seek: (cursor: number) => void;
  follow: () => void;
  setSpeed: (speed: Speed) => void;
}

interface PlayerState {
  following: boolean;
  cursor: number;
  playing: boolean;
  speed: Speed;
}

// isShown — что видно в текущем виде: от этого зависят темп воспроизведения и шаги кнопками.
export function usePlayer(
  events: readonly HarnessEvent[],
  isShown: IsShown = isNotService,
): Player {
  const [state, setState] = useState<PlayerState>(initialState);
  const total = events.length;
  const cursor = state.following ? total : Math.min(state.cursor, total);
  const playing = state.playing && !state.following && cursor < total;

  // Воспроизведение: через паузу, как в записи, показываем следующее событие.
  // Дошли до конца — переходим в «следить за последним»: в живой сессии так и продолжится.
  useEffect(() => {
    if (!playing) {
      return undefined;
    }
    const timer = setTimeout(
      () => {
        setState((current) =>
          cursor + 1 >= total
            ? { ...current, following: true, playing: false }
            : { ...current, cursor: cursor + 1 },
        );
      },
      delayBefore(events, cursor, state.speed, isShown),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [playing, cursor, total, events, state.speed, isShown]);

  useAtParam(state.following ? null : cursor);

  const stopAt = (next: number): void => {
    setState((current) => ({ ...current, playing: false, following: false, cursor: next }));
  };

  return {
    cursor,
    total,
    following: state.following,
    playing,
    speed: state.speed,
    play: () => {
      // С конца — повтор с начала.
      setState((current) => ({
        ...current,
        playing: true,
        following: false,
        cursor: cursor >= total ? 0 : cursor,
      }));
    },
    pause: () => {
      stopAt(cursor);
    },
    step: (direction) => {
      stopAt(stepCursor(events, cursor, direction, isShown));
    },
    seek: stopAt,
    follow: () => {
      setState((current) => ({ ...current, playing: false, following: true }));
    },
    setSpeed: (speed) => {
      setState((current) => ({ ...current, speed }));
    },
  };
}

// Позиция — в адресе (?at=), пока курсор не следует за последним событием.
function useAtParam(cursor: number | null): void {
  useEffect(() => {
    writeAtParam(cursor);
  }, [cursor]);
}

function initialState(): PlayerState {
  const at = readAtParam();
  return { following: at === null, cursor: at ?? 0, playing: false, speed: 1 };
}

function readAtParam(): number | null {
  const value = new URLSearchParams(window.location.search).get('at');
  const number = value === null ? Number.NaN : Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

// replaceState, а не pushState: перемотка — не переход, «назад» в браузере её не листает.
function writeAtParam(cursor: number | null): void {
  const params = new URLSearchParams(window.location.search);
  if (cursor === null) {
    params.delete('at');
  } else {
    params.set('at', String(cursor));
  }
  const query = params.toString();
  window.history.replaceState(
    window.history.state,
    '',
    query === '' ? window.location.pathname : `?${query}`,
  );
}
