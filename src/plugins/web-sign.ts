import * as sign from '@rabby-wallet/rabby-sign/umd/sign-wasm-rabby';

import { RabbyApiPlugin } from './intf';
import { SIGN_HDS } from '../const';

export const WebSignApiPlugin: RabbyApiPlugin = {
  async onInitiateAsync(options) {
    await sign.lW(options?.webHf);
  },

  async onSignRequest(ctx) {
    const { parsed, axiosRequestConfig: config } = ctx;
    const { method, url, params } = parsed;

    const res = sign.cattleGsW(params, method as any, url);

    config.headers = config.headers || {};
    config.headers[SIGN_HDS[0]] = encodeURIComponent(res.ts);
    config.headers[SIGN_HDS[1]] = encodeURIComponent(res.nonce);
    config.headers[SIGN_HDS[2]] = encodeURIComponent(res.version);
    config.headers[SIGN_HDS[3]] = encodeURIComponent(res.signature);
  },
};
