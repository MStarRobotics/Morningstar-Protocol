import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env module before importing logger
vi.mock('../../src/services/env', () => ({
  env: {
    isDev: false,
  },
}));

import { logger } from '../../src/services/logger';
import { env } from '../../src/services/env';

describe('Logger Service', () => {
  beforeEach(() => {
    logger.clear();
    vi.restoreAllMocks();
    // Reset isDev to false by default
    (env as { isDev: boolean }).isDev = false;
  });

  describe('log levels store entries in the ring buffer', () => {
    it('should store a debug entry', () => {
      logger.debug('debug message', { detail: 'test' });
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('debug');
      expect(logs[0].message).toBe('debug message');
      expect(logs[0].data).toEqual({ detail: 'test' });
    });

    it('should store an info entry', () => {
      logger.info('info message', 42);
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toBe('info message');
      expect(logs[0].data).toBe(42);
    });

    it('should store a warn entry', () => {
      logger.warn('warn message');
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('warn');
      expect(logs[0].message).toBe('warn message');
    });

    it('should store an error entry', () => {
      const err = new Error('something broke');
      logger.error('error message', err);
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toBe('error message');
      expect(logs[0].data).toBe(err);
    });

    it('should include a timestamp on each entry', () => {
      logger.info('timestamped');
      const logs = logger.getRecentLogs();
      expect(logs[0].timestamp).toBeDefined();
      const parsed = Date.parse(logs[0].timestamp);
      expect(Number.isNaN(parsed)).toBe(false);
    });
  });

  describe('getRecentLogs', () => {
    it('should return all entries when count exceeds buffer size', () => {
      logger.info('one');
      logger.warn('two');
      logger.error('three');
      const logs = logger.getRecentLogs(500);
      expect(logs).toHaveLength(3);
    });

    it('should return only the last N entries when count is specified', () => {
      logger.info('first');
      logger.info('second');
      logger.info('third');
      logger.info('fourth');
      const logs = logger.getRecentLogs(2);
      expect(logs).toHaveLength(2);
      expect(logs[0].message).toBe('third');
      expect(logs[1].message).toBe('fourth');
    });

    it('should return entries in chronological order', () => {
      logger.debug('step-1');
      logger.info('step-2');
      logger.warn('step-3');
      logger.error('step-4');
      const logs = logger.getRecentLogs();
      expect(logs[0].message).toBe('step-1');
      expect(logs[1].message).toBe('step-2');
      expect(logs[2].message).toBe('step-3');
      expect(logs[3].message).toBe('step-4');
    });

    it('should return an empty array when buffer is empty', () => {
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(0);
    });
  });

  describe('ring buffer max size', () => {
    it('should not exceed 100 entries', () => {
      for (let i = 0; i < 120; i++) {
        logger.info(`message-${i}`);
      }
      const logs = logger.getRecentLogs();
      expect(logs.length).toBe(100);
    });

    it('should keep the most recent entries when buffer overflows', () => {
      for (let i = 0; i < 110; i++) {
        logger.info(`msg-${i}`);
      }
      const logs = logger.getRecentLogs();
      // The first 10 should have been evicted
      expect(logs[0].message).toBe('msg-10');
      expect(logs[logs.length - 1].message).toBe('msg-109');
    });
  });

  describe('clear', () => {
    it('should empty the buffer', () => {
      logger.info('a');
      logger.warn('b');
      logger.error('c');
      expect(logger.getRecentLogs()).toHaveLength(3);

      logger.clear();
      expect(logger.getRecentLogs()).toHaveLength(0);
    });

    it('should allow new entries after clearing', () => {
      logger.info('before');
      logger.clear();
      logger.info('after');
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('after');
    });
  });

  describe('dev mode console output', () => {
    beforeEach(() => {
      (env as { isDev: boolean }).isDev = true;
    });

    it('should call console.debug for debug level', () => {
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      logger.debug('dev debug');
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith('[DEBUG] dev debug', '');
    });

    it('should call console.log for info level', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('dev info');
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith('[INFO] dev info', '');
    });

    it('should call console.warn for warn level', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('dev warn');
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith('[WARN] dev warn', '');
    });

    it('should call console.error for error level', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('dev error');
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith('[ERROR] dev error', '');
    });

    it('should pass data to console methods', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const data = { key: 'value' };
      logger.info('with data', data);
      expect(spy).toHaveBeenCalledWith('[INFO] with data', data);
    });
  });

  describe('production mode (isDev = false)', () => {
    it('should not call console.debug', () => {
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      logger.debug('silent debug');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not call console.log', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('silent info');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not call console.warn', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('silent warn');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not call console.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('silent error');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should still store entries in the buffer even without console output', () => {
      logger.info('buffered');
      logger.warn('also buffered');
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(2);
    });
  });
});
