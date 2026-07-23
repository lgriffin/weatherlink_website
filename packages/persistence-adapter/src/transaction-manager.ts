import type { TransactionManager } from '@weather/domain';
import type { DrizzleDatabase as Database } from './db.js';

export class DrizzleTransactionManager implements TransactionManager {
  constructor(private readonly db: Database) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.transaction(async () => {
      return fn();
    });
  }
}
