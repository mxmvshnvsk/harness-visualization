// Подскролл к текущему этапу при воспроизведении. Прокрутка колесом или пальцем ставит его на
// паузу — человек смотрит своё; снимает паузу кнопка «к текущему шагу» или новое воспроизведение.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { useClockValue } from '../../timeline/useTimeline';

interface Follow {
  paused: boolean;
  resume: () => void;
  register: (id: string) => (element: HTMLElement | null) => void;
}

// Сколько после своей прокрутки не считать прокрутку ручной.
const AUTO_SCROLL_MS = 900;

export function useFollowActive(activeId: string | null, clock: TimelineClock): Follow {
  const playing = useClockValue(clock, (state) => state.playing);
  const [paused, setPaused] = useState(false);
  // Новое воспроизведение снимает паузу: состояние правим при рендере, не в эффекте.
  const [wasPlaying, setWasPlaying] = useState(playing);
  if (playing !== wasPlaying) {
    setWasPlaying(playing);
    if (playing) {
      setPaused(false);
    }
  }
  const cards = useRef(new Map<string, HTMLElement>());
  const autoUntil = useRef(0);
  const scrollTo = useCallback((id: string | null) => {
    const card = id === null ? undefined : cards.current.get(id);
    if (card !== undefined) {
      autoUntil.current = performance.now() + AUTO_SCROLL_MS;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    }
  }, []);
  useEffect(() => {
    if (playing && !paused) {
      scrollTo(activeId);
    }
  }, [activeId, playing, paused, scrollTo]);
  useEffect(() => {
    const onManual = (): void => {
      if (performance.now() > autoUntil.current) {
        setPaused(true);
      }
    };
    window.addEventListener('wheel', onManual, { passive: true });
    window.addEventListener('touchmove', onManual, { passive: true });
    return () => {
      window.removeEventListener('wheel', onManual);
      window.removeEventListener('touchmove', onManual);
    };
  }, []);
  const register = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element === null) {
        cards.current.delete(id);
      } else {
        cards.current.set(id, element);
      }
    },
    [],
  );
  const resume = useCallback(() => {
    setPaused(false);
    scrollTo(activeId);
  }, [activeId, scrollTo]);
  // Пауза имеет смысл, только пока идёт воспроизведение.
  return { paused: paused && playing, resume, register };
}
