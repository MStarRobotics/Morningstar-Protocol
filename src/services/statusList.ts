/**
 * Status List 2021 (Bitstring) Service
 * Implements privacy-preserving revocation checks for VCs.
 * Default length follows the W3C guidance for group privacy (131072+ entries).
 */

import { env } from './env';

export type StatusPurpose = 'revocation' | 'suspension';

export interface StatusListCredential {
  id: string;
  type: string[];
  statusPurpose: StatusPurpose;
  encodedList: string; // base64
  issuer: string;
  issuedAt: string;
  length: number;
}

const DEFAULT_LIST_LENGTH = 131072;

const bytesToBase64 = (bytes: Uint8Array): string => {
  if (typeof btoa !== 'undefined') {
    let binary = '';
    bytes.forEach(b => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }
  // Fallback for non-browser environments
  return Buffer.from(bytes).toString('base64');
};

const base64ToBytes = (base64: string): Uint8Array => {
  if (typeof atob !== 'undefined') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  // Fallback for non-browser environments
  return new Uint8Array(Buffer.from(base64, 'base64'));
};

export class StatusListService {
  private length: number;
  private list: Uint8Array;
  private indexByCredentialId: Map<string, number> = new Map();
  private allocatedIndexes: Set<number> = new Set();

  constructor(length: number = DEFAULT_LIST_LENGTH, allowUnsafeLength: boolean = false) {
    const allowSmallList = allowUnsafeLength || env?.mode === 'test' || env?.isDev;
    const configuredLength = allowSmallList ? length : (env?.statusListLength || length);
    this.length = allowSmallList ? configuredLength : Math.max(configuredLength, DEFAULT_LIST_LENGTH);
    this.list = new Uint8Array(Math.ceil(this.length / 8));
    if (!allowSmallList) {
      this.restoreState();
    }
  }

  allocateIndex(credentialId: string): number {
    const existing = this.indexByCredentialId.get(credentialId);
    if (existing !== undefined) return existing;

    const nextIndex = this.allocateRandomIndex();
    this.indexByCredentialId.set(credentialId, nextIndex);
    this.persistState();
    return nextIndex;
  }

  revoke(index: number): void {
    this.setBit(index, true);
    this.persistState();
  }

  suspend(index: number): void {
    this.setBit(index, true);
    this.persistState();
  }

  isRevoked(index: number): boolean {
    return this.getBit(index);
  }

  exportCredential(issuer: string, id: string, purpose: StatusPurpose): StatusListCredential {
    return {
      id,
      type: ['VerifiableCredential', 'StatusList2021Credential'],
      statusPurpose: purpose,
      encodedList: bytesToBase64(this.list),
      issuer,
      issuedAt: new Date().toISOString(),
      length: this.length
    };
  }

  importEncodedList(encodedList: string, length: number): void {
    this.length = length;
    this.list = base64ToBytes(encodedList);
    this.persistState();
  }

  static checkStatus(encodedList: string, length: number, index: number): boolean {
    const listBytes = base64ToBytes(encodedList);
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    if (index < 0 || index >= length) return true;
    if (byteIndex >= listBytes.length) return true;
    return ((listBytes[byteIndex] >> bitIndex) & 1) === 1;
  }

  private setBit(index: number, value: boolean): void {
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    if (index < 0 || index >= this.length) return;

    if (value) {
      this.list[byteIndex] |= (1 << bitIndex);
    } else {
      this.list[byteIndex] &= ~(1 << bitIndex);
    }
  }

  private getBit(index: number): boolean {
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    if (index < 0 || index >= this.length) return true;
    return ((this.list[byteIndex] >> bitIndex) & 1) === 1;
  }

  private allocateRandomIndex(): number {
    if (this.allocatedIndexes.size >= this.length) {
      throw new Error('Status list is full');
    }

    let index = 0;
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      index = this.randomIndex();
      if (!this.allocatedIndexes.has(index)) {
        this.allocatedIndexes.add(index);
        return index;
      }
    }

    // Fallback to linear scan if random allocation fails
    for (let i = 0; i < this.length; i++) {
      if (!this.allocatedIndexes.has(i)) {
        this.allocatedIndexes.add(i);
        return i;
      }
    }

    throw new Error('Status list allocation failed');
  }

  private randomIndex(): number {
    if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
      const bytes = new Uint32Array(1);
      crypto.getRandomValues(bytes);
      return bytes[0] % this.length;
    }
    return Math.floor(Math.random() * this.length);
  }

  private persistState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const payload = {
        length: this.length,
        encodedList: bytesToBase64(this.list),
        indexByCredentialId: Array.from(this.indexByCredentialId.entries()),
        allocatedIndexes: Array.from(this.allocatedIndexes.values()),
      };
      localStorage.setItem('status_list_state', JSON.stringify(payload));
    } catch {
      // Ignore persistence failures
    }
  }

  private restoreState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('status_list_state');
      if (!raw) return;
      const payload = JSON.parse(raw) as {
        length: number;
        encodedList: string;
        indexByCredentialId: Array<[string, number]>;
        allocatedIndexes: number[];
      };
      if (payload?.encodedList) {
        this.length = payload.length;
        this.list = base64ToBytes(payload.encodedList);
        this.indexByCredentialId = new Map(payload.indexByCredentialId || []);
        this.allocatedIndexes = new Set(payload.allocatedIndexes || []);
      }
    } catch {
      // Ignore corrupted state
    }
  }
}

export const statusListService = new StatusListService();
