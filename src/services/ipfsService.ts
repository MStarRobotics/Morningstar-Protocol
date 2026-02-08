/**
 * IPFS (InterPlanetary File System) Integration Service
 * Implements decentralized document storage as per ZKBAR-V specifications.
 *
 * Supports:
 * - In-memory simulator (safe for demos/tests)
 * - Proxy-backed upload endpoint (recommended for production)
 * - Pinata-compatible API (client-side only for demo; use backend in production)
 */

import { sha256, generateCID } from './cryptography';
import { env } from './env';
import { logger } from './logger';

export interface IPFSFile {
  cid: string;           // Content Identifier
  name: string;
  size: number;
  type: string;
  hash: string;          // SHA-256 hash for verification
  uploadedAt: string;
  pinnedNodes: string[]; // Nodes pinning this content
  encrypted: boolean;
}

export interface IPFSMetadata {
  cid: string;
  originalFileName: string;
  fileType: string;
  credentialId: string;
  uploaderDID: string;
  accessControl: 'public' | 'private' | 'restricted';
  encryptionMethod?: string;
}

export type IPFSWriteMode = 'none' | 'proxy' | 'pinata' | 'public';

class IPFSSimulator {
  private storage: Map<string, Blob> = new Map();
  private metadata: Map<string, IPFSMetadata> = new Map();
  private pinningNodes: Set<string> = new Set(['node-eu-1', 'node-us-1', 'node-asia-1']);

  /**
   * Upload file to IPFS
   */
  async uploadFile(
    file: File | Blob,
    metadata: Omit<IPFSMetadata, 'cid'>
  ): Promise<IPFSFile> {
    try {
      // Read file content
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const content = Array.from(uint8Array).map(b => String.fromCharCode(b)).join('');

      // Generate CID (Content Identifier)
      const hash = await sha256(content);
      const cid = await generateCID(content);

      // Store file
      this.storage.set(cid, file);

      // Store metadata
      const fullMetadata: IPFSMetadata = {
        ...metadata,
        cid
      };
      this.metadata.set(cid, fullMetadata);

      const ipfsFile: IPFSFile = {
        cid,
        name: metadata.originalFileName,
        size: file.size,
        type: file.type || 'application/octet-stream',
        hash,
        uploadedAt: new Date().toISOString(),
        pinnedNodes: Array.from(this.pinningNodes),
        encrypted: metadata.accessControl === 'private'
      };

      // Simulate network delay
      await this.simulateDelay(200);

      return ipfsFile;
    } catch (error) {
      logger.error('IPFS upload error:', error);
      throw new Error('Failed to upload to IPFS');
    }
  }

  /**
   * Upload JSON data to IPFS
   */
  async uploadJSON(
    data: unknown,
    metadata: Omit<IPFSMetadata, 'cid'>
  ): Promise<IPFSFile> {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const file = new File([blob], metadata.originalFileName, { type: 'application/json' });
    
    return this.uploadFile(file, metadata);
  }

  /**
   * Retrieve file from IPFS by CID
   */
  async getFile(cid: string): Promise<Blob | null> {
    await this.simulateDelay(150);
    
    const file = this.storage.get(cid);
    return file || null;
  }

  /**
   * Get file metadata
   */
  getMetadata(cid: string): IPFSMetadata | null {
    return this.metadata.get(cid) || null;
  }

  /**
   * Verify file integrity using hash
   */
  async verifyFile(cid: string, expectedHash: string): Promise<boolean> {
    const file = await this.getFile(cid);
    if (!file) return false;

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const content = Array.from(uint8Array).map(b => String.fromCharCode(b)).join('');
    
    const actualHash = await sha256(content);
    return actualHash === expectedHash;
  }

