import { createHash } from 'crypto';

export interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
}

export interface MerkleProof {
  leaf: string;
  proof: { hash: string; position: 'left' | 'right' }[];
  root: string;
}

class MerkleTreeService {
  private hash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  buildTree(credentials: string[]): MerkleNode {
    if (credentials.length === 0) {
      throw new Error('Cannot build Merkle tree from empty array');
    }

    let nodes: MerkleNode[] = credentials.map(cred => ({
      hash: this.hash(cred)
    }));

    while (nodes.length > 1) {
      const nextLevel: MerkleNode[] = [];

      for (let i = 0; i < nodes.length; i += 2) {
        const left = nodes[i];
        const right = i + 1 < nodes.length ? nodes[i + 1] : left;

        const combined = left.hash + right.hash;
        const parentHash = this.hash(combined);

        nextLevel.push({
          hash: parentHash,
          left,
          right
        });
      }

      nodes = nextLevel;
    }

    return nodes[0];
  }

  generateProof(credentials: string[], targetCredential: string): MerkleProof {
    const leaves = credentials.map(c => this.hash(c));
    const targetHash = this.hash(targetCredential);
    const targetIndex = leaves.indexOf(targetHash);

    if (targetIndex === -1) {
      throw new Error('Credential not found in tree');
    }

    const proof: { hash: string; position: 'left' | 'right' }[] = [];
    let currentLevel = leaves;
    let currentIndex = targetIndex;

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;

        if (i === currentIndex || i + 1 === currentIndex) {
          const siblingIndex = i === currentIndex ? i + 1 : i;
          const sibling = currentLevel[siblingIndex] || left;
          const position = i === currentIndex ? 'right' : 'left';

          proof.push({ hash: sibling, position });
        }

        const combined = left + right;
        nextLevel.push(this.hash(combined));
      }

      currentIndex = Math.floor(currentIndex / 2);
      currentLevel = nextLevel;
    }

    return {
      leaf: targetHash,
      proof,
      root: currentLevel[0]
    };
  }

  verifyProof(proof: MerkleProof): boolean {
    let currentHash = proof.leaf;

    for (const step of proof.proof) {
      const combined = step.position === 'left'
        ? step.hash + currentHash
        : currentHash + step.hash;

      currentHash = this.hash(combined);
    }

    return currentHash === proof.root;
  }

  getMerkleRoot(credentials: string[]): string {
    const tree = this.buildTree(credentials);
    return tree.hash;
  }
}

export const merkleTreeService = new MerkleTreeService();
