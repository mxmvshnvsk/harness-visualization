// Маршруты лаборатории evals (этап 8e):
//   GET /api/evals                 — наборы задач из evals/*.json и отчёты прогонов из traces/evals/
//                                    и примеры из репозитория (examples/evals, этап 9.3);
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
  // Пример из репозитория: трейсов попыток при нём нет, только отчёт с ответами.
  example: boolean;
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

interface ReportSource {
  directory: string;
  example: boolean;
}

interface EvalRoutesOptions {
  projectRoot: string;
  // Свои отчёты главнее одноимённых примеров.
  reportSources: ReportSource[];
  catalog: TraceCatalog;
}

type LocatedReport = EvalReport & { file: string; example: boolean };

export function registerEvalRoutes(app: FastifyInstance, options: EvalRoutesOptions): void {
  app.get('/api/evals', async (): Promise<EvalsResponse> => {
    const sets = await readSets(join(options.projectRoot, 'evals'));
    const reports = await readReports(options.reportSources);
    return {
      sets,
      reports: reports
        .map(summarizeReport)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
    };
  });

  app.get<{ Params: { file: string } }>('/api/evals/reports/:file', async (request, reply) => {
    const { file } = request.params;
    const report = JSON_FILE_NAME.test(file) ? await findReport(options.reportSources, file) : null;
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

async function readReports(sources: ReportSource[]): Promise<LocatedReport[]> {
  const reports = new Map<string, LocatedReport>();
  for (const source of sources) {
    for (const file of await jsonFiles(source.directory)) {
      const report = reports.has(file) ? null : await readReport(source, file);
      if (report !== null) {
        reports.set(file, report);
      }
    }
  }
  return [...reports.values()];
}

async function findReport(sources: ReportSource[], file: string): Promise<LocatedReport | null> {
  for (const source of sources) {
    const report = await readReport(source, file);
    if (report !== null) {
      return report;
    }
  }
  return null;
}

// Отчёт мог дописываться в эту секунду или оказаться чужим JSON — тогда его просто нет.
async function readReport(source: ReportSource, file: string): Promise<LocatedReport | null> {
  try {
    const path = join(source.directory, file);
    const value = JSON.parse(await readFile(path, 'utf8')) as Partial<EvalReport>;
    return value.kind === 'evalReport'
      ? { ...(value as EvalReport), file, example: source.example }
      : null;
  } catch {
    return null;
  }
}

function summarizeReport(report: LocatedReport): EvalReportSummary {
  return {
    file: report.file,
    example: report.example,
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
// Есть ли трейс попытки: у примеров из репозитория трейсов попыток нет, только отчёт.
async function withAnswers(report: EvalReport, catalog: TraceCatalog): Promise<EvalReport> {
  const results = await Promise.all(
    report.results.map(async (result) => {
      const contents = await catalog.read(basename(result.tracePath));
      const events: HarnessEvent[] = contents?.events ?? [];
      return {
        ...result,
        answer: result.answer !== undefined ? result.answer : readTrialFacts(events).answer,
        traceAvailable: contents !== null,
      };
    }),
  );
  return { ...report, results };
}
