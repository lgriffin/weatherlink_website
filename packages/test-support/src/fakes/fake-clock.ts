import type { Clock } from '@weather/domain';

export class FakeClock implements Clock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date('2026-07-17T14:00:00Z')) {
    this.currentTime = initialTime;
  }

  now(): Date {
    return this.currentTime;
  }

  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  set(time: Date): void {
    this.currentTime = time;
  }
}
