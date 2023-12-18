import type { AxiosRequestConfig } from 'axios';

export type InitOptions = {
  webHf?: string;
};

export interface RabbyApiPlugin {
  onInitiateAsync?: (options?: InitOptions) => Promise<void>;
  onInitiate?: (options?: InitOptions) => Promise<void>;

  onSignRequest: (ctx: {
    axiosRequestConfig: AxiosRequestConfig<any>;
    parsed: {
      params: any;
      method: string;
      url: string;
    };
  }) => Promise<void>;
}
