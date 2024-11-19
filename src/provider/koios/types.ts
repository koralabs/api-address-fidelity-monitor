interface AssetUTxO {
  tx_hash: string;
  tx_index: number;
  address: string;
  value: string;
  stake_address: string | null;
  payment_cred: string | null;
  epoch_no: number;
  block_height: number | null;
  block_time: number;
  datum_hash: string | null;
  inline_datum: { bytes: string; value: object } | null;
  reference_script: {
    hash: string;
    size: number;
    type: string;
    bytes: string;
    value: object | null;
  } | null;
  asset_list:
    | {
        policy_id: string;
        asset_name: string;
        finger_print: string;
        decimals: number;
        quantity: string;
      }[]
    | null;
  is_spent: boolean;
}

export { AssetUTxO };
