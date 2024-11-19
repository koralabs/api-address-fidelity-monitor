import axios, { AxiosInstance } from 'axios';
import { Network } from './types.js';
import { AssetUTxO } from 'provider/koios/types.js';

class KoiosProvider {
  private _apiToken: string;
  private _network: Network;
  private _axiosInstance: AxiosInstance;

  constructor(apiToken: string, network: Network) {
    this._apiToken = apiToken;
    this._network = network;
    this._axiosInstance = makeAxiosInstance(this._apiToken, this._network);
  }

  assetUTxOs = async (assetIds: string[]): Promise<AssetUTxO[]> => {
    const result = await this._axiosInstance.post<AssetUTxO[]>(
      '/asset_utxos',
      {
        _asset_list: assetIds.map((assetId) => [
          assetId.slice(0, 56),
          assetId.slice(56),
        ]),
        _extended: true,
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );
    return result.data;
  };
}

const makeAxiosInstance = (
  apiToken: string,
  network: Network
): AxiosInstance => {
  const api = axios.create({
    baseURL: apiBaseUrls[network],
  });
  api.interceptors.request.use((config) => {
    config.headers.Authorization = `Bearer ${apiToken}`;
    return config;
  });
  return api;
};

const apiBaseUrls: Record<Network, string> = {
  Mainnet: 'https://api.koios.rest/api/v1',
  Preprod: 'https://preprod.koios.rest/api/v1',
  Preview: 'https://preview.koios.rest/api/v1',
};

export { KoiosProvider };
