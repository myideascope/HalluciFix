/**
 * Database Replacement Service
 * Provides DynamoDB and RDS alternatives to Supabase functionality
 */

import { logger, logUtils } from './logging';
import { config } from './config';

// Import AWS SDK v3 modules
import { DynamoDBClient, QueryCommand, ScanCommand, PutItemCommand, UpdateItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { RDSDataClient, ExecuteStatementCommand, BatchExecuteStatementCommand } from '@aws-sdk/client-rds-data';

export interface DatabaseRecord {
  [key: string]: any;
}

export interface QueryOptions {
  select?: string[];
  where?: Record<string, any>;
  limit?: number;
  order?: string;
}

class DatabaseReplacementService {
  private dynamoDBClient: DynamoDBClient | null = null;
  private rdsDataClient: RDSDataClient | null = null;
  private useRDS: boolean = false;
  private databaseLogger = logger.child({ component: 'DatabaseReplacement' });

  constructor() {
    this.initializeClients();
  }

  private async initializeClients() {
    try {
      const dbConfig = await config.getDatabase();
      
      // Check if RDS is configured, otherwise use DynamoDB
      this.useRDS = !!(dbConfig.rdsClusterArn && dbConfig.rdsSecretArn);
      
      if (this.useRDS) {
        this.rdsDataClient = new RDSDataClient({
          region: dbConfig.region || 'us-east-1',
        });
        this.databaseLogger.info('RDS Data API client initialized');
      } else {
        this.dynamoDBClient = new DynamoDBClient({
          region: dbConfig.region || 'us-east-1',
        });
        this.databaseLogger.info('DynamoDB client initialized');
      }
    } catch (error) {
      this.databaseLogger.error('Failed to initialize database clients', error as Error);
      throw error;
    }
  }

  /**
   * Get a table/query interface similar to Supabase's from() method
   */
  from(tableName: string) {
    return new DatabaseTable(tableName, this);
  }

  /**
   * Execute a DynamoDB operation with logging
   */
  async executeDynamoDB<T>(tableName: string, operation: string, command: any): Promise<T> {
    const startTime = Date.now();
    
    try {
      if (!this.dynamoDBClient) {
        throw new Error('DynamoDB client not initialized');
      }

      const result = await this.dynamoDBClient.send(command);
      const duration = Date.now() - startTime;

      this.databaseLogger.debug(`${operation} operation completed`, {
        table: tableName,
        operation,
        duration,
        recordCount: this.getRecordCount(result),
      });

      return result as T;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.databaseLogger.error(`${operation} operation failed`, error as Error, {
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

  /**
   * Execute an RDS operation with logging
   */
  async executeRDS<T>(tableName: string, operation: string, sql: string, parameters?: any[]): Promise<T> {
    const startTime = Date.now();
    
    try {
      if (!this.rdsDataClient) {
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
        parameters: parameters?.map(param => ({ name: param.name, value: this.convertToRDSValue(param.value) })),
      });

      const result = await this.rdsDataClient.send(command);
      const duration = Date.now() - startTime;

      this.databaseLogger.debug(`${operation} operation completed`, {
        table: tableName,
        operation,
        duration,
        recordCount: this.getRDSRecordCount(result),
      });

      return result as T;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.databaseLogger.error(`${operation} operation failed`, error as Error, {
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

  private getRecordCount(result: any): number {
    if (result.Items) return result.Items.length;
    if (result.Count) return result.Count;
    if (result.Item) return 1;
    return 0;
  }

  private getRDSRecordCount(result: any): number {
    if (result.records) return result.records.length;
    if (result.numberOfRecordsUpdated) return result.numberOfRecordsUpdated;
    return 0;
  }

  private convertToRDSValue(value: any): any {
    if (value === null || value === undefined) {
      return {isNull: true};
    }
    if (typeof value === 'string') {
      return {stringValue: value};
    }
    if (typeof value === 'number') {
      return {longValue: value};
    }
    if (typeof value === 'boolean') {
      return {booleanValue: value};
    }
    if (typeof value === 'object') {
      return {stringValue: JSON.stringify(value)};
    }
    return {stringValue: String(value)};
  }

  private convertFromRDSValue(value: any): any {
    if (value.isNull) return null;
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.longValue !== undefined) return value.longValue;
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.doubleValue !== undefined) return value.doubleValue;
    return null;
  }

  convertRDSRecord(record: any): DatabaseRecord {
    if (!record || !record.values) return {};
    
    const result: DatabaseRecord = {};
    Object.keys(record.values).forEach(key => {
      result[key] = this.convertFromRDSValue(record.values[key]);
    });
    return result;
  }
}

class DatabaseTable {
  constructor(
    private tableName: string,
    private dbService: DatabaseReplacementService
  ) {}

  /**
   * SELECT operation
   */
  async select(columns: string = '*'): Promise<{ data: DatabaseRecord[], error?: Error }> {
    try {
      if (this.dbService['useRDS']) {
        // RDS implementation
        const sql = `SELECT ${columns} FROM ${this.tableName}`;
        const result = await this.dbService.executeRDS(this.tableName, 'select', sql);
        
        const data = result.records?.map(this.dbService.convertRDSRecord.bind(this.dbService)) || [];
        return { data };
      } else {
        // DynamoDB implementation
        const command = new ScanCommand({
          TableName: this.tableName,
        });
        
        const result = await this.dbService.executeDynamoDB(this.tableName, 'select', command);
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
        if (this.dbService['useRDS']) {
          // RDS batch insert
          const sql = `INSERT INTO ${this.tableName} (${Object.keys(data[0]).join(', ')}) VALUES (${Object.keys(data[0]).map((_, i) => `$${i + 1}`).join(', ')})`;
          const parameters = data.map(item => 
            Object.values(item).map(value => ({ value }))
          );
          
          const result = await this.dbService.executeRDS(this.tableName, 'insert', sql, parameters[0]);
          return { data: [this.dbService.convertRDSRecord(result)] };
        } else {
          // DynamoDB batch insert
          const commands = data.map(item => new PutItemCommand({
            TableName: this.tableName,
            Item: this.convertToDynamoDBItem(item),
          }));

          const results = await Promise.all(commands.map(cmd => 
            this.dbService.executeDynamoDB(this.tableName, 'insert', cmd)
          ));
          
          return { data: results.map(() => ({})) };
        }
      } else {
        // Single insert
        if (this.dbService['useRDS']) {
          const columns = Object.keys(data);
          const values = Object.values(data);
          const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`)}) RETURNING *`;
          const parameters = values.map(value => ({ value }));
          
          const result = await this.dbService.executeRDS(this.tableName, 'insert', sql, parameters);
          return { data: [this.dbService.convertRDSRecord(result)] };
        } else {
          const command = new PutItemCommand({
            TableName: this.tableName,
            Item: this.convertToDynamoDBItem(data),
          });

          const result = await this.dbService.executeDynamoDB(this.tableName, 'insert', command);
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
      if (this.dbService['useRDS']) {
        const columns = Object.keys(data);
        const sql = `UPDATE ${this.tableName} SET ${columns.map((col, i) => `${col} = $${i + 1}`)} RETURNING *`;
        const parameters = Object.values(data).map(value => ({ value }));
        
        const result = await this.dbService.executeRDS(this.tableName, 'update', sql, parameters);
        return { data: [this.dbService.convertRDSRecord(result)] };
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

        const result = await this.dbService.executeDynamoDB(this.tableName, 'update', command);
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
      if (this.dbService['useRDS']) {
        const sql = `DELETE FROM ${this.tableName} RETURNING *`;
        const result = await this.dbService.executeRDS(this.tableName, 'delete', sql);
        return { data: [this.dbService.convertRDSRecord(result)] };
      } else {
        // DynamoDB delete requires key
        throw new Error('DynamoDB delete requires specifying the item key');
      }
    } catch (error) {
      return { data: [], error: error as Error };
    }
  }

  private convertToDynamoDBItem(data: DatabaseRecord): any {
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
}

// Export singleton instance
const databaseReplacementService = new DatabaseReplacementService();

// Export compatibility interface
export const getDatabaseReplacement = () => databaseReplacementService;

// Export for backward compatibility
export const databaseReplacement = new Proxy({}, {
  get(target, prop) {
    if (prop === 'from') {
      return (tableName: string) => databaseReplacementService.from(tableName);
    }
    return undefined;
  }
});

export default databaseReplacement;