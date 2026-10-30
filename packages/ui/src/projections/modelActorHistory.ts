import type { HarnessEvent } from '@harness-visualization/harness';
import type { EventOfType } from '../events/eventTypes';
import { inheritedModelActor } from './modelActorIdentity';
import type { MessageOrigin, ModelActors } from './modelActorTypes';

export function inheritedModelHistory(
  events: readonly HarnessEvent[],
  actors: ModelActors,
): Map<string, MessageOrigin> {
  const history = new Map<string, MessageOrigin>();
  const branch = events.find((event) => event.type === 'branch_started');
  if (branch === undefined) {
    return history;
  }
  const prompt = events.find((event) => event.type === 'prompt_assembled');
  for (const entry of inheritedEntries(branch)) {
    const actor = inheritedModelActor(entry.model);
    actors.inherited.push(actor);
    const message = prompt?.messages[entry.messageIndex];
    if (message?.role === 'assistant') {
      const toolCallIds = message.toolCalls.map((toolCall) => toolCall.id);
      recordModelMessage(history, message.content, toolCallIds, { actor, inherited: true });
    }
  }
  return history;
}

function inheritedEntries(branch: EventOfType<'branch_started'>) {
  if (branch.historyActors !== undefined) {
    return branch.historyActors;
  }
  if (branch.sourceModel === undefined) {
    return [];
  }
  // В старом формате известна модель истории целиком, но нет индексов отдельных сообщений.
  return [{ messageIndex: -1, model: branch.sourceModel }];
}

export function recordModelMessage(
  history: Map<string, MessageOrigin>,
  content: unknown,
  toolCallIds: string[],
  origin: MessageOrigin,
): void {
  const keys = [
    messageKey(content, toolCallIds),
    ...toolCallIds.map((toolCallId) => `tool:${toolCallId}`),
  ];
  for (const key of keys) {
    const previousOrigin = history.get(key);
    const hasDifferentAuthor =
      previousOrigin !== undefined && previousOrigin.actor?.key !== origin.actor?.key;
    if (hasDifferentAuthor) {
      // Совпавший текст разных моделей не позволяет надёжно определить автора сообщения.
      history.set(key, { actor: null, inherited: previousOrigin.inherited });
    } else {
      history.set(key, origin);
    }
  }
}

export function messageKey(content: unknown, toolCallIds: string[]): string {
  if (toolCallIds.length > 0) {
    return toolCallIds.join('|');
  }
  return JSON.stringify(content) ?? '';
}
