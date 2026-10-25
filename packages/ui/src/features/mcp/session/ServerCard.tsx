// Сервер: кого харнесс запустил, как сервер представился, доверяем ли его пометкам, что он
// прислал в system prompt и что писал в свой журнал (stderr).

import type { ReactElement } from 'react';
import type { McpJournalItem, McpServerView } from '../../../projections/projectMcp';
import { formatMs } from './mcpFormat';
import styles from './McpSession.module.css';

export function ServerCard(props: {
  server: McpServerView;
  journal: readonly McpJournalItem[];
}): ReactElement {
  const { server } = props;
  const logs = props.journal.flatMap((item) =>
    item.kind === 'log' && item.log.serverName === server.name ? [item.log] : [],
  );
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Сервер {server.name}</h2>
      <p className={styles.sub}>
        Кого харнесс запустил, как сервер представился и что прислал без проверки.
      </p>
      <div className={styles.server}>
        <ServerFacts server={server} />
        <div className={styles.stack}>
          <div className={styles.box}>
            <span className={styles.role}>инструкции сервера → ушли в system prompt</span>
            {server.ready?.instructions ?? '—'}
          </div>
          <div className={styles.box}>
            <span className={styles.role}>stderr сервера ({logs.length})</span>
            <ul className={styles.logs}>
              {logs.length === 0 ? (
                <li>пока пусто</li>
              ) : (
                logs.map((log) => (
                  <li key={log.index}>
                    +{formatMs(log.at - server.started.at)} {log.text}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServerFacts({ server }: { server: McpServerView }): ReactElement {
  const { ready } = server;
  return (
    <dl className={styles.facts}>
      <dt>команда запуска</dt>
      <dd className={styles.mono}>
        {server.command} {server.args.join(' ')}
      </dd>
      <dt>представился</dt>
      <dd>
        {ready?.serverInfo === null || ready === null ? (
          '—'
        ) : (
          <>
            <span className={styles.mono}>
              {ready.serverInfo.name} {ready.serverInfo.version}
            </span>
            , протокол {ready.protocolVersion ?? '—'}
          </>
        )}
      </dd>
      <dt>запуск</dt>
      <dd>{startText(server)}</dd>
      <dt>пометкам тулов</dt>
      <dd>
        <span className={styles.chip} data-tone={server.trustAnnotations ? 'on' : 'off'}>
          {server.trustAnnotations ? 'доверяем · trustAnnotations' : 'не доверяем'}
        </span>{' '}
        {server.trustAnnotations
          ? '— readOnlyHint превращается в класс действия read'
          : '— классы действий неизвестны, политика спросит человека'}
      </dd>
      <dt>остановлен</dt>
      <dd>
        {server.stopped === null
          ? 'работает'
          : `через ${formatMs(server.stopped.at - server.started.at)} после запуска`}
      </dd>
    </dl>
  );
}

function startText(server: McpServerView): string {
  if (server.failed !== null) {
    return `не запустился: ${server.failed.message}`;
  }
  return server.ready === null
    ? 'идёт…'
    : `${formatMs(server.ready.durationMs)}: initialize → tools/list`;
}
