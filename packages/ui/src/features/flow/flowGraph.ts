// Схема потока: узлы и связи между ними. Координаты — в единицах viewBox SVG (960 × 460),
// схема масштабируется вместе с контейнером.

export type FlowNodeId = 'user' | 'harness' | 'model' | 'mcp' | 'tools' | 'network';

export interface FlowNode {
  id: FlowNodeId;
  title: string;
  // Подпись под названием: что это за участник.
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 460;

export const FLOW_NODES: Record<FlowNodeId, FlowNode> = {
  user: {
    id: 'user',
    title: 'Пользователь',
    role: 'вопрос и разрешения',
    x: 100,
    y: 200,
    width: 160,
    height: 76,
  },
  harness: {
    id: 'harness',
    title: 'Харнесс',
    role: 'prompt, политика, цикл агента',
    x: 420,
    y: 200,
    width: 220,
    height: 104,
  },
  model: {
    id: 'model',
    title: 'Модель',
    role: 'LLM по API',
    x: 820,
    y: 70,
    width: 170,
    height: 76,
  },
  mcp: {
    id: 'mcp',
    title: 'MCP-сервер',
    role: 'отдельный процесс',
    x: 820,
    y: 230,
    width: 170,
    height: 76,
  },
  tools: {
    id: 'tools',
    title: 'Тулы харнесса',
    role: 'файлы, поиск, страницы',
    x: 420,
    y: 390,
    width: 200,
    height: 76,
  },
  network: {
    id: 'network',
    title: 'Интернет',
    role: 'поиск и сайты',
    x: 820,
    y: 390,
    width: 170,
    height: 76,
  },
};

// Связи рисуются всегда — по ним видно, кто с кем вообще может говорить.
export const FLOW_EDGES: readonly [FlowNodeId, FlowNodeId][] = [
  ['user', 'harness'],
  ['harness', 'model'],
  ['harness', 'mcp'],
  ['harness', 'tools'],
  ['tools', 'network'],
];

export interface Point {
  x: number;
  y: number;
}

// Точка на краю узла в сторону другого узла: пакет вылетает из края и прилетает к краю,
// а не к центру — там название узла.
export function boundaryPoint(node: FlowNode, toward: FlowNode): Point {
  const dx = toward.x - node.x;
  const dy = toward.y - node.y;
  if (dx === 0 && dy === 0) {
    return { x: node.x, y: node.y };
  }
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : node.width / 2 / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : node.height / 2 / Math.abs(dy),
  );
  return { x: node.x + dx * scale, y: node.y + dy * scale };
}

// Полоса — кривая Безье от края одного узла к краю другого (как ребро в React Flow), сдвинутая
// вбок: у каждой связи две полосы, «туда» и «обратно», и точка идёт ровно по нарисованной.
export interface Lane {
  // Путь для атрибута d у <path>.
  path: string;
  at: (progress: number) => Point;
  // Где стоит подпись полосы: посередине, сбоку от неё — со своей стороны у каждой полосы.
  label: Point;
}

export const LANE_OFFSET = 6;
const LABEL_OFFSET = 22;
const CURVE = 0.45;

export function laneOf(fromId: FlowNodeId, toId: FlowNodeId): Lane {
  const from = FLOW_NODES[fromId];
  const to = FLOW_NODES[toId];
  const start = boundaryPoint(from, to);
  const end = boundaryPoint(to, from);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  // Сдвиг вбок — по нормали к хорде; у встречной полосы нормаль смотрит в другую сторону.
  const normal = { x: -dy / length, y: dx / length };
  const shift = (point: Point, distance: number): Point => ({
    x: point.x - normal.x * distance,
    y: point.y - normal.y * distance,
  });
  const vertical = Math.abs(dy) > Math.abs(dx);
  const control1 = vertical
    ? { x: start.x, y: start.y + dy * CURVE }
    : { x: start.x + dx * CURVE, y: start.y };
  const control2 = vertical
    ? { x: end.x, y: end.y - dy * CURVE }
    : { x: end.x - dx * CURVE, y: end.y };
  const points = [start, control1, control2, end].map((point) =>
    shift(point, LANE_OFFSET),
  ) as Bezier;
  const at = (progress: number): Point => cubic(points, progress);
  const [p0, p1, p2, p3] = points;
  return {
    path: `M ${format(p0)} C ${format(p1)}, ${format(p2)}, ${format(p3)}`,
    at,
    label: shift(at(0.5), LABEL_OFFSET),
  };
}

type Bezier = [Point, Point, Point, Point];

// Точка кубической кривой Безье: веса — многочлены Бернштейна.
function cubic(points: Bezier, progress: number): Point {
  const rest = 1 - progress;
  const weights = [
    rest ** 3,
    3 * rest * rest * progress,
    3 * rest * progress * progress,
    progress ** 3,
  ];
  return points.reduce(
    (sum, point, index) => ({
      x: sum.x + (weights[index] ?? 0) * point.x,
      y: sum.y + (weights[index] ?? 0) * point.y,
    }),
    { x: 0, y: 0 },
  );
}

function format(point: Point): string {
  return `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
}

// Все полосы схемы, «откуда>куда», — посчитаны один раз.
export const LANES: Record<string, Lane | undefined> = Object.fromEntries(
  FLOW_EDGES.flatMap(([fromId, toId]) => [
    [`${fromId}>${toId}`, laneOf(fromId, toId)],
    [`${toId}>${fromId}`, laneOf(toId, fromId)],
  ]),
);
