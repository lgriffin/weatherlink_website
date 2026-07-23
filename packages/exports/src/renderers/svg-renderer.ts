import type { SeriesResult } from '@weather/analytics';

const WIDTH = 800;
const HEIGHT = 400;
const PADDING = { top: 30, right: 20, bottom: 40, left: 60 };
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#0891b2'];

export function renderSvg(seriesList: SeriesResult[]): string {
  if (seriesList.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><text x="50%" y="50%" text-anchor="middle">No data</text></svg>`;
  }

  const allPoints = seriesList.flatMap((s) => s.points);
  const allValues = allPoints.map((p) => p.value).filter((v): v is number => v !== null);
  const allTimestamps = allPoints.map((p) => p.timestamp);

  if (allValues.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><text x="50%" y="50%" text-anchor="middle">No data points</text></svg>`;
  }

  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const minTs = Math.min(...allTimestamps);
  const maxTs = Math.max(...allTimestamps);

  const valRange = maxVal - minVal || 1;
  const tsRange = maxTs - minTs || 1;

  const chartW = WIDTH - PADDING.left - PADDING.right;
  const chartH = HEIGHT - PADDING.top - PADDING.bottom;

  function scaleX(ts: number): number {
    return PADDING.left + ((ts - minTs) / tsRange) * chartW;
  }

  function scaleY(val: number): number {
    return PADDING.top + chartH - ((val - minVal) / valRange) * chartH;
  }

  let paths = '';
  let legend = '';

  seriesList.forEach((series, idx) => {
    const color = COLORS[idx % COLORS.length]!;
    const validPoints = series.points.filter((p) => p.value !== null);
    if (validPoints.length === 0) return;

    const d = validPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(p.timestamp).toFixed(1)},${scaleY(p.value!).toFixed(1)}`)
      .join(' ');

    paths += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" />\n`;
    legend += `<text x="${PADDING.left + idx * 120}" y="${HEIGHT - 5}" fill="${color}" font-size="11">${series.metric} (${series.unit})</text>\n`;
  });

  const yTicks = 5;
  let gridLines = '';
  for (let i = 0; i <= yTicks; i++) {
    const val = minVal + (valRange * i) / yTicks;
    const y = scaleY(val);
    gridLines += `<line x1="${PADDING.left}" y1="${y.toFixed(1)}" x2="${WIDTH - PADDING.right}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" />\n`;
    gridLines += `<text x="${PADDING.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="11">${val.toFixed(1)}</text>\n`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" style="background:#fff;font-family:sans-serif">
${gridLines}
${paths}
${legend}
</svg>`;
}
