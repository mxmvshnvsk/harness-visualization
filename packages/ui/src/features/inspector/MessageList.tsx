// Что ушло в модель: messages по порядку (по клику — целиком) и сколько tools предложено.

import { useState, type ReactElement } from 'react';
import styles from './Inspector.module.css';
import { readRequestBody, type RequestMessage } from './readRequestBody';

interface MessageListProps {
  body: Record<string, unknown>;
}

export function MessageList({ body }: MessageListProps): ReactElement {
  const { messages, toolNames } = readRequestBody(body);
  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>
        prompt · {messages.length} messages · {toolNames.length} tools
      </h3>
      {messages.map((message, index) => (
        // Сообщения не меняются и не переставляются — порядковый номер годится как ключ.
        <MessageRow key={index} message={message} />
      ))}
      {toolNames.length > 0 && <div className={styles.caption}>tools: {toolNames.join(', ')}</div>}
    </section>
  );
}

function MessageRow({ message }: { message: RequestMessage }): ReactElement {
  const [open, setOpen] = useState(false);
  const text = describeMessage(message);
  return (
    <details
      className={styles.message}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className={styles.messageSummary}>
        <span className={styles.mono}>{message.role}</span>
        <span className={styles.ellipsis}>{text}</span>
      </summary>
      {open && <pre className={styles.code}>{text}</pre>}
    </details>
  );
}

function describeMessage(message: RequestMessage): string {
  const parts = [message.content ?? '', ...message.toolCalls.map((call) => `tool_call ${call}`)];
  return parts.filter((part) => part !== '').join('\n') || '(пусто)';
}
