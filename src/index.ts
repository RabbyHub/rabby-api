import axios, { AxiosAdapter } from 'axios';
import rateLimit, { RateLimitedAxiosInstance } from 'axios-rate-limit';
import { ethErrors } from 'eth-rpc-errors';
import {
  getChain,
  INITIAL_OPENAPI_URL,
  CHAINS,
  SIGN_HDS,
  genSignParams,
} from './utils';
import * as sign from '@debank/isomorphic/es/sign-wasm-rabby';
import {
  RPCResponse,
  ServerChain,
  TotalBalanceResponse,
  ChainWithPendingCount,
  SecurityCheckResponse,
  Tx,
  ExplainTxResponse,
  GasLevel,
  GetTxResponse,
  TokenItem,
  AssetItem,
  NFTItem,
  Collection,
  TxHistoryResult,
  TokenApproval,
  NFTApprovalResponse,
  ApprovalStatus,
  UsedChain,
} from './types';

interface OpenApiStore {
  host: string;
}

interface Options {
  store: OpenApiStore;
  adapter?: AxiosAdapter;
}

const maxRPS = 100;

export class OpenApiService {
  store!: OpenApiStore;

  request!: RateLimitedAxiosInstance;

  setHost = async (host: string) => {
    this.store.host = host;
    await this.init();
  };

  getHost = () => {
    return this.store.host;
  };

  ethRpc:
    | ((
        chainId: string,
        arg: { method: string; params: Array<any>; origin?: string }
      ) => Promise<any>)
    | (() => Promise<never>) = async () => {
    throw ethErrors.provider.disconnected();
  };
  adapter?: AxiosAdapter;

  constructor({ store, adapter }: Options) {
    this.store = store;
    this.adapter = adapter;
  }

  init = async () => {
    await sign.lW();

    if (!process.env.DEBUG) {
      this.store.host = INITIAL_OPENAPI_URL;
    }

    const request = axios.create({
      baseURL: this.store.host,
      adapter: this.adapter,
      headers: {
        'X-Client': 'Rabby',
        'X-Version': process.env.release ?? '0.0.0',
      },
    });

    // rateLimit 之后再签名，此时 timestamp 才是最新的
    request.interceptors.request.use((config) => {
      const { method, url, params } = genSignParams(config);

      const res = sign.cattleGsW(params, method, url);

      config.headers = config.headers || {};
      config.headers[SIGN_HDS[0]] = res.ts;
      config.headers[SIGN_HDS[1]] = res.nonce;
      config.headers[SIGN_HDS[2]] = res.version;
      config.headers[SIGN_HDS[3]] = res.signature;

      return config;
    });
    this.request = rateLimit(request, { maxRPS });

    this.request.interceptors.response.use((response) => {
      const code = response.data?.err_code || response.data?.error_code;
      const msg = response.data?.err_msg || response.data?.error_msg;

      if (code && code !== 200) {
        if (msg) {
          let err;
          try {
            err = new Error(JSON.parse(msg));
          } catch (e) {
            err = new Error(msg);
          }
          throw err;
        }
        throw new Error(response.data);
      }
      return response;
    });
    this._mountMethods();
  };

  private _mountMethods = () => {
    this.ethRpc = (chain_id, { origin = 'rabby', method, params }) => {
      return this.request
        .post(`/v1/wallet/eth_rpc?origin=${origin}&method=${method}`, {
          chain_id,
          method,
          params,
        })
        .then(({ data }: { data: RPCResponse<any> }) => {
          if (data?.error) {
            throw data.error;
          }

          return data?.result;
        });
    };
  };

  getRecommendChains = async (
    address: string,
    origin: string
  ): Promise<ServerChain[]> => {
    const { data } = await this.request.get('/v1/wallet/recommend_chains', {
      params: {
        user_addr: address,
        origin,
      },
    });
    return data;
  };

  getTotalBalance = async (address: string): Promise<TotalBalanceResponse> => {
    const { data } = await this.request.get('/v1/user/total_balance', {
      params: {
        id: address,
      },
    });
    return {
      ...data,
      chain_list: data.chain_list.filter(
        (item: { id: string }) =>
          !!Object.values(CHAINS).find((chain) => chain.serverId === item.id)
      ),
    };
  };

  getPendingCount = async (
    address: string
  ): Promise<{ total_count: number; chains: ChainWithPendingCount[] }> => {
    const { data } = await this.request.get('/v1/wallet/pending_tx_count', {
      params: {
        user_addr: address,
      },
    });
    return data;
  };

  checkOrigin = async (
    address: string,
    origin: string
  ): Promise<SecurityCheckResponse> => {
    const { data } = await this.request.get('/v1/wallet/check_origin', {
      params: {
        user_addr: address,
        origin,
      },
    });

    return data;
  };

  checkText = async (
    address: string,
    origin: string,
    text: string
  ): Promise<SecurityCheckResponse> => {
    const { data } = await this.request.post('/v1/wallet/check_text', {
      user_addr: address,
      origin,
      text,
    });
    return data;
  };

