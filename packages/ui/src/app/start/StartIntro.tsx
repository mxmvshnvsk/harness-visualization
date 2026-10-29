// Стартовый экран в режиме «Обучение»: что это за тренажёр, три слова, без которых не разобраться,
// и три входа — посмотреть готовую запись, спросить самому, разобраться в одной теме.
// По фидбэку экспертов (29.10.2026): на старте было непонятно, что такое сессия и трейс и с чего
// начать. Образцы входа: публичный пример-проект Langfuse — сначала готовые трейсы, потом свои;
// пошаговый разбор одной задачи у LLM Visualization Брендана Байкрофта.

import { useState, type ReactElement } from 'react';
import { RouteRow, useRouteProgress } from './RouteRow';
import { TermPhrase } from '../../help/HelpLinks';
import { TourLoader } from '../../features/tour/Tour';
import styles from './Start.module.css';

interface StartIntroProps {
  // null — примера в списке нет (папку examples/traces убрали).
  onOpenExample: (() => void) | null;
  onAsk: () => void;
  onOpenLabs: () => void;
  // Пример сразу на остановке «ветка от шага» — для шага маршрута новичка.
  onOpenBranch: (() => void) | null;
}

// Введение на старте или, если его скрыли, одна строка со ссылками (мокап, одобренный 29.10.2026:
// старт был перегружен — заголовок экрана дублировал введение, у введения была своя рамка).
export function StartIntro(outer: StartIntroProps): ReactElement {
  const [hidden, setHidden] = useIntroHidden();
  const progress = useRouteProgress();
  const [entering, props] = useTourEntry(outer);
  if (hidden) {
    return (
      <div className={styles.strip}>
        {entering && <TourLoader />}
        <b>Тренажёр по AI-агентам</b>
        <span className={styles.stripLinks}>
          <StripLink onClick={props.onOpenExample}>Как работает тренажёр</StripLink>
          <StripLink onClick={props.onOpenLabs}>Все лаборатории</StripLink>
          {progress !== null && <StripLink onClick={() => setHidden(false)}>{progress}</StripLink>}
          <StripLink onClick={() => setHidden(false)}>Показать введение</StripLink>
        </span>
      </div>
    );
  }
  return (
    <div className={styles.introBlock}>
      {entering && <TourLoader />}
      <section className={styles.hero}>
        <button type="button" className={styles.dismiss} onClick={() => setHidden(true)}>
          Скрыть введение ×
        </button>
        <Lead />
        <LoopDiagram />
      </section>
      <Entries {...props} />
      <RouteRow {...props} />
    </div>
  );
}

function Lead(): ReactElement {
  return (
    <div className={styles.introText}>
      <h1 className={styles.heroTitle}>Тренажёр по AI-агентам</h1>
      <p className={styles.lead}>
        {/* Определение — с источниками в справке: формула «модель + харнесс» — общепринятое
            упрощение, а не строгий термин. */}
        <TermPhrase topic="model-vs-harness">
          Агент складывается из модели и харнесса — кода вокруг неё
        </TermPhrase>
        . Задайте вопрос или откройте готовую запись и посмотрите по шагам, что делает каждый: что
        уходит в модель, какие тулы она вызывает, что разрешает харнесс.
      </p>
      <div className={styles.terms} aria-label="Словарь">
        <span>
          <b>Сессия</b> — разговор с агентом
        </span>
        <span>
          <b>Трейс</b> — его запись в файле
        </span>
        <span>
          <b>Харнесс</b> — код вокруг модели
        </span>
      </div>
    </div>
  );
}

function Entries(props: StartIntroProps): ReactElement {
  return (
    <div className={styles.entryGrid}>
      <Entry
        main
        title="Как работает тренажёр"
        mark="→"
        text="Экскурсия по готовой записи: что где на экране и куда смотреть."
        meta="6 минут · без ключа"
        onClick={props.onOpenExample}
      />
      <Entry
        title="Спросить агента самому"
        mark="↓"
        text="Ваш вопрос станет сессией, а потом записью."
        meta="нужен ключ DeepSeek"
        onClick={props.onAsk}
      />
      <Entry
        title="Разобраться в одной теме"
        mark="→"
        text="Лаборатории: RAG, MCP, токены, Evals, код-арена."
        meta="10–20 минут"
        onClick={props.onOpenLabs}
      />
    </div>
  );
}

interface EntryProps {
  title: string;
  mark: string;
  text: string;
  meta: string;
  onClick: (() => void) | null;
  main?: boolean;
}

// Вход — целиком кнопка: крупная цель, без отдельной кнопки внутри карточки.
function Entry(props: EntryProps): ReactElement {
  return (
    <button
      type="button"
      className={styles.entry}
      data-main={props.main === true}
      disabled={props.onClick === null}
      onClick={() => props.onClick?.()}
    >
      <span className={styles.entryTitle}>
        {props.title} <span aria-hidden>{props.mark}</span>
      </span>
      <span className={styles.entryText}>{props.text}</span>
      <span className={styles.entryMeta}>{props.meta}</span>
    </button>
  );
}

function StripLink(props: { onClick: (() => void) | null; children: string }): ReactElement {
  return (
    <button
      type="button"
      className={styles.stripLink}
      disabled={props.onClick === null}
      onClick={() => props.onClick?.()}
    >
      {props.children}
    </button>
  );
}

// Вход в экскурсию: экран трейса рисуется не мгновенно (в дев-сборке — до полсекунды), и без
// отклика клик казался бы потерянным. Сразу показываем ту же плашку загрузки, что встретит на
// экране трейса, и переходим через два кадра — чтобы она успела отрисоваться.
function useTourEntry(props: StartIntroProps): [boolean, StartIntroProps] {
  const [entering, setEntering] = useState(false);
  const wrap = (open: (() => void) | null): (() => void) | null =>
    open === null
      ? null
      : () => {
          setEntering(true);
          requestAnimationFrame(() => {
            requestAnimationFrame(open);
          });
        };
  return [
    entering,
    { ...props, onOpenExample: wrap(props.onOpenExample), onOpenBranch: wrap(props.onOpenBranch) },
  ];
}

const HIDDEN_KEY = 'hv-intro-hidden';

// Скрыто ли введение — помним в браузере; без хранилища введение просто видно.
function useIntroHidden(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(HIDDEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const change = (next: boolean): void => {
    setHidden(next);
    try {
      window.localStorage.setItem(HIDDEN_KEY, next ? '1' : '0');
    } catch {
      // Хранилище недоступно — выбор живёт до перезагрузки.
    }
  };
  return [hidden, change];
}

// Агент = модель + цикл харнесса: вопрос → харнесс → модель → «вызови тул» → харнесс → … → ответ.
function LoopDiagram(): ReactElement {
  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 420 180"
      role="img"
      aria-label="Агент — это модель плюс цикл харнесса: харнесс отправляет запрос модели, модель просит вызвать тул, харнесс выполняет его и спрашивает снова, пока модель не ответит"
    >
      <rect className={styles.diagramBox} x="4" y="46" width="88" height="58" rx="12" />
      <text x="48" y="72" textAnchor="middle">
        Вопрос
      </text>
      <text className={styles.diagramNote} x="48" y="90" textAnchor="middle">
        пользователь
      </text>
      <rect className={styles.diagramBox} x="134" y="18" width="106" height="114" rx="14" />
      <text x="187" y="60" textAnchor="middle">
        Харнесс
      </text>
      <text className={styles.diagramNote} x="187" y="80" textAnchor="middle">
        prompt, тулы,
      </text>
      <text className={styles.diagramNote} x="187" y="96" textAnchor="middle">
        политика
      </text>
      <rect className={styles.diagramBox} x="328" y="46" width="88" height="58" rx="12" />
      <text x="372" y="72" textAnchor="middle">
        Модель
      </text>
      <text className={styles.diagramNote} x="372" y="90" textAnchor="middle">
        DeepSeek
      </text>
      <path className={styles.diagramLine} d="M92 75 H128" />
      <path className={styles.diagramArrow} d="M132 75 l-8 -4.5 v9z" />
      <path className={styles.diagramLine} d="M240 62 H322" />
      <path className={styles.diagramArrow} d="M326 62 l-8 -4.5 v9z" />
      <path className={styles.diagramLine} d="M328 90 H246" />
      <path className={styles.diagramArrow} d="M242 90 l8 -4.5 v9z" />
      <text className={styles.diagramNote} x="284" y="54" textAnchor="middle">
        запрос
      </text>
      <text className={styles.diagramNote} x="284" y="108" textAnchor="middle">
        «вызови тул»
      </text>
      <path className={styles.diagramLine} d="M207 132 c0 24 -40 24 -40 0" />
      <path className={styles.diagramArrow} d="M167 134 l-4.5 8 h9z" />
      <text className={styles.diagramNote} x="187" y="174" textAnchor="middle">
        цикл, пока модель не ответит
      </text>
    </svg>
  );
}
