// Draw in CSS pixels, with a backing bitmap matched to the display's pixel ratio.
// History stays on its existing, water-demand-adjusted scale.
export function mountHistoryChart(canvas, history) {
  const view = canvas.ownerDocument.defaultView;
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const data = history.filter(point => Number.isFinite(point.v)).slice(-7);
  let frame = 0, disposed = false, sized = false, previousSize = '';

  function resize() {
    if (disposed || !canvas.isConnected) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    // The dialog may still be hidden. ResizeObserver will redraw after it opens.
    if (!width || !height) return;
    const ratio = Math.min(3, Math.max(1, view.devicePixelRatio || 1));
    const size = `${width}|${height}|${ratio}`;
    if (size === previousSize) return;
    previousSize = size;
    view.cancelAnimationFrame(frame);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const left = 33, right = 12, top = 19, bottom = 31;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const slotWidth = plotWidth / Math.max(1, data.length);
    const barWidth = Math.min(54, slotWidth * .68);
    const animate = !sized && !view.matchMedia('(prefers-reduced-motion: reduce)').matches
      && canvas.ownerDocument.documentElement.dataset.motion !== 'off';
    sized = true;
    const started = view.performance.now();

    function draw(now) {
      if (disposed || !canvas.isConnected) return;
      const progress = animate ? Math.min(1, (now - started) / 420) : 1;
      const eased = 1 - Math.pow(1 - progress, 3);
      ctx.clearRect(0, 0, width, height);
      if (!data.length) {
        ctx.fillStyle = '#526b56'; ctx.font = '500 14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Még nincs mentett mérés.', width / 2, height / 2);
        return;
      }
      ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = '#dce9db'; ctx.setLineDash([3, 5]);
      for (const percent of [0, 50, 100]) {
        const y = top + plotHeight * (1 - percent / 100);
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
        ctx.fillStyle = '#536e57'; ctx.font = '500 11px system-ui'; ctx.textAlign = 'right';
        ctx.fillText(String(percent), left - 8, y + 4);
      }
      ctx.restore();
      data.forEach((point, i) => {
        const value = Math.max(0, Math.min(100, point.v));
        const barHeight = Math.max(1, plotHeight * value / 100 * eased);
        const center = left + (i + .5) * slotWidth;
        const gradient = ctx.createLinearGradient(0, top, 0, top + plotHeight);
        gradient.addColorStop(0, value < 30 ? '#d68d71' : value < 50 ? '#edc174' : '#73bc7d');
        gradient.addColorStop(1, value < 30 ? '#a64f35' : value < 50 ? '#b37a28' : '#227951');
        const radius = Math.min(7, barWidth / 2, barHeight / 2);
        ctx.fillStyle = gradient; ctx.beginPath();
        ctx.roundRect(center - barWidth / 2, top + plotHeight - barHeight, barWidth, barHeight, radius);
        ctx.fill();
        ctx.fillStyle = value < 30 ? '#9a4d35' : value < 50 ? '#8c621e' : '#245c3c';
        ctx.font = `650 ${slotWidth < 38 ? 11 : 13}px system-ui`; ctx.textAlign = 'center';
        ctx.fillText(Math.round(value) + '%', center, height - 10);
      });
      if (progress < 1) frame = view.requestAnimationFrame(draw);
    }
    draw(started);
  }

  const observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(resize) : null;
  observer?.observe(canvas);
  view.addEventListener('resize', resize);
  resize();
  return () => {
    disposed = true;
    observer?.disconnect();
    view.removeEventListener('resize', resize);
    view.cancelAnimationFrame(frame);
  };
}
