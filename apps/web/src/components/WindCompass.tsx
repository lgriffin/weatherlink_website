import { formatValue } from '../config/measurements';

interface WindCompassProps {
  degrees: number | null;
  speed: number | null;
  gust: number | null;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function degreesToCardinal(deg: number): string {
  const idx = Math.round(deg / 45) % 8;
  return CARDINALS[idx]!;
}

export function WindCompass({ degrees, speed, gust }: WindCompassProps) {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 60;
  const tickR = 52;
  const labelR = 42;

  return (
    <div className="wind-compass">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="var(--color-border)" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={outerR - 8} fill="none" stroke="var(--color-border)" strokeWidth={0.5} />

        {/* Tick marks every 30 degrees */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i * 30 - 90) * (Math.PI / 180);
          const major = i % 3 === 0;
          const r1 = major ? outerR - 12 : outerR - 8;
          const r2 = outerR;
          return (
            <line
              key={i}
              x1={cx + r1 * Math.cos(angle)}
              y1={cy + r1 * Math.sin(angle)}
              x2={cx + r2 * Math.cos(angle)}
              y2={cy + r2 * Math.sin(angle)}
              stroke="var(--color-text-muted)"
              strokeWidth={major ? 2 : 1}
            />
          );
        })}

        {/* Cardinal labels */}
        {(['N', 'E', 'S', 'W'] as const).map((label, i) => {
          const angle = (i * 90 - 90) * (Math.PI / 180);
          return (
            <text
              key={label}
              x={cx + labelR * Math.cos(angle)}
              y={cy + labelR * Math.sin(angle)}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--color-text-muted)"
              fontSize={11}
              fontWeight={600}
            >
              {label}
            </text>
          );
        })}

        {/* Direction arrow */}
        {degrees !== null && (
          <g transform={`rotate(${degrees}, ${cx}, ${cy})`}>
            <polygon
              points={`${cx},${cy - outerR + 14} ${cx - 6},${cy - outerR + 28} ${cx + 6},${cy - outerR + 28}`}
              fill="var(--chart-wind)"
            />
            <line
              x1={cx}
              y1={cy - outerR + 28}
              x2={cx}
              y2={cy + 8}
              stroke="var(--chart-wind)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          </g>
        )}

        {/* Center text - cardinal direction */}
        <text
          x={cx}
          y={cy + 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-text)"
          fontSize={16}
          fontWeight={700}
        >
          {degrees !== null ? degreesToCardinal(degrees) : '—'}
        </text>
      </svg>

      {/* Speed and gust below compass */}
      <div style={{ textAlign: 'center', marginTop: 'var(--space-xs)' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          {formatValue(speed, 'm/s')} m/s
          {gust !== null && (
            <span style={{ marginLeft: 'var(--space-sm)' }}>
              gust {formatValue(gust, 'm/s')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
