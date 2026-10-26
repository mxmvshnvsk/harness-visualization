// Авансовый отчёт — по регламенту компенсации расходов (docs/regulations/expenses.md).

const SEPARATOR = ';';

export function parseExpenses(csv) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');
  const rows = lines.slice(1).map(parseRow);
  const totalKopecks = rows.reduce((sum, row) => sum + row.amountKopecks, 0);
  return { rows, totalKopecks };
}

function parseRow(line) {
  const [date, description, amount] = splitFields(line);
  return { date, description, amountKopecks: parseAmount(amount) };
}

// Поля через «;»; в кавычках «;» — часть текста.
function splitFields(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === SEPARATOR && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

// «12 345,50» → 1234550 копеек; \s в JavaScript ловит и неразрывный пробел. Считаем целыми числами: 0,1 + 0,2 в дробях не равно 0,3.
function parseAmount(text) {
  const [rubles, kopecks = '0'] = text.replace(/\s/g, '').split(',');
  return Number(rubles) * 100 + Number(kopecks.padEnd(2, '0'));
}
