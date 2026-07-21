import { describe, it, expect } from 'vitest';
import {
  fahrenheitToCelsius,
  celsiusToFahrenheit,
  mphToMs,
  msToMph,
  inHgToHpa,
  hpaToInHg,
  inchesToMm,
  mmToInches,
} from './conversions.js';

describe('fahrenheitToCelsius', () => {
  it('converts freezing point', () => {
    expect(fahrenheitToCelsius(32)).toBeCloseTo(0, 5);
  });

  it('converts boiling point', () => {
    expect(fahrenheitToCelsius(212)).toBeCloseTo(100, 5);
  });

  it('converts body temperature', () => {
    expect(fahrenheitToCelsius(98.6)).toBeCloseTo(37, 1);
  });

  it('converts negative values', () => {
    expect(fahrenheitToCelsius(-40)).toBeCloseTo(-40, 5);
  });
});

describe('celsiusToFahrenheit', () => {
  it('converts zero', () => {
    expect(celsiusToFahrenheit(0)).toBeCloseTo(32, 5);
  });

  it('round-trips through both conversions', () => {
    const original = 72.5;
    expect(celsiusToFahrenheit(fahrenheitToCelsius(original))).toBeCloseTo(original, 5);
  });
});

describe('mphToMs', () => {
  it('converts zero', () => {
    expect(mphToMs(0)).toBe(0);
  });

  it('converts 1 mph', () => {
    expect(mphToMs(1)).toBeCloseTo(0.44704, 4);
  });

  it('converts 60 mph', () => {
    expect(mphToMs(60)).toBeCloseTo(26.8224, 3);
  });
});

describe('msToMph', () => {
  it('round-trips through both conversions', () => {
    const original = 15.5;
    expect(msToMph(mphToMs(original))).toBeCloseTo(original, 5);
  });
});

describe('inHgToHpa', () => {
  it('converts standard pressure', () => {
    expect(inHgToHpa(29.92)).toBeCloseTo(1013.25, 0);
  });

  it('converts zero', () => {
    expect(inHgToHpa(0)).toBe(0);
  });
});

describe('hpaToInHg', () => {
  it('round-trips through both conversions', () => {
    const original = 30.15;
    expect(hpaToInHg(inHgToHpa(original))).toBeCloseTo(original, 5);
  });
});

describe('inchesToMm', () => {
  it('converts 1 inch', () => {
    expect(inchesToMm(1)).toBeCloseTo(25.4, 5);
  });

  it('converts zero', () => {
    expect(inchesToMm(0)).toBe(0);
  });
});

describe('mmToInches', () => {
  it('round-trips through both conversions', () => {
    const original = 2.5;
    expect(mmToInches(inchesToMm(original))).toBeCloseTo(original, 5);
  });
});
