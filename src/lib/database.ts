/**
 * Database Service Replacement
 * Provides AWS DynamoDB and RDS alternatives to Supabase functionality
 */

import { logger, logUtils } from './logging';
import { config } from './config';

// Import AWS SDK v3 modules
import { DynamoDBClient, QueryCommand, ScanCommand, PutItemCommand, UpdateItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';

export interface DatabaseRecord {
  [key: string]: any;
}

export interface QueryOptions {
  select?: string[];
  where?: Record<string, any>;
  limit?: number;
  order?: string;
}

// Global database service instance
let databaseClient: DynamoDBClient | RDSDataClient | null = null;
let useRDS: boolean = false;
const databaseLogger = logger.child({ component: 'DatabaseReplacement' });

// Initialize the database client
async function ensureDatabaseInitialized() {
  if (databaseClient) return;

  try {
    const dbConfig = await config.getDatabase();
    
    // Determine which database service to use
    useRDS = !!(dbConfig.rdsClusterArn && dbConfig.rdsSecretArn);
    
    if (useRDS) {
      databaseClient = new RDSDataClient({
        region: dbConfig.region || 'us-east-1',
      });
      databaseLogger.info('RDS Data API client initialized');
    } else {
      databaseClient = new DynamoDBClient({
        region: dbConfig.region || 'us-east-1',
      });
      databaseLogger.info('DynamoDB client initialized');
    }
  } catch (error) {
    databaseLogger.error('Failed to initialize database client', error as Error);
    throw error;
  }
}

// Execute a DynamoDB operation with logging
async function executeDynamoDB<T>(tableName: string, operation: string, command: any): Promise<T> {
  const startTime = Date.now();
  
  try {
    if (!databaseClient || !('send' in databaseClient)) {
      throw new Error('DynamoDB client not initialized');
    }

    const result = await databaseClient.send(command);
    const duration = Date.now() - startTime;

    databaseLogger.debug(`${operation} operation completed`, {
      table: tableName,
      operation,
      duration,
      recordCount: getRecordCount(result),
    });

    return result as T;
  } catch (error) {
    const duration = Date.now() - startTime;
    databaseLogger.error(`${operation} operation failed`, error as Error, {
      table: tableName,
      operation,
      duration,
    });
    
    logUtils.logError(error as Error, {
      component: 'DatabaseReplacement',
      table: tableName,
      operation,
      duration,
    });

    throw error;
  }
}

// Execute an RDS operation with logging
async function executeRDS<T>(tableName: string, operation: string, sql: string, parameters?: any[]): Promise<T> {
  const startTime = Date.now();
  
  try {
    if (!databaseClient || !('send' in databaseClient)) {
      throw new Error('RDS Data client not initialized');
    }

    const dbConfig = await config.getDatabase();
    if (!dbConfig.rdsResourceArn || !dbConfig.rdsSecretArn) {
      throw new Error('RDS configuration not found');
    }

    const command = new ExecuteStatementCommand({
      resourceArn: dbConfig.rdsResourceArn,
      secretArn: dbConfig.rdsSecretArn,
      database: dbConfig.rdsDatabaseName,
      sql,
      parameters: parameters?.map(param => ({ name: param.name, value: convertToRDSValue(param.value) })),
    });

    const result = await databaseClient.send(command);
    const duration = Date.now() - startTime;

    databaseLogger.debug(`${operation} operation completed`, {
      table: tableName,
      operation,
      duration,
      recordCount: getRDSRecordCount(result),
    });

    return result as T;
  } catch (error) {
    const duration = Date.now() - startTime;
    databaseLogger.error(`${operation} operation failed`, error as Error, {
      table: tableName,
      operation,
      duration,
    });
    
    logUtils.logError(error as Error, {
      component: 'DatabaseReplacement',
      table: tableName,
      operation,
      duration,
    });

    throw error;
  }
}

class DatabaseTable {
  constructor(private tableName: string) {}

  /**
   * SELECT operation
   */
  async select(columns: string = '*'): Promise<{ data: DatabaseRecord[], error?: Error }> {
    try {
      if (useRDS) {
        // RDS implementation
        const sql = `SELECT ${columns} FROM ${this.tableName}`;
        const result = await executeRDS(this.tableName, 'select', sql);
        
        const data = result.records?.map(convertRDSRecord) || [];
        return { data };
      } else {
        // DynamoDB implementation
        const command = new ScanCommand({
          TableName: this.tableName,
        });
        
        const result = await executeDynamoDB(this.tableName, 'select', command);
        return { data: result.Items || [] };
      }
    } catch (error) {
      return { data: [], error: error as Error };
    }
  }

  /**
   * INSERT operation
   */
  async insert(data: DatabaseRecord | DatabaseRecord[]): Promise<{ data: DatabaseRecord[], error?: Error }> {
    try {
      if (Array.isArray(data)) {
        // Batch insert
        if (useRDS) {
          // RDS batch insert
          const sql = `INSERT INTO ${this.tableName} (${Object.keys(data[0]).join(', ')}) VALUES (${Object.keys(data[0]).map((_, i) => `$${i + 1}`).join(', ')})`;
          const parameters = data.map(item => 
            Object.values(item).map(value => ({ value }))
          );
          
          const result = await executeRDS(this.tableName, 'insert', sql, parameters[0]);
          return { data: [convertRDSRecord(result)] };
        } else {
          // DynamoDB batch insert
          const commands = data.map(item => new PutItemCommand({
            TableName: this.tableName,
            Item: convertToDynamoDBItem(item),
          }));

          const results = await Promise.all(commands.map(cmd => 
            executeDynamoDB(this.tableName, 'insert', cmd)
          ));
          
          return { data: results.map(() => ({})) };
        }
      } else {
        // Single insert
        if (useRDS) {
          const columns = Object.keys(data);
          const values = Object.values(data);
          const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`)}) RETURNING *`;
          const parameters = values.map(value => ({ value }));
          
          const result = await executeRDS(this.tableName, 'insert', sql, parameters);
          return { data: [convertRDSRecord(result)] };
        } else {
          const command = new PutItemCommand({
            TableName: this.tableName,
            Item: convertToDynamoDBItem(data),
          });

          const result = await executeDynamoDB(this.tableName, 'insert', command);
          return { data: [result] };
        }
      }
    } catch (error) {
      return { data: [], error: error as Error };
    }
  }

  /**
   * UPDATE operation
   */
  async update(data: DatabaseRecord): Promise<{ data: DatabaseRecord[], error?: Error }> {
    try {
      if (useRDS) {
        const columns = Object.keys(data);
        const sql = `UPDATE ${this.tableName} SET ${columns.map((col, i) => `${col} = $${i + 1}`)} RETURNING *`;
        const parameters = Object.values(data).map(value => ({ value }));
        
        const result = await executeRDS(this.tableName, 'update', sql, parameters);
        return { data: [convertRDSRecord(result)] };
      } else {
        // DynamoDB update requires key specification
        const keys = Object.keys(data);
        const updateExpression = `SET ${keys.map(key => `#${key} = :${key}`).join(', ')}`;
        const expressionAttributeNames = keys.reduce((acc, key) => ({ ...acc, [`#${key}`]: key }), {});
        const expressionAttributeValues = keys.reduce((acc, key) => ({ ...acc, [`:${key}`]: data[key] }), {});

        const command = new UpdateItemCommand({
          TableName: this.tableName,
          Key: { id: data.id }, // Assuming 'id' is the primary key
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
        });

        const result = await executeDynamoDB(this.tableName, 'update', command);
        return { data: [result] };
      }
    } catch (error) {
      return { data: [], error: error as Error };
    }
  }

  /**
   * DELETE operation
   */
  async delete(): Promise<{ data: DatabaseRecord[], error?: Error }> {
    try {
      if (useRDS) {
        const sql = `DELETE FROM ${this.tableName} RETURNING *`;
        const result = await executeRDS(this.tableName, 'delete', sql);
        return { data: [convertRDSRecord(result)] };
      } else {
        // DynamoDB delete requires key
        throw new Error('DynamoDB delete requires specifying the item key');
      }
    } catch (error) {
      return { data: [], error: error as Error };
    }
  }
}

// Utility functions
function getRecordCount(result: any): number {
  if (result.Items) return result.Items.length;
  if (result.Count) return result.Count;
  if (result.Item) return 1;
  return 0;
}

function getRDSRecordCount(result: any): number {
  if (result.records) return result.records.length;
  if (result.numberOfRecordsUpdated) return result.numberOfRecordsUpdated;
  return 0;
}

function convertToRDSValue(value: any): any {
  if (value === null || value === undefined) {
    return { isNull: true };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'number') {
    return { longValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'object') {
    return { stringValue: JSON.stringify(value) };
  }
  return { stringValue: String(value) };
}

function convertFromRDSValue(value: any): any {
  if (value.isNull) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.longValue !== undefined) return value.longValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.doubleValue !== undefined) return value.doubleValue;
  return null;
}

