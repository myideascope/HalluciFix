import { createClient } from '@supabase/supabase-js';
import { config } from './config';

interface ProfilerConfig {
  enableQueryProfiling: boolean;
  enableResourceMonitoring: boolean;
  profilingDuration: number; // seconds
  samplingInterval: number; // milliseconds
  slowQueryThreshold: number; // milliseconds
}

interface QueryProfile {
  queryId: string;
  queryText: string;
  executionPlan: ExecutionPlan;
  executionTime: number;
  resourceUsage: ResourceUsage;
  bottlenecks: Bottleneck[];
  optimizationSuggestions: string[];
}

interface ExecutionPlan {
  planNodes: PlanNode[];
  totalCost: number;
  actualTime: number;
  rowsReturned: number;
  indexesUsed: string[];
  tablesScanned: string[];
}

interface PlanNode {
  nodeType: string;
  operation: string;
  cost: number;
  actualTime: number;
  rows: number;
  width: number;
  indexName?: string;
  tableName?: string;
  filterCondition?: string;
}

interface ResourceUsage {
  cpuTime: number;
  ioTime: number;
  memoryUsage: number;
  diskReads: number;
  diskWrites: number;
  networkBytes: number;
}

interface Bottleneck {
  type: 'cpu' | 'io' | 'memory' | 'network' | 'lock' | 'index';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: number; // percentage of total execution time
  suggestion: string;
}

interface ProfilingSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  config: ProfilerConfig;
  queryProfiles: QueryProfile[];
  systemMetrics: SystemMetrics[];
  summary: ProfilingSummary;
}

interface SystemMetrics {
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  diskIOPS: number;
  networkThroughput: number;
  activeConnections: number;
  lockWaits: number;
  cacheHitRatio: number;
}

interface ProfilingSummary {
  totalQueries: number;
  slowQueries: number;
  averageExecutionTime: number;
  topBottlenecks: Bottleneck[];
  resourceUtilization: {
    avgCpuUsage: number;
    avgMemoryUsage: number;
    avgDiskIOPS: number;
    peakConnections: number;
  };
  optimizationOpportunities: string[];
}

class DatabaseProfiler {
  private supabase = createClient(config.database.supabaseUrl, config.database.supabaseAnonKey);
  private activeSessions: Map<string, ProfilingSession> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  async startProfilingSession(config: ProfilerConfig): Promise<string> {
    const sessionId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: ProfilingSession = {
      sessionId,
      startTime: new Date(),
      config,
      queryProfiles: [],
      systemMetrics: [],
      summary: {
        totalQueries: 0,
        slowQueries: 0,
        averageExecutionTime: 0,
        topBottlenecks: [],
        resourceUtilization: {
          avgCpuUsage: 0,
          avgMemoryUsage: 0,
          avgDiskIOPS: 0,
          peakConnections: 0
        },
        optimizationOpportunities: []
      }
    };

    this.activeSessions.set(sessionId, session);

    // Start resource monitoring if enabled
    if (config.enableResourceMonitoring) {
      this.startResourceMonitoring(sessionId, config.samplingInterval);
    }

    // Set up automatic session end
    setTimeout(() => {
      this.stopProfilingSession(sessionId);
    }, config.profilingDuration * 1000);

    console.log(`Started profiling session: ${sessionId}`);
    return sessionId;
  }

