export interface Channel {
  id: string;
  name: string;
  organizations: string[];
  createdAt: string;
  isPrivate: boolean;
}

export interface ChannelTransaction {
  channelId: string;
  transactionId: string;
  timestamp: number;
  data: any;
  participants: string[];
}

class ChannelService {
  private channels: Map<string, Channel> = new Map();
  private transactions: Map<string, ChannelTransaction[]> = new Map();
  private channelCounter = 0;

  createChannel(name: string, organizations: string[], isPrivate: boolean = true): Channel {
    const channel: Channel = {
      id: `channel-${Date.now()}-${++this.channelCounter}`,
      name,
      organizations,
      createdAt: new Date().toISOString(),
      isPrivate
    };

    this.channels.set(channel.id, channel);
    this.transactions.set(channel.id, []);

    return channel;
  }

  addTransaction(channelId: string, data: any, participants: string[]): ChannelTransaction {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const transaction: ChannelTransaction = {
      channelId,
      transactionId: `tx-${Date.now()}`,
      timestamp: Date.now(),
      data,
      participants
    };

    const channelTxs = this.transactions.get(channelId) || [];
    channelTxs.push(transaction);
    this.transactions.set(channelId, channelTxs);

    return transaction;
  }

  getChannel(channelId: string): Channel | undefined {
    return this.channels.get(channelId);
  }

  getChannelTransactions(channelId: string): ChannelTransaction[] {
    return this.transactions.get(channelId) || [];
  }

  getAllChannels(): Channel[] {
    return Array.from(this.channels.values());
  }
}

export const channelService = new ChannelService();
