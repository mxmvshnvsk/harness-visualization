import { ModelActor } from './models/ModelActor';
// Лента событий: номер, время от начала, тип, коротко. Полное событие — по клику, в JSON.
// Это «сырой» вид потока; таймлайн и инспектор (8.3) построят из тех же событий свои виды.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useState, type ReactElement } from 'react';
import { describeEvent } from '../events/describeEvent';
import { eventGroup, SERVICE_EVENT_TYPES } from '../events/eventGroups';
import { Segmented } from '../components/Segmented';
import { AgentChip } from './agents/AgentChip';
import { useAgentLabels } from './agents/agentLabels';
import styles from './EventList.module.css';
import { formatFixed } from '../text/formatNumber';

interface EventListProps {
  events: HarnessEvent[];
}

// Чьё событие для фильтра: '' — все, 'main' — главного агента, иначе id субагента.
const ALL = '';
const MAIN = 'main';

export function EventList({ events }: EventListProps): ReactElement {
  const [showService, setShowService] = useState(false);
  const [agent, setAgent] = useState(ALL);
  const labels = useAgentLabels();
  const startedAt = events.length === 0 ? 0 : Date.parse(events[0]?.timestamp ?? '');
  const visible = events.filter(
    (event) => (showService || !SERVICE_EVENT_TYPES.has(event.type)) && ofAgent(event, agent),
  );
  return (
    <div className={styles.list}>
      {labels.enabled && (
        <Segmented
          label="Чьи события"
          size="small"
          options={[
            { value: ALL, label: 'все' },
            { value: MAIN, label: 'главный' },
            ...labels.subagents.map((id) => ({ value: id, label: id })),
          ]}
          value={agent}
          onChange={setAgent}
        />
      )}
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={showService}
          onChange={(event) => {
            setShowService(event.target.checked);
          }}
        />
        показать служебные (mcp_message, network_request, mcp_server_log)
      </label>
      {visible.map((event) => (
        <EventRow key={event.sequence} event={event} startedAt={startedAt} />
      ))}
    </div>
  );
}

function ofAgent(event: HarnessEvent, agent: string): boolean {
  if (agent === ALL) {
    return true;
  }
  return agent === MAIN ? event.agentId === undefined : event.agentId === agent;
}

interface EventRowProps {
  event: HarnessEvent;
  startedAt: number;
}

function EventRow({ event, startedAt }: EventRowProps): ReactElement {
  const [open, setOpen] = useState(false);
  const offsetSeconds = (Date.parse(event.timestamp) - startedAt) / 1000;
  return (
    <details
      className={styles.row}
      data-group={eventGroup(event.type)}
      onToggle={(toggle) => {
        setOpen(toggle.currentTarget.open);
      }}
    >
      <summary className={styles.summary}>
        <span className={styles.number}>{event.sequence}</span>
        <span className={styles.time}>+{formatFixed(offsetSeconds, 2)} с</span>
        <span className={styles.type}>
          {event.type} <ModelActor event={event} /> <AgentChip agentId={event.agentId} />
        </span>
        <span className={styles.text}>{describeEvent(event)}</span>
      </summary>
      {/* JSON строится только у раскрытой строки: в model_request весь prompt. */}
      {open && <pre className={styles.json}>{JSON.stringify(event, null, 2)}</pre>}
    </details>
  );
}
