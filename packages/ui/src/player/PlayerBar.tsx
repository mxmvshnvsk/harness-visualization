// Панель плеера: к началу, шаг назад, воспроизведение, шаг вперёд, «вживую» / «к концу»,
// скорость и лента действий, по которой можно перематывать. Позиция и лента обновляются
// прямо в DOM по кадрам часов — React их не перерисовывает.

import { useEffect, useRef, type ReactElement } from 'react';
import { realAt, stepTime, type Schedule } from '../timeline/schedule';
import type { TimelineClock } from '../timeline/TimelineClock';
import { useClockValue } from '../timeline/useTimeline';
import { ActionStrip } from './ActionStrip';
import styles from './PlayerBar.module.css';

const SPEEDS = [0.5, 1, 2, 4] as const;

interface PlayerBarProps {
  clock: TimelineClock;
  schedule: Schedule;
  // Живая сессия: «к концу» значит «вживую».
  live: boolean;
}

export function PlayerBar({ clock, schedule, live }: PlayerBarProps): ReactElement {
  return (
    <div className={styles.bar}>
      <div className={styles.buttons}>
        <Transport clock={clock} schedule={schedule} />
        <FollowAndSpeed clock={clock} live={live} />
        <Position clock={clock} schedule={schedule} />
      </div>
      <ActionStrip clock={clock} schedule={schedule} />
    </div>
  );
}

// К началу, шаг назад, воспроизведение / пауза, шаг вперёд.
function Transport({
  clock,
  schedule,
}: {
  clock: TimelineClock;
  schedule: Schedule;
}): ReactElement {
  const playing = useClockValue(clock, (state) => state.playing);
  const step = (direction: 'forward' | 'back'): void => {
    clock.seek(stepTime(schedule, clock.getState().time, direction));
  };
  return (
    <>
      <IconButton
        label="К началу"
        path="M6 6v12M18 6l-9 6 9 6V6Z"
        onClick={() => {
          clock.seek(0);
        }}
      />
      <IconButton
        label="Шаг назад"
        path="M17 6 9 12l8 6V6ZM6 6v12"
        onClick={() => {
          step('back');
        }}
      />
      <IconButton
        label={playing ? 'Пауза' : 'Воспроизвести'}
        path={playing ? 'M9 6v12M15 6v12' : 'M8 5v14l11-7L8 5Z'}
        primary
        onClick={() => {
          if (playing) {
            clock.pause();
          } else {
            clock.play();
          }
        }}
      />
      <IconButton
        label="Шаг вперёд"
        path="m7 6 8 6-8 6V6ZM18 6v12"
        onClick={() => {
          step('forward');
        }}
      />
    </>
  );
}

function FollowAndSpeed({ clock, live }: { clock: TimelineClock; live: boolean }): ReactElement {
  const following = useClockValue(clock, (state) => state.following);
  const speed = useClockValue(clock, (state) => state.speed);
  return (
    <>
      <button
        type="button"
        className={styles.follow}
        aria-pressed={following}
        onClick={() => {
          clock.follow();
        }}
      >
        {live ? 'вживую' : 'к концу'}
      </button>
      <label className={styles.speed}>
        <span className={styles.visuallyHidden}>Скорость</span>
        <select
          value={speed}
          onChange={(event) => {
            clock.setSpeed(Number(event.target.value));
          }}
        >
          {SPEEDS.map((value) => (
            <option key={value} value={value}>
              {String(value).replace('.', ',')}×
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

// «сессия 2,25 с из 6,66 с» — по кадрам часов, без перерисовки React.
function Position({ clock, schedule }: { clock: TimelineClock; schedule: Schedule }): ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const total = realAt(schedule, schedule.total);
    const draw = (): void => {
      if (ref.current !== null) {
        const real = realAt(schedule, clock.getState().time);
        ref.current.textContent = `сессия ${formatSeconds(real)} из ${formatSeconds(total)}`;
      }
    };
    draw();
    return clock.subscribe(draw);
  }, [clock, schedule]);
  return <span ref={ref} className={styles.position} />;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} с`;
}

interface IconButtonProps {
  label: string;
  path: string;
  onClick: () => void;
  primary?: boolean;
}

function IconButton({ label, path, onClick, primary = false }: IconButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={primary ? `${styles.icon} ${styles.primary}` : styles.icon}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={path} />
      </svg>
    </button>
  );
}