  checkTx = async (
    tx: Tx,
    origin: string,
    address: string,
    update_nonce = false
  ): Promise<SecurityCheckResponse> => {
    const { data } = await this.request.post('/v1/wallet/check_tx', {
      user_addr: address,
      origin,
      tx,
      update_nonce,
    });

    return data;
  };

  preExecTx = async ({
    tx,
    origin,
    address,
    updateNonce = false,
    pending_tx_list = [],
  }: {
    tx: Tx;
    origin: string;
    address: string;
    updateNonce: boolean;
    pending_tx_list: Tx[];
  }): Promise<ExplainTxResponse> => {
    const { data } = await this.request.post('/v1/wallet/pre_exec_tx', {
      tx,
      user_addr: address,
      origin,
      update_nonce: updateNonce,
      pending_tx_list,
    });

    return data;
  };

  historyGasUsed = async (params: {
    tx: Tx;
    user_addr: string;
  }): Promise<{
    gas_used: number;
  }> => {
    const { data } = await this.request.post('/v1/wallet/history_tx_used_gas', {
      ...params,
    });

    return data;
  };

  pendingTxList = async (
    tx: Tx,
    origin: string,
    address: string,
    update_nonce = false
  ): Promise<Tx[]> => {
    const { data } = await this.request.post('/v1/wallet/pending_tx_list', {
      tx,
      user_addr: address,
      origin,
      update_nonce,
    });

    return data;
  };

  pushTx = async (tx: Tx, traceId?: string) => {
    const { data } = await this.request.post('/v1/wallet/push_tx', {
      tx,
      traceId,
    });

    return data;
  };

  explainText = async (
    origin: string,
    address: string,
    text: string
  ): Promise<{ comment: string }> => {
    const { data } = await this.request.post('/v1/wallet/explain_text', {
      user_addr: address,
      origin,
      text,
    });

    return data;
  };

  gasMarket = async (
    chainId: string,
    customGas?: number
  ): Promise<GasLevel[]> => {
    const { data } = await this.request.get('/v1/wallet/gas_market', {
      params: {
        chain_id: chainId,
        custom_price: customGas,
      },
    });

    return data;
  };

  getTx = async (
    chainId: string,
    hash: string,
    gasPrice: number
  ): Promise<GetTxResponse> => {
    const { data } = await this.request.get('/v1/wallet/get_tx', {
      params: {
        chain_id: chainId,
        gas_price: gasPrice,
        tx_id: hash,
      },
    });

    return data;
  };

  getEnsAddressByName = async (
    name: string
  ): Promise<{ addr: string; name: string }> => {
    const { data } = await this.request.get('/v1/wallet/ens', {
      params: {
        text: name,
      },
    });

    return data;
  };

  searchToken = async (id: string, q: string): Promise<TokenItem[]> => {
    const { data } = await this.request.get('/v1/user/token_search', {
      params: {
        id,
        q,
        has_balance: false,
      },
    });

    return data?.filter((token: { chain: string | undefined }) =>
      getChain(token.chain)
    );
  };

  searchSwapToken = async (
    id: string,
    chainId: string,
    q: string,
    is_all = false
  ) => {
    const { data } = await this.request.get('/v1/user/token_search', {
      params: {
        id,
        chain_id: chainId,
        q,
        is_all,
      },
    });
    return data;
  };

  getToken = async (
    id: string,
    chainId: string,
    tokenId: string
  ): Promise<TokenItem> => {
    const { data } = await this.request.get('/v1/user/token', {
      params: {
        id,
        chain_id: chainId,
        token_id: tokenId,
      },
    });

    return data;
  };

  listToken = async (id: string, chainId?: string): Promise<TokenItem[]> => {
    const { data } = await this.request.get('/v1/user/token_list', {
      params: {
        id,
        is_all: false,
        chain_id: chainId,
      },
    });

    return data?.filter((token: { chain: string | undefined }) =>
      getChain(token.chain)
    );
  };

  customListToken = async (
    uuids: string[],
    id: string
  ): Promise<TokenItem[]> => {
    const { data } = await this.request.post('/v1/user/specific_token_list', {
      id,
      uuids,
    });

    return data?.filter((token: { chain: string | undefined }) =>
      getChain(token.chain)
    );
  };

  listChainAssets = async (id: string): Promise<AssetItem[]> => {
    const { data } = await this.request.get('/v1/user/simple_protocol_list', {
      params: {
        id,
      },
    });
    return data;
  };

  listNFT = async (id: string, isAll = true): Promise<NFTItem[]> => {
    const { data } = await this.request.get('/v1/user/nft_list', {
      params: {
        id,
        is_all: isAll,
      },
    });
    return data?.filter((nft: { chain: string | undefined }) =>
      getChain(nft.chain)
    );
  };

