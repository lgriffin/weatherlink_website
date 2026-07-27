export interface MeasurementMeta {
  label: string;
  category: string;
  color: string;
}

export const MEASUREMENT_META: Record<string, MeasurementMeta> = {
  'temperature.outdoor': { label: 'Temperature', category: 'temperature', color: 'var(--chart-temp)' },
  'temperature.indoor': { label: 'Indoor Temp', category: 'temperature', color: 'var(--chart-temp-indoor)' },
  'temperature.apparent': { label: 'Feels Like', category: 'temperature', color: 'var(--chart-temp-apparent)' },
  'temperature.dewPoint': { label: 'Dew Point', category: 'temperature', color: 'var(--chart-dewpoint)' },
  'temperature.heatIndex': { label: 'Heat Index', category: 'temperature', color: 'var(--chart-heat-index)' },
  'temperature.windChill': { label: 'Wind Chill', category: 'temperature', color: 'var(--chart-wind-chill)' },
  'temperature.wetBulb': { label: 'Wet Bulb', category: 'temperature', color: 'var(--chart-temp)' },
  'temperature.thwIndex': { label: 'THW Index', category: 'temperature', color: 'var(--chart-temp)' },
  'temperature.thswIndex': { label: 'THSW Index', category: 'temperature', color: 'var(--chart-temp)' },
  'humidity.outdoor': { label: 'Humidity', category: 'humidity', color: 'var(--chart-humidity)' },
  'humidity.indoor': { label: 'Indoor Humidity', category: 'humidity', color: 'var(--chart-humidity)' },
  'pressure.seaLevel': { label: 'Pressure', category: 'pressure', color: 'var(--chart-pressure)' },
  'pressure.absolute': { label: 'Abs. Pressure', category: 'pressure', color: 'var(--chart-pressure)' },
  'pressure.trend': { label: 'Pressure Trend', category: 'pressure', color: 'var(--chart-pressure)' },
  'wind.speed': { label: 'Wind Speed', category: 'wind', color: 'var(--chart-wind)' },
  'wind.gust': { label: 'Wind Gust', category: 'wind', color: 'var(--chart-wind-gust)' },
  'wind.direction': { label: 'Wind Direction', category: 'wind', color: 'var(--chart-wind)' },
  'wind.speedAvg1Min': { label: 'Wind (1m avg)', category: 'wind', color: 'var(--chart-wind)' },
  'wind.speedAvg2Min': { label: 'Wind (2m avg)', category: 'wind', color: 'var(--chart-wind)' },
  'wind.speedAvg10Min': { label: 'Wind (10m avg)', category: 'wind', color: 'var(--chart-wind)' },
  'rain.rate': { label: 'Rain Rate', category: 'rain', color: 'var(--chart-rain-rate)' },
  'rain.last15Min': { label: 'Rain (15m)', category: 'rain', color: 'var(--chart-rain)' },
  'rain.last60Min': { label: 'Rain (1h)', category: 'rain', color: 'var(--chart-rain)' },
  'rain.last24Hr': { label: 'Rain (24h)', category: 'rain', color: 'var(--chart-rain)' },
  'rain.daily': { label: 'Rain Today', category: 'rain', color: 'var(--chart-rain)' },
  'rain.monthly': { label: 'Rain This Month', category: 'rain', color: 'var(--chart-rain)' },
  'rain.yearly': { label: 'Rain This Year', category: 'rain', color: 'var(--chart-rain)' },
  'rain.stormTotal': { label: 'Storm Total', category: 'rain', color: 'var(--chart-rain)' },
  'solar.radiation': { label: 'Solar Radiation', category: 'solar', color: 'var(--chart-solar)' },
  'uv.index': { label: 'UV Index', category: 'uv', color: 'var(--chart-uv)' },
  'airQuality.pm1': { label: 'PM 1.0', category: 'airQuality', color: 'var(--chart-air)' },
  'airQuality.pm2_5': { label: 'PM 2.5', category: 'airQuality', color: 'var(--chart-air)' },
  'airQuality.pm10': { label: 'PM 10', category: 'airQuality', color: 'var(--chart-air)' },
  'soil.temperature': { label: 'Soil Temp', category: 'soil', color: 'var(--chart-soil)' },
  'soil.moisture': { label: 'Soil Moisture', category: 'soil', color: 'var(--chart-soil)' },
  'leaf.wetness': { label: 'Leaf Wetness', category: 'leaf', color: 'var(--chart-leaf)' },
  evapotranspiration: { label: 'ET', category: 'et', color: 'var(--chart-et)' },
};

