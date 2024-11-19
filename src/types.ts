type Network = 'Mainnet' | 'Preprod' | 'Preview';

interface SlotConfig {
  zeroTime: number;
  zeroSlot: number;
  slotLength: number;
}

interface Handle {
  name: string;
  hex: string;
  resolvedAddress: string;
}

interface ResolvedHandle {
  name: string;
  hex: string;
  oldResolvedAddress: string;
  newResolvedAddress: string;
  blockHeight: number;
  blockTime: number;
}

export type { Handle, Network, ResolvedHandle, SlotConfig };
