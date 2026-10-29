// Экскурсия поверх открытого трейса: подсветка цели и карточка остановки. Вкладку и раскрытие
// переключает тот, кто показывает экскурсию (onApply), — здесь листание, перемотка плеера, клавиши
// (← → и Esc) и раскладка. Подсветка не перехватывает клики: под ней можно щёлкать самому.

import type { HarnessEvent } from '@harness-visualization/harness';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Button } from '../../components/Button';
import { timeAt, type Schedule } from '../../timeline/schedule';
import type { TimelineClock } from '../../timeline/TimelineClock';
import { BRANCH_REQUEST, TOUR_STOPS, type TourStop } from './tourStops';
import styles from './Tour.module.css';

interface TourProps {
  // Остановка из адреса (с нуля) — с неё экскурсия начинается.
  initial: number;
  events: readonly HarnessEvent[];
  clock: TimelineClock;
  schedule: Schedule;
  // Открыть вкладку остановки и записать её в адрес.
  onApply: (stop: number) => void;
  onExit: () => void;
  onFinish: () => void;
}

export function Tour(props: TourProps): ReactElement {
  const { ready, pending, go } = useTourPaging(props);
  useScrollLock();
  useTourKeys(pending ?? ready, go, props.onExit);
  const stop = ready === null ? null : (TOUR_STOPS[ready] ?? null);
  useLiftedControl(stop?.also ?? null);
  if (ready === null || stop === null) {
    return <TourLoader still />;
  }
  // Подсветка и карточка — отдельные компоненты: подсветка следует за целью каждый кадр, и
  // перерисовываться при этом должна она одна, а не вся карточка с текстом.
  return (
    <>
      <Spot stop={stop} index={ready} />
      <TourCard
        stop={ready}
        stopData={stop}
        pending={pending !== null}
        onGo={go}
        onExit={props.onExit}
        onFinish={props.onFinish}
      />
    </>
  );
}

// «Попробуйте» про плеер: метка на корне документа поднимает плеер над затемнением и включает
// пульсирующую рамку на нужном элементе (стили — в Tour.module.css).
function useLiftedControl(control: string | null): void {
  useEffect(() => {
    if (control === null) {
      return undefined;
    }
    document.documentElement.dataset.tourAlso = control;
    return () => {
      delete document.documentElement.dataset.tourAlso;
    };
  }, [control]);
}

function Spot({ stop, index }: { stop: TourStop; index: number }): ReactElement | null {
  const rect = useTargetRect(stop, index);
  if (rect === null) {
    return null;
  }
  return (
    <div
      className={styles.spot}
      data-glide={rect.glide}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      aria-hidden
    />
  );
}

// Пока идёт экскурсия, страница и колонки не прокручиваются — ни колесом, ни пальцем, ни
// клавишами: иначе подсвеченная часть уезжает из-под карточки. Прокручивается только сама
// карточка (если не влезла). Экскурсия сама подводит цель к глазам — scrollIntoView и scrollTo
// работают и при overflow: hidden.
function useScrollLock(): void {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    const block = (event: Event): void => {
      const element = event.target instanceof Element ? event.target : null;
      if ((element?.closest('[data-tour-card]') ?? null) === null) {
        event.preventDefault();
      }
    };
    const options = { passive: false, capture: true };
    window.addEventListener('wheel', block, options);
    window.addEventListener('touchmove', block, options);
    return () => {
      root.style.overflow = previous;
      window.removeEventListener('wheel', block, options);
      window.removeEventListener('touchmove', block, options);
    };
  }, []);
}

// Первый вход: запись ещё идёт с сервера (трейс приходит целиком в конце потока). Затемнение то
// же, что у подсветки, — экскурсия проявляется из него, а не возникает поверх голого экрана.
// Проявляется плашка один раз — на старте, по клику; на экране трейса та же плашка просто стоит
// (still), иначе при смене экрана она мигнула бы.
export function TourLoader({ still = false }: { still?: boolean }): ReactElement {
  return (
    <div className={styles.loader} data-still={still} role="status" aria-live="polite">
      <div className={styles.loaderCard}>
        <span className={styles.spinner} aria-hidden />
        <span>
          <b>Готовим экскурсию</b>
          <span className={styles.loaderText}>Загружаем запись «удалёнка»…</span>
        </span>
      </div>
    </div>
  );
}