export const UNIT_SYMBOLS: Record<string, string> = {
  celsius: '°C',
  hPa: 'hPa',
  'm/s': 'm/s',
  mm: 'mm',
  'mm/h': 'mm/h',
  'W/m2': 'W/m²',
  degrees: '°',
  percent: '%',
  uv_index: '',
  'ug/m3': 'µg/m³',
  volumetric: '%',
};

export interface CategoryInfo {
  key: string;
  label: string;
}

export const CATEGORY_ORDER: CategoryInfo[] = [
  { key: 'temperature', label: 'Temperature' },
  { key: 'humidity', label: 'Humidity' },
  { key: 'pressure', label: 'Pressure' },
  { key: 'wind', label: 'Wind' },
  { key: 'rain', label: 'Rain' },
  { key: 'solar', label: 'Solar' },
  { key: 'uv', label: 'UV' },
  { key: 'airQuality', label: 'Air Quality' },
  { key: 'soil', label: 'Soil' },
  { key: 'leaf', label: 'Leaf' },
  { key: 'et', label: 'Evapotranspiration' },
];

export const DASHBOARD_ORDER = [
  'temperature.outdoor',
  'temperature.apparent',
  'humidity.outdoor',
  'pressure.seaLevel',
  'wind.speed',
  'wind.gust',
  'wind.direction',
  'rain.daily',
  'rain.rate',
  'temperature.dewPoint',
  'temperature.heatIndex',
  'temperature.windChill',
  'solar.radiation',
  'uv.index',
  'temperature.indoor',
  'humidity.indoor',
  'pressure.absolute',
  'wind.speedAvg10Min',
  'rain.monthly',
  'rain.yearly',
];

export const HERO_METRICS = {
  temperature: ['temperature.outdoor', 'temperature.apparent'],
  wind: ['wind.speed', 'wind.gust', 'wind.direction'],
  rain: ['rain.rate', 'rain.daily', 'rain.monthly', 'rain.yearly'],
};

export const CHART_GROUPS = [
  {
    key: 'temperature',
    label: 'Temperature',
    unit: '°C',
    metrics: [
      { key: 'temperature.outdoor', label: 'Outdoor' },
      { key: 'temperature.dewPoint', label: 'Dew Point' },
      { key: 'temperature.heatIndex', label: 'Heat Index' },
      { key: 'temperature.windChill', label: 'Wind Chill' },
    ],
  },
  {
    key: 'moisture',
    label: 'Moisture',
    unit: '',
    useArea: true,
    metrics: [
      { key: 'humidity.outdoor', label: 'Humidity (%)' },
      { key: 'rain.rate', label: 'Rain Rate (mm/h)' },
      { key: 'rain.daily', label: 'Daily Rain (mm)' },
    ],
  },
  {
    key: 'wind',
    label: 'Wind',
    unit: 'm/s',
    metrics: [
      { key: 'wind.speed', label: 'Speed' },
      { key: 'wind.gust', label: 'Gust' },
    ],
  },
  {
    key: 'pressureSolar',
    label: 'Pressure & Solar',
    unit: '',
    metrics: [
      { key: 'pressure.seaLevel', label: 'Pressure (hPa)' },
      { key: 'solar.radiation', label: 'Solar (W/m²)' },
      { key: 'uv.index', label: 'UV Index' },
    ],
  },
];

export function getLabel(key: string): string {
  return MEASUREMENT_META[key]?.label ?? key;
}

export function getUnitSymbol(unit: string): string {
  return UNIT_SYMBOLS[unit] ?? unit;
}

export function getColor(key: string): string {
  return MEASUREMENT_META[key]?.color ?? 'var(--color-text-muted)';
}

export function getCategory(key: string): string {
  return MEASUREMENT_META[key]?.category ?? 'other';
}

export function formatValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  if (unit === 'degrees') return `${Math.round(value)}`;
  if (unit === 'percent') return `${Math.round(value)}`;
  if (unit === 'uv_index') return `${value.toFixed(1)}`;
  return value.toFixed(1);
}

export function formatTimestamp(ts: string | null): string {
  if (!ts) return '';
  const date = new Date(ts);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
