// Справка из блоков parseMarkdown — обычными элементами React, без innerHTML.

import type { ReactElement } from 'react';
import styles from './Help.module.css';
import { parseMarkdown, type Block, type Inline } from './parseMarkdown';

export function MarkdownView({ text }: { text: string }): ReactElement {
  return (
    <div className={styles.markdown}>
      {parseMarkdown(text).map((block, index) => (
        // Блоки неизменны и не переставляются — порядковый номер годится как ключ.
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }): ReactElement {
  switch (block.kind) {
    case 'title':
      return <h2 className={styles.title}>{renderInlines(block.inlines)}</h2>;
    case 'heading':
      return <h3 className={styles.heading}>{renderInlines(block.inlines)}</h3>;
    case 'paragraph':
      return <p>{renderInlines(block.inlines)}</p>;
    case 'list':
      return (
        <ul>
          {block.items.map((item, index) => (
            <li key={index}>{renderInlines(item)}</li>
          ))}
        </ul>
      );
  }
}

function renderInlines(inlines: Inline[]): ReactElement[] {
  return inlines.map((inline, index) => {
    switch (inline.kind) {
      case 'text':
        return <span key={index}>{inline.text}</span>;
      case 'strong':
        return <strong key={index}>{inline.text}</strong>;
      case 'code':
        return (
          <code key={index} className={styles.code}>
            {inline.text}
          </code>
        );
      case 'link':
        return (
          <a key={index} href={inline.href} target="_blank" rel="noreferrer noopener">
            {inline.text}
          </a>
        );
    }
  });
}
