import { Credential, AuditLog, Institution } from '../types';
import { isMockMode, detectWallets, connectWallet, signMessage } from './walletService';
import { logger } from './logger';

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockConnectWallet = async (): Promise<string> => {
  // Delegate to real wallet if available
  if (!isMockMode()) {
    try {
      const wallets = detectWallets();
      if (wallets.length > 0) {
        return await connectWallet(wallets[0].provider);
      }
    } catch (err) {
      logger.warn('[mockBlockchain] Real wallet connect failed, falling back to mock', err);
    }
  }
  await wait(800);
  return "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
};

export const mockSignTransaction = async (address?: string): Promise<string> => {
  // Delegate to real wallet if available
  if (!isMockMode() && address) {
    try {
      const wallets = detectWallets();
      if (wallets.length > 0) {
        const message = `Sign transaction at ${new Date().toISOString()}`;
        return await signMessage(wallets[0].provider, message, address);
      }
    } catch (err) {
      logger.warn('[mockBlockchain] Real signing failed, falling back to mock', err);
    }
  }
  await wait(1500);
  return "0x" + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
};

export const fetchCredentials = async (): Promise<Credential[]> => {
  await wait(800);
  return [
    {
      id: "vc-1001",
      type: "Bachelor of Science",
      issuer: "Polygon University",
      issuanceDate: "2023-05-20",
      recipient: "did:polygon:student1",
      status: 'active',
      data: {
        major: "Computer Science",
        gpa: "3.8",
        honors: "Magna Cum Laude"
      },
      hiddenData: {
        studentId: "899-21-44",
        classRank: "14/450",
        transcriptHash: "0x882...99a"
      }
    },
    {
      id: "vc-1002",
      type: "Data Science Certificate",
      issuer: "Tech Academy",
      issuanceDate: "2024-01-15",
      recipient: "did:polygon:student1",
      status: 'active',
      data: {
        skills: "Python, SQL, Machine Learning",
        hours: "40"
      },
      hiddenData: {
        examScore: "98/100",
        instructorNote: "Exceptional performance in Neural Networks capstone."
      }
    }
  ];
};

export const fetchAuditLogs = async (): Promise<AuditLog[]> => {
  await wait(500);
  return [
    { id: "log-1", timestamp: "2024-05-10 10:23:00", action: "IssuerStateAnchored", actor: "0xAdmin...1", hash: "0x123...abc", status: "confirmed" },
    { id: "log-2", timestamp: "2024-05-11 14:05:00", action: "CredentialIssued", actor: "0xUni...2", hash: "0x456...def", status: "confirmed" },
    { id: "log-3", timestamp: "2024-05-12 09:12:00", action: "CredentialRevoked", actor: "0xUni...2", hash: "0x789...ghi", status: "confirmed" },
    { id: "log-4", timestamp: "2024-05-12 11:30:00", action: "RoleGranted", actor: "0xAdmin...1", hash: "0x999...zzz", status: "confirmed" },
  ];
};

export const fetchInstitutions = async (): Promise<Institution[]> => {
  await wait(600);
  return [
    { address: "0xUni...2", name: "Polygon University", role: "ISSUER_ROLE", kycStatus: "verified", addedDate: "2023-01-15" },
    { address: "0xAca...5", name: "Tech Academy", role: "ISSUER_ROLE", kycStatus: "verified", addedDate: "2023-03-10" },
    { address: "0xNew...8", name: "New Age Institute", role: "NONE", kycStatus: "pending", addedDate: "2024-05-20" },
  ];
};

export const getNetworkStats = async () => {
  await wait(300);
  return {
    verifiedCredentials: "1,248,932",
    issuers: "450+",
    transactions: "8.2M"
  };
};

export const fetchDashboardStats = async () => {
  await wait(700);
  return {
    totalIssued: 1248,
    pendingVerifications: 24,
    activeSchemas: 8,
    chartData: [
      { name: 'Mon', issued: 4, pending: 2 },
      { name: 'Tue', issued: 7, pending: 1 },
      { name: 'Wed', issued: 5, pending: 3 },
      { name: 'Thu', issued: 12, pending: 5 },
      { name: 'Fri', issued: 9, pending: 2 },
      { name: 'Sat', issued: 3, pending: 4 },
      { name: 'Sun', issued: 1, pending: 0 },
    ]
  };
};