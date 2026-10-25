// Точка входа команды pnpm check-grounding <файл трейса>:
// печатает, на какие источники сослался ответ и что модель видела по каждому.

import { styleText } from 'node:util';
import { checkGrounding } from '../grounding/checkGrounding.js';
import { describeClaimsReport } from '../grounding/describeClaimsReport.js';
import { describeGroundingReport } from '../grounding/describeGroundingReport.js';
import { readTrace } from '../grounding/readTrace.js';

async function main(): Promise<void> {
  const tracePath = process.argv[2];
  if (tracePath === undefined) {
    console.error('Укажите файл трейса: pnpm check-grounding traces/<файл>.jsonl');
    process.exitCode = 1;
    return;
  }
  const events = await readTrace(tracePath);
  const report = checkGrounding(events);
  console.log(styleText('bold', `Grounding check (проверка опоры ответа) по трейсу ${tracePath}`));
  for (const line of describeGroundingReport(report)) {
    console.log(line);
  }
  console.log('');
  for (const line of describeClaimsReport(report.claims)) {
    console.log(line);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
