// Browser stub for pg module
export class Pool {
  constructor() {
    console.warn('PostgreSQL Pool is not available in browser environment');
  }
  
  async connect() {
    throw new Error('PostgreSQL connections not available in browser environment');
  }
  
  async query() {
    throw new Error('PostgreSQL queries not available in browser environment');
  }
  
  async end() {
    // No-op
  }
  
  get totalCount() { return 0; }
  get idleCount() { return 0; }
  get waitingCount() { return 0; }
}

export class PoolClient {
  async query() {
    throw new Error('PostgreSQL queries not available in browser environment');
  }
  
  release() {
    // No-op
  }
}

export class QueryResult {
  constructor() {
    this.rows = [];
    this.rowCount = 0;
  }
}

export default { Pool, PoolClient, QueryResult };