import React, { useEffect } from 'react';
import { usePerformanceMonitor, reportPerformanceMetrics } from '../hooks/usePerformanceMonitor';

interface PerformanceMonitorProps {
  children: React.ReactNode;
  reportInterval?: number; // in milliseconds
  enableReporting?: boolean;
}

export function PerformanceMonitor({
  children,
  reportInterval = 30000, // 30 seconds
  enableReporting = true
}: PerformanceMonitorProps) {
  const { metrics, measureOperation } = usePerformanceMonitor();

  useEffect(() => {
    if (!enableReporting) return;

    // Report metrics periodically
    const reportTimer = setInterval(() => {
      reportPerformanceMetrics(metrics);
    }, reportInterval);

    // Report initial metrics
    reportPerformanceMetrics(metrics);

    return () => clearInterval(reportTimer);
  }, [metrics, reportInterval, enableReporting]);

  // Make measureOperation available globally for manual measurements
  useEffect(() => {
    (window as any).measurePerformance = measureOperation;
  }, [measureOperation]);

  return <>{children}</>;
}