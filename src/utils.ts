import { isNil, keyBy, omitBy } from 'lodash';
import { CHAINS } from '@debank/common';
import { AxiosRequestConfig } from 'axios';
import { decode } from 'qss';

const chainsDict = keyBy(CHAINS, 'serverId');
export const getChain = (chainId?: string) => {
  if (!chainId) {
    return null;
  }
  return chainsDict[chainId];
};

const chainNetworkDict = keyBy(CHAINS, 'network');

export const getChainByNetwork = (network?: string | number) => {
  if (!network) {
    return null;
  }
  network = network.toString();

  return chainNetworkDict[network.startsWith('0x') ? +network : network];
};

export const INITIAL_OPENAPI_URL =
  'https://gas-account.rabby-api.debank.dbkops.com/';

export const INITIAL_TESTNET_OPENAPI_URL = 'https://api.testnet.rabby.io/';

export { CHAINS };

export function genSignParams(config: AxiosRequestConfig) {
  let params = omitBy(config.params ?? {}, isNil);
  const method = (config.method ?? 'GET').toUpperCase() as any;
  let url = decodeURIComponent(config.url ?? '');

  if (url.search(/\?/) > 0) {
    const [_url, qs] = url.split('?');
    const query = decode(qs);
    params = {
      ...params,
      ...query,
    };
    url = _url;
  }

  return {
    method,
    url,
    params,
  };
}

export function sleep(ms = 0, signal?: AbortController['signal']) {
  if (signal?.aborted || ms < 0) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  return new Promise<void>((resolve, reject) => {
    const abortHandler = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
      signal?.removeEventListener('abort', abortHandler);
    };

    signal?.addEventListener('abort', abortHandler);

    const timer = setTimeout(() => {
      resolve();

      signal?.removeEventListener('abort', abortHandler);
    }, ms);
  });
}