interface TourCardProps {
  stop: number;
  stopData: TourStop;
  // Листнули, вкладка новой остановки ещё перерисовывается (ничего не грузится — запись уже
  // в браузере): карточка чуть гаснет, чтобы клик не казался потерянным.
  pending: boolean;
  onGo: (stop: number) => void;
  onExit: () => void;
  onFinish: () => void;
}

function TourCard(props: TourCardProps): ReactElement {
  const { stop, stopData } = props;
  const layout = useCardLayout(stopData, stop);
  const last = stop === TOUR_STOPS.length - 1;
  return (
    <section
      className={styles.card}
      data-tour-card
      data-animate={layout.animate}
      data-pending={props.pending}
      aria-busy={props.pending}
      style={{ left: layout.left, right: layout.right, bottom: layout.bottom }}
      role="dialog"
      aria-labelledby="tour-title"
    >
      {/* key: новая остановка — текст проявляется заново; кнопки снаружи, чтобы фокус на «Дальше»
          не терялся при листании с клавиатуры. */}
      <div key={stop} className={styles.cardBody}>
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
      </div>
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

// Листание — одним кадром: вкладка, адрес, момент плеера, карточка и подсветка меняются в одной
// отрисовке, а не догоняют друг друга. Сразу по клику — только отклик (pending): карточка чуть
// гаснет; два requestAnimationFrame — чтобы этот отклик успел отрисоваться до тяжёлой
// перерисовки вкладки. ready — остановка, которая на экране целиком; null — первый вход,
// запись ещё не пришла.
function useTourPaging({ initial, events, clock, schedule, onApply }: TourProps) {
  const [ready, setReady] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const frames = useRef<number[]>([]);
  const show = useCallback(
    (stop: number): boolean => {
      const at = stopTime(stop, events, schedule);
      if (at === null) {
        return false;
      }
      if (at === 'end') {
        clock.follow();
      } else {
        clock.pause();
        clock.seek(at);
      }
      setReady(stop);
      setPending(null);
      return true;
    },
    [events, schedule, clock],
  );
  // Первый вход: ждём запись, перематываем через кадр (эффекты потомков идут раньше родительских:
  // плеер мог ещё не узнать длину записи — перемотка упёрлась бы в ноль).
  useEffect(() => {
    if (ready !== null) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      show(initial);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [ready, initial, show]);
  useEffect(
    () => () => {
      frames.current.forEach(cancelAnimationFrame);
    },
    [],
  );
  const go = useCallback(
    (stop: number) => {
      setPending(stop);
      frames.current.forEach(cancelAnimationFrame);
      const first = requestAnimationFrame(() => {
        const second = requestAnimationFrame(() => {
          onApply(stop);
          show(stop);
        });
        frames.current = [second];
      });
      frames.current = [first];
    },
    [onApply, show],
  );
  return { ready, pending, go };
}

// Момент остановки на плеере; end — последнее событие: как кнопка «к концу», иначе виды, которые
// ждут конца записи (проверка опоры ответа), его не увидят — перемотка по времени встаёт чуть
// раньше. null — запись ещё не дошла до события.
function stopTime(
  index: number,
  events: readonly HarnessEvent[],
  schedule: Schedule,
): number | 'end' | null {
  const target = TOUR_STOPS[index];
  const first = events[0];
  const event = target === undefined ? undefined : events[target.at];
  if (target === undefined || first === undefined || event === undefined) {
    return null;
  }
  if (target.at >= events.length - 1) {
    return 'end';
  }
  return timeAt(schedule, Date.parse(event.timestamp) - Date.parse(first.timestamp));
}

function useTourKeys(stop: number | null, go: (stop: number) => void, onExit: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const element = event.target instanceof Element ? event.target : null;
      if (
        stop === null ||
        (element !== null && element.closest('input, textarea, select, [contenteditable]') !== null)
      ) {
        return;
      }
      if (event.key === 'Escape') {
        onExit();
      } else if (event.key === 'ArrowRight' && stop < TOUR_STOPS.length - 1) {
        go(stop + 1);
      } else if (event.key === 'ArrowLeft' && stop > 0) {
        go(stop - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [stop, go, onExit]);
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
  // Только что сменили остановку — подсветка переезжает плавно; дальше (прокрутка) — следует за
  // целью сразу, иначе отставала бы от страницы.
  glide: boolean;
}

const GLIDE_MS = 320;

// Где цель на экране: вкладки перерисовываются и прокручиваются, поэтому меряем каждый кадр
// (одно getBoundingClientRect) и перерисовываем подсветку, только когда цель сдвинулась. Первый
// замер — до отрисовки кадра (layout effect): подсветка встаёт вместе с карточкой, а не догоняет
// её. На новой остановке один раз подводим цель к глазам.
function useTargetRect(stop: TourStop | null, index: number): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (stop === null) {
      return undefined;
    }
    let scrolled = false;
    let frame = 0;
    let last = '';
    const changedAt = performance.now();
    const measure = (): void => {
      const element = document.querySelector<HTMLElement>(SELECTORS[stop.target]);
      if (element !== null && !scrolled) {
        scrolled = true;
        bringIntoView(element, stop);
      }
      const glide = performance.now() - changedAt < GLIDE_MS;
      const next =
        element === null
          ? null
          : visibleRect(element.getBoundingClientRect(), floorFor(stop.target), glide);
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setRect(next);
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [stop, index]);
  return rect;
}

// Прокрутка сразу, без плавности: при листании остановок плавная прокрутка читается как задержка.
// Раскрытый вызов вкладка прокручивает к себе сама — тогда страницу не трогаем.
function bringIntoView(element: HTMLElement, stop: TourStop): void {
  if (stop.target === 'branch' || stop.target === 'grounding' || stop.target === 'documents') {
    element.scrollIntoView({ block: 'center' });
  } else if (stop.target === 'view' && stop.focus === undefined) {
    window.scrollTo({ top: 0 });
  }
}

// Нижняя граница подсветки: над плеером — он закреплён внизу поверх страницы, и рамка, ушедшая
// под него, не замыкалась бы (а сквозь стекло плеера просвечивала бы рядом с рамками вкладки).
// Сам плеер подсвечиваем целиком, колонку «Диалог» — тоже: она справа от плеера, а не над ним.
function floorFor(target: TourStop['target']): number {
  const player = document.querySelector(SELECTORS.player)?.getBoundingClientRect();
  if (target === 'player' || target === 'dialog' || player === undefined) {
    return window.innerHeight - 4;
  }
  return player.top - 8;
}

// Цель выше экрана — подсветку обрезаем по краям видимой области, чтобы рамка замыкалась.
function visibleRect(box: DOMRect, floor: number, glide: boolean): Rect {
  const pad = 4;
  const top = Math.max(box.top - pad, 4);
  const bottom = Math.min(box.bottom + pad, floor);
  return {
    left: box.left - pad,
    top,
    width: box.width + pad * 2,
    height: Math.max(bottom - top, 0),
    glide,
  };
}

type CardLayout = Partial<Record<'left' | 'right' | 'bottom', number>> & { animate: boolean };

// Карточка у нижнего края над плеером: справа, а когда смотрим на «Диалог» — левее колонки.
// На узком экране — во всю ширину. Плеер меняет высоту по ходу записи — место пересчитываем каждый
// кадр, но перерисовываем, только когда оно сдвинулось. Первая расстановка — без анимации:
// иначе карточка при появлении подъезжала бы от стартового места.
function useCardLayout(stop: TourStop | null, index: number): CardLayout {
  const [layout, setLayout] = useState<CardLayout>({ right: 16, bottom: 120, animate: false });
  useLayoutEffect(() => {
    let frame = 0;
    let last = '';
    let placed = false;
    const place = (): void => {
      const next = cardPlace(stop);
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setLayout({ ...next, animate: placed });
      }
      placed = true;
      frame = requestAnimationFrame(place);
    };
    place();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [stop, index]);
  return layout;
}

function cardPlace(stop: TourStop | null): Omit<CardLayout, 'animate'> {
  const player = document.querySelector(SELECTORS.player)?.getBoundingClientRect();
  const bottom = Math.round(player === undefined ? 24 : window.innerHeight - player.top + 12);
  if (window.innerWidth <= 760) {
    return { left: 16, right: 16, bottom };
  }
  const dialog = document.querySelector(SELECTORS.dialog)?.getBoundingClientRect();
  const nextToDialog = stop?.target === 'dialog' && dialog !== undefined && dialog.width > 120;
  return { right: nextToDialog ? Math.round(window.innerWidth - dialog.left + 16) : 16, bottom };
}
