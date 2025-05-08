import { Err, Ok, Result } from 'ts-res';

import { HANDLE_ME_API_KEY, KORA_USER_AGENT } from './constants/index.js';
import { convertError } from './error/index.js';
import { Handle } from './types.js';

interface HandleInResponse {
  name: string;
  hex: string;
  holder: string;
  resolved_addresses: { ada: string };
}

const fetchAllHandleNames = async (): Promise<Result<string[], string>> => {
  const myHeaders = new Headers();
  myHeaders.append('Content-Type', 'text/plain');
  myHeaders.append('Accept', 'text/plain');

  const requestOptions: RequestInit = {
    method: 'GET',
    headers: myHeaders,
  };

  try {
    const result = await (
      await fetch('https://api.handle.me/handles', requestOptions)
    ).text();
    const names = result.split('\n');
    return Ok(names);
  } catch (err) {
    return Err(convertError(err));
  }
};

const fetchHandle = async (
  handleName: string
): Promise<Result<Handle, string>> => {
  const requestOptions: RequestInit = {
    method: 'GET',
    headers: {
      'User-Agent': KORA_USER_AGENT,
      'api-key': HANDLE_ME_API_KEY,
    },
  };

  try {
    const result = await fetch(
      `https://api.handle.me/handles/${handleName}`,
      requestOptions
    );

    if (result.ok) {
      const data = (await result.json()) as HandleInResponse;
      return Ok({
        name: data.name,
        hex: data.hex,
        resolvedAddress: data?.resolved_addresses?.ada || '',
      });
    } else {
      return Err(result.statusText);
    }
  } catch (err) {
    return Err(convertError(err));
  }
};

const fetchHandles = async (
  page: number = 1,
  recordsPerPage: number = 100
): Promise<Result<Handle[], string>> => {
  const requestOptions: RequestInit = {
    method: 'GET',
    headers: {
      'User-Agent': KORA_USER_AGENT,
      'api-key': HANDLE_ME_API_KEY,
    },
  };

  try {
    const result = await fetch(
      `https://api.handle.me/handles?page=${Math.floor(
        page
      )}&records_per_page=${Math.floor(recordsPerPage)}`,
      requestOptions
    );
    if (result.ok) {
      const data = (await result.json()) as HandleInResponse[];
      const handles = data.map((handle) => ({
        name: handle.name,
        hex: handle.hex,
        resolvedAddress: handle?.resolved_addresses?.ada || '',
      }));
      return Ok(handles);
    } else {
      return Err(result.statusText);
    }
  } catch (err) {
    return Err(convertError(err));
  }
};

export { fetchAllHandleNames, fetchHandle, fetchHandles };
