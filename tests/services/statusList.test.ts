import { describe, it, expect, beforeEach } from 'vitest';
import { StatusListService } from '../../src/services/statusList';

describe('StatusListService', () => {
  let service: StatusListService;

  beforeEach(() => {
    service = new StatusListService(128, true);
  });

  it('should allocate indices for credentials', () => {
    const idx1 = service.allocateIndex('cred-1');
    const idx2 = service.allocateIndex('cred-2');
    expect(idx1).not.toBe(idx2);
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(128);
    expect(idx2).toBeLessThan(128);
  });

  it('should return same index for same credential', () => {
    const idx1 = service.allocateIndex('cred-1');
    const idx2 = service.allocateIndex('cred-1');
    expect(idx1).toBe(idx2);
  });

  it('should not show credential as revoked initially', () => {
    const idx = service.allocateIndex('cred-1');
    expect(service.isRevoked(idx)).toBe(false);
  });

  it('should mark credential as revoked', () => {
    const idx = service.allocateIndex('cred-1');
    service.revoke(idx);
    expect(service.isRevoked(idx)).toBe(true);
  });

  it('should export and verify via static checkStatus', () => {
    const idx = service.allocateIndex('cred-1');
    service.revoke(idx);

    const exported = service.exportCredential('did:polygon:issuer', 'status-list-1', 'revocation');
    expect(exported.statusPurpose).toBe('revocation');

    const isRevoked = StatusListService.checkStatus(exported.encodedList, exported.length, idx);
    expect(isRevoked).toBe(true);

    // Non-revoked index
    const idx2 = service.allocateIndex('cred-2');
    const isRevoked2 = StatusListService.checkStatus(exported.encodedList, exported.length, idx2);
    expect(isRevoked2).toBe(false);
  });

  it('should throw when list is full', () => {
    const smallService = new StatusListService(2, true);
    smallService.allocateIndex('a');
    smallService.allocateIndex('b');
    expect(() => smallService.allocateIndex('c')).toThrow('Status list is full');
  });
});
