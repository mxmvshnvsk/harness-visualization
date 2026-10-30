import type { HarnessEvent } from '@harness-visualization/harness';
import { messageKey } from '../../projections/modelActorHistory';
import { toolActorKey } from '../../projections/modelActorIdentity';
import type { MessageOrigin, ModelActor, ModelActors } from '../../projections/modelActorTypes';

export interface ModelActorsContextValue extends ModelActors {
  sourceEvents: readonly HarnessEvent[];
}

export interface ActorReference {
  requestId?: string | null;
  toolCallId?: string | null;
  event?: HarnessEvent;
  eventIndex?: number;
  agentId?: string | null;
}

interface ActorLabel {
  text: string;
  title: string;
}

interface WireHistoryMessage {
  role?: string;
  content?: unknown;
  tool_calls?: { id: string }[];
  tool_call_id?: string;
}

const MODEL_EVENTS = new Set([
  'assistant_message',
  'memory_updated',
  'progress_updated',
  'subagent_finished',
]);

export function modelActorLabel(
  reference: ActorReference,
  actors: ModelActorsContextValue,
): ActorLabel {
  const event = referencedEvent(reference, actors.sourceEvents);
  const toolCallId = reference.toolCallId ?? eventToolCallId(event, actors);
  const actor = referencedActor({ reference, event, toolCallId, actors });
  if (actor === undefined) {
    const text = unknownActorLabel({ reference, event, toolCallId });
    return { text, title: text };
  }
  const prefix = toolCallId ? 'по запросу ' : '';
  const alias = returnedModelAlias(actor);
  return {
    text: `${prefix}${actor.label}${alias}`,
    title: `${actor.provider} · запрос: ${actor.requested} · ответ: ${actor.returned ?? 'ещё нет'}`,
  };
}

function referencedEvent(
  reference: ActorReference,
  events: readonly HarnessEvent[],
): HarnessEvent | undefined {
  if (reference.event !== undefined) {
    return reference.event;
  }
  return reference.eventIndex === undefined ? undefined : events[reference.eventIndex];
}

function eventToolCallId(event: HarnessEvent | undefined, actors: ModelActors): string | null {
  if (event === undefined) {
    return null;
  }
  if ('toolCallId' in event) {
    return event.toolCallId;
  }
  return actors.causes.get(event.sequence) ?? null;
}

function referencedActor(input: {
  reference: ActorReference;
  event: HarnessEvent | undefined;
  toolCallId: string | null;
  actors: ModelActors;
}): ModelActor | undefined {
  const { reference, event, toolCallId, actors } = input;
  if (event !== undefined) {
    return actors.events.get(event.sequence);
  }
  if (reference.requestId) {
    return actors.requests.get(reference.requestId);
  }
  if (!toolCallId) {
    return undefined;
  }
  if (reference.agentId !== undefined) {
    return actors.tools.get(toolActorKey(reference.agentId, toolCallId));
  }
  const matches = [...actors.tools].filter(([key]) => key.endsWith(`:${toolCallId}`));
  return matches.length === 1 ? matches[0]?.[1] : undefined;
}

function unknownActorLabel(input: {
  reference: ActorReference;
  event: HarnessEvent | undefined;
  toolCallId: string | null;
}): string {
  const { reference, event, toolCallId } = input;
  const modelWasInvolved =
    expectsModel(event) || Boolean(reference.requestId) || Boolean(toolCallId);
  if (toolCallId) {
    return 'по запросу модель не указана';
  }
  if (modelWasInvolved) {
    return 'модель не указана';
  }
  return event?.type === 'user_message' ? 'пользователь' : 'харнесс';
}

function expectsModel(event: HarnessEvent | undefined): boolean {
  if (event === undefined) {
    return false;
  }
  if ('requestId' in event || 'toolCallId' in event || MODEL_EVENTS.has(event.type)) {
    return true;
  }
  return event.type === 'skill_loaded' && event.trigger === 'model';
}

function returnedModelAlias(actor: ModelActor): string {
  if (actor.returned === null || actor.returned === '' || actor.returned === actor.requested) {
    return '';
  }
  return ` (запрос: ${actor.requested})`;
}

export function historyMessageLabel(
  message: unknown,
  requestId: string,
  actors: ModelActors,
): string | null {
  if (message === null || typeof message !== 'object') {
    return null;
  }
  const record = message as WireHistoryMessage;
  const key = historyMessageKey(record);
  if (key === null) {
    return null;
  }
  const origin = actors.histories.get(requestId)?.get(key);
  const historyPrefix = origin?.inherited ? 'из истории · ' : '';
  const toolPrefix = record.role === 'tool' ? 'по запросу ' : '';
  const author = historyAuthor(origin);
  return `${historyPrefix}${toolPrefix}${author}`;
}

function historyMessageKey(message: WireHistoryMessage): string | null {
  if (message.role === 'tool') {
    return `tool:${message.tool_call_id ?? ''}`;
  }
  if (message.role === 'assistant') {
    const toolCallIds = message.tool_calls?.map((toolCall) => toolCall.id) ?? [];
    return messageKey(message.content, toolCallIds);
  }
  return null;
}

function historyAuthor(origin: MessageOrigin | undefined): string {
  return origin?.actor?.label ?? 'модель не указана';
}
