// Маршруты лаборатории evals (этап 8e):
//   GET /api/evals                 — наборы задач из evals/*.json и отчёты прогонов из traces/evals/;
//   GET /api/evals/reports/:file   — отчёт прогона с ответом агента в каждой попытке.
//
// Отчёт пишет pnpm run eval после каждой попытки, поэтому незаконченный прогон тоже виден.
// Имя файла из адреса — только имя в папке, без «/» и «..», как у трейсов.

import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { evalSetSchema, type HarnessEvent } from '@harness-visualization/harness';
import {
  readTrialFacts,
  type EvalReport,
  type EvalSet,
} from '@harness-visualization/harness/evals';
import type { FastifyInstance } from 'fastify';
import type { TraceCatalog } from '../traces/TraceCatalog.js';

const JSON_FILE_NAME = /^[\w.-]+\.json$/u;

export interface EvalReportSummary {
  file: string;
  setName: string;
  startedAt: string;
  finishedAt: string | null;
  model: string;
  trials: number;
  configs: string[];
  tasks: number;
  // Сколько попыток уже сделано и сколько всего задумано.
  done: number;
  planned: number;
}

export interface EvalsResponse {
  sets: { file: string; set: EvalSet }[];
  reports: EvalReportSummary[];
}

interface EvalRoutesOptions {
  projectRoot: string;
  reportsDirectory: string;
  catalog: TraceCatalog;
}

export function registerEvalRoutes(app: FastifyInstance, options: EvalRoutesOptions): void {
  app.get('/api/evals', async (): Promise<EvalsResponse> => {
    const sets = await readSets(join(options.projectRoot, 'evals'));
    const reports = await readReports(options.reportsDirectory);
    return {
      sets,
      reports: reports
        .map(summarizeReport)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
    };
  });

  app.get<{ Params: { file: string } }>('/api/evals/reports/:file', async (request, reply) => {
    const { file } = request.params;
    const report = JSON_FILE_NAME.test(file)
      ? await readReport(join(options.reportsDirectory, file), file)
      : null;
    if (report === null) {
      return reply.code(404).send({ error: 'Такого отчёта нет в traces/evals/' });
    }
    return withAnswers(report, options.catalog);
  });
}

async function jsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && JSON_FILE_NAME.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    // Папки ещё нет: ни одного прогона не было.
    return [];
  }
}

async function readSets(directory: string): Promise<EvalsResponse['sets']> {
  const sets: EvalsResponse['sets'] = [];
  for (const file of await jsonFiles(directory)) {
    const parsed = evalSetSchema.safeParse(
      JSON.parse(await readFile(join(directory, file), 'utf8')),
    );
    if (parsed.success) {
      sets.push({ file: `evals/${file}`, set: parsed.data });
    }
  }
  return sets;
}

async function readReports(directory: string): Promise<(EvalReport & { file: string })[]> {
  const reports = await Promise.all(
    (await jsonFiles(directory)).map((file) => readReport(join(directory, file), file)),
  );
  return reports.filter((report) => report !== null);
}

// Отчёт мог дописываться в эту секунду или оказаться чужим JSON — тогда его просто нет.
async function readReport(
  path: string,
  file: string,
): Promise<(EvalReport & { file: string }) | null> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Partial<EvalReport>;
    return value.kind === 'evalReport' ? { ...(value as EvalReport), file } : null;
  } catch {
    return null;
  }
}

function summarizeReport(report: EvalReport & { file: string }): EvalReportSummary {
  return {
    file: report.file,
    setName: report.set.name,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    model: report.model,
    trials: report.trials,
    configs: report.configs.map((config) => config.name),
    tasks: report.tasks.length,
    done: report.results.length,
    planned: report.tasks.length * report.configs.length * report.trials,
  };
}

// В первых отчётах ответа нет — берём его из трейса попытки: трейс — источник правды.
async function withAnswers(report: EvalReport, catalog: TraceCatalog): Promise<EvalReport> {
  const results = await Promise.all(
    report.results.map(async (result) => {
      if (result.answer !== undefined) {
        return result;
      }
      const contents = await catalog.read(basename(result.tracePath));
      const events: HarnessEvent[] = contents?.events ?? [];
      return { ...result, answer: readTrialFacts(events).answer };
    }),
  );
  return { ...report, results };
}
