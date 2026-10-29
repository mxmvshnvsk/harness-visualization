// Экскурсия поверх открытого трейса: подсветка цели и карточка остановки. Вкладку и раскрытие
// переключает тот, кто показывает экскурсию (onGo), — здесь только перемотка плеера, клавиши
// (← → и Esc) и раскладка. Подсветка не перехватывает клики: под ней можно щёлкать самому.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '../../components/Button';
import { timeAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { BRANCH_REQUEST, TOUR_STOPS, type TourStop } from './tourStops';
import styles from './Tour.module.css';

interface TourProps {
  // Номер остановки с нуля.
  stop: number;
  events: readonly HarnessEvent[];
  clock: TimelineClock;
  schedule: Schedule;
  onGo: (stop: number) => void;
  onExit: () => void;
  onFinish: () => void;
}

export function Tour(props: TourProps): ReactElement | null {
  const stop = TOUR_STOPS[props.stop];
  useSeekToStop(props);
  useTourKeys(props);
  const rect = useTargetRect(stop ?? null, props.stop);
  const layout = useCardLayout(stop ?? null, props.stop);
  if (stop === undefined) {
    return null;
  }
  return (
    <>
      {rect !== null && (
        <div
          className={styles.spot}
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          aria-hidden
        />
      )}
      <TourCard {...props} stopData={stop} layout={layout} />
    </>
  );
}

function TourCard(props: TourProps & { stopData: TourStop; layout: CardLayout }): ReactElement {
  const { stop, stopData, layout } = props;
  const last = stop === TOUR_STOPS.length - 1;
  return (
    <section className={styles.card} style={layout} role="dialog" aria-labelledby="tour-title">
      <div className={styles.count}>
        <span>
          Экскурсия · {stop + 1} из {TOUR_STOPS.length}
        </span>
        <span className={styles.dots} aria-hidden>
          {TOUR_STOPS.map((item, index) => (
            <i key={item.title} data-on={index <= stop} />
          ))}
        </span>
      </div>
      <h3 id="tour-title" className={styles.title}>
        {stopData.title}
      </h3>
      <p className={styles.text}>{stopData.text}</p>
      <div>
        <div className={styles.label}>Куда смотреть</div>
        <p className={styles.text}>{stopData.look}</p>
      </div>
      <p className={styles.try}>
        <b>Попробуйте:</b> {stopData.tryThis}
      </p>
      <div className={styles.nav}>
        <button type="button" className={styles.exit} onClick={props.onExit}>
          Выйти
        </button>
        <span className={styles.navButtons}>
          {stop > 0 && <Button onClick={() => props.onGo(stop - 1)}>← Назад</Button>}
          <Button variant="accent" onClick={() => (last ? props.onFinish() : props.onGo(stop + 1))}>
            {last ? 'Готово' : 'Дальше →'}
          </Button>
        </span>
      </div>
    </section>
  );
}

// Плеер встаёт на момент события остановки — когда запись дошла до него (трейс приходит целиком
// в конце потока). Перематываем один раз на остановку: дальше плеер в руках человека. Через кадр:
// эффекты потомков идут раньше родительских, и плеер мог ещё не узнать длину записи — перемотка
// упёрлась бы в ноль.
function useSeekToStop({ stop, events, clock, schedule }: TourProps): void {
  const done = useRef<number | null>(null);
  const target = TOUR_STOPS[stop];
  const first = events[0];
  const event = target === undefined ? undefined : events[target.at];
  useEffect(() => {
    if (done.current === stop || first === undefined || event === undefined) {
      return undefined;
    }
    // Последнее событие — как кнопка «к концу»: виды, которые ждут конца записи (проверка опоры
    // ответа), иначе не увидят его — перемотка по времени останавливается чуть раньше.
    const last = target !== undefined && target.at >= events.length - 1;
    const at = timeAt(schedule, Date.parse(event.timestamp) - Date.parse(first.timestamp));
    const frame = requestAnimationFrame(() => {
      done.current = stop;
      if (last) {
        clock.follow();
      } else {
        clock.pause();
        clock.seek(at);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [stop, first, event, target, events.length, clock, schedule]);
}

function useTourKeys({ stop, onGo, onExit }: TourProps): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const element = event.target instanceof Element ? event.target : null;
      if (
        element !== null &&
        element.closest('input, textarea, select, [contenteditable]') !== null
      ) {
        return;
      }
      if (event.key === 'Escape') {
        onExit();
      } else if (event.key === 'ArrowRight' && stop < TOUR_STOPS.length - 1) {
        onGo(stop + 1);
      } else if (event.key === 'ArrowLeft' && stop > 0) {
        onGo(stop - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [stop, onGo, onExit]);
}

const SELECTORS: Record<TourStop['target'], string> = {
  dialog: '[data-tour="dialog"]',
  player: '[data-tour="player"]',
  view: '[data-tour="view"]',
  grounding: '[data-tour="grounding"]',
  documents: '[data-tour="documents"]',
  branch: `[data-branch-request="${BRANCH_REQUEST}"]`,
};

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Где цель на экране: вкладки перерисовываются и прокручиваются, поэтому смотрим часто, а на
// новой остановке один раз подводим цель к глазам.
function useTargetRect(stop: TourStop | null, index: number): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (stop === null) {
      return undefined;
    }
    let scrolled = false;
    const measure = (): void => {
      const element = document.querySelector<HTMLElement>(SELECTORS[stop.target]);
      if (element === null) {
        setRect(null);
        return;
      }
      if (!scrolled) {
        scrolled = true;
        bringIntoView(element, stop);
      }
      setRect(visibleRect(element.getBoundingClientRect()));
    };
    const timer = window.setInterval(measure, 120);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [stop, index]);
  return rect;
}

// Раскрытый вызов вкладка прокручивает к себе сама — тогда страницу не трогаем.
function bringIntoView(element: HTMLElement, stop: TourStop): void {
  if (stop.target === 'branch' || stop.target === 'grounding' || stop.target === 'documents') {
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } else if (stop.target === 'view' && stop.focus === undefined) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Цель выше экрана — подсветку обрезаем по краям окна, чтобы рамка была видна.
function visibleRect(box: DOMRect): Rect {
  const pad = 4;
  const top = Math.max(box.top - pad, 4);
  const bottom = Math.min(box.bottom + pad, window.innerHeight - 4);
  return {
    left: box.left - pad,
    top,
    width: box.width + pad * 2,
    height: Math.max(bottom - top, 0),
  };
}

type CardLayout = Partial<Record<'left' | 'right' | 'bottom', number>>;

// Карточка у нижнего края над плеером: справа, а когда смотрим на «Диалог» — левее колонки.
// На узком экране — во всю ширину.
function useCardLayout(stop: TourStop | null, index: number): CardLayout {
  const [layout, setLayout] = useState<CardLayout>({ right: 16, bottom: 120 });
  useEffect(() => {
    const place = (): void => {
      const player = document.querySelector(SELECTORS.player)?.getBoundingClientRect();
      const bottom = player === undefined ? 24 : window.innerHeight - player.top + 12;
      if (window.innerWidth <= 760) {
        setLayout({ left: 16, right: 16, bottom });
        return;
      }
      const dialog = document.querySelector(SELECTORS.dialog)?.getBoundingClientRect();
      const nextToDialog = stop?.target === 'dialog' && dialog !== undefined && dialog.width > 120;
      setLayout({ right: nextToDialog ? window.innerWidth - dialog.left + 16 : 16, bottom });
    };
    place();
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
    };
  }, [stop, index]);
  return layout;
}
