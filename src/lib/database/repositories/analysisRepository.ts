/**
 * Analysis Results Repository
 * 
 * Repository pattern for analysis_results table operations.
 * Replaces Supabase table operations with direct PostgreSQL queries.
 */

import { db } from '../postgresService';
import { AnalysisResult, DatabaseAnalysisResult, convertDatabaseResult, convertToDatabase } from '../../../types/analysis';
import { logger } from '../../logging';

export interface AnalysisFilters {
  userId?: string;
  analysisType?: 'single' | 'batch' | 'scheduled';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  batchId?: string;
  scanId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minAccuracy?: number;
  maxAccuracy?: number;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface AnalysisStats {
  totalCount: number;
  averageAccuracy: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  recentAnalyses: number;
}

class AnalysisRepository {
  /**
   * Create a new analysis result
   */
  async create(analysis: Omit<AnalysisResult, 'id' | 'createdAt'>): Promise<AnalysisResult> {
    try {
      const dbAnalysis = convertToDatabase(analysis as AnalysisResult);
      
      const query = `
        INSERT INTO analysis_results (
          user_id, content, accuracy, risk_level, hallucinations,
          verification_sources, processing_time, analysis_type,
          batch_id, scan_id, filename, full_content
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;

      const params = [
        dbAnalysis.user_id,
        dbAnalysis.content,
        dbAnalysis.accuracy,
        dbAnalysis.risk_level,
        JSON.stringify(dbAnalysis.hallucinations),
        dbAnalysis.verification_sources,
        dbAnalysis.processing_time,
        dbAnalysis.analysis_type || 'single',
        dbAnalysis.batch_id || null,
        dbAnalysis.scan_id || null,
        dbAnalysis.filename || null,
        dbAnalysis.full_content || null
      ];

      const result = await db.queryOne<DatabaseAnalysisResult>(query, params);
      
      if (!result) {
        throw new Error('Failed to create analysis result');
      }

      logger.info('Analysis result created', { 
        id: result.id, 
        userId: result.user_id,
        analysisType: result.analysis_type 
      });

      return convertDatabaseResult(result);

    } catch (error) {
      logger.error('Failed to create analysis result', error as Error);
      throw error;
    }
  }

  /**
   * Get analysis result by ID
   */
  async findById(id: string, userId?: string): Promise<AnalysisResult | null> {
    try {
      let query = 'SELECT * FROM analysis_results WHERE id = $1';
      const params: any[] = [id];

      if (userId) {
        query += ' AND user_id = $2';
        params.push(userId);
      }

      const result = await db.queryOne<DatabaseAnalysisResult>(query, params);
      
      return result ? convertDatabaseResult(result) : null;

    } catch (error) {
      logger.error('Failed to find analysis result by ID', error as Error, { id, userId });
      throw error;
    }
  }

  /**
   * Find analysis results with filters and pagination
   */
  async findMany(
    filters?: AnalysisFilters,
    pagination?: PaginationOptions
  ): Promise<{ data: AnalysisResult[]; total: number }> {
    try {
      const { 
        limit = 50, 
        offset = 0, 
        orderBy = 'created_at', 
        orderDirection = 'DESC' 
      } = pagination || {};

      // Build WHERE clause
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (filters?.userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        params.push(filters.userId);
      }

      if (filters?.analysisType) {
        conditions.push(`analysis_type = $${paramIndex++}`);
        params.push(filters.analysisType);
      }

      if (filters?.riskLevel) {
        conditions.push(`risk_level = $${paramIndex++}`);
        params.push(filters.riskLevel);
      }

      if (filters?.batchId) {
        conditions.push(`batch_id = $${paramIndex++}`);
        params.push(filters.batchId);
      }

      if (filters?.scanId) {
        conditions.push(`scan_id = $${paramIndex++}`);
        params.push(filters.scanId);
      }

      if (filters?.dateFrom) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(filters.dateFrom);
      }

      if (filters?.dateTo) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(filters.dateTo);
      }

      if (filters?.minAccuracy !== undefined) {
        conditions.push(`accuracy >= $${paramIndex++}`);
        params.push(filters.minAccuracy);
      }

      if (filters?.maxAccuracy !== undefined) {
        conditions.push(`accuracy <= $${paramIndex++}`);
        params.push(filters.maxAccuracy);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM analysis_results ${whereClause}`;
      const countResult = await db.queryOne<{ count: string }>(countQuery, params);
      const total = parseInt(countResult?.count || '0');

      // Get data
      const dataQuery = `
        SELECT * FROM analysis_results 
        ${whereClause}
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      params.push(limit, offset);
      const results = await db.queryMany<DatabaseAnalysisResult>(dataQuery, params);

      const data = results.map(convertDatabaseResult);

      return { data, total };

    } catch (error) {
      logger.error('Failed to find analysis results', error as Error, { filters, pagination });
      throw error;
    }
  }

  /**
   * Update analysis result
   */
  async update(id: string, updates: Partial<AnalysisResult>, userId?: string): Promise<AnalysisResult | null> {
    try {
      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Build SET clause
      if (updates.accuracy !== undefined) {
        updateFields.push(`accuracy = $${paramIndex++}`);
        params.push(updates.accuracy);
      }

      if (updates.riskLevel) {
        updateFields.push(`risk_level = $${paramIndex++}`);
        params.push(updates.riskLevel);
      }

      if (updates.hallucinations) {
        updateFields.push(`hallucinations = $${paramIndex++}`);
        params.push(JSON.stringify(updates.hallucinations));
      }

      if (updates.verificationSources !== undefined) {
        updateFields.push(`verification_sources = $${paramIndex++}`);
        params.push(updates.verificationSources);
      }

      if (updates.processingTime !== undefined) {
        updateFields.push(`processing_time = $${paramIndex++}`);
        params.push(updates.processingTime);
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      // Build WHERE clause
      let whereClause = `WHERE id = $${paramIndex++}`;
      params.push(id);

      if (userId) {
        whereClause += ` AND user_id = $${paramIndex++}`;
        params.push(userId);
      }

      const query = `
        UPDATE analysis_results 
        SET ${updateFields.join(', ')}
        ${whereClause}
        RETURNING *
      `;

      const result = await db.queryOne<DatabaseAnalysisResult>(query, params);
      
      if (!result) {
        return null;
      }

      logger.info('Analysis result updated', { id, userId });
      return convertDatabaseResult(result);

    } catch (error) {
      logger.error('Failed to update analysis result', error as Error, { id, userId });
      throw error;
    }
  }

  /**
   * Delete analysis result
   */
  async delete(id: string, userId?: string): Promise<boolean> {
    try {
      let query = 'DELETE FROM analysis_results WHERE id = $1';
      const params: any[] = [id];

      if (userId) {
        query += ' AND user_id = $2';
        params.push(userId);
      }

      const result = await db.query(query, params);
      
      const deleted = (result.rowCount || 0) > 0;
      
      if (deleted) {
        logger.info('Analysis result deleted', { id, userId });
      }

      return deleted;

    } catch (error) {
      logger.error('Failed to delete analysis result', error as Error, { id, userId });
      throw error;
    }
  }

  /**
   * Get analysis statistics for a user
   */
  async getStats(userId: string, dateFrom?: Date, dateTo?: Date): Promise<AnalysisStats> {
    try {
      const conditions = ['user_id = $1'];
      const params: any[] = [userId];
      let paramIndex = 2;

      if (dateFrom) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(dateFrom);
      }

      if (dateTo) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(dateTo);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      // Get overall stats
      const statsQuery = `
        SELECT 
          COUNT(*) as total_count,
          AVG(accuracy) as average_accuracy,
          COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk,
          COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk,
          COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk,
          COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_analyses
        FROM analysis_results ${whereClause}
      `;

      const result = await db.queryOne<{
        total_count: string;
        average_accuracy: string;
        low_risk: string;
        medium_risk: string;
        high_risk: string;
        critical_risk: string;
        recent_analyses: string;
      }>(statsQuery, params);

      if (!result) {
        throw new Error('Failed to get analysis stats');
      }

      return {
        totalCount: parseInt(result.total_count),
        averageAccuracy: parseFloat(result.average_accuracy) || 0,
        riskDistribution: {
          low: parseInt(result.low_risk),
          medium: parseInt(result.medium_risk),
          high: parseInt(result.high_risk),
          critical: parseInt(result.critical_risk)
        },
        recentAnalyses: parseInt(result.recent_analyses)
      };

    } catch (error) {
      logger.error('Failed to get analysis stats', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Bulk create analysis results
   */
  async bulkCreate(analyses: Omit<AnalysisResult, 'id' | 'createdAt'>[]): Promise<AnalysisResult[]> {
    try {
      if (analyses.length === 0) {
        return [];
      }

      return await db.transaction(async (client) => {
        const results: AnalysisResult[] = [];

        for (const analysis of analyses) {
          const dbAnalysis = convertToDatabase(analysis as AnalysisResult);
          
          const query = `
            INSERT INTO analysis_results (
              user_id, content, accuracy, risk_level, hallucinations,
              verification_sources, processing_time, analysis_type,
              batch_id, scan_id, filename, full_content
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
          `;

          const params = [
            dbAnalysis.user_id,
            dbAnalysis.content,
            dbAnalysis.accuracy,
            dbAnalysis.risk_level,
            JSON.stringify(dbAnalysis.hallucinations),
            dbAnalysis.verification_sources,
            dbAnalysis.processing_time,
            dbAnalysis.analysis_type || 'single',
            dbAnalysis.batch_id || null,
            dbAnalysis.scan_id || null,
            dbAnalysis.filename || null,
            dbAnalysis.full_content || null
          ];

          const result = await client.query<DatabaseAnalysisResult>(query, params);
          
          if (result.rows[0]) {
            results.push(convertDatabaseResult(result.rows[0]));
          }
        }

        logger.info('Bulk analysis results created', { count: results.length });
        return results;
      });

    } catch (error) {
      logger.error('Failed to bulk create analysis results', error as Error);
      throw error;
    }
  }
}

// Export singleton instance
export const analysisRepository = new AnalysisRepository();