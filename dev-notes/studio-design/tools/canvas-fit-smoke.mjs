/** Verify the Demo overview fits dispersed nodes without the interactive zoom floor. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const fit = source.slice(source.indexOf('function fitCanvas('), source.indexOf('\nfunction focusNode('));
function run(nodes, width, height) {
  const S = { nodes, zoom: 1, pan: { x: 0, y: 0 } };
  const context = vm.createContext({ S, document: { getElementById: () => ({ clientWidth: width, clientHeight: height }), querySelector: () => null }, applyCamera() {}, save() {} });
  vm.runInContext(fit + ';fitCanvas(true)', context);
  return S;
}
for (const [width, height] of [[917, 1273], [390, 844], [1280, 720]]) {
  test(`all dispersed nodes remain visible at ${width} by ${height}`, () => {
    const nodes = [{ x: -500, y: -300, w: 420, h: 260 }, { x: 4500, y: 1100, w: 380, h: 440 }];
    const state = run(nodes, width, height);
    for (const n of nodes) {
      assert.ok(n.x * state.zoom + state.pan.x >= 80 - 1e-7);
      assert.ok((n.x + n.w) * state.zoom + state.pan.x <= width - 32 + 1e-7);
      assert.ok(n.y * state.zoom + state.pan.y >= 80 - 1e-7);
      assert.ok((n.y + n.h) * state.zoom + state.pan.y <= height - 64 + 1e-7);
    }
    assert.ok(state.zoom < .25);
  });
}
test('empty canvas retains a finite usable camera', () => {
  const state = run([], 390, 844);
  assert.ok(Number.isFinite(state.zoom));
  assert.ok(Number.isFinite(state.pan.x));
  assert.ok(Number.isFinite(state.pan.y));
});
