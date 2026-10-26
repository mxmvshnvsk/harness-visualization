// Панель плеера: к началу, шаг назад, воспроизведение, шаг вперёд, «вживую» / «к концу»,
// скорость, зум ленты и лента действий, по которой можно перематывать. Позиция и лента обновляются
// прямо в DOM по кадрам часов — React их не перерисовывает.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Segmented } from '../components/Segmented';
import { realAt, stepTime, type Schedule } from '../timeline/schedule';
import type { TimelineClock } from '../timeline/TimelineClock';
import { useClockValue } from '../timeline/useTimeline';
import { ActionStrip } from './ActionStrip';
import { IconButton } from './IconButton';
import styles from './PlayerBar.module.css';
import { StripMinimap } from './StripMinimap';
import { createStripView } from './stripWindow';
import { ZoomControls } from './ZoomControls';

// Скорости — группой кнопок: все видны сразу и переключаются одним нажатием.
const SPEED_OPTIONS = [0.5, 1, 2, 4].map((value) => ({
  value: String(value),
  label: `${String(value).replace('.', ',')}×`,
}));

interface PlayerBarProps {
  clock: TimelineClock;
  schedule: Schedule;
  // Живая сессия: «к концу» значит «вживую».
  live: boolean;
  // Свёрнут — одна строка: воспроизведение, лента и позиция.
  collapsed: boolean;
  onToggle: () => void;
}

export function PlayerBar(props: PlayerBarProps): ReactElement {
  const { clock, schedule, live, collapsed, onToggle } = props;
  // Окно ленты переживает сворачивание плеера.
  const [view] = useState(createStripView);
  if (collapsed) {
    return (
      <div className={styles.collapsed}>
        <PlayButton clock={clock} />
        <div className={styles.stripCell}>
          <ActionStrip clock={clock} schedule={schedule} view={view} />
        </div>
        <Position clock={clock} schedule={schedule} />
        <ToggleButton collapsed onToggle={onToggle} />
      </div>
    );
  }
  return (
    <div className={styles.bar}>
      <div className={styles.buttons}>
        <Transport clock={clock} schedule={schedule} />
        <FollowAndSpeed clock={clock} live={live} />
        <ZoomControls clock={clock} schedule={schedule} view={view} />
        <Position clock={clock} schedule={schedule} />
        <ToggleButton collapsed={false} onToggle={onToggle} />
      </div>
      <ActionStrip clock={clock} schedule={schedule} view={view} />
      <StripMinimap clock={clock} schedule={schedule} view={view} />
    </div>
  );
}

function ToggleButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <IconButton
      label={collapsed ? 'Развернуть плеер' : 'Свернуть плеер'}
      path={collapsed ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}
      onClick={onToggle}
    />
  );
}

function PlayButton({ clock }: { clock: TimelineClock }): ReactElement {
  const playing = useClockValue(clock, (state) => state.playing);
  return (
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
      <PlayButton clock={clock} />
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
      <Segmented
        label="Скорость"
        options={SPEED_OPTIONS}
        value={String(speed)}
        onChange={(value) => {
          clock.setSpeed(Number(value));
        }}
        size="small"
      />
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
