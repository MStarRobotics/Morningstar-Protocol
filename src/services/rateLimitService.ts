import { RateLimiterMemory } from 'rate-limiter-flexible';

export interface RateLimitConfig {
  points: number;
  duration: number;
  blockDuration?: number;
}

class RateLimitService {
  private limiters: Map<string, RateLimiterMemory> = new Map();

  createLimiter(name: string, config: RateLimitConfig): void {
    this.limiters.set(name, new RateLimiterMemory({
      points: config.points,
      duration: config.duration,
      blockDuration: config.blockDuration
    }));
  }

  async consume(limiterName: string, key: string, points: number = 1): Promise<boolean> {
    const limiter = this.limiters.get(limiterName);
    if (!limiter) {
      throw new Error(`Rate limiter '${limiterName}' not found`);
    }

    try {
      await limiter.consume(key, points);
      return true;
    } catch {
      return false;
    }
  }

  async getRemainingPoints(limiterName: string, key: string): Promise<number> {
    const limiter = this.limiters.get(limiterName);
    if (!limiter) return 0;

    try {
      const res = await limiter.get(key);
      return res ? res.remainingPoints : limiter.points;
    } catch {
      return 0;
    }
  }

  async reset(limiterName: string, key: string): Promise<void> {
    const limiter = this.limiters.get(limiterName);
    if (limiter) {
      await limiter.delete(key);
    }
  }
}

export const rateLimitService = new RateLimitService();

// Initialize default rate limiters
rateLimitService.createLimiter('credential-issuance', {
  points: 10,
  duration: 60 // 10 requests per minute
});

rateLimitService.createLimiter('credential-verification', {
  points: 100,
  duration: 60 // 100 requests per minute
});

rateLimitService.createLimiter('api-general', {
  points: 50,
  duration: 60 // 50 requests per minute
});