  /**
   * Get file as Data URL for display
   */
  async getFileAsDataURL(cid: string): Promise<string | null> {
    const file = await this.getFile(cid);
    if (!file) return null;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Get file as text
   */
  async getFileAsText(cid: string): Promise<string | null> {
    const file = await this.getFile(cid);
    if (!file) return null;

    return await file.text();
  }

  /**
   * Get file as JSON
   */
  async getFileAsJSON(cid: string): Promise<unknown> {
    const text = await this.getFileAsText(cid);
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (error) {
      logger.error('JSON parse error:', error);
      return null;
    }
  }

  /**
   * Pin file (ensure it's kept available)
   */
  async pinFile(cid: string, nodeName?: string): Promise<boolean> {
    if (!this.storage.has(cid)) return false;

    if (nodeName) {
      this.pinningNodes.add(nodeName);
    }

    await this.simulateDelay(100);
    return true;
  }

  /**
   * Unpin file
   */
  async unpinFile(cid: string, nodeName: string): Promise<boolean> {
    this.pinningNodes.delete(nodeName);
    await this.simulateDelay(100);
    return true;
  }

  /**
   * Delete file from IPFS (simulated - in real IPFS, content is permanent)
   */
  deleteFile(cid: string): boolean {
    const deleted = this.storage.delete(cid);
    this.metadata.delete(cid);
    return deleted;
  }

  /**
   * Get storage statistics
   */
  getStats() {
    let totalSize = 0;
    this.storage.forEach(file => {
      totalSize += file.size;
    });

    return {
      totalFiles: this.storage.size,
      totalSize,
      totalSizeFormatted: this.formatBytes(totalSize),
      pinningNodes: Array.from(this.pinningNodes),
      distributedCopies: this.pinningNodes.size
    };
  }

  /**
   * Search files by metadata
   */
  searchFiles(query: Partial<IPFSMetadata>): IPFSMetadata[] {
    const results: IPFSMetadata[] = [];
    
    this.metadata.forEach((meta) => {
      let matches = true;
      
      for (const key in query) {
        if (meta[key as keyof IPFSMetadata] !== query[key as keyof IPFSMetadata]) {
          matches = false;
          break;
        }
      }
      
      if (matches) {
        results.push(meta);
      }
    });
    
    return results;
  }

  /**
   * Get all files for a specific credential
   */
  getCredentialFiles(credentialId: string): IPFSMetadata[] {
    return this.searchFiles({ credentialId });
  }

  /**
   * Get all files uploaded by a specific DID
   */
  getFilesByUploader(uploaderDID: string): IPFSMetadata[] {
    return this.searchFiles({ uploaderDID });
  }

  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Simulate network delay
   */
  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Export storage for backup
   */
  exportStorage(): string {
    const data = {
      files: Array.from(this.storage.keys()),
      metadata: Array.from(this.metadata.entries()),
      timestamp: new Date().toISOString()
    };
    
    return JSON.stringify(data, null, 2);
  }

  /**
   * Get replication status
   */
  getReplicationStatus(cid: string): {
    cid: string;
    replicated: boolean;
    nodeCount: number;
    nodes: string[];
  } {
    const exists = this.storage.has(cid);
    
    return {
      cid,
      replicated: exists,
      nodeCount: exists ? this.pinningNodes.size : 0,
      nodes: exists ? Array.from(this.pinningNodes) : []
    };
  }
}

class IPFSClient {
  private simulator = new IPFSSimulator();
  private metadataCache: Map<string, IPFSMetadata> = new Map();

  constructor() {
    this.restoreMetadataCache();
  }

  async uploadJSON(
    data: unknown,
    metadata: Omit<IPFSMetadata, 'cid'>
  ): Promise<IPFSFile> {
    const mode = (env.ipfsWriteMode || 'none') as IPFSWriteMode;

    if (mode === 'proxy' && env.ipfsProxyUrl) {
      return this.uploadViaProxy(data, metadata);
    }

    if (mode === 'pinata' && env.ipfsApiUrl) {
      return this.uploadViaPinata(data, metadata);
    }

    // Default to simulator for safety
    return this.simulator.uploadJSON(data, metadata);
  }

  async uploadFile(
    file: File | Blob,
    metadata: Omit<IPFSMetadata, 'cid'>
  ): Promise<IPFSFile> {
    // File uploads should be handled by a backend in production.
    // We keep simulator support for local demos.
    return this.simulator.uploadFile(file, metadata);
  }

  async getJSON(cid: string): Promise<unknown> {
    const url = this.getGatewayUrl(cid);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      logger.warn('[IPFS] Gateway fetch failed, using simulator:', error);
      return this.simulator.getFileAsJSON(cid);
    }
  }

  getGatewayUrl(cid: string): string {
    const gateway = env.ipfsGateway || 'https://ipfs.io/ipfs/';
    return `${gateway.replace(/\/$/, '')}/${cid}`;
  }

  getMetadata(cid: string): IPFSMetadata | null {
    return this.metadataCache.get(cid) || this.simulator.getMetadata(cid);
  }

