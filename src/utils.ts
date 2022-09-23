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

export const INITIAL_OPENAPI_URL = 'https://api.rabby.io';

export { CHAINS };

// only valid for all char is ascii
export function shorthex2ascii(input: string) {
  const hexes = input.match(/.{1,2}/g) || [];
  let back = '';
  for (let i = 0; i < hexes.length; i++) {
    back += String.fromCharCode(parseInt(hexes[i], 16));
  }

  return back;
}

export const SIGN_HDS = [
  /* 'x-api-ts' */ shorthex2ascii('782d6170692d7473'),
  /* 'x-api-nonce' */ shorthex2ascii('782d6170692d6e6f6e6365'),
  /* 'x-api-ver' */ shorthex2ascii('782d6170692d766572'),
  /* 'x-api-sign' */ shorthex2ascii('782d6170692d7369676e')
] as const;

export function genSignParams(config: AxiosRequestConfig) {
  let params = omitBy(config.params ?? {}, isNil);
  const method = (config.method ?? 'GET').toUpperCase() as any;
  let url = decodeURIComponent(config.url ?? '');
  const options = {
    timestamp: Date.now() / 1e3
  };

  if (url.search(/\?/) > 0) {
    const [_url, qs] = url.split('?');
    const query = decode(qs);
    params = {
      ...params,
      ...query
    };
    url = _url;
  }

  return {
    method,
    url,
    params,
    options
  };
}
