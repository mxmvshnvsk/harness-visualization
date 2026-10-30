import type { HarnessEvent, ModelRequestPayload } from '../events/harnessEvents.js';
import type { AssistantMessage, ChatMessage, ModelReply } from '../model/chatTypes.js';
import type { BranchModel } from './branchModel.js';

type EventOf<Type extends HarnessEvent['type']> = Extract<HarnessEvent, { type: Type }>;

export interface BranchHistoryActor {
  messageIndex: number;
  model: BranchModel;
}

interface HistorySources {
  requests: Map<string, EventOf<'model_request'>>;
  responses: EventOf<'model_response'>[];
  branch: EventOf<'branch_started'> | undefined;
  prompt: EventOf<'prompt_assembled'> | undefined;
}

export function branchHistoryActors(
  events: readonly HarnessEvent[],
  messages: ChatMessage[],
): BranchHistoryActor[] {
  const sources = historySources(events);
  const actors: BranchHistoryActor[] = [];
  messages.forEach((message, messageIndex) => {
    if (message.role !== 'assistant') {
      return;
    }
    const model = responseAuthor(message, sources) ?? inheritedAuthor(message, sources);
    if (model !== undefined) {
      actors.push({ messageIndex, model });
    }
  });
  return actors;
}

function historySources(events: readonly HarnessEvent[]): HistorySources {
  const requests = new Map<string, EventOf<'model_request'>>();
  const responses: EventOf<'model_response'>[] = [];
  for (const event of events) {
    if (event.type === 'model_request') {
      requests.set(event.requestId, event);
    }
    if (event.type === 'model_response' && event.agentId === undefined) {
      responses.push(event);
    }
  }
  return {
    requests,
    responses,
    branch: events.find((event) => event.type === 'branch_started'),
    prompt: events.find((event) => event.type === 'prompt_assembled'),
  };
}

function responseAuthor(
  message: AssistantMessage,
  sources: HistorySources,
): BranchModel | undefined {
  const response = sources.responses.findLast((event) => replyMatchesMessage(event.reply, message));
  if (response === undefined) {
    return undefined;
  }
  const request = sources.requests.get(response.requestId);
  if (request === undefined) {
    return undefined;
  }
  const source = request.modelIdentity ?? legacyModelIdentity(request);
  return { ...source, model: response.reply.model };
}

function replyMatchesMessage(reply: ModelReply, message: AssistantMessage): boolean {
  if (message.toolCalls.length === 0) {
    return message.content !== null && reply.text === message.content;
  }
  const originalCallIds = new Set(message.toolCalls.map((toolCall) => toolCall.id));
  return reply.toolCalls.some((toolCall) => originalCallIds.has(toolCall.id));
}

function legacyModelIdentity(request: ModelRequestPayload): BranchModel {
  const model = typeof request.body.model === 'string' ? request.body.model : 'модель не указана';
  return {
    model,
    baseUrl: request.url.replace(/\/chat\/completions\/?$/, ''),
    providerName: new URL(request.url).host,
  };
}

function inheritedAuthor(
  message: AssistantMessage,
  sources: HistorySources,
): BranchModel | undefined {
  const originalIndex = sources.prompt?.messages.findIndex((original) =>
    sameAssistantMessage(original, message),
  );
  return sources.branch?.historyActors?.find((entry) => entry.messageIndex === originalIndex)
    ?.model;
}

function sameAssistantMessage(original: ChatMessage, message: AssistantMessage): boolean {
  return (
    original.role === 'assistant' &&
    original.content === message.content &&
    JSON.stringify(original.toolCalls) === JSON.stringify(message.toolCalls)
  );
}
