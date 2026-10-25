import { describe, expect, it } from 'vitest';
import { boundaryPoint, FLOW_NODES, hopsOf, LANE_OFFSET, laneOf, routePoint } from './flowGraph';

describe('boundaryPoint', () => {
  it('точка — на краю узла в сторону другого', () => {
    const { loop, policy, tools } = FLOW_NODES;

    // Политика прямо под циклом — нижний край цикла.
    expect(boundaryPoint(loop, policy)).toEqual({ x: loop.x, y: loop.y + loop.height / 2 });
    // Исполнение тулов под политикой — верхний край исполнения.
    expect(boundaryPoint(tools, policy)).toEqual({ x: tools.x, y: tools.y - tools.height / 2 });
  });
});

describe('laneOf', () => {
  it('полоса начинается у края отправителя и кончается у края адресата', () => {
    const { loop, model } = FLOW_NODES;
    const lane = laneOf('loop', 'model');

    expect(Math.abs(lane.at(0).x - (loop.x + loop.width / 2))).toBeLessThan(LANE_OFFSET + 1);
    expect(Math.abs(lane.at(1).x - (model.x - model.width / 2))).toBeLessThan(LANE_OFFSET + 1);
  });

  it('полосы «туда» и «обратно» — по разные стороны и с подписями по разные стороны', () => {
    const out = laneOf('loop', 'model');
    const back = laneOf('model', 'loop');
    const { y } = FLOW_NODES.loop;

    expect(Math.sign(out.at(0.5).y - y)).toBe(-Math.sign(back.at(0.5).y - y));
    expect(Math.sign(out.label.y - y)).toBe(-Math.sign(back.label.y - y));
  });
});

describe('маршрут', () => {
  const route = ['loop', 'policy', 'tools'] as const;

  it('обратно — те же переходы в обратном порядке', () => {
    expect(hopsOf(route, 'out')).toEqual(['loop>policy', 'policy>tools']);
    expect(hopsOf(route, 'back')).toEqual(['tools>policy', 'policy>loop']);
  });

  it('точка идёт от края первого участника до края последнего через середину', () => {
    const { loop, policy, tools } = FLOW_NODES;
    const start = routePoint(route, 'out', 0);
    const middle = routePoint(route, 'out', 0.5);
    const end = routePoint(route, 'out', 1);

    expect(Math.abs(start.y - (loop.y + loop.height / 2))).toBeLessThan(1);
    // На середине маршрута точка проходит политику насквозь: начинается второй переход.
    expect(Math.abs(middle.y - (policy.y + policy.height / 2))).toBeLessThan(1);
    expect(Math.abs(end.y - (tools.y - tools.height / 2))).toBeLessThan(1);
  });
});
