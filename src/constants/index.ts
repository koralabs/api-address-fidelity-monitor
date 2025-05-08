import { config as envConfig } from 'dotenv';
envConfig();

export const {
  KORA_USER_AGENT = '',
  HANDLE_ME_API_KEY = '',
  KOIOS_API_TOKEN = '',
} = process.env;
