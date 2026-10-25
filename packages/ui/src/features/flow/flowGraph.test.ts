import { describe, expect, it } from 'vitest';
import { boundaryPoint, FLOW_NODES, labelAnchor } from './flowGraph';

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

describe('labelAnchor', () => {
  it('подпись — между краями узлов и не заходит ни в один', () => {
    const { harness, model } = FLOW_NODES;
    const anchor = labelAnchor(harness, model);

    expect(anchor.x).toBeGreaterThan(harness.x + harness.width / 2);
    expect(anchor.x).toBeLessThan(model.x - model.width / 2);
  });

  it('у события внутри узла — над узлом', () => {
    const { harness } = FLOW_NODES;
    expect(labelAnchor(harness, harness).y).toBeLessThan(harness.y - harness.height / 2);
  });
});
