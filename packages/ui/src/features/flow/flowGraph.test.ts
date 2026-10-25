import { describe, expect, it } from 'vitest';
import { boundaryPoint, FLOW_NODES, LANE_OFFSET, laneOf } from './flowGraph';

describe('boundaryPoint', () => {
  it('точка — на краю узла в сторону другого', () => {
    const { user, harness, tools } = FLOW_NODES;

    // Пользователь левее харнесса на одной высоте — правый край пользователя.
    expect(boundaryPoint(user, harness)).toEqual({ x: user.x + user.width / 2, y: user.y });
    // Тулы ниже харнесса — нижний край харнесса.
    expect(boundaryPoint(harness, tools)).toEqual({
      x: harness.x,
      y: harness.y + harness.height / 2,
    });
  });
});

describe('laneOf', () => {
  it('полоса начинается у края отправителя и кончается у края адресата', () => {
    const { harness, model } = FLOW_NODES;
    const lane = laneOf('harness', 'model');
    const start = lane.at(0);
    const end = lane.at(1);

    expect(Math.abs(start.x - (harness.x + harness.width / 2))).toBeLessThan(LANE_OFFSET + 1);
    expect(Math.abs(end.x - (model.x - model.width / 2))).toBeLessThan(LANE_OFFSET + 1);
  });

  it('полосы «туда» и «обратно» — по разные стороны и с подписями по разные стороны', () => {
    const out = laneOf('user', 'harness');
    const back = laneOf('harness', 'user');

    expect(Math.sign(out.at(0.5).y - FLOW_NODES.user.y)).toBe(
      -Math.sign(back.at(0.5).y - FLOW_NODES.user.y),
    );
    expect(Math.sign(out.label.y - FLOW_NODES.user.y)).toBe(
      -Math.sign(back.label.y - FLOW_NODES.user.y),
    );
  });
});
