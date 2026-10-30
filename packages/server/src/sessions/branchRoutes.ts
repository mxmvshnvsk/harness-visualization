// Ветка от шага записанного трейса (этап 9):
//   POST /api/sessions/branch  { traceFile, step, edit } — запустить ветку, ответить id сессии.
// Ветка — обычная живая сессия: тот же поток событий, разрешения и диалог, что у «Новый вопрос».
// Шаги до step — replay из трейса, с него — новый прогон (harness: branch/).

import {
  branchSessionInput,
  modelOptions,
  branchSourceKey,
  selectBranchModel,
  validateModelEffort,
  REASONING_EFFORTS,
} from '@harness-visualization/harness';
import { branchSourceModel } from '@harness-visualization/harness/branch';
import type { HarnessEvent } from '@harness-visualization/harness';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TraceCatalog } from '../traces/TraceCatalog.js';
import { launchSession, type SessionRoutesOptions } from './sessionRoutes.js';

export const branchRequestSchema = z.object({
  traceFile: z.string().min(1),
  step: z.number().int().positive(),
  modelKey: z.string().min(1).optional(),
  reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
  edit: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('replay') }),
    z.object({ kind: z.literal('toolResult'), toolCallId: z.string().min(1), content: z.string() }),
  ]),
});

export type BranchRequest = z.infer<typeof branchRequestSchema>;

interface BranchRouteOptions extends SessionRoutesOptions {
  catalog: TraceCatalog;
  tracesDirectory: string;
}

interface BranchOptionsQuery {
  traceFile: string;
  step: string;
}

export function registerBranchRoutes(app: FastifyInstance, options: BranchRouteOptions): void {
  app.get<{ Querystring: BranchOptionsQuery }>('/api/branch-options', (request, reply) =>
    handleBranchOptions(request, reply, options),
  );
  app.post('/api/sessions/branch', (request, reply) => handleBranchStart(request, reply, options));
}

async function handleBranchOptions(
  request: FastifyRequest<{ Querystring: BranchOptionsQuery }>,
  reply: FastifyReply,
  options: BranchRouteOptions,
): Promise<FastifyReply> {
  const contents = await options.catalog.read(request.query.traceFile);
  if (contents === null) {
    return reply.code(404).send({ error: 'Такого трейса нет' });
  }
  try {
    const step = Number(request.query.step);
    const source = branchSourceModel(contents.events, step);
    const models = modelOptions(options.loadedSettings.settings).map((model) => ({
      ...model,
      available:
        model.available || (model.key === 'default' && options.loadedSettings.modelApiKey !== ''),
    }));
    return reply.send({
      source,
      sourceKey: branchSourceKey(options.loadedSettings, contents.events, step),
      models,
    });
  } catch (error) {
    return branchError(reply, error);
  }
}

async function handleBranchStart(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BranchRouteOptions,
): Promise<FastifyReply> {
  const parsed = branchRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.message });
  }
  const contents = await options.catalog.read(parsed.data.traceFile);
  if (contents === null) {
    return reply.code(404).send({ error: 'Такого трейса нет в traces/' });
  }
  try {
    const sessionId = await launchBranch(parsed.data, contents.events, options);
    return reply.code(201).send({ sessionId, eventsUrl: `/api/sessions/${sessionId}/events` });
  } catch (error) {
    return branchError(reply, error);
  }
}

async function launchBranch(
  request: BranchRequest,
  events: HarnessEvent[],
  options: BranchRouteOptions,
): Promise<string> {
  const { traceFile, step, edit, reasoningEffort } = request;
  const modelKey = request.modelKey ?? branchSourceKey(options.loadedSettings, events, step);
  const loadedSettings = await selectBranchModel(
    options.loadedSettings,
    events,
    step,
    request.modelKey,
  );
  const input = branchSessionInput({
    loadedSettings,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    projectRoot: options.projectRoot,
    sourceTracePath: `${options.tracesDirectory}/${traceFile}`,
    sourceEvents: events,
    step,
    edit,
    workspaceDirectory: null,
  });
  validateModelEffort(options.loadedSettings, modelKey ?? '', input.reasoningEffort);
  return launchSession(input, `⑂ ${input.question}`, options);
}

function branchError(reply: FastifyReply, error: unknown): FastifyReply {
  const message = error instanceof Error ? error.message : String(error);
  return reply.code(400).send({ error: message });
}
