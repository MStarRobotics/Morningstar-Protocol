import bcrypt from 'bcryptjs';

export interface HashedPassword {
  hash: string;
  salt: string;
  rounds: number;
}

class PasswordService {
  private readonly defaultRounds = 12;

  async hashPassword(password: string, rounds: number = this.defaultRounds): Promise<string> {
    return await bcrypt.hash(password, rounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  async generateSalt(rounds: number = this.defaultRounds): Promise<string> {
    return await bcrypt.genSalt(rounds);
  }

  getRounds(hash: string): number {
    return bcrypt.getRounds(hash);
  }

  isValidHash(hash: string): boolean {
    // Bcrypt hashes start with $2a$, $2b$, or $2y$
    if (!hash || typeof hash !== 'string') return false;
    if (!hash.match(/^\$2[aby]\$/)) return false;
    
    try {
      bcrypt.getRounds(hash);
      return true;
    } catch {
      return false;
    }
  }
}

export const passwordService = new PasswordService();
