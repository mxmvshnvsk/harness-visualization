// Стартовый экран в режиме «Обучение»: что это за стенд, три слова, без которых не разобраться,
// и три входа — посмотреть готовую запись, спросить самому, разобраться в одной теме.
// По фидбэку экспертов (29.10.2026): на старте было непонятно, что такое сессия и трейс и с чего
// начать. Образцы входа: публичный пример-проект Langfuse — сначала готовые трейсы, потом свои;
// пошаговый разбор одной задачи у LLM Visualization Брендана Байкрофта.

import type { ReactElement } from 'react';
import { Button } from '../../components/Button';
import styles from './Start.module.css';

interface StartIntroProps {
  // null — примера в списке нет (папку examples/traces убрали).
  onOpenExample: (() => void) | null;
  onAsk: () => void;
  onOpenLabs: () => void;
}

export function StartIntro(props: StartIntroProps): ReactElement {
  return (
    <>
      <section className={styles.intro}>
        <div className={styles.introText}>
          <h2 className={styles.introTitle}>
            Учебный стенд: агент работает на настоящей модели, а вы видите каждый его шаг
          </h2>
          <p className={styles.muted}>
            Что ушло в модель, какие тулы она попросила, что разрешил харнесс и из чего сложился
            ответ. Агент — сотрудник вымышленной компании «Кедр Софт», отвечает по её документам.
          </p>
          <dl className={styles.glossary}>
            <div>
              <dt>Сессия</dt>
              <dd>разговор с агентом, который идёт сейчас</dd>
            </div>
            <div>
              <dt>Трейс</dt>
              <dd>запись сессии в файле: открыть снова, переслать, ответвиться от шага</dd>
            </div>
            <div>
              <dt>Харнесс</dt>
              <dd>код вокруг модели: собирает prompt, вызывает тулы, решает, что можно</dd>
            </div>
          </dl>
        </div>
        <LoopDiagram />
      </section>
      <div className={styles.entries}>
        <span className={styles.label}>С чего начать</span>
        <div className={styles.entryGrid}>
          <Entry
            main
            title="Посмотреть, как работает агент"
            text="Готовая запись по шагам: что агент спросил у модели, какие тулы вызвал и как пришёл к ответу."
            tags={['3 минуты', 'без ключа']}
            action="Открыть пример"
            onAction={props.onOpenExample}
          />
          <Entry
            title="Спросить агента самому"
            text="Ваш вопрос — новая сессия. Смотрите её вживую; когда закончится, она сохранится трейсом."
            tags={['нужен ключ DeepSeek']}
            action="К вопросу ↓"
            onAction={props.onAsk}
          />
          <Entry
            title="Разобраться в одной теме"
            text="Лаборатории: поиск по документам, тулы и MCP, оценка агента, выбор токена, агент-программист."
            tags={['5 тем', '10–20 минут']}
            action="Выбрать тему"
            onAction={props.onOpenLabs}
          />
        </div>
      </div>
    </>
  );
}

interface EntryProps {
  title: string;
  text: string;
  tags: readonly string[];
  action: string;
  onAction: (() => void) | null;
  main?: boolean;
}

function Entry(props: EntryProps): ReactElement {
  return (
    <article className={styles.entry} data-main={props.main === true}>
      <h3 className={styles.entryTitle}>{props.title}</h3>
      <p className={styles.muted}>{props.text}</p>
      <span className={styles.tags}>
        {props.tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
          </span>
        ))}
      </span>
      <Button
        className={styles.entryAction}
        variant={props.main === true ? 'accent' : 'ink'}
        disabled={props.onAction === null}
        onClick={() => props.onAction?.()}
      >
        {props.action}
      </Button>
    </article>
  );
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
