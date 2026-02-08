import { MerkleTree } from 'merkletreejs';
import { createHash } from 'crypto';

export interface MerkleProofData {
  leaf: string;
  proof: string[];
  root: string;
  verified: boolean;
}

class EnhancedMerkleTreeService {
  private hash(data: string): Buffer {
    return createHash('sha256').update(data).digest();
  }

  buildTree(credentials: string[]): MerkleTree {
    if (credentials.length === 0) {
      throw new Error('Cannot build Merkle tree from empty array');
    }

    const leaves = credentials.map(c => this.hash(c));
    return new MerkleTree(leaves, (data: Buffer) => createHash('sha256').update(data).digest(), {
      sortPairs: true
    });
  }

  generateProof(credentials: string[], targetCredential: string): MerkleProofData {
    const tree = this.buildTree(credentials);
    const leaf = this.hash(targetCredential);
    const proof = tree.getProof(leaf);
    const root = tree.getRoot().toString('hex');
    const verified = tree.verify(proof, leaf, tree.getRoot());

    return {
      leaf: leaf.toString('hex'),
      proof: proof.map(p => p.data.toString('hex')),
      root,
      verified
    };
  }

  verifyProof(leaf: string, proof: string[], root: string): boolean {
    const leafBuffer = Buffer.from(leaf, 'hex');
    const rootBuffer = Buffer.from(root, 'hex');
    const proofBuffers = proof.map(p => ({
      data: Buffer.from(p, 'hex'),
      position: 'left' as const
    }));

    const tree = new MerkleTree([], (data: Buffer) => createHash('sha256').update(data).digest());
    return tree.verify(proofBuffers, leafBuffer, rootBuffer);
  }

  getMerkleRoot(credentials: string[]): string {
    const tree = this.buildTree(credentials);
    return tree.getRoot().toString('hex');
  }

  getTreeDepth(credentials: string[]): number {
    const tree = this.buildTree(credentials);
    return tree.getDepth();
  }

  getLeafCount(credentials: string[]): number {
    const tree = this.buildTree(credentials);
    return tree.getLeafCount();
  }
}

export const enhancedMerkleTreeService = new EnhancedMerkleTreeService();
