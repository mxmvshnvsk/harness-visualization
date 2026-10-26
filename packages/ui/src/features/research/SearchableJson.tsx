// Поиск в сыром JSON (просьба автора 26.10.2026): совпадения подсвечены, счётчик, переход
// к следующему и предыдущему (Enter / Shift+Enter, ↑ ↓). Пока идёт поиск, длинные строки
// развёрнуты — иначе совпадение в свёрнутой части не найти.

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import styles from './Research.module.css';

// Больше подсветок — тормозит отрисовка; счётчик всё равно честный.
const MAX_MARKS = 1000;

interface Match {
  start: number;
  end: number;
}

export function findMatches(text: string, query: string): Match[] {
  const needle = query.toLocaleLowerCase('ru-RU');
  if (needle === '') {
    return [];
  }
  const haystack = text.toLocaleLowerCase('ru-RU');
  const matches: Match[] = [];
  for (
    let at = haystack.indexOf(needle);
    at >= 0;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    matches.push({ start: at, end: at + needle.length });
  }
  return matches;
}

export function SearchableJson(props: { folded: string; full: string }): ReactElement {
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const text = query === '' ? props.folded : props.full;
  const matches = useMemo(() => findMatches(props.full, query), [props.full, query]);
  const preRef = useRef<HTMLPreElement>(null);
  const active = matches.length === 0 ? -1 : current % matches.length;
  useEffect(() => {
    const pre = preRef.current;
    const mark = pre?.querySelector<HTMLElement>('[data-current="true"]');
    if (pre && mark) {
      pre.scrollTop = mark.offsetTop - pre.clientHeight / 2;
    }
  }, [active, query]);
  const step = (delta: number): void => {
    if (matches.length > 0) {
      setCurrent((active + delta + matches.length) % matches.length);
    }
  };
  return (
    <>
      <SearchBar
        query={query}
        count={matches.length}
        active={active}
        onQuery={(next) => {
          setQuery(next);
          setCurrent(0);
        }}
        onStep={step}
      />
      <pre ref={preRef} className={styles.json}>
        {query === '' ? text : <Highlighted text={text} matches={matches} active={active} />}
      </pre>
    </>
  );
}

function SearchBar(props: {
  query: string;
  count: number;
  active: number;
  onQuery: (query: string) => void;
  onStep: (delta: number) => void;
}): ReactElement {
  return (
    <div className={styles.searchBar}>
      <input
        className={styles.search}
        type="search"
        placeholder="найти в JSON"
        aria-label="Найти в JSON"
        value={props.query}
        onChange={(event) => props.onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            props.onStep(event.shiftKey || event.key === 'ArrowUp' ? -1 : 1);
          }
        }}
      />
      <span className={styles.mono}>{describeCount(props.query, props.count, props.active)}</span>
      <button
        type="button"
        className={styles.chip}
        disabled={props.count === 0}
        onClick={() => props.onStep(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className={styles.chip}
        disabled={props.count === 0}
        onClick={() => props.onStep(1)}
      >
        ↓
      </button>
    </div>
  );
}

function describeCount(query: string, count: number, active: number): string {
  if (query === '') {
    return '';
  }
  return count === 0 ? 'не найдено' : `${String(active + 1)} из ${String(count)}`;
}

function Highlighted(props: {
  text: string;
  matches: readonly Match[];
  active: number;
}): ReactElement {
  const parts: ReactElement[] = [];
  let at = 0;
  props.matches.slice(0, MAX_MARKS).forEach((match, index) => {
    parts.push(<span key={`t${String(index)}`}>{props.text.slice(at, match.start)}</span>);
    parts.push(
      <mark key={`m${String(index)}`} className={styles.mark} data-current={index === props.active}>
        {props.text.slice(match.start, match.end)}
      </mark>,
    );
    at = match.end;
  });
  parts.push(<span key="rest">{props.text.slice(at)}</span>);
  return <>{parts}</>;
}
