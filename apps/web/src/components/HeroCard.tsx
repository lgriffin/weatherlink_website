import { formatValue, getUnitSymbol } from '../config/measurements';
import { Sparkline } from './Sparkline';
import { WindCompass } from './WindCompass';

interface Measurement {
  value: number | null;
  unit: string;
  timestamp: string | null;
}

interface HeroCardProps {
  type: 'temperature' | 'wind' | 'rain';
  measurements: Record<string, Measurement>;
  sparklineData?: Array<{ timestamp: number; value: number | null }> | undefined;
}

function TemperatureHero({ measurements, sparklineData }: Omit<HeroCardProps, 'type'>) {
  const temp = measurements['temperature.outdoor'];
  const feelsLike = measurements['temperature.apparent'];

  return (
    <div className="hero-card">
      <div className="hero-card__title">Temperature</div>
      <div className="hero-card__primary">
        {temp ? formatValue(temp.value, temp.unit) : '—'}
        <span className="hero-card__primary-unit">°C</span>
      </div>
      {feelsLike && feelsLike.value !== null && (
        <div className="hero-card__secondary">
          Feels like {formatValue(feelsLike.value, feelsLike.unit)}°C
        </div>
      )}
      {sparklineData && sparklineData.length > 2 && (
        <div style={{ marginTop: 'var(--space-sm)' }}>
          <Sparkline data={sparklineData} color="var(--chart-temp)" height={48} />
        </div>
      )}
    </div>
  );
}

function WindHero({ measurements, sparklineData }: Omit<HeroCardProps, 'type'>) {
  const speed = measurements['wind.speed'];
  const gust = measurements['wind.gust'];
  const direction = measurements['wind.direction'];

  return (
    <div className="hero-card">
      <div className="hero-card__title">Wind</div>
      <div className="hero-card__body">
        <WindCompass
          degrees={direction?.value ?? null}
          speed={speed?.value ?? null}
          gust={gust?.value ?? null}
        />
        <div className="hero-card__values">
          <div className="hero-card__detail">
            <div className="hero-card__detail-item">
              <span>Speed</span>
              <span className="hero-card__detail-value">
                {speed ? formatValue(speed.value, speed.unit) : '—'} m/s
              </span>
            </div>
            <div className="hero-card__detail-item">
              <span>Gust</span>
              <span className="hero-card__detail-value">
                {gust ? formatValue(gust.value, gust.unit) : '—'} m/s
              </span>
            </div>
          </div>
          {sparklineData && sparklineData.length > 2 && (
            <div style={{ marginTop: 'var(--space-sm)' }}>
              <Sparkline data={sparklineData} color="var(--chart-wind)" height={48} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RainHero({ measurements, sparklineData }: Omit<HeroCardProps, 'type'>) {
  const rate = measurements['rain.rate'];
  const daily = measurements['rain.daily'];
  const monthly = measurements['rain.monthly'];
  const yearly = measurements['rain.yearly'];

  return (
    <div className="hero-card">
      <div className="hero-card__title">Rain</div>
      <div className="hero-card__primary">
        {rate ? formatValue(rate.value, rate.unit) : '—'}
        <span className="hero-card__primary-unit">mm/h</span>
      </div>
      <div className="hero-card__detail">
        <div className="hero-card__detail-item">
          <span>Today</span>
          <span className="hero-card__detail-value">
            {daily ? formatValue(daily.value, daily.unit) : '—'}
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>
              {' '}{getUnitSymbol(daily?.unit ?? 'mm')}
            </span>
          </span>
        </div>
        {monthly && monthly.value !== null && (
          <div className="hero-card__detail-item">
            <span>Month</span>
            <span className="hero-card__detail-value">
              {formatValue(monthly.value, monthly.unit)}
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                {' '}{getUnitSymbol(monthly.unit)}
              </span>
            </span>
          </div>
        )}
        {yearly && yearly.value !== null && (
          <div className="hero-card__detail-item">
            <span>Year</span>
            <span className="hero-card__detail-value">
              {formatValue(yearly.value, yearly.unit)}
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                {' '}{getUnitSymbol(yearly.unit)}
              </span>
            </span>
          </div>
        )}
      </div>
      {sparklineData && sparklineData.length > 2 && (
        <div style={{ marginTop: 'var(--space-sm)' }}>
          <Sparkline data={sparklineData} color="var(--chart-rain)" height={48} />
        </div>
      )}
    </div>
  );
}

export function HeroCard({ type, measurements, sparklineData }: HeroCardProps) {
  switch (type) {
    case 'temperature':
      return <TemperatureHero measurements={measurements} sparklineData={sparklineData} />;
    case 'wind':
      return <WindHero measurements={measurements} sparklineData={sparklineData} />;
    case 'rain':
      return <RainHero measurements={measurements} sparklineData={sparklineData} />;
  }
}
