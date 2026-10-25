// Панель плеера: к началу, шаг назад, воспроизведение, шаг вперёд, к последнему событию,
// скорость и перемотка. Шаг кнопками — по значимым событиям, служебные насквозь.

import type { HarnessEvent } from '@harness-visualization/harness';
import type { ReactElement, ReactNode } from 'react';
import { elapsedAt, SPEEDS, type Speed } from './playback';
import styles from './PlayerBar.module.css';
import type { Player } from './usePlayer';

interface PlayerBarProps {
  player: Player;
  events: readonly HarnessEvent[];
  // Живая сессия: «к последнему» значит «вживую».
  live: boolean;
}

export function PlayerBar({ player, events, live }: PlayerBarProps): ReactElement {
  return (
    <div className={styles.bar}>
      <Transport player={player} live={live} />
      <Seek player={player} events={events} />
    </div>
  );
}

function Transport({ player, live }: { player: Player; live: boolean }): ReactElement {
  return (
    <>
      <IconButton
        label="К началу"
        onClick={() => {
          player.seek(0);
        }}
        path="M6 6v12M18 6l-9 6 9 6V6Z"
      />
      <IconButton
        label="Шаг назад"
        onClick={() => {
          player.step('back');
        }}
        path="M17 6 9 12l8 6V6ZM6 6v12"
      />
      {player.playing ? (
        <IconButton label="Пауза" onClick={player.pause} path="M9 6v12M15 6v12" primary />
      ) : (
        <IconButton label="Воспроизвести" onClick={player.play} path="M8 5v14l11-7L8 5Z" primary />
      )}
      <IconButton
        label="Шаг вперёд"
        onClick={() => {
          player.step('forward');
        }}
        path="m7 6 8 6-8 6V6ZM18 6v12"
      />
      <button
        type="button"
        className={styles.follow}
        aria-pressed={player.following}
        onClick={player.follow}
      >
        {live ? 'вживую' : 'к концу'}
      </button>
      <label className={styles.speed}>
        <span className={styles.visuallyHidden}>Скорость</span>
        <select
          value={player.speed}
          onChange={(event) => {
            player.setSpeed(Number(event.target.value) as Speed);
          }}
        >
          {SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function Seek({
  player,
  events,
}: {
  player: Player;
  events: readonly HarnessEvent[];
}): ReactElement {
  const { cursor, total } = player;
  const seconds = (elapsedAt(events, cursor) / 1000).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <>
      <input
        className={styles.range}
        type="range"
        min={0}
        max={total}
        value={cursor}
        aria-label="Позиция в сессии"
        onChange={(event) => {
          player.seek(Number(event.target.value));
        }}
      />
      <Position>
        событие {cursor} из {total} · +{seconds} с
      </Position>
    </>
  );
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

function Position({ children }: { children: ReactNode }): ReactElement {
  return (
    <span className={styles.position} aria-live="off">
      {children}
    </span>
  );
}