function convertRDSRecord(record: any): DatabaseRecord {
  if (!record || !record.values) return {};
  
  const result: DatabaseRecord = {};
  Object.keys(record.values).forEach(key => {
    result[key] = convertFromRDSValue(record.values[key]);
  });
  return result;
}

function convertToDynamoDBItem(data: DatabaseRecord): any {
  const item: any = {};
  Object.keys(data).forEach(key => {
    const value = data[key];
    if (value === null || value === undefined) {
      item[key] = { NULL: true };
    } else if (typeof value === 'string') {
      item[key] = { S: value };
    } else if (typeof value === 'number') {
      item[key] = { N: String(value) };
    } else if (typeof value === 'boolean') {
      item[key] = { BOOL: value };
    } else if (typeof value === 'object') {
      item[key] = { S: JSON.stringify(value) };
    } else {
      item[key] = { S: String(value) };
    }
  });
  return item;
}

// Initialize database on module load
ensureDatabaseInitialized().catch(error => {
  databaseLogger.error('Failed to initialize database service', error as Error);
});

// Export table factory function
export function from(tableName: string): DatabaseTable {
  return new DatabaseTable(tableName);
}

// Export compatibility interface
export const getDatabase = () => ({ from });

// Export for backward compatibility
export const database = new Proxy({}, {
  get(target, prop) {
    if (prop === 'from') {
      return (tableName: string) => new DatabaseTable(tableName);
    }
    return undefined;
  }
});

// Export database service instance
export const databaseService = database;

// Export initialization function for backward compatibility
export async function initializeDatabase(): Promise<void> {
  // Database is automatically initialized in the module
  console.log('Database service initialized');
}

export default database;