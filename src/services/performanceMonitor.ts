export interface PerformanceMetrics {
  timestamp: number;
  operation: string;
  duration: number;
  success: boolean;
  gasUsed?: number;
  throughput?: number;
}

export interface SystemMetrics {
  totalCredentialsIssued: number;
  totalVerifications: number;
  averageIssuanceTime: number;
  averageVerificationTime: number;
  successRate: number;
  throughputPerHour: number;
  uptime: number;
  activeUsers: number;
}

class PerformanceMonitoringService {
  private metrics: PerformanceMetrics[] = [];
  private startTime: number = Date.now();

  recordMetric(operation: string, duration: number, success: boolean, gasUsed?: number): void {
    this.metrics.push({
      timestamp: Date.now(),
      operation,
      duration,
      success,
      gasUsed
    });
  }

  async measureOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    gasUsed?: number
  ): Promise<T> {
    const start = performance.now();
    let success = true;

    try {
      const result = await fn();
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const duration = performance.now() - start;
      this.recordMetric(operation, duration, success, gasUsed);
    }
  }

  getSystemMetrics(): SystemMetrics {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    const recentMetrics = this.metrics.filter(m => m.timestamp > oneHourAgo);
    const issuanceMetrics = this.metrics.filter(m => m.operation === 'credential_issuance');
    const verificationMetrics = this.metrics.filter(m => m.operation === 'credential_verification');

    const avgIssuance = issuanceMetrics.length > 0
      ? issuanceMetrics.reduce((sum, m) => sum + m.duration, 0) / issuanceMetrics.length
      : 0;

    const avgVerification = verificationMetrics.length > 0
      ? verificationMetrics.reduce((sum, m) => sum + m.duration, 0) / verificationMetrics.length
      : 0;

    const successCount = this.metrics.filter(m => m.success).length;
    const successRate = this.metrics.length > 0
      ? (successCount / this.metrics.length) * 100
      : 100;

    return {
      totalCredentialsIssued: issuanceMetrics.length,
      totalVerifications: verificationMetrics.length,
      averageIssuanceTime: avgIssuance,
      averageVerificationTime: avgVerification,
      successRate,
      throughputPerHour: recentMetrics.length,
      uptime: now - this.startTime,
      activeUsers: this.getActiveUserCount()
    };
  }

  private getActiveUserCount(): number {
    // Simulate active user tracking
    return Math.floor(Math.random() * 100) + 50;
  }

  getMetricsByOperation(operation: string): PerformanceMetrics[] {
    return this.metrics.filter(m => m.operation === operation);
  }

  getRecentMetrics(limit: number = 100): PerformanceMetrics[] {
    return this.metrics.slice(-limit);
  }

  getThroughputStats(): { operation: string; tps: number }[] {
    const operations = ['credential_issuance', 'credential_verification', 'credential_revocation'];
    const oneHourAgo = Date.now() - 3600000;

    return operations.map(op => {
      const count = this.metrics.filter(
        m => m.operation === op && m.timestamp > oneHourAgo
      ).length;

      return {
        operation: op,
        tps: count / 3600 // transactions per second
      };
    });
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  exportMetrics(): string {
    return JSON.stringify({
      systemMetrics: this.getSystemMetrics(),
      throughputStats: this.getThroughputStats(),
      recentMetrics: this.getRecentMetrics(50)
    }, null, 2);
  }
}

export const performanceMonitor = new PerformanceMonitoringService();
