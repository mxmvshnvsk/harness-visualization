// Подписчик потока событий, который печатает их в консоль коротко и по-русски.
// С флагом --verbose под каждой строкой печатается и полное событие в JSON.

import { styleText } from 'node:util';
import { describeEventForConsole } from './describeEventForConsole.js';
import type { EventListener } from './EventStream.js';

export interface ConsolePrinterOptions {
  verbose: boolean;
}

export function createConsolePrinter(options: ConsolePrinterOptions): EventListener {
  return (event) => {
    const prefix = styleText('dim', `[${event.sequence}]`);
    for (const line of describeEventForConsole(event)) {
      console.log(`${prefix} ${line}`);
    }
    if (options.verbose) {
      console.log(styleText('dim', JSON.stringify(event, null, 2)));
    }
  };
}