  async pinCid(cid: string): Promise<boolean> {
    const mode = (env.ipfsWriteMode || 'none') as IPFSWriteMode;
    if (mode === 'proxy' && env.ipfsProxyUrl) {
      try {
        const response = await fetch(`${env.ipfsProxyUrl.replace(/\/$/, '')}/pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cid }),
        });
        return response.ok;
      } catch (error) {
        logger.warn('[IPFS] Proxy pin failed:', error);
      }
    }

    return this.simulator.pinFile(cid);
  }

  private async uploadViaProxy(
    data: unknown,
    metadata: Omit<IPFSMetadata, 'cid'>
  ): Promise<IPFSFile> {
    const response = await fetch(env.ipfsProxyUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, metadata }),
    });

    if (!response.ok) {
      throw new Error(`IPFS proxy upload failed: ${response.status}`);
    }

    const payload = await response.json();
    const cid = payload.cid as string;
    if (!cid) {
      throw new Error('IPFS proxy did not return a CID');
    }

    const file: IPFSFile = {
      cid,
      name: metadata.originalFileName,
      size: payload.size ?? JSON.stringify(data).length,
      type: metadata.fileType || 'application/json',
      hash: payload.hash ?? (await sha256(JSON.stringify(data))),
      uploadedAt: new Date().toISOString(),
      pinnedNodes: payload.pinnedNodes ?? [],
      encrypted: metadata.accessControl === 'private',
    };

    this.cacheMetadata({ ...metadata, cid });
    return file;
  }

  private async uploadViaPinata(
    data: unknown,
    metadata: Omit<IPFSMetadata, 'cid'>
  ): Promise<IPFSFile> {
    if (!env.ipfsPinningJwt && !env.ipfsApiKey) {
      logger.warn('[IPFS] Pinata credentials missing, falling back to simulator');
      return this.simulator.uploadJSON(data, metadata);
    }

    const body = new FormData();
    const jsonString = JSON.stringify(data, null, 2);
    body.append('file', new Blob([jsonString], { type: 'application/json' }), metadata.originalFileName);
    body.append('pinataMetadata', JSON.stringify({ name: metadata.originalFileName }));
    body.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const headers: Record<string, string> = {};
    if (env.ipfsPinningJwt) {
      headers.Authorization = `Bearer ${env.ipfsPinningJwt}`;
    } else if (env.ipfsApiKey) {
      headers['x-api-key'] = env.ipfsApiKey;
    }

    const response = await fetch(env.ipfsApiUrl!, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(`Pinata upload failed: ${response.status}`);
    }

    const payload = await response.json();
    const cid = payload.IpfsHash || payload.cid;
    if (!cid) {
      throw new Error('Pinata response missing CID');
    }

    const file: IPFSFile = {
      cid,
      name: metadata.originalFileName,
      size: payload.PinSize ?? jsonString.length,
      type: metadata.fileType || 'application/json',
      hash: payload.hash ?? (await sha256(jsonString)),
      uploadedAt: new Date().toISOString(),
      pinnedNodes: ['pinata'],
      encrypted: metadata.accessControl === 'private',
    };

    this.cacheMetadata({ ...metadata, cid });
    return file;
  }

  private cacheMetadata(metadata: IPFSMetadata): void {
    this.metadataCache.set(metadata.cid, metadata);
    this.persistMetadataCache();
  }

  private persistMetadataCache(): void {
    if (typeof localStorage === 'undefined') return;
    const entries = Array.from(this.metadataCache.values());
    localStorage.setItem('ipfs_metadata_cache', JSON.stringify(entries));
  }

  private restoreMetadataCache(): void {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem('ipfs_metadata_cache');
    if (!raw) return;
    try {
      const entries = JSON.parse(raw) as IPFSMetadata[];
      entries.forEach(entry => this.metadataCache.set(entry.cid, entry));
    } catch {
      // Ignore corrupted cache
    }
  }
}

export const ipfsClient = new IPFSClient();

// Singleton instance
export const ipfsService = new IPFSSimulator();
export const ipfsServiceClient = ipfsClient;

/**
 * Upload credential document to IPFS
 */
export async function uploadCredentialDocument(
  file: File,
  credentialId: string,
  uploaderDID: string,
  isPrivate: boolean = true
): Promise<IPFSFile> {
  return await ipfsServiceClient.uploadFile(file, {
    originalFileName: file.name,
    fileType: file.type,
    credentialId,
    uploaderDID,
    accessControl: isPrivate ? 'private' : 'public'
  });
}

/**
 * Upload credential metadata to IPFS
 */
export async function uploadCredentialMetadata(
  credential: Record<string, unknown> & { id: string },
  uploaderDID: string
): Promise<IPFSFile> {
  return await ipfsServiceClient.uploadJSON(credential, {
    originalFileName: `credential_${credential.id}.json`,
    fileType: 'application/json',
    credentialId: credential.id,
    uploaderDID,
    accessControl: 'private',
    encryptionMethod: 'AES-256-GCM'
  });
}

/**
 * Retrieve and verify credential from IPFS
 */
export async function retrieveAndVerifyCredential(
  cid: string,
  expectedHash: string
): Promise<{ valid: boolean; data?: unknown; error?: string }> {
  try {
    const data = await ipfsServiceClient.getJSON(cid);
    if (!data) {
      return { valid: false, error: 'Failed to retrieve data' };
    }
    const computedHash = await sha256(JSON.stringify(data));
    const isValid = computedHash === expectedHash;
    
    if (!isValid) {
      return { valid: false, error: 'Hash verification failed' };
    }
    
    return { valid: true, data };
  } catch (error) {
    return { valid: false, error: 'Retrieval error' };
  }
}
