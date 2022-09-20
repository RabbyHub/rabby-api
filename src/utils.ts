import { keyBy } from 'lodash';
import { CHAINS } from '@debank/common';

const chainsDict = keyBy(CHAINS, 'serverId');
export const getChain = (chainId?: string) => {
  if (!chainId) {
    return null;
  }
  return chainsDict[chainId];
};

export const INITIAL_OPENAPI_URL = 'https://api.rabby.io';

export { CHAINS };
