import type { HarnessEvent } from '@harness-visualization/harness';
import type { EventOfType } from '../events/eventTypes';
import { inheritedModelHistory, recordModelMessage } from './modelActorHistory';
import { modelActorKey, requestModelActor, toolActorKey } from './modelActorIdentity';
import type { MessageOrigin, ModelActor, ModelActors } from './modelActorTypes';

export type { MessageOrigin, ModelActor, ModelActors } from './modelActorTypes';

interface ActorProjection {
  actors: ModelActors;
  requestEvents: Map<string, EventOfType<'model_request'>>;
  history: Map<string, MessageOrigin>;
  activeTools: Map<string, EventOfType<'tool_call'>>;
  lastAgentReply: Map<string, ModelActor>;
}

export function projectModelActors(events: readonly HarnessEvent[]): ModelActors {
  const projection = createProjection(events);
  for (const event of events) {
    projectModelEvent(projection, event);
  }
  const { actors } = projection;
  const allActors = [...actors.requests.values(), ...actors.inherited];
  actors.multiple = new Set(allActors.map((actor) => actor.key)).size > 1;
  return actors;
}

function createProjection(events: readonly HarnessEvent[]): ActorProjection {
  const actors: ModelActors = {
    multiple: false,
    requests: new Map(),
    tools: new Map(),
    events: new Map(),
    causes: new Map(),
    inherited: [],
    histories: new Map(),
  };
  const requestEvents = new Map<string, EventOfType<'model_request'>>();
  for (const event of events) {
    if (event.type === 'model_request') {
      requestEvents.set(event.requestId, event);
      actors.requests.set(event.requestId, requestModelActor(event));
    }
  }
  return {
    actors,
    requestEvents,
    history: inheritedModelHistory(events, actors),
    activeTools: new Map(),
    lastAgentReply: new Map(),
  };
}

function projectModelEvent(projection: ActorProjection, event: HarnessEvent): void {
  const scope = event.agentId ?? '';
  if (event.type === 'tool_call') {
    projection.activeTools.set(scope, event);
  }
  if (event.type === 'model_request') {
    // Снимок до запроса не должен получить авторов из будущих ответов.
    projection.actors.histories.set(event.requestId, new Map(projection.history));
  }
  if (event.type === 'model_response') {
    recordResponse(projection, event);
  }
  const actor = eventModelActor(projection, event);
  if (actor !== undefined) {
    projection.actors.events.set(event.sequence, actor);
  }
  if (event.type === 'tool_result') {
    projection.activeTools.delete(scope);
  }
}

function eventModelActor(projection: ActorProjection, event: HarnessEvent): ModelActor | undefined {
  const { actors, lastAgentReply } = projection;
  const cause = semanticToolCause(event, projection.activeTools.get(event.agentId ?? ''));
  if (cause !== undefined) {
    actors.causes.set(event.sequence, cause);
    return actors.tools.get(toolActorKey(event.agentId, cause));
  }
  if ('toolCallId' in event) {
    return actors.tools.get(toolActorKey(event.agentId, event.toolCallId));
  }
  switch (event.type) {
    case 'assistant_message':
      return lastAgentReply.get(event.agentId ?? '');
    case 'subagent_finished':
      return lastAgentReply.get(event.subagentId);
    case 'subagent_started':
      return actors.tools.get(toolActorKey(event.agentId, event.parentToolCallId));
    default:
      return 'requestId' in event ? actors.requests.get(event.requestId) : undefined;
  }
}

function recordResponse(
  projection: ActorProjection,
  response: EventOfType<'model_response'>,
): void {
  const { actors, history, requestEvents, lastAgentReply } = projection;
  const actor = actors.requests.get(response.requestId);
  if (actor === undefined) {
    return;
  }
  actor.returned = response.reply.model;
  actor.label = response.reply.model || actor.requested;
  actor.key = modelActorKey(actor.baseUrl, actor.label);
  const toolCallIds = response.reply.toolCalls.map((toolCall) => toolCall.id);
  recordModelMessage(history, response.reply.text, toolCallIds, { actor, inherited: false });
  for (const toolCallId of toolCallIds) {
    actors.tools.set(toolActorKey(response.agentId, toolCallId), actor);
  }
  if (requestEvents.get(response.requestId)?.purpose === 'agentStep') {
    lastAgentReply.set(response.agentId ?? '', actor);
  }
}

function semanticToolCause(
  event: HarnessEvent,
  call: EventOfType<'tool_call'> | undefined,
): string | undefined {
  if (call === undefined) {
    return undefined;
  }
  switch (event.type) {
    case 'skill_loaded':
      return loadedSkillCause(event, call);
    case 'memory_updated':
      return call.toolName === 'memory' ? call.toolCallId : undefined;
    case 'progress_updated':
      return call.toolName === 'update_progress' ? call.toolCallId : undefined;
    default:
      return undefined;
  }
}

function loadedSkillCause(
  event: EventOfType<'skill_loaded'>,
  call: EventOfType<'tool_call'>,
): string | undefined {
  if (event.trigger !== 'model' || call.toolName !== 'load_skill') {
    return undefined;
  }
  const argumentsRecord = call.arguments as { name?: unknown } | null;
  return argumentsRecord?.name === event.name ? call.toolCallId : undefined;
}
