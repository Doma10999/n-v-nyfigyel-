const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('history-chart.js', 'utf8');
const chartModule = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function fixture({ width = 480, height = 208, ratio = 2, reduced = true } = {}) {
  const calls = [], frames = new Map(), listeners = new Map();
  let observer, disconnected = false, frameId = 0;
  const ctx = new Proxy({}, { get: (_, name) => name === 'createLinearGradient'
    ? () => ({ addColorStop() {} }) : (...args) => calls.push({ name, args }) });
  const view = {
    devicePixelRatio: ratio, performance: { now: () => 0 },
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
    ResizeObserver: class {
      constructor(fn) { observer = fn; }
      observe() {}
      disconnect() { disconnected = true; }
    }
  };
  const canvas = {
    clientWidth: width, clientHeight: height, isConnected: true,
    ownerDocument: { defaultView: view, documentElement: { dataset: {} } },
    getContext: () => ctx
  };
  return { canvas, calls, frames, view, listeners,
    resize: () => observer(), disconnected: () => disconnected };
}

test('chart matches mobile/desktop CSS size and pixel density without scaling text', async () => {
  const { mountHistoryChart } = await chartModule;
  for (const width of [240, 280, 360, 480, 520, 700]) {
    for (const ratio of [1, 1.25, 2, 3]) {
      const f = fixture({ width, ratio });
      const dispose = mountHistoryChart(f.canvas, [51, 50, 49, 48, 47, 100, 47].map(v => ({ v })));
      assert.equal(f.canvas.width, Math.round(width * ratio));
      assert.equal(f.canvas.height, 208 * ratio);
      assert.deepEqual(f.calls.find(c => c.name === 'setTransform').args, [ratio, 0, 0, ratio, 0, 0]);
      const labels = f.calls.filter(c => c.name === 'fillText');
      assert.equal(labels.filter(c => String(c.args[0]).endsWith('%')).length, 7);
      for (const c of labels) {
        assert.ok(c.args[1] >= 0 && c.args[1] <= width, 'label stays within the canvas');
        assert.ok(c.args[2] >= 0 && c.args[2] <= 208);
      }
      for (const c of f.calls.filter(c => c.name === 'roundRect')) {
        const [x, y, w, h] = c.args;
        assert.ok(x >= 33 && x + w <= width - 12 && y >= 19 && y + h <= 177);
      }
      dispose();
    }
  }
});

test('hidden dialog waits for sizing and redraws on resize and pixel ratio changes', async () => {
  const { mountHistoryChart } = await chartModule;
  const f = fixture({ width: 0, height: 0 });
  const dispose = mountHistoryChart(f.canvas, [{ v: 81 }]);
  assert.equal(f.calls.length, 0);
  f.canvas.clientWidth = 320; f.canvas.clientHeight = 184; f.resize();
  assert.equal(f.canvas.width, 640); assert.equal(f.canvas.height, 368);
  f.canvas.clientWidth = 480; f.resize(); assert.equal(f.canvas.width, 960);
  f.view.devicePixelRatio = 1; f.listeners.get('resize')();
  assert.equal(f.canvas.width, 480);
  dispose();
  assert.equal(f.disconnected(), true); assert.equal(f.listeners.size, 0);
  const callCount = f.calls.length; f.resize(); assert.equal(f.calls.length, callCount);
});

test('recent seven values are clamped, invalid values skipped, and empty data labelled', async () => {
  const { mountHistoryChart } = await chartModule;
  const f = fixture();
  mountHistoryChart(f.canvas, [1, 2, 3, 4, 5, 6, 7, -20, 180, NaN].map(v => ({ v })));
  const labels = f.calls.filter(c => c.name === 'fillText' && String(c.args[0]).endsWith('%'));
  assert.deepEqual(labels.map(c => c.args[0]), ['3%', '4%', '5%', '6%', '7%', '0%', '100%']);
  const empty = fixture(); mountHistoryChart(empty.canvas, []);
  assert.ok(empty.calls.some(c => c.name === 'fillText' && c.args[0] === 'Még nincs mentett mérés.'));
});

test('animation terminates and disposing cancels pending work', async () => {
  const { mountHistoryChart } = await chartModule;
  const f = fixture({ reduced: false });
  const dispose = mountHistoryChart(f.canvas, [{ v: 70 }]);
  assert.equal(f.frames.size, 1);
  const [id, draw] = [...f.frames][0]; f.frames.delete(id); draw(450);
  assert.equal(f.frames.size, 0);
  dispose(); assert.equal(f.disconnected(), true);
  const pending = fixture({ reduced: false });
  const stop = mountHistoryChart(pending.canvas, [{ v: 71 }]);
  assert.equal(pending.frames.size, 1); stop(); assert.equal(pending.frames.size, 0);
  const off = fixture({ reduced: false }); off.canvas.ownerDocument.documentElement.dataset.motion = 'off';
  mountHistoryChart(off.canvas, [{ v: 71 }]); assert.equal(off.frames.size, 0);
});
