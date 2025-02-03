import { config } from 'dotenv';
import { Err, Ok, Result } from 'ts-res';

import { KOIOS_API_TOKEN } from './constants/index.js';
import { convertError } from './error/index.js';
import { KoiosProvider } from './koios.js';
import { Handle, ResolvedHandle } from './types.js';

config();

const HANDLE_POLICY_ID =
  'f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a';

const koios = new KoiosProvider(KOIOS_API_TOKEN, 'Mainnet');

const resolveHandle = async (
  handle: Handle
): Promise<Result<ResolvedHandle, string>> => {
  try {
    const assetUtxos = await koios.assetUTxOs([
      `${HANDLE_POLICY_ID}${handle.hex}`,
    ]);
    const { name, hex, resolvedAddress } = handle;
    const foundAssetUtxo = assetUtxos.find((utxo) =>
      utxo.asset_list?.some(
        (asset) =>
          asset.policy_id == HANDLE_POLICY_ID && asset.asset_name == hex
      )
    );
    return Ok({
      name,
      hex,
      oldResolvedAddress: resolvedAddress,
      newResolvedAddress: foundAssetUtxo?.address || '',
      blockHeight: foundAssetUtxo?.block_height || 0,
      blockTime: foundAssetUtxo?.block_time || Date.now(),
    });
  } catch (err) {
    return Err(convertError(err));
  }
};

const resolveHandles = async (
  handles: Handle[]
): Promise<Result<ResolvedHandle[], string>> => {
  try {
    const assetUtxos = await koios.assetUTxOs(
      handles.map((handle) => `${HANDLE_POLICY_ID}${handle.hex}`)
    );
    const resolvedHandles = handles.map((handle): ResolvedHandle => {
      const { name, hex, resolvedAddress } = handle;
      const foundAssetUtxo = assetUtxos.find((utxo) =>
        utxo.asset_list?.some(
          (asset) =>
            asset.policy_id == HANDLE_POLICY_ID && asset.asset_name == hex
        )
      );
      return {
        name,
        hex,
        oldResolvedAddress: resolvedAddress,
        newResolvedAddress: foundAssetUtxo?.address || '',
        blockHeight: foundAssetUtxo?.block_height || 0,
        blockTime: foundAssetUtxo?.block_time || Date.now(),
      };
    });
    return Ok(resolvedHandles);
  } catch (err) {
    return Err(convertError(err));
  }
};

export { resolveHandle, resolveHandles };
