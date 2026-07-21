export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

export function celsiusToFahrenheit(c: number): number {
  return c * (9 / 5) + 32;
}

export function mphToMs(mph: number): number {
  return mph * 0.44704;
}

export function msToMph(ms: number): number {
  return ms / 0.44704;
}

export function inHgToHpa(inHg: number): number {
  return inHg * 33.8639;
}

export function hpaToInHg(hpa: number): number {
  return hpa / 33.8639;
}

export function inchesToMm(inches: number): number {
  return inches * 25.4;
}

export function mmToInches(mm: number): number {
  return mm / 25.4;
}