  listCollection = async (params: {
    collection_ids: string;
  }): Promise<Collection[]> => {
    const { data } = await this.request.get('/v1/nft/collections', {
      params,
    });
    return data;
  };

  listTxHisotry = async (params: {
    id?: string;
    chain_id?: string;
    token_id?: string;
    coin_id?: string;
    start_time?: number;
    page_count?: number;
  }): Promise<TxHistoryResult> => {
    const { data } = await this.request.get('/v1/user/history_list', {
      params,
    });
    return data;
  };

  tokenPrice = async (
    tokenName: string
  ): Promise<{
    change_percent: number;
    last_price: number;
  }> => {
    const { data } = await this.request.get('/v1/token/price_change', {
      params: {
        token: tokenName,
      },
    });

    return data;
  };

  tokenAuthorizedList = async (
    id: string,
    chain_id: string
  ): Promise<TokenApproval[]> => {
    const { data } = await this.request.get('/v1/user/token_authorized_list', {
      params: {
        id,
        chain_id,
      },
    });

    return data;
  };

  userNFTAuthorizedList = async (
    id: string,
    chain_id: string
  ): Promise<NFTApprovalResponse> => {
    const { data } = await this.request.get('/v1/user/nft_authorized_list', {
      params: {
        id,
        chain_id,
      },
    });

    return data;
  };

  getDEXList = async (chain_id: string) => {
    const { data } = await this.request.get<
      {
        id: string;
        name: string;
        logo_url: string;
        site_url: string;
        type: string;
      }[]
    >('/v1/wallet/swap_dex_list', {
      params: {
        chain_id,
      },
    });
    return data;
  };

  getSwapQuote = async (params: {
    id: string;
    chain_id: string;
    dex_id: string;
    pay_token_id: string;
    pay_token_raw_amount: string;
    receive_token_id: string;
  }) => {
    const { data } = await this.request.get<{
      receive_token_raw_amount: number;
      dex_approve_to: string;
      dex_swap_to: string;
      dex_swap_calldata: string;
      is_wrapped: boolean;
      gas: {
        gas_used: number;
        gas_price: number;
        gas_cost_value: number;
        gas_cost_usd_value: number;
      };
      pay_token: TokenItem;
      receive_token: TokenItem;
    }>('/v1/wallet/swap_quote', {
      params,
    });
    return data;
  };

  getSwapTokenList = async (id: string, chainId?: string) => {
    const { data } = await this.request.get<TokenItem[]>(
      '/v1/wallet/swap_token_list',
      {
        params: {
          id,
          chain_id: chainId,
          is_all: false,
        },
      }
    );
    return data;
  };

  postGasStationOrder = async (params: {
    userAddr: string;
    fromChainId: string;
    fromTxId: string;
    toChainId: string;
    toTokenAmount: string;
    fromTokenId: string;
    fromTokenAmount: string;
    fromUsdValue: number;
  }) => {
    const { data } = await this.request.post('/v1/wallet/gas_station_order', {
      order: {
        user_addr: params.userAddr,
        from_chain_id: params.fromChainId,
        from_tx_id: params.fromTxId,
        from_token_id: params.fromTokenId,
        from_token_amount: params.fromTokenAmount,
        to_chain_id: params.toChainId,
        to_token_amount: params.toTokenAmount,
        from_usd_value: params.fromUsdValue,
      },
    });
    return data;
  };

  getGasStationChainBalance = async (chain_id: string) => {
    const { data } = await this.request.get<{ usd_value: number }>(
      '/v1/wallet/gas_station_usd_value',
      {
        params: {
          chain_id,
        },
      }
    );
    return data;
  };

  getGasStationTokenList = async () => {
    const { data } = await this.request.get<TokenItem[]>(
      '/v1/wallet/gas_station_token_list'
    );
    return data;
  };

  explainTypedData = async (
    user_addr: string,
    origin: string,
    data: any
  ): Promise<{
    type_list_nft: ExplainTxResponse['type_list_nft'];
  }> => {
    const { data: resData } = await this.request.post(
      '/v1/wallet/explain_typed_data',
      {
        user_addr,
        origin,
        data,
      }
    );
    return resData;
  };

  checkTypedData = async (
    user_addr: string,
    origin: string,
    data: any
  ): Promise<SecurityCheckResponse> => {
    const { data: resData } = await this.request.post(
      '/v1/wallet/check_typed_data',
      {
        user_addr,
        origin,
        data,
      }
    );
    return resData;
  };

  approvalStatus = async (id: string): Promise<ApprovalStatus[]> => {
    const { data } = await this.request.get('/v1/user/approval_status', {
      params: {
        id,
      },
    });
    return data;
  };

  usedChainList = async (id: string): Promise<UsedChain[]> => {
    const { data } = await this.request.get('/v1/user/used_chain_list', {
      params: {
        id,
      },
    });
    return data;
  };

  getLatestVersion = async (): Promise<{ version_tag: string }> => {
    const { data } = await this.request.get('/v1/wallet/version');
    return data;
  };
}
