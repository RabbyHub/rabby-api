import type { AxiosRequestConfig } from 'axios';

export interface RabbyApiPlugin {
  onInitiate: (options?: { webHr?: string }) => Promise<void>;

  onSignRequest: (ctx: {
    axiosRequestConfig: AxiosRequestConfig<any>;
    parsed: {
      params: any;
      method: string;
      url: string;
    };
  }) => Promise<void>;
}
