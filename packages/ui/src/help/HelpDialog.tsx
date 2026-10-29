// Окно справки — встроенный <dialog>: браузер сам держит фокус внутри и закрывает по Esc.
// Шапка закреплена (мокап, одобренный 29.10.2026): тема всегда на виду, под ней — раздел, который
// сейчас читаете, а полоска внизу шапки показывает, сколько прочитано. Прокручивается только текст.

import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import { Button } from '../components/Button';
import styles from './Help.module.css';
import { helpText, type HelpTopic } from './helpTopics';
import { MarkdownBlocks, renderInlines } from './MarkdownView';
import { parseMarkdown } from './parseMarkdown';

interface HelpDialogProps {
  topic: HelpTopic | null;
  onClose: () => void;
}

export function HelpDialog({ topic, onClose }: HelpDialogProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (topic !== null && !dialog.open) {
      dialog.showModal();
    }
    if (topic === null && dialog.open) {
      dialog.close();
    }
  }, [topic]);
  const text = topic === null ? null : helpText(topic);
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-label="Справка">
      {/* Новая тема — новое чтение: раздел и прогресс с нуля. */}
      <HelpReader key={topic ?? ''} text={text} />
      <div className={styles.dialogFooter}>
        <Button variant="ink" onClick={onClose}>
          Понятно
        </Button>
      </div>
    </dialog>
  );
}

function HelpReader({ text }: { text: string | null }): ReactElement {
  const body = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const reading = useReading(body, bar);
  const blocks = text === null ? [] : parseMarkdown(text);
  const title = blocks.find((block) => block.kind === 'title');
  return (
    <>
      <header className={styles.dialogHead} data-scrolled={reading.scrolled}>
        <h2 className={styles.title}>
          {title === undefined ? 'Справка' : renderInlines(title.inlines)}
        </h2>
        <span className={styles.section} aria-live="polite">
          {reading.section}
        </span>
        <div ref={bar} className={styles.progress} aria-hidden />
      </header>
      <div ref={body} className={styles.dialogBody} onScroll={reading.onScroll}>
        {text === null ? (
          <p>Справки по этой теме пока нет.</p>
        ) : (
          <MarkdownBlocks blocks={blocks.filter((block) => block !== title)} />
        )}
      </div>
    </>
  );
}

interface Reading {
  scrolled: boolean;
  // Подзаголовок, который ушёл выше края последним, — «где я»; пусто, пока читаем начало.
  section: string;
  onScroll: () => void;
}

// Прогресс пишем прямо в стиль полоски — без перерисовки на каждый кадр прокрутки.
function useReading(
  body: RefObject<HTMLDivElement | null>,
  bar: RefObject<HTMLDivElement | null>,
): Reading {
  const [scrolled, setScrolled] = useState(false);
  const [section, setSection] = useState('');
  const onScroll = (): void => {
    const element = body.current;
    if (element === null) {
      return;
    }
    const top = element.scrollTop;
    const range = Math.max(1, element.scrollHeight - element.clientHeight);
    bar.current?.style.setProperty('--read', String(Math.min(1, top / range)));
    setScrolled(top > 4);
    setSection(top > 4 ? passedHeading(element) : '');
  };
  return { scrolled, section, onScroll };
}

function passedHeading(element: HTMLElement): string {
  const edge = element.getBoundingClientRect().top + 8;
  const passed = [...element.querySelectorAll('h3')].filter(
    (heading) => heading.getBoundingClientRect().top <= edge,
  );
  return passed.at(-1)?.textContent ?? '';
}
