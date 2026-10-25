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

// Где стоит подпись пакета: посередине между краями узлов; у события внутри узла — над ним.
export function labelAnchor(from: FlowNode, to: FlowNode): Point {
  if (from.id === to.id) {
    return { x: from.x, y: from.y - from.height / 2 - 22 };
  }
  const start = boundaryPoint(from, to);
  const end = boundaryPoint(to, from);
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}
