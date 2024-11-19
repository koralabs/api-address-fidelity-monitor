import { Network, SlotConfig } from 'types.js';

const SLOT_CONFIG_NETWORK: Record<Network, SlotConfig> = {
  Mainnet: { zeroTime: 1596059091000, zeroSlot: 4492800, slotLength: 1000 }, // Starting at Shelley era
  Preview: { zeroTime: 1666656000000, zeroSlot: 0, slotLength: 1000 }, // Starting at Shelley era
  Preprod: {
    zeroTime: 1654041600000 + 1728000000,
    zeroSlot: 86400,
    slotLength: 1000,
  }, // Starting at Shelley era
};

const slotToUnixTime = (network: Network, slot: number): number => {
  const config = SLOT_CONFIG_NETWORK[network];
  const msAfterBegin = (slot - config.zeroSlot) * config.slotLength;
  return config.zeroTime + msAfterBegin;
};

export { slotToUnixTime };