  async stopProfilingSession(sessionId: string): Promise<ProfilingSession | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.warn(`Profiling session not found: ${sessionId}`);
      return null;
    }

    session.endTime = new Date();

    // Stop resource monitoring
    const interval = this.monitoringIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(sessionId);
    }

    // Generate summary
    session.summary = this.generateProfilingSummary(session);

    // Save session results
    await this.saveProfilingSession(session);

    // Clean up
    this.activeSessions.delete(sessionId);

    console.log(`Stopped profiling session: ${sessionId}`);
    return session;
  }

  async profileQuery(sessionId: string, queryText: string, queryFn: () => Promise<any>): Promise<QueryProfile> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.config.enableQueryProfiling) {
      // If no active session, just execute the query
      await queryFn();
      return this.createEmptyQueryProfile(queryText);
    }

    const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // Get execution plan before running query
      const executionPlan = await this.getExecutionPlan(queryText);

      // Execute the query
      const result = await queryFn();

      const executionTime = Date.now() - startTime;

      // Collect resource usage (simulated for now)
      const resourceUsage = await this.collectQueryResourceUsage(queryId, executionTime);

      // Analyze bottlenecks
      const bottlenecks = this.analyzeBottlenecks(executionPlan, resourceUsage, executionTime);

      // Generate optimization suggestions
      const optimizationSuggestions = this.generateOptimizationSuggestions(executionPlan, bottlenecks);

      const queryProfile: QueryProfile = {
        queryId,
        queryText,
        executionPlan,
        executionTime,
        resourceUsage,
        bottlenecks,
        optimizationSuggestions
      };

      // Add to session
      session.queryProfiles.push(queryProfile);

      return queryProfile;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`Query profiling failed for ${queryId}:`, error);
      
      return {
        queryId,
        queryText,
        executionPlan: { planNodes: [], totalCost: 0, actualTime: executionTime, rowsReturned: 0, indexesUsed: [], tablesScanned: [] },
        executionTime,
        resourceUsage: { cpuTime: 0, ioTime: 0, memoryUsage: 0, diskReads: 0, diskWrites: 0, networkBytes: 0 },
        bottlenecks: [],
        optimizationSuggestions: ['Query execution failed - check query syntax and database connectivity']
      };
    }
  }

  private async getExecutionPlan(queryText: string): Promise<ExecutionPlan> {
    try {
      // For Supabase/PostgreSQL, we would use EXPLAIN ANALYZE
      // This is a simplified implementation
      const { data, error } = await this.supabase.rpc('explain_query_plan', {
        query_text: queryText
      });

      if (error || !data) {
        return this.createDefaultExecutionPlan();
      }

      return this.parseExecutionPlan(data);
    } catch (error) {
      console.warn('Failed to get execution plan:', error);
      return this.createDefaultExecutionPlan();
    }
  }

  private parseExecutionPlan(planData: any): ExecutionPlan {
    // Parse PostgreSQL execution plan
    // This is a simplified implementation
    const planNodes: PlanNode[] = [];
    let totalCost = 0;
    let actualTime = 0;
    const indexesUsed: string[] = [];
    const tablesScanned: string[] = [];

    if (Array.isArray(planData)) {
      planData.forEach((node: any) => {
        const planNode: PlanNode = {
          nodeType: node.node_type || 'Unknown',
          operation: node.operation || 'Unknown',
          cost: node.total_cost || 0,
          actualTime: node.actual_time || 0,
          rows: node.rows || 0,
          width: node.width || 0,
          indexName: node.index_name,
          tableName: node.table_name,
          filterCondition: node.filter
        };

        planNodes.push(planNode);
        totalCost += planNode.cost;
        actualTime += planNode.actualTime;

        if (planNode.indexName) {
          indexesUsed.push(planNode.indexName);
        }
        if (planNode.tableName) {
          tablesScanned.push(planNode.tableName);
        }
      });
    }

    return {
      planNodes,
      totalCost,
      actualTime,
      rowsReturned: planNodes.reduce((sum, node) => sum + node.rows, 0),
      indexesUsed: [...new Set(indexesUsed)],
      tablesScanned: [...new Set(tablesScanned)]
    };
  }

  private createDefaultExecutionPlan(): ExecutionPlan {
    return {
      planNodes: [],
      totalCost: 0,
      actualTime: 0,
      rowsReturned: 0,
      indexesUsed: [],
      tablesScanned: []
    };
  }

  private async collectQueryResourceUsage(queryId: string, executionTime: number): Promise<ResourceUsage> {
    // In a real implementation, this would collect actual resource metrics
    // For now, we'll simulate based on execution time
    return {
      cpuTime: executionTime * 0.7, // Assume 70% of time is CPU
      ioTime: executionTime * 0.2,  // 20% is I/O
      memoryUsage: Math.min(executionTime * 1000, 100 * 1024 * 1024), // Estimate memory usage
      diskReads: Math.floor(executionTime / 10), // Estimate disk reads
      diskWrites: Math.floor(executionTime / 50), // Estimate disk writes
      networkBytes: executionTime * 100 // Estimate network usage
    };
  }

  private analyzeBottlenecks(
    executionPlan: ExecutionPlan,
    resourceUsage: ResourceUsage,
    executionTime: number
  ): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    // Analyze CPU bottlenecks
    if (resourceUsage.cpuTime > executionTime * 0.8) {
      bottlenecks.push({
        type: 'cpu',
        severity: 'high',
        description: 'High CPU usage detected',
        impact: (resourceUsage.cpuTime / executionTime) * 100,
        suggestion: 'Consider optimizing query logic or adding appropriate indexes'
      });
    }

    // Analyze I/O bottlenecks
    if (resourceUsage.ioTime > executionTime * 0.5) {
      bottlenecks.push({
        type: 'io',
        severity: 'high',
        description: 'High I/O wait time detected',
        impact: (resourceUsage.ioTime / executionTime) * 100,
        suggestion: 'Consider adding indexes or optimizing table structure'
      });
    }

    // Analyze index usage
    const hasSeqScan = executionPlan.planNodes.some(node => 
      node.nodeType.toLowerCase().includes('seq') || 
      node.operation.toLowerCase().includes('sequential')
    );
    
    if (hasSeqScan && executionPlan.rowsReturned > 1000) {
      bottlenecks.push({
        type: 'index',
        severity: 'medium',
        description: 'Sequential scan detected on large table',
        impact: 60,
        suggestion: 'Add appropriate indexes for WHERE clauses and JOIN conditions'
      });
    }

    // Analyze memory usage
    if (resourceUsage.memoryUsage > 50 * 1024 * 1024) { // 50MB
      bottlenecks.push({
        type: 'memory',
        severity: 'medium',
        description: 'High memory usage detected',
        impact: 30,
        suggestion: 'Consider reducing result set size or optimizing query structure'
      });
    }

    return bottlenecks.sort((a, b) => b.impact - a.impact);
  }

  private generateOptimizationSuggestions(
    executionPlan: ExecutionPlan,
    bottlenecks: Bottleneck[]
  ): string[] {
    const suggestions: string[] = [];

    // Add bottleneck-specific suggestions
    bottlenecks.forEach(bottleneck => {
      suggestions.push(bottleneck.suggestion);
    });

    // Add general optimization suggestions
    if (executionPlan.indexesUsed.length === 0) {
      suggestions.push('No indexes were used - consider adding indexes on frequently queried columns');
    }

    if (executionPlan.totalCost > 1000) {
      suggestions.push('High query cost detected - review query structure and consider breaking into smaller operations');
    }

    if (executionPlan.tablesScanned.length > 3) {
      suggestions.push('Multiple table scans detected - consider optimizing JOIN operations');
    }

    return [...new Set(suggestions)]; // Remove duplicates
  }

  private createEmptyQueryProfile(queryText: string): QueryProfile {
    return {
      queryId: 'no_session',
      queryText,
      executionPlan: this.createDefaultExecutionPlan(),
      executionTime: 0,
      resourceUsage: { cpuTime: 0, ioTime: 0, memoryUsage: 0, diskReads: 0, diskWrites: 0, networkBytes: 0 },
      bottlenecks: [],
      optimizationSuggestions: []
    };
  }

  private startResourceMonitoring(sessionId: string, samplingInterval: number): void {
    const interval = setInterval(async () => {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        clearInterval(interval);
        return;
      }

      try {
        const metrics = await this.collectSystemMetrics();
        session.systemMetrics.push(metrics);
      } catch (error) {
        console.error('Failed to collect system metrics:', error);
      }
    }, samplingInterval);

    this.monitoringIntervals.set(sessionId, interval);
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    try {
      // Collect database metrics
      const { data: dbStats } = await this.supabase.rpc('get_database_stats');
      const { data: connectionStats } = await this.supabase.rpc('get_connection_stats');

      return {
        timestamp: new Date(),
        cpuUsage: dbStats?.[0]?.cpu_usage || 0,
        memoryUsage: dbStats?.[0]?.memory_usage || 0,
        diskIOPS: dbStats?.[0]?.disk_iops || 0,
        networkThroughput: dbStats?.[0]?.network_throughput || 0,
        activeConnections: connectionStats?.[0]?.active_connections || 0,
        lockWaits: dbStats?.[0]?.lock_waits || 0,
        cacheHitRatio: dbStats?.[0]?.cache_hit_ratio || 0
      };
    } catch (error) {
      console.warn('Failed to collect system metrics:', error);
      return {
        timestamp: new Date(),
        cpuUsage: 0,
        memoryUsage: 0,
        diskIOPS: 0,
        networkThroughput: 0,
        activeConnections: 0,
        lockWaits: 0,
        cacheHitRatio: 0
      };
    }
  }

  private generateProfilingSummary(session: ProfilingSession): ProfilingSummary {
    const queryProfiles = session.queryProfiles;
    const systemMetrics = session.systemMetrics;

    const totalQueries = queryProfiles.length;
    const slowQueries = queryProfiles.filter(q => q.executionTime > session.config.slowQueryThreshold).length;
    const averageExecutionTime = queryProfiles.reduce((sum, q) => sum + q.executionTime, 0) / totalQueries || 0;

    // Collect all bottlenecks and find top ones
    const allBottlenecks = queryProfiles.flatMap(q => q.bottlenecks);
    const topBottlenecks = allBottlenecks
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 5);

    // Calculate resource utilization
    const resourceUtilization = {
      avgCpuUsage: systemMetrics.reduce((sum, m) => sum + m.cpuUsage, 0) / systemMetrics.length || 0,
      avgMemoryUsage: systemMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) / systemMetrics.length || 0,
      avgDiskIOPS: systemMetrics.reduce((sum, m) => sum + m.diskIOPS, 0) / systemMetrics.length || 0,
      peakConnections: Math.max(...systemMetrics.map(m => m.activeConnections), 0)
    };

    // Generate optimization opportunities
    const optimizationOpportunities = this.generateOptimizationOpportunities(queryProfiles, topBottlenecks);

    return {
      totalQueries,
      slowQueries,
      averageExecutionTime,
      topBottlenecks,
      resourceUtilization,
      optimizationOpportunities
    };
  }

  private generateOptimizationOpportunities(
    queryProfiles: QueryProfile[],
    topBottlenecks: Bottleneck[]
  ): string[] {
    const opportunities: string[] = [];

    // Analyze query patterns
    const slowQueries = queryProfiles.filter(q => q.executionTime > 1000);
    if (slowQueries.length > 0) {
      opportunities.push(`${slowQueries.length} slow queries detected - focus on optimization`);
    }

    // Analyze index usage
    const queriesWithoutIndexes = queryProfiles.filter(q => q.executionPlan.indexesUsed.length === 0);
    if (queriesWithoutIndexes.length > queryProfiles.length * 0.5) {
      opportunities.push('Many queries not using indexes - review indexing strategy');
    }

    // Analyze bottleneck patterns
    const cpuBottlenecks = topBottlenecks.filter(b => b.type === 'cpu');
    if (cpuBottlenecks.length > 0) {
      opportunities.push('CPU bottlenecks detected - consider query optimization');
    }

    const ioBottlenecks = topBottlenecks.filter(b => b.type === 'io');
    if (ioBottlenecks.length > 0) {
      opportunities.push('I/O bottlenecks detected - consider adding indexes or optimizing storage');
    }

    return opportunities;
  }

  private async saveProfilingSession(session: ProfilingSession): Promise<void> {
    try {
      await this.supabase
        .from('profiling_sessions')
        .insert({
          session_id: session.sessionId,
          start_time: session.startTime.toISOString(),
          end_time: session.endTime?.toISOString(),
          config: session.config,
          query_profiles: session.queryProfiles,
          system_metrics: session.systemMetrics,
          summary: session.summary
        });
    } catch (error) {
      console.error('Failed to save profiling session:', error);
    }
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  getSession(sessionId: string): ProfilingSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  async getHistoricalSessions(limit: number = 10): Promise<ProfilingSession[]> {
    try {
      const { data, error } = await this.supabase
        .from('profiling_sessions')
        .select('*')
        .order('start_time', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get historical sessions:', error);
      return [];
    }
  }
}

export { DatabaseProfiler, ProfilerConfig, QueryProfile, ProfilingSession, Bottleneck };