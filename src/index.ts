import axios, { AxiosAdapter, AxiosRequestConfig } from 'axios';
import rateLimit, { RateLimitedAxiosInstance } from 'axios-rate-limit';
import { ethErrors } from 'eth-rpc-errors';
import { genSignParams, sleep } from './utils';

import { omit } from 'lodash';
import { ASYNC_JOB_RETRY_DELAY, ASYNC_JOB_TIMEOUT } from './const';
import { InitOptions, RabbyApiPlugin } from './plugins/intf';
import {
  AddrDescResponse,
  BridgeAggregator,
  ApprovalStatus,
  AssetItem,
  BasicDappInfo,
  CEXQuote,
  Cex,
  ChainListItem,
  ChainWithPendingCount,
  Collection,
  CollectionList,
  CollectionWithFloorPrice,
  ComplexProtocol,
  ContractCredit,
  DbkBridgeHistoryItem,
  ExplainTxResponse,
  ExplainTypedDataResponse,
  GasLevel,
  GetTxResponse,
  HistoryCurve,
  JobResponse,
  LatestExplainTxResponse,
  MempoolCheckDetail,
  NFTApprovalResponse,
  NFTItem,
  NodeStatus,
  NodeStatusDetail,
  ParseTextResponse,
  ParseTxResponse,
  ParseTypedDataResponse,
  PendingTxItem,
  Protocol,
  RPCResponse,
  SecurityCheckResponse,
  ServerChain,
  SlippageStatus,
  Summary,
  SupportedChain,
  SwapTradeList,
  TokenApproval,
  TokenItem,
  TotalBalanceResponse,
  Tx,
  TxAllHistoryResult,
  TxHistoryResult,
  TxPushType,
  TxRequest,
  UsedChain,
  BridgeTokenPair,
  BridgeQuote,
  BridgeHistory,
  ContractInfo,
  GasAccountCheckResult,
  ParseCommonResponse,
  WithdrawListAddressItem,
  BuyCountryItem,
  BuyQuoteItem,
  BuyHistoryList,
  BuyPaymentMethod,
  GasAccountInfo,
  TokenEntityDetail,
  TokenItemWithEntity,
  ProjectItem,
  CopyTradeTokenListResponse,
  CopyTradeRecentBuyListResponse,
  CopyTradePnlListResponse,
  AppChainListResponse,
  CopyTradeTokenListV2Response,
  CopyTradeRecentBuyListV2Response,
  CopyTradeTokenItemV2,
  CopyTradeSameToken,
  DefaultRPCRes,
  TokenDetailWithPriceCurve,
  GiftEligibilityItem,
  UserFeedbackItem,
  PerpTopToken,
  KlineDataItem,
  TokenMarketInfo,
  TokenHolderInfo,
  TokenSupplyInfo,
  MarketSummary,
  MarketTradingHistoryItem,
  TokenHolderSummary,
  TokenHolderItem,
  CurrencyItem,
  PerpBridgeQuote,
  LiquidityPoolItem,
  LiquidityPoolHistoryItem,
  NFTDetail,
  NFTTradingConfig,
  PrepareAcceptNFTOfferResponse,
  PrepareListingNFTResponse,
  CreateListingNFTOfferResponse,
  NFTListingResponse,
} from './types';

interface OpenApiStore {
  host: string;
  testnetHost?: string;
  apiKey: string | null;
  apiTime: number | null;
}

interface Options {
  store: OpenApiStore | Promise<OpenApiStore>;
  plugin: RabbyApiPlugin;
  adapter?: AxiosAdapter;

  clientName?: string;
  clientVersion?: string;
}

enum CurveDayType {
  DAY = 1,
  WEEK = 7,
}

const maxRPS = 500;

type VersionPrefix = 'v1' | 'v2';
type ApiOptions<V extends VersionPrefix | void = VersionPrefix> = {
  restfulPrefix?: V;
};

export class OpenApiService {
  store!: OpenApiStore;

  request!: RateLimitedAxiosInstance;

  #adapter?: AxiosAdapter;
  #plugin: RabbyApiPlugin;

  #clientName: string;
  #clientVersion: string;

  constructor({
    store,
    plugin,
    adapter,
    clientName = 'Rabby',
    clientVersion = process.env.release ?? '0.0.0',
  }: Options) {
    if (store instanceof Promise) {
      store.then((resolvedStore) => {
        this.store = resolvedStore;
      });
    } else {
      this.store = store;
    }
    this.#plugin = plugin;
    this.#adapter = adapter;

    this.#clientName = clientName;
    this.#clientVersion = clientVersion;
  }

  setHost = async (host: string) => {
    this.store.host = host;

    await this.init();
  };

  setHostSync = (host: string) => {
    this.store.host = host;

    this.initSync();
  };

  setAPIKey = async (apiKey: string) => {
    this.store.apiKey = apiKey;
    await this.init();
  };

  setAPITime = async (apiTime: number) => {
    this.store.apiTime = apiTime;
    await this.init();
  };

  removeAPIKey = async () => {
    this.store.apiKey = null;
    this.store.apiTime = null;
    await this.init();
  };

  getHost = () => {
    return this.store.host;
  };

  setTestnetHost = async (host: string) => {
    this.store.testnetHost = host;
  };

  getTestnetHost = () => {
    return this.store.testnetHost;
  };

  ethRpc:
    | ((
        chainId: string,
        arg: { method: string; params: Array<any>; origin?: string }
      ) => Promise<any>)
    | (() => Promise<never>) = async () => {
    throw ethErrors.provider.disconnected();
  };

  init = async (options?: string | InitOptions) => {
    options = typeof options === 'string' ? { webHf: options } : options;

    await this.#plugin.onInitiateAsync?.({ ...options });

    this.initSync({ ...options });
  };

  initSync(options?: InitOptions) {
    this.#plugin.onInitiate?.({ ...options });
    const headers: Record<string, string | number> = {
      'X-Client': this.#clientName,
      'X-Version': this.#clientVersion,
    };
    if (this.store.apiKey && this.store.apiTime) {
      headers['X-API-Key'] = this.store.apiKey;
      headers['X-API-Time'] = this.store.apiTime;
    }
    const request = axios.create({
      baseURL: this.store.host,
      adapter: this.#adapter,
      headers,
    });

    // sign after rateLimit, timestamp is the latest
    request.interceptors.request.use(async (config) => {
      const { method, url, params } = genSignParams(config);

      await this.#plugin.onSignRequest({
        axiosRequestConfig: config,
        parsed: { method, url, params },
      });

      return config;
    });
    this.request = rateLimit(request, { maxRPS });

    this.request.interceptors.response.use((response) => {
      const newAPIKey = response.headers?.['x-set-api-key'];
      if (newAPIKey) {
        this.setAPIKey(newAPIKey);
      }
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
        throw new Error(
          typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data)
        );
      }
      return response;
    });
    this._mountMethods();
  }

  asyncJob = <T = any>(
    url: string,
    options?: AxiosRequestConfig & {
      retryDelay?: number;
    }
  ): Promise<T> => {
    const _option = {
      timeout: ASYNC_JOB_TIMEOUT,
      retryDelay: ASYNC_JOB_RETRY_DELAY,
      ...options,
    };
    const startTime = +new Date();

    return this.request(
      url,
      omit(
        {
          method: 'GET',
          ..._option,
        },
        'retryDelay'
      )
    ).then((res) => {
      const data: JobResponse<T> = res.data;
      if (data.result) {
        return data.result.data;
      }

      const deltaTime = +new Date() - startTime;
      _option.timeout = _option.timeout - deltaTime - _option.retryDelay;

      return sleep(_option.retryDelay, _option.signal).then(() =>
        this.asyncJob(url, _option)
      );
    });
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

  getTotalBalance = async (
    address: string,
    isCore = false
  ): Promise<TotalBalanceResponse> => {
    const { data } = await this.request.get('/v1/user/total_balance', {
      params: {
        id: address,
        is_core: isCore,
      },
    });

    return data;
  };

  getTotalBalanceV2 = async ({
    address,
    isCore = false,
    included_token_uuids = [],
    excluded_token_uuids = [],
    excluded_protocol_ids = [],
    excluded_chain_ids = [],
  }: {
    address: string;
    isCore: boolean;
    included_token_uuids: string[];
    excluded_token_uuids: string[];
    excluded_protocol_ids: string[];
    excluded_chain_ids: string[];
  }): Promise<TotalBalanceResponse> => {
    const { data } = await this.request.post('/v2/user/total_balance', {
      id: address,
      is_core: isCore,
      included_token_uuids: included_token_uuids,
      excluded_token_uuids: excluded_token_uuids,
      excluded_protocol_ids: excluded_protocol_ids,
      excluded_chain_ids: excluded_chain_ids,
    });

    return data;
  };

  get24hTotalBalance = async (
    address: string
  ): Promise<{ total_usd_value: number }> => {
    const { data } = await this.request.get('/v1/user/total_balance_24h', {
      params: {
        id: address,
      },
    });
    return data;
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
    const { data } = await this.request.post('/v1/wallet/check_origin', {
      user_addr: address,
      origin,
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
    delegate_call,
  }: {
    tx: Tx;
    origin: string;
    address: string;
    updateNonce: boolean;
    pending_tx_list: Tx[];
    delegate_call?: boolean;
  }): Promise<ExplainTxResponse> => {
    const { data } = await this.request.post('/v1/wallet/pre_exec_tx', {
      tx,
      user_addr: address,
      origin,
      update_nonce: updateNonce,
      pending_tx_list,
      delegate_call,
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

  traceTx = async (
    txId: string,
    traceId: string,
    chainId: string
  ): Promise<void> => {
    const { data } = await this.request.post('/v1/wallet/trace_tx', {
      tx_id: txId,
      trace_id: traceId,
      chain_id: chainId,
    });
    return data;
  };

  pushTx = async (tx: Tx, traceId?: string) => {
    const { data } = await this.request.post('/v1/wallet/push_tx', {
      tx,
      trace_id: traceId,
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

  gasMarketV2 = async (options: {
    chainId: string;
    tx?: Tx;
    customGas?: number;
  }): Promise<GasLevel[]> => {
    const { data } = await this.request.post('/v2/wallet/gas_market', {
      chain_id: options.chainId,
      custom_price: options.customGas,
      tx: options.tx,
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

  searchToken = async (
    id: string,
    q: string,
    chainId?: string,
    is_all = false
  ): Promise<TokenItem[]> => {
    const { data } = await this.request.get('/v1/user/token_search', {
      params: {
        id,
        q,
        has_balance: false,
        is_all,
        chain_id: chainId,
      },
    });

    return data;
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

  getCachedTokenList = async (id: string): Promise<TokenItem[]> => {
    const { data } = await this.request.get('/v1/user/cache_token_list', {
      params: {
        id,
      },
    });
    return data;
  };

  listToken = async (
    id: string,
    chainId?: string,
    isAll = false
  ): Promise<TokenItem[]> => {
    const { data } = await this.request.get('/v1/user/token_list', {
      params: {
        id,
        is_all: isAll,
        chain_id: chainId,
      },
    });

    return data;
  };

  getTokenEntity = async (
    id: string,
    chainId?: string
  ): Promise<TokenEntityDetail> => {
    const { data } = await this.request.get('/v1/token/identity', {
      params: {
        id,
        chain_id: chainId,
      },
    });

    return data;
  };

  getHistoryTokenList = async (params: {
    id: string;
    chainId?: string;
    timeAt?: number;
    dateAt?: string;
  }): Promise<TokenItem[]> => {
    const { data } = await this.request.get('/v1/user/history_token_list', {
      params: {
        id: params.id,
        chain_id: params.chainId,
        time_at: params.timeAt,
        date_at: params.dateAt,
      },
    });

    return data;
  };

  customListToken = async (
    uuids: string[],
    id: string
  ): Promise<TokenItem[]> => {
    if (!uuids?.length || !id) {
      return [];
    }
    const { data } = await this.request.post('/v1/user/specific_token_list', {
      id,
      uuids,
    });

    return data;
  };

  listChainAssets = async (id: string): Promise<AssetItem[]> => {
    const { data } = await this.request.get('/v1/user/simple_protocol_list', {
      params: {
        id,
      },
    });
    return data;
  };

  listNFT = async (
    id: string,
    isAll = true,
    sortByCredit?: boolean
  ): Promise<NFTItem[]> => {
    const { data } = await this.request.get('/v1/user/nft_list', {
      params: Object.assign(
        {
          id,
          is_all: isAll,
        },
        sortByCredit
          ? {
              sort_by: 'credit_score',
            }
          : {}
      ),
    });
    return data;
  };

  listCollection = async (params: {
    collection_ids: string;
  }): Promise<Collection[]> => {
    const { data } = await this.request.get('/v1/nft/collections', {
      params,
    });
    return data;
  };

  hasNewTxFrom = async (params: {
    address: string;
    startTime: number;
  }): Promise<{ has_new_tx: boolean }> => {
    const { data } = await this.request.get('/v1/user/has_new_tx', {
      params: {
        id: params.address,
        start_time: params.startTime,
      },
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

  getAllTxHistory = async (
    params: {
      id: string;
      start_time?: number;
      page_count?: number;
    },
    options?: Parameters<typeof this.asyncJob>[1]
  ): Promise<TxAllHistoryResult> => {
    const data = await this.asyncJob('/v1/user/history_all_list', {
      method: 'GET',
      params,
      ...options,
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

  tokenAuthorizedList = async <V extends ApiOptions['restfulPrefix']>(
    id: string,
    chain_id: string,
    options?: ApiOptions<V>
  ): Promise<TokenApproval[]> => {
    const { restfulPrefix = 'v1' } = options || {};
    const { data } = await this.request.get(
      `/${restfulPrefix}/user/token_authorized_list`,
      {
        params: {
          id,
          chain_id,
        },
      }
    );

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
    slippage?: string | number;
    fee?: boolean;
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
      dex_fee_desc?: string | null;
    }>('/v1/wallet/swap_quote', {
      params,
      timeout: 5000,
    });
    return data;
  };

  getSwapTokenList = async (id: string, chainId?: string) => {
    const params: { id: string; is_all: boolean; chain_id?: string } = {
      id,
      is_all: false,
    };

    if (chainId) {
      params.chain_id = chainId;
    }
    const { data } = await this.request.get<TokenItem[]>(
      '/v1/wallet/swap_token_list',
      {
        params,
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

  getGasStationChainBalance = async (chain_id: string, addr: string) => {
    const { data } = await this.request.get<{ usd_value: number }>(
      '/v1/wallet/gas_station_usd_value',
      {
        params: {
          chain_id,
          addr,
        },
      }
    );
    return data;
  };

  getApprovalCount = async (
    address: string
  ): Promise<{ total_asset_cnt: number }> => {
    const { data } = await this.request.get(
      '/v1/user/total_approval_asset_cnt',
      {
        params: {
          id: address,
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
  ): Promise<ExplainTypedDataResponse> => {
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

  approvalStatus = async (
    id: string,
    options?: ApiOptions
  ): Promise<ApprovalStatus[]> => {
    const { restfulPrefix = 'v1' } = options || {};
    const { data } = await this.request.get(
      `/${restfulPrefix}/user/approval_status`,
      {
        params: {
          id,
        },
      }
    );
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

  addOriginFeedback = async (params: {
    user_addr: string;
    origin: string;
    is_safe: boolean;
  }): Promise<{ is_success: boolean }> => {
    const { data } = await this.request.post('/v1/wallet/add_origin_feedback', {
      user_addr: params.user_addr,
      origin: params.origin,
      is_safe: params.is_safe,
    });
    return data;
  };

  getProtocolList = async (addr: string): Promise<Protocol[]> => {
    const { data } = await this.request.get('/v1/user/protocol_list', {
      params: {
        id: addr,
      },
    });
    return data;
  };

  getComplexProtocolList = async (addr: string): Promise<ComplexProtocol[]> => {
    const { data } = await this.request.get('/v1/user/complex_protocol_list', {
      params: {
        id: addr,
      },
    });
    return data;
  };

  getProtocol = async ({
    addr,
    id,
  }: {
    addr: string;
    id: string;
  }): Promise<ComplexProtocol> => {
    const { data } = await this.request.get('/v1/user/protocol', {
      params: {
        id: addr,
        protocol_id: id,
      },
    });
    return data;
  };

  getHistoryProtocol = async ({
    addr,
    id,
    timeAt,
    dateAt,
  }: {
    addr: string;
    id: string;
    timeAt?: number;
    dateAt?: number;
  }): Promise<ComplexProtocol> => {
    const { data } = await this.request.get('/v1/user/history_protocol', {
      params: {
        id: addr,
        protocol_id: id,
        time_at: timeAt,
        date_at: dateAt,
      },
    });
    return data;
  };

  getTokenHistoryPrice = async ({
    chainId,
    id,
    timeAt,
  }: {
    chainId: string;
    id: string;
    timeAt: number;
  }): Promise<{ price: number }> => {
    const { data } = await this.request.get('/v1/token/history_price', {
      params: {
        chain_id: chainId,
        id,
        time_at: timeAt,
      },
    });
    return data;
  };

  getTokenHistoryDict = async ({
    chainId,
    ids,
    timeAt,
  }: {
    chainId: string;
    ids: string;
    timeAt: number;
  }): Promise<Record<string, number>> => {
    const { data } = await this.request.get('/v1/token/history_price_dict', {
      params: {
        chain_id: chainId,
        ids,
        time_at: timeAt,
      },
    });
    return data;
  };

  getNetCurve = async (
    addr: string,
    days: CurveDayType = CurveDayType.DAY
  ): Promise<{ timestamp: number; usd_value: number }[]> => {
    const { data } = await this.request.get('/v1/user/total_net_curve', {
      params: {
        id: addr,
        days,
      },
    });
    return data;
  };

  getChainList = async (): Promise<ServerChain[]> => {
    const { data } = await this.request.get('/v1/chain/list');
    return data;
  };

  getCEXSwapQuote = async (params: {
    cex_id: string;
    pay_token_id: string;
    pay_token_amount: string;
    receive_token_id: string;
    chain_id: string;
  }): Promise<CEXQuote> => {
    const { data } = await this.request.get('/v1/wallet/cex_swap_quote', {
      params,
    });
    return data;
  };

  getSwapTradeList = async (params: {
    user_addr: string;
    start: string;
    limit: string;
  }): Promise<SwapTradeList> => {
    const { data } = await this.request.get('/v1/wallet/swap_trade_list', {
      params,
    });
    return data;
  };

  getSwapTradeListV2 = async (params: {
    user_addr: string;
    limit: number;
    start_time?: number;
  }): Promise<SwapTradeList> => {
    const { data } = await this.request.get('/v2/wallet/swap_trade_list', {
      params,
    });
    return data;
  };

  postSwap = async (params: {
    quote: {
      pay_token_id: string;
      pay_token_amount: number;
      receive_token_id: string;
      receive_token_amount: number;
      slippage: number;
    };
    dex_id: string;
    tx_id: string;
    tx: Tx;
  }) => {
    const { data } = await this.request.post('/v1/wallet/swap_trade', params);
    return data;
  };

  checkSlippage = async (params: {
    chain_id: string;
    slippage: string;
    from_token_id: string;
    to_token_id: string;
  }): Promise<SlippageStatus> => {
    const { data } = await this.request.get('/v1/wallet/check_slippage', {
      params,
    });
    return data;
  };

  suggestSlippage = async (params: {
    chain_id: string;
    slippage: string;
    from_token_id: string;
    to_token_id: string;
    from_token_amount: string;
  }): Promise<{ suggest_slippage: number }> => {
    const { data } = await this.request.get('v1/wallet/suggest_slippage', {
      params,
    });
    return data;
  };

  getOriginPopularityLevel = async (
    origin: string
  ): Promise<{ level: 'very_low' | 'low' | 'medium' | 'high' }> => {
    const { data } = await this.request.get(
      '/v1/engine/origin/popularity_level',
      {
        params: {
          origin,
        },
      }
    );
    return data;
  };

  getOriginIsScam = async (
    origin: string,
    source: string
  ): Promise<{ is_scam: boolean }> => {
    const { data } = await this.request.get('/v1/engine/origin/is_scam', {
      params: {
        origin,
        source,
      },
    });
    return data;
  };

  getOriginThirdPartyCollectList = async (
    origin: string
  ): Promise<{ collect_list: { name: string; logo_url: string }[] }> => {
    const { data } = await this.request.get(
      '/v1/engine/origin/third_party_collect_list',
      {
        params: {
          origin,
        },
      }
    );
    return data;
  };

  getSummarizedAssetList = async (
    id: string,
    chain_id?: string
  ): Promise<Summary> => {
    const { data } = await this.request.get('/v1/user/summarized_asset_list', {
      params: {
        id,
        chain_id,
      },
    });
    return data;
  };

  unexpectedAddrList = async ({
    chainId,
    tx,
    origin,
    addr,
  }: {
    chainId: string;
    tx: Tx;
    origin: string;
    addr: string;
  }): Promise<{ id: string }[]> => {
    const { data } = await this.request.post(
      '/v1/engine/addr/unexpected_list',
      {
        chain_id: chainId,
        tx,
        origin,
        user_addr: addr,
      }
    );
    return data;
  };

  gasLessTxCheck = async ({
    tx,
    usdValue,
    preExecSuccess,
    gasUsed,
  }: {
    gasUsed: number;
    preExecSuccess: boolean;
    tx: Tx;
    usdValue: number;
  }): Promise<{
    is_gasless: boolean;
    desc?: string;
    promotion?: {
      id: string;
      contract_id: string;
      chain_id: string;
      config: {
        button_text: string;
        before_click_text: string;
        after_click_text: string;
        logo: string;
        theme_color: string;
        dark_color: string;
      };
    };
  }> => {
    const { data } = await this.request.post('/v1/wallet/tx_is_gasless', {
      gas_used: gasUsed,
      pre_exec_success: preExecSuccess,
      tx,
      usd_value: usdValue,
    });
    return data;
  };

  gasLessTxsCheck = async (postData: {
    tx_list: Tx[];
  }): Promise<{
    is_gasless: boolean;
    desc?: string;
    promotion?: {
      id: string;
      contract_id: string;
      chain_id: string;
      config: {
        button_text: string;
        before_click_text: string;
        after_click_text: string;
        logo: string;
        theme_color: string;
        dark_color: string;
      };
    };
  }> => {
    const { data } = await this.request.post(
      '/v1/wallet/txs_is_gasless',
      postData
    );
    return data;
  };

  parseTx = async ({
    chainId,
    tx,
    origin,
    addr,
  }: {
    chainId: string;
    tx: Tx;
    origin: string;
    addr: string;
  }): Promise<ParseTxResponse> => {
    const { data } = await this.request.post('/v1/engine/action/parse_tx', {
      chain_id: chainId,
      tx,
      origin,
      user_addr: addr,
    });
    return data;
  };

  isSuspiciousToken = async (
    id: string,
    chainId: string
  ): Promise<{ is_suspicious: boolean }> => {
    const { data } = await this.request.get('/v1/engine/token/is_suspicious', {
      params: {
        chain_id: chainId,
        id,
      },
    });
    return data;
  };

  depositCexSupport = async (
    id: string,
    chainId: string,
    cexId: string
  ): Promise<{ support: boolean }> => {
    const { data } = await this.request.get(
      '/v1/engine/token/deposit_cex_support',
      {
        params: {
          chain_id: chainId,
          id,
          cex_id: cexId,
        },
      }
    );
    return data;
  };

  // Token 可充值的 CEX 列表
  depositCexList = async (
    id: string,
    chainId: string
  ): Promise<{ cex_list: Cex[] }> => {
    const { data } = await this.request.get(
      '/v1/engine/token/deposit_cex_list',
      {
        params: {
          chain_id: chainId,
          id,
        },
      }
    );
    return data;
  };

  // 合约信用分
  getContractCredit = async (
    id: string,
    chainId: string
  ): Promise<ContractCredit> => {
    const { data } = await this.request.get('/v1/engine/contract/credit', {
      params: {
        chain_id: chainId,
        id,
      },
    });
    return data;
  };

  // 是否跟地址交互过
  hasInteraction = async (
    addr: string,
    chainId: string,
    contractId: string
  ): Promise<{ has_interaction: boolean }> => {
    const { data } = await this.request.get(
      '/v1/engine/contract/has_interaction',
      {
        params: {
          chain_id: chainId,
          user_addr: addr,
          contract_id: contractId,
        },
      }
    );
    return data;
  };

  /**
   * @deprecated
   * 授权风险敞口
   */
  tokenApproveExposure = async (
    id: string,
    chainId: string
  ): Promise<{ usd_value: number }> => {
    const { data } = await this.request.get(
      '/v1/engine/contract/token_approval_exposure',
      {
        params: {
          chain_id: chainId,
          id,
        },
      }
    );
    return data;
  };

  tokenApproveTrustValue = async (
    id: string,
    chainId: string
  ): Promise<{ usd_value: number }> => {
    const { data } = await this.request.get(
      '/v1/engine/contract/spend_usd_value',
      {
        params: {
          chain_id: chainId,
          id,
        },
      }
    );
    return data;
  };

  getContractInfo = async (
    id: string,
    chainId: string
  ): Promise<ContractInfo | null> => {
    const { data } = await this.request.get<{ contract: null | ContractInfo }>(
      '/v1/contract',
      {
        params: {
          chain_id: chainId,
          id,
        },
      }
    );

    return data.contract;
  };

  // 地址描述
  addrDesc = async (id: string): Promise<AddrDescResponse> => {
    const { data } = await this.request.get('/v1/engine/addr/desc', {
      params: {
        id,
      },
    });
    return data;
  };

  // 两个地址是否发生过转账
  hasTransfer = async (
    chainId: string,
    from: string,
    to: string
  ): Promise<{ has_transfer: boolean }> => {
    const { data } = await this.request.get('/v1/engine/addr/has_transfer', {
      params: {
        chain_id: chainId,
        from_addr: from,
        to_addr: to,
      },
      timeout: 2000,
    });
    return data;
  };

  // 全链两个地址是否发生过转账
  hasTransferAllChain = async (
    from: string,
    to: string
  ): Promise<{ has_transfer: boolean }> => {
    const { data } = await this.request.get('/v2/engine/addr/has_transfer', {
      params: {
        from_addr: from,
        to_addr: to,
      },
      timeout: 2000,
    });
    return data;
  };

  isTokenContract = async (
    chainId: string,
    id: string
  ): Promise<{ is_token: boolean }> => {
    const { data } = await this.request.get('/v1/engine/contract/is_token', {
      params: {
        id,
        chain_id: chainId,
      },
    });
    return data;
  };

  addrUsedChainList = async (id: string): Promise<UsedChain[]> => {
    const { data } = await this.request.get('/v1/engine/addr/used_chain_list', {
      params: { id },
    });
    return data;
  };

  /**
   * @deprecated
   */
  getTokenNFTExposure = async (
    chainId: string,
    id: string
  ): Promise<{ usd_value: number }> => {
    const { data } = await this.request.get(
      '/v1/engine/contract/top_nft_approval_exposure',
      {
        params: { chain_id: chainId, id },
      }
    );
    return data;
  };

  getTokenNFTTrustValue = async (
    chainId: string,
    id: string
  ): Promise<{ usd_value: number }> => {
    const { data } = await this.request.get(
      '/v1/engine/contract/top_nft_spend_usd_value',
      {
        params: { chain_id: chainId, id },
      }
    );
    return data;
  };

  getCollection = async (
    chainId: string,
    id: string
  ): Promise<{ collection: CollectionWithFloorPrice }> => {
    const { data } = await this.request.get('/v1/engine/collection', {
      params: { chain_id: chainId, id },
    });
    return data;
  };

  isSuspiciousCollection = async (
    chainId: string,
    id: string
  ): Promise<{ is_suspicious: boolean }> => {
    const { data } = await this.request.get(
      '/v1/engine/collection/is_suspicious',
      {
        params: { chain_id: chainId, id },
      }
    );
    return data;
  };

  isOriginVerified = async (
    origin: string
  ): Promise<{ is_verified: boolean | null }> => {
    const { data } = await this.request.get('/v1/engine/origin/is_verified', {
      params: { origin },
    });
    return data;
  };

  parseTypedData = async ({
    typedData,
    origin,
    address,
  }: {
    typedData: Record<string, any>;
    origin: string;
    address: string;
  }): Promise<ParseTypedDataResponse> => {
    const { data } = await this.request.post(
      '/v1/engine/action/parse_typed_data',
      {
        typed_data: typedData,
        origin,
        user_addr: address,
      }
    );
    return data;
  };

  parseText = async ({
    text,
    origin,
    address,
  }: {
    text: string;
    origin: string;
    address: string;
  }): Promise<ParseTextResponse> => {
    const { data } = await this.request.post('/v1/engine/action/parse_text', {
      text,
      origin,
      user_addr: address,
    });
    return data;
  };

  collectionList = async ({
    id,
    chainId,
    isAll,
  }: {
    id: string;
    chainId?: string;
    isAll: boolean;
  }): Promise<CollectionList[]> => {
    const { data } = await this.request.get('/v1/user/collection_list', {
      params: {
        id,
        chain_id: chainId,
        is_all: isAll,
      },
    });
    return data;
  };

  gasPriceStats = async (chainId: string): Promise<{ median: number }> => {
    const { data } = await this.request.get('/v1/wallet/gas_price_stats', {
      params: {
        chain_id: chainId,
      },
    });
    return data;
  };

  badgeHasClaimed = async (
    id: string
  ): Promise<
    | {
        id: string;
        badge_id: number;
        user_id: string;
        inner_id: number;
        create_at: number;
        update_at: number;
        has_claimed: true;
      }
    | { has_claimed: false }
  > => {
    const { data } = await this.request.get('/v1/badge/code/user_has_claimed', {
      params: {
        user_id: id,
      },
    });
    return data;
  };

  badgeHasMinted = async (
    id: string
  ): Promise<
    | {
        id: string;
        badge_id: number;
        user_id: string;
        inner_id: number;
        usd_value: number;
        tvf: number;
        mint_at: number;
        has_minted: true;
      }
    | { has_minted: false }
  > => {
    const { data } = await this.request.get('/v1/badge/user_has_minted', {
      params: {
        user_id: id,
      },
    });
    return data;
  };

  mintBadge = async (params: {
    code: string;
    userAddr: string;
  }): Promise<{ is_success: boolean; inner_id: number }> => {
    const { data } = await this.request.post('/v1/badge/mint', {
      code: params.code,
      user_id: params.userAddr,
    });
    return data;
  };

  badgeHasClaimedByName = async ({
    id,
    name,
  }: {
    id: string;
    name: string;
  }): Promise<
    | {
        id: string;
        badge_id: number;
        user_id: string;
        inner_id: number;
        create_at: number;
        update_at: number;
        has_claimed: true;
      }
    | { has_claimed: false }
  > => {
    const { data } = await this.request.get(
      `/v1/badge/code/user_has_claimed/${name}`,
      {
        params: {
          user_id: id,
        },
      }
    );
    return data;
  };

  badgeHasMintedByName = async ({
    id,
    name,
  }: {
    id: string;
    name: string;
  }): Promise<
    | {
        id: string;
        badge_id: number;
        user_id: string;
        inner_id: number;
        usd_value: number;
        tvf: number;
        mint_at: number;
        has_minted: true;
      }
    | { has_minted: false }
  > => {
    const { data } = await this.request.get(
      `/v1/badge/user_has_minted/${name}`,
      {
        params: {
          user_id: id,
        },
      }
    );
    return data;
  };

  mintBadgeByName = async (params: {
    name: string;
    code: string;
    userAddr: string;
  }): Promise<{ is_success: boolean; inner_id: number }> => {
    const { data } = await this.request.post(`/v1/badge/mint/${params.name}`, {
      code: params.code,
      user_id: params.userAddr,
    });
    return data;
  };

  userHasRequestedFaucet = async (params: {
    chain_id: string;
    user_addr: string;
  }): Promise<{ has_requested: boolean }> => {
    const { data } = await this.request.get('/v1/faucet/user_has_requested', {
      params,
    });
    return data;
  };

  requestFaucet = async (params: {
    chain_id: string;
    user_addr: string;
  }): Promise<{ is_success: boolean }> => {
    const { data } = await this.request.post('/v1/faucet/request', {
      ...params,
    });
    return data;
  };

  gasSupportedPushType = async (
    chainId: string
  ): Promise<{ low_gas: boolean; mev: boolean }> => {
    const { data } = await this.request.get('/v1/wallet/supported_push_type', {
      params: {
        chain_id: chainId,
      },
    });
    return data;
  };

  submitTx = async (postData: {
    req_id?: string;
    tx: Tx;
    push_type: TxPushType;
    is_gasless?: boolean;
    is_gas_account?: boolean;
    log_id: string;
    low_gas_deadline?: number;
    origin?: string;
    sig?: string;
  }): Promise<{ req: TxRequest; access_token?: string }> => {
    const { sig, ...rest } = postData;
    const { data } = await this.request.post(
      '/v1/wallet/submit_tx',
      {
        ...rest,
      },
      {
        headers: sig ? { sig } : undefined,
      }
    );

    return data;
  };

  submitTxV2 = async (postData: {
    frontend_push_result?:
      | {
          // FE  push
          success: true;
          has_pushed: true;
          raw_tx: string;
          url: string;
          return_tx_id: string;
        }
      | {
          // FE push failed
          success: false;
          has_pushed: true;
          url: string;
          error_msg: string;
        };
    backend_push_require: {
      gas_type: 'gas_account' | 'gasless' | null;
    };
    context: {
      tx: Tx;
      origin?: string;
      log_id: string;
    };
    mev_share_model: 'user' | 'rabby';
    sig?: string;
  }): Promise<{
    tx_id?: string;
    access_token?: string;
    err?: string;
  }> => {
    const { sig, ...rest } = postData;
    const { data } = await this.request.post(
      '/v2/wallet/submit_tx',
      {
        ...rest,
      },
      {
        headers: sig ? { sig } : undefined,
      }
    );

    return data;
  };

  getDefaultRPCs = async (): Promise<DefaultRPCRes> => {
    const { data } = await this.request.get('/v1/chainrpc');
    return data;
  };

  getTxRequests = async (ids: string | string[]): Promise<TxRequest[]> => {
    const { data } = await this.request.get('/v1/wallet/get_tx_requests', {
      params: {
        ids: Array.isArray(ids) ? ids.join(',') : ids,
      },
    });

    return data;
  };

  getTxRequest = async (id: string): Promise<TxRequest> => {
    const { data } = await this.request.get('/v1/wallet/get_tx_request', {
      params: {
        id,
      },
    });

    return data;
  };

  withdrawTx = async (reqId: string): Promise<{ req: TxRequest }> => {
    const { data } = await this.request.post('/v1/wallet/withdraw_tx', {
      id: reqId,
    });

    return data;
  };

  retryPushTx = async (reqId: string): Promise<{ req: TxRequest }> => {
    const { data } = await this.request.post('/v1/wallet/retry_push_tx', {
      id: reqId,
    });

    return data;
  };

  mempoolChecks = async (
    txId: string,
    chainId: string,
    node_info?: boolean
  ): Promise<MempoolCheckDetail[]> => {
    const { data } = await this.request.get('/v1/wallet/mempool_checks', {
      params: {
        tx_id: txId,
        chain_id: chainId,
        node_info: node_info ? 1 : 0,
      },
    });
    return data;
  };

  getPendingTxList = async (
    params: {
      chain_id: string;
    },
    options?: Parameters<typeof this.asyncJob>[1]
  ): Promise<{
    pending_tx_list: PendingTxItem[];
    token_dict: Record<string, TokenItem | NFTItem>;
  }> => {
    const data = await this.asyncJob('/v1/wallet/get_pending_tx_list', {
      params,
      ...options,
    });
    return data;
  };

  getLatestPreExec = async (params: {
    id: string;
  }): Promise<LatestExplainTxResponse> => {
    const { data } = await this.request.get('/v1/wallet/get_latest_pre_exec', {
      params,
    });
    return data;
  };

  walletSupportChain = async (params: {
    chain_id: string;
    user_addr: string;
  }): Promise<{ is_success: boolean; count: number }> => {
    const { data } = await this.request.post(
      '/v1/wallet/support_chain',
      params
    );
    return data;
  };

  walletSupportOrigin = async (params: {
    origin: string;
    user_addr: string;
    text: string;
  }): Promise<{ is_success: boolean; count: number }> => {
    const { data } = await this.request.post(
      '/v1/wallet/support_origin',
      params
    );
    return data;
  };

  walletSupportSelector = async (params: {
    selector: string;
    user_addr: string;
    chain_id: string;
    contract_id: string;
  }): Promise<{ is_success: boolean; count: number }> => {
    const { data } = await this.request.post(
      '/v1/wallet/support_selector',
      params
    );
    return data;
  };

  searchDapp = async (params?: {
    q?: string;
    chain_id?: string;
    start?: number;
    limit?: number;
    match_id?: boolean;
  }): Promise<{
    page: {
      limit: number;
      start: number;
      total: number;
    };
    dapps: BasicDappInfo[];
  }> => {
    const { data } = await this.request.get('/v1/dapp/search', { params });
    return data;
  };

  getDappsInfo = async (params: {
    ids: string[];
  }): Promise<BasicDappInfo[]> => {
    const { data } = await this.request.get('/v1/dapp/list', {
      params: {
        ids: params?.ids?.join(','),
      },
    });
    return data;
  };

  getDappHotTags = async (params?: { limit: number }): Promise<string[]> => {
    const { data } = await this.request.get('/v1/dapp/hot_tags', {
      params,
    });
    return data;
  };

  getHotDapps = async (params?: {
    limit: number;
    order_by: string;
  }): Promise<BasicDappInfo[]> => {
    const { data } = await this.request.get('/v1/dapp/hot_list', { params });
    return data;
  };

  getRabbyClaimText = async (params: {
    id: string;
    invite_code?: string;
  }): Promise<{ id: string; text: string }> => {
    const { data } = await this.request.get('/v1/points/user/claim_text', {
      params,
    });
    return data;
  };

  getRabbySignatureText = async (params: {
    id: string;
  }): Promise<{ id: string; text: string }> => {
    const { data } = await this.request.get('/v1/points/user/sign_text', {
      params,
    });
    return data;
  };

  getRabbyPoints = async (params: {
    id: string;
  }): Promise<{
    id: string;
    invite_code?: string;
    logo_url: string;
    logo_thumbnail_url: string;
    web3_id: string;
    claimed_points: number;
    total_claimed_points: number;
  }> => {
    const { data } = await this.request.get('/v1/points/user', { params });
    return data;
  };

  checkRabbyPointsInviteCode = async (params: {
    code: string;
  }): Promise<{ invite_code_exist: boolean }> => {
    const { data } = await this.request.get(
      '/v1/points/user/invite_code_exist',
      { params }
    );
    return data;
  };

  setRabbyPointsInviteCode = async (params: {
    id: string;
    signature: string;
    invite_code: string;
  }): Promise<{ code: number }> => {
    const { data } = await this.request.post(
      '/v1/points/user/invite_code',
      params
    );
    return data;
  };

  checkRabbyPointClaimable = async (params: {
    id: string;
  }): Promise<{ claimable: boolean }> => {
    const { data } = await this.request.get('/v1/points/user/claimable', {
      params,
    });
    return data;
  };

  getRabbyPointsSnapshot = async (params: {
    id: string;
  }): Promise<{
    id: string;
    address_balance: number;
    metamask_swap: number;
    rabby_old_user: number;
    rabby_nadge: number;
    rabby_nft: number;
    extra_bouns: number;
    claimed: boolean;
    snapshot_at: number;
  }> => {
    const { data } = await this.request.get('/v1/points/snapshot', { params });
    return data;
  };

  claimRabbyPointsSnapshot = async (params: {
    id: string;
    signature: string;
    invite_code?: string;
  }): Promise<{
    error_code: number;
    error_msg?: string;
  }> => {
    const { data } = await this.request.post(
      '/v1/points/claim_snapshot',
      params
    );
    return data;
  };

  getRabbyPointsTopUsers = async (params: {
    id: string;
  }): Promise<
    {
      id: string;
      logo_url: string;
      logo_thumbnail_url: string;
      web3_id: string;
      claimed_points: number;
    }[]
  > => {
    const { data } = await this.request.get('/v1/points/top_user', { params });
    return data;
  };

  getRabbyPointsList = async (params: {
    id: string;
  }): Promise<
    {
      id: number;
      title: string;
      description: string;
      start_at: number;
      end_at: number;
      claimable_points: number;
    }[]
  > => {
    const { data } = await this.request.get('/v1/points/campaign_list', {
      params,
    });
    return data;
  };

  getRabbyPointsCampaignIsEnded = async (): Promise<{
    campaign_is_ended: boolean;
  }> => {
    const { data } = await this.request.get('v1/points/campaign');
    return data;
  };

  claimRabbyPointsById = async (params: {
    campaign_id: number;
    user_id: string;
    signature: string;
  }): Promise<{ error_code: number }> => {
    const { data } = await this.request.post(
      '/v1/points/claim_campaign',
      params
    );
    return data;
  };

  getRabbyPointsV2 = async (params: {
    id: string;
  }): Promise<{
    id: string;
    invite_code?: string;
    logo_url: string;
    logo_thumbnail_url: string;
    web3_id: string;
    claimed_points: number;
    total_claimed_points: number;
  }> => {
    const { data } = await this.request.get('/v2/points/user', { params });
    return data;
  };

  getRabbySignatureTextV2 = async (params: {
    id: string;
  }): Promise<{ id: string; text: string }> => {
    const { data } = await this.request.get('/v2/points/user/sign_text', {
      params,
    });
    return data;
  };

  getRabbyClaimTextV2 = async (params: {
    id: string;
    invite_code?: string;
  }): Promise<{ id: string; text: string }> => {
    const { data } = await this.request.get('/v2/points/user/claim_text', {
      params,
    });
    return data;
  };

  setRabbyPointsInviteCodeV2 = async (params: {
    id: string;
    signature: string;
    invite_code: string;
  }): Promise<{ code: number }> => {
    const { data } = await this.request.post(
      '/v2/points/user/invite_code',
      params
    );
    return data;
  };

  checkRabbyPointsInviteCodeV2 = async (params: {
    code: string;
  }): Promise<{ invite_code_exist: boolean }> => {
    const { data } = await this.request.get(
      '/v2/points/user/invite_code_exist',
      {
        params,
      }
    );
    return data;
  };

  claimRabbyPointsSnapshotV2 = async (params: {
    id: string;
    signature: string;
    invite_code?: string;
  }): Promise<{
    error_code: number;
    error_msg?: string;
  }> => {
    const { data } = await this.request.post(
      '/v2/points/claim_snapshot',
      params
    );
    return data;
  };

  getRabbyPointsTopUsersV2 = async (params: {
    id: string;
  }): Promise<
    {
      id: string;
      logo_url: string;
      logo_thumbnail_url: string;
      web3_id: string;
      claimed_points: number;
    }[]
  > => {
    const { data } = await this.request.get('/v2/points/top_user', {
      params,
    });
    return data;
  };

  getRabbyPointsListV2 = async (params: {
    id: string;
  }): Promise<
    {
      id: number;
      title: string;
      description: string;
      start_at: number;
      end_at: number;
      claimable_points: number;
    }[]
  > => {
    const { data } = await this.request.get('/v2/points/campaign_list', {
      params,
    });
    return data;
  };

  claimRabbyPointsByIdV2 = async (params: {
    campaign_id: number;
    user_id: string;
    signature: string;
  }): Promise<{ error_code: number }> => {
    const { data } = await this.request.post(
      '/v2/points/claim_campaign',
      params
    );
    return data;
  };

  getRabbyPointsSnapshotV2 = async (params: {
    id: string;
  }): Promise<{
    id: string;
    wallet_balance_reward: number;
    active_stats_reward: number;
    extra_bouns: number;
    claimed: boolean;
    snapshot_at: number;
    claimed_points: number;
  }> => {
    const { data } = await this.request.get('/v2/points/snapshot', {
      params,
    });
    return data;
  };

  checkRabbyPointClaimableV2 = async (params: {
    id: string;
  }): Promise<{ claimable: boolean }> => {
    const { data } = await this.request.get('/v2/points/user/claimable', {
      params,
    });
    return data;
  };

  checkClaimInfoV2 = async (params: {
    id: string;
  }): Promise<{ claimable_points: number; claimed_points: number }> => {
    const { data } = await this.request.get('/v2/points/user/claim_info', {
      params,
    });
    return data;
  };

  getRabbyPointsCampaignIsEndedV2 = async (): Promise<{
    campaign_is_ended: boolean;
  }> => {
    const { data } = await this.request.get('v2/points/campaign');
    return data;
  };

  getSupportedChains = async (): Promise<SupportedChain[]> => {
    const { data } = await this.request.get('/v1/wallet/supported_chains');
    return data;
  };

  searchChainList = async (params?: {
    limit?: number;
    start?: number;
    q?: string;
  }): Promise<{
    page: {
      start: number;
      limit: number;
      total: number;
    };
    chain_list: ChainListItem[];
  }> => {
    const { data } = await this.request.get('/v1/chain/total_list', {
      params,
    });
    return data;
  };

  getChainListByIds = async (params: {
    ids: string;
  }): Promise<ChainListItem[]> => {
    const { data } = await this.request.get('/v1/chain/get_list', {
      params,
    });
    return data;
  };

  getHistoryCurve = async (addr: string): Promise<HistoryCurve> => {
    const { data } = await this.request.get('/v1/user/history_curve', {
      params: { id: addr },
    });
    return data;
  };

  getHistoryCurveSupportedList = async (): Promise<{
    supported_chains: string[];
  }> => {
    const { data } = await this.request.get(
      '/v1/chain/classify_supported_list'
    );
    return data;
  };

  getHistoryCurveStatus = async (params: {
    id: string;
  }): Promise<{
    failed_msg: Record<string, string>;
    id: string;
    status: 'pending' | 'running' | 'finished' | 'failed';
    update_at: number;
  }> => {
    const { data } = await this.request.get('/v1/user/history_curve/status', {
      params,
    });
    return data;
  };

  initHistoryCurve = async (params: {
    id: string;
  }): Promise<{ success: boolean }> => {
    const { data } = await this.request.post(
      '/v1/user/history_curve/init',
      params
    );
    return data;
  };

  getNodeStatusList = async (): Promise<NodeStatus[]> => {
    const { data } = await this.request.get('/v1/node/list');
    return data;
  };

  getNodeStatusDetail = async (params: {
    chain_id: string;
  }): Promise<NodeStatusDetail> => {
    const { data } = await this.request.get('/v1/node', { params });
    return data;
  };

  postActionLog = async (body: {
    id: string;
    type: 'tx' | 'typed_data' | 'text';
    rules: { id: string; level: string | null }[];
  }) => {
    const { data } = await this.request.post('/v1/engine/action/log', body);
    return data;
  };

  checkSpoofing = async ({
    from,
    to,
  }: {
    from: string;
    to: string;
  }): Promise<{ is_spoofing: boolean }> => {
    const { data } = await this.request.get('/v1/engine/addr/is_spoofing', {
      params: { user_addr: from, dest_addr: to },
    });
    return data;
  };

  getAddressByDeBankId = async (
    name: string
  ): Promise<{ addr: string; web3_id: string }> => {
    const { data } = await this.request.get('/v1/user/web3_id', {
      params: {
        text: name,
      },
    });

    return data;
  };

  getBridgeSupportChain = async (): Promise<string[]> => {
    const { data } = await this.request.get('/v1/bridge/supported_chains');
    return data;
  };

  getBridgeAggregatorList = async (): Promise<BridgeAggregator[]> => {
    const { data } = await this.request.get('/v1/bridge/list');
    return data;
  };

  getBridgePairList = async (params: {
    aggregator_ids: string[];
    to_chain_id: string;
    user_addr: string;
  }): Promise<BridgeTokenPair[]> => {
    const { data } = await this.request.get('/v1/bridge/pair_list', {
      params: { ...params, aggregator_ids: params.aggregator_ids.join(',') },
    });
    return data;
  };

  getBridgeQuoteList = async (params: {
    aggregator_ids: string;
    user_addr: string;
    from_chain_id: string;
    from_token_id: string;
    from_token_raw_amount: string;
    to_chain_id: string;
    to_token_id: string;
  }): Promise<Omit<BridgeQuote, 'tx'>[]> => {
    const { data } = await this.request.get('/v1/bridge/quote_list', {
      params,
    });
    return data;
  };

  getBridgeQuoteListV2 = async (params: {
    aggregator_id: string;
    user_addr: string;
    from_chain_id: string;
    from_token_id: string;
    from_token_raw_amount: string;
    to_chain_id: string;
    to_token_id: string;
  }): Promise<Omit<BridgeQuote, 'tx'>[]> => {
    const { data } = await this.request.get('/v2/bridge/quote_list', {
      params,
    });
    return data;
  };

  getBridgeQuote = async (params: {
    aggregator_id: string;
    bridge_id: string;
    user_addr: string;
    from_chain_id: string;
    from_token_id: string;
    from_token_raw_amount: string;
    to_chain_id: string;
    to_token_id: string;
  }): Promise<BridgeQuote> => {
    const { data } = await this.request.get('/v1/bridge/quote', {
      params,
    });
    return data;
  };

  getBridgeHistoryList = async (params: {
    user_addr: string;
    start: number;
    limit: number;
    is_all?: boolean;
  }): Promise<{ history_list: BridgeHistory[]; total_cnt: number }> => {
    const { data } = await this.request.get('/v1/bridge/history_list', {
      params,
    });
    return data;
  };

  buildBridgeTx = async (params: {
    aggregator_id: string;
    bridge_id: string;
    user_addr: string;
    from_chain_id: string;
    from_token_id: string;
    from_token_raw_amount: string;
    to_chain_id: string;
    to_token_id: string;
    slippage: string;
    quote_key: string;
  }): Promise<Tx> => {
    const { data } = await this.request.get('/v2/bridge/build_tx', {
      params,
    });
    return data;
  };

  postBridgeHistory = async (params: {
    aggregator_id: string;
    bridge_id: string;
    from_chain_id: string;
    from_token_id: string;
    from_token_amount: string | number;
    to_chain_id: string;
    to_token_id: string;
    to_token_amount: string | number;
    tx_id: string;
    tx: Tx;
    rabby_fee: number;
  }): Promise<{ success: boolean }> => {
    const { data } = await this.request.post('/v1/bridge/history', params);
    return data;
  };

  /**
   * no id just no check address
   */
  getPerpPermission = async (params: {
    id?: string;
  }): Promise<{
    has_permission: boolean;
  }> => {
    const { data } = await this.request.get(
      '/v1/user/has_hyperliquid_permission',
      {
        params,
      }
    );
    return data;
  };

  /**
   * @param params.dex_id - The ID of the DEX to get the top tokens for. If not provided, hyperliquid default DEXs will be included. if all is provided, all DEXs will be included.  and xyz is xyz dex tokens
   * @returns A list of top tokens for the given DEX.
   */
  getPerpTopTokenList = async (params: {
    dex_id?: string;
  }): Promise<PerpTopToken[]> => {
    const { data } = await this.request.get('/v1/token/hyperliquid_top', {
      params,
    });
    return data;
  };

  getPerpsBridgeIsSupportToken = async (params: {
    token_id: string;
    chain_id: string;
  }): Promise<{
    success: boolean;
  }> => {
    const { data } = await this.request.get(
      '/v2/bridge/hyperliquid/support_token',
      {
        params,
      }
    );
    return data;
  };

  getPerpBridgeQuote = async (params: {
    user_addr: string;
    from_chain_id: string;
    from_token_id: string;
    from_token_raw_amount: string;
  }): Promise<PerpBridgeQuote> => {
    const { data } = await this.request.get('/v2/bridge/hyperliquid/quote', {
      params,
    });
    return data;
  };

  postPerpBridgeHistory = async (params: {
    from_chain_id: string;
    from_token_id: string;
    from_token_amount: number;
    to_token_amount: number;
    tx_id: string;
    tx: Tx;
  }): Promise<{ success: boolean }> => {
    const { data } = await this.request.post('/v2/bridge/hyperliquid', params);
    return data;
  };

  getSupportedDEXList = async (): Promise<{ dex_list: string[] }> => {
    const { data } = await this.request.get('/v1/wallet/supported_dex_list');
    return data;
  };

  createDbkBridgeHistory = async (
    postData: Pick<
      DbkBridgeHistoryItem,
      | 'user_addr'
      | 'from_chain_id'
      | 'to_chain_id'
      | 'tx_id'
      | 'from_token_amount'
    >
  ): Promise<{ success: boolean }> => {
    const { data } = await this.request.post(
      '/v1/user/dbk/bridge_history',
      postData
    );
    return data;
  };

  getDbkBridgeHistoryList = async (params: {
    user_addr: string;
    start?: number;
    limit?: number;
  }): Promise<{
    page: { total: number; limit: number; start: number };
    data: DbkBridgeHistoryItem[];
  }> => {
    const { data } = await this.request.get(
      '/v1/user/dbk/bridge_history_list',
      {
        params,
      }
    );
    return data;
  };
  getGasAccountSignText = async (
    account_id: string
  ): Promise<{ text: string }> => {
    const { data } = await this.request.get('/v1/gas_account/sign_text', {
      params: {
        account_id,
      },
    });
    return data;
  };

  getGasAccountInfo = async (params: {
    sig: string;
    id: string;
  }): Promise<{
    account: GasAccountInfo;
  }> => {
    const { sig, ...others } = params;
    const { data } = await this.request.get('/v1/gas_account', {
      params: {
        ...others,
      },
      headers: {
        sig,
      },
    });
    return data;
  };

  getGasAccountInfoV2 = async (params: {
    id: string;
  }): Promise<{
    account: GasAccountInfo;
  }> => {
    const { data } = await this.request.get('/v2/gas_account', {
      params,
    });
    return data;
  };

  createGasAccountPayInfo = async (postData: {
    id: string;
  }): Promise<{
    account: GasAccountInfo;
  }> => {
    const { data } = await this.request.post(
      '/v2/gas_account/pay_info',
      postData
    );
    return data;
  };

  checkGasAccountGiftEligibility = async (params: {
    id: string;
  }): Promise<{
    has_eligibility: boolean;
    can_claimed_usd_value: number;
  }> => {
    const { data } = await this.request.get(
      '/v1/gas_account/check_eligibility',
      {
        params,
      }
    );
    return data;
  };

  checkGasAccountGiftEligibilityBatch = async (params: {
    ids: string[];
  }): Promise<GiftEligibilityItem[]> => {
    const { data } = await this.request.post(
      '/v1/gas_account/check_eligibility/batch',
      params
    );
    return data;
  };

  confirmIapOrder = async (postData: {
    transaction_id: string;
    device_type: 'android' | 'ios';
    product_id: string;
  }): Promise<{ req: TxRequest }> => {
    const { data } = await this.request.post(
      '/v1/gas_account/confirm_iap_order',
      postData
    );

    return data;
  };

  claimGasAccountGift = async (params: {
    sig: string;
    id: string;
  }): Promise<{
    success: boolean;
  }> => {
    const { sig, ...others } = params;
    const { data } = await this.request.post(
      '/v1/gas_account/claim',
      {
        ...others,
      },
      {
        headers: {
          sig,
        },
      }
    );
    return data;
  };

  loginGasAccount = async (params: {
    sig: string;
    account_id: string;
  }): Promise<{
    success: boolean;
  }> => {
    const { sig, ...others } = params;
    const { data } = await this.request.post(
      '/v1/gas_account/login',
      {
        ...others,
      },
      {
        headers: {
          sig,
        },
      }
    );
    return data;
  };

  logoutGasAccount = async (params: {
    sig: string;
    account_id: string;
  }): Promise<{
    success: boolean;
  }> => {
    const { sig, ...others } = params;
    const { data } = await this.request.post(
      '/v1/gas_account/logout',
      {
        ...others,
      },
      {
        headers: {
          sig,
        },
      }
    );
    return data;
  };

  getGasAccountTokenList = async (id: string): Promise<TokenItem[]> => {
    const { data } = await this.request.get('/v1/user/recharge_token_list', {
      params: {
        id,
      },
    });
    return data;
  };

  rechargeGasAccount = async (p: {
    sig: string;
    account_id: string;
    tx_id: string;
    chain_id: string;
    amount: number;
    user_addr: string;
    nonce: number;
  }): Promise<{
    success: boolean;
  }> => {
    const { sig, ...params } = p;
    const { data } = await this.request.post(
      '/v1/gas_account/recharge',
      params,
      {
        headers: {
          sig,
        },
      }
    );
    return data;
  };

  withdrawGasAccount = async (p: {
    sig: string;
    amount: number;
    account_id: string;
    user_addr: string;
    chain_id: string;
    fee: number;
  }): Promise<{
    success: boolean;
  }> => {
    const { sig, ...params } = p;
    const { data } = await this.request.post(
      '/v1/gas_account/withdraw',
      params,
      {
        headers: {
          sig,
        },
      }
    );
    return data;
  };

  getWithdrawList = async (p: {
    sig: string;
    id: string;
  }): Promise<WithdrawListAddressItem[]> => {
    const { sig, ...params } = p;
    const { data } = await this.request.get('/v1/gas_account/withdraw_list', {
      params,
      headers: {
        sig,
      },
    });
    return data;
  };

  getGasAccountHistory = async (p: {
    sig: string;
    account_id: string;
    start: number;
    limit: number;
  }): Promise<{
    recharge_list: {
      amount: number;
      chain_id: string;
      create_at: number;
      gas_account_id: string;
      tx_id: string;
      user_addr: string;
    }[];
    withdraw_list: {
      amount: number;
      chain_id: string;
      create_at: number;
      gas_account_id: string;
      tx_id: string;
      user_addr: string;
    }[];
    history_list: {
      id: string;
      chain_id: string;
      create_at: number;
      gas_cost_usd_value: number;
      gas_account_id: string;
      tx_id: string;
      usd_value: number;
      user_addr: string;
      history_type: 'tx' | 'recharge' | 'withdraw';
      source: string;
    }[];
    pagination: {
      limit: number;
      start: number;
      total: number;
    };
  }> => {
    const { sig, ...params } = p;

    const { data } = await this.request.get('/v1/gas_account/history', {
      params,
      headers: {
        sig,
      },
    });
    return data;
  };

  checkGasAccountTxs = async (p: {
    sig?: string;
    account_id: string;
    tx_list: Tx[];
  }): Promise<GasAccountCheckResult> => {
    const { sig, ...params } = p;
    const { data } = await this.request.post(
      '/v1/gas_account/check_txs',
      params,
      {
        headers: sig
          ? {
              sig,
            }
          : undefined,
      }
    );
    return data;
  };

  getGasAccountAml = async (id: string): Promise<{ is_risk: boolean }> => {
    const { data } = await this.request.get('/v1/gas_account/aml', {
      params: {
        id,
      },
    });
    return data;
  };

  parseCommon = async (params: {
    typed_data: Record<string, any>;
    origin: string;
    user_addr: string;
  }): Promise<ParseCommonResponse> => {
    const { data } = await this.request.post(
      '/v1/engine/action/parse_common',
      params
    );
    return data;
  };

  getRecommendBridgeToChain = async (params: {
    from_chain_id: string;
  }): Promise<{ to_chain_id: string }> => {
    const { data } = await this.request.get('/v2/bridge/recommend/to_chain', {
      params,
    });
    return data;
  };

  getRecommendFromToken = async (params: {
    user_addr: string;
    from_chain_id: string;
    from_token_id: string;
    from_token_amount: string;
    to_chain_id: string;
    to_token_id: string;
  }): Promise<{ token_list: TokenItem[] }> => {
    const { data } = await this.request.get(
      '/v2/bridge/recommend/from_token_list',
      {
        params,
      }
    );
    return data;
  };

  getBridgeToTokenList = async (params: {
    from_chain_id: string;
    to_chain_id: string;
    from_token_id?: string;
    q?: string;
    user_addr?: string;
  }): Promise<{
    token_list: (TokenItem & { trade_volume_24h: 'low' | 'middle' | 'high' })[];
  }> => {
    const { data } = await this.request.get(
      '/v2/bridge/recommend/to_token_list',
      {
        params,
      }
    );
    return data;
  };

  getBridgeQuoteV2 = async (params: {
    aggregator_id: string;
    user_addr: string;
    from_chain_id: string;
    from_token_id: string;
    from_token_raw_amount: string;
    to_chain_id: string;
    to_token_id: string;
    slippage: string;
  }): Promise<Omit<BridgeQuote, 'tx'>[]> => {
    const { data } = await this.request.get('/v2/bridge/quote_list', {
      params,
    });
    return data;
  };

  getBridgeQuoteTxV2 = async (params: {
    aggregator_id: string;
    bridge_id: string;
    user_addr: string;
    from_chain_id: string;
    from_token_id: string;
    from_token_raw_amount: string;
    to_chain_id: string;
    to_token_id: string;
    slippage: string;
  }): Promise<BridgeQuote> => {
    const { data } = await this.request.get('/v2/bridge/quote', {
      params,
    });
    return data;
  };

  isSameBridgeToken = async (params: {
    from_chain_id: string;
    from_token_id: string;
    to_chain_id: string;
    to_token_id: string;
  }): Promise<{ is_same: boolean; aggregator_id: string }[]> => {
    const { data } = await this.request.get('/v2/bridge/same_token', {
      params,
    });
    return data;
  };

  getBridgeSupportChainV2 = async (): Promise<string[]> => {
    const { data } = await this.request.get('/v2/bridge/supported_chains');
    return data;
  };

  submitFeedback = async ({
    text,
    usage,
  }: {
    text: string;
    /**
     * @description 'usage' is used to submit feedback on rating scene.
     * by default, it means 'uninstall' scene.
     */
    usage?: 'rating' /*  | 'uninstall' */;
  }): Promise<{ success: boolean }> => {
    const { data } = await this.request.post('v1/feedback', {
      text,
      ...(usage && { usage }),
    });
    return data;
  };

  uninstalledFeedback = async ({
    text,
  }: {
    text: string;
  }): Promise<{ success: boolean }> => {
    return this.submitFeedback({
      text,
    });
  };

  /**
   * @deprecated
   */
  getToken24hPrice = async (params: {
    chain_id: string;
    id: string;
  }): Promise<{ time_at: number; price: number }[]> => {
    const { data } = await this.request.get('/v1/token/24h_price', {
      params,
    });
    return data;
  };

  getTokenPriceCurve = async (params: {
    chain_id: string;
    id: string;
    days: number | 1 | 7;
  }): Promise<{ time_at: number; price: number }[]> => {
    const { data } = await this.request.get('/v1/token/price_curve', {
      params,
    });
    return data;
  };

  getTokenDatePrice = async (params: {
    chain_id: string;
    id: string;
  }): Promise<{ date_at: string; price: number }[]> => {
    const { data } = await this.request.get('/v1/token/date_price', {
      params,
    });
    return data;
  };

  searchTokens = async (params: { q: string }): Promise<TokenItem[]> => {
    const { data } = await this.request.get('/v1/token/search', {
      params,
    });
    return data;
  };

  searchTokensV2 = async (params: {
    q: string;
    chain_id?: string;
  }): Promise<TokenItemWithEntity[]> => {
    const { data } = await this.request.get('/v2/token/search', {
      params,
    });
    return data;
  };

  // resp arr of chain_id
  getCopyTradingChainList = async (): Promise<string[]> => {
    const { data } = await this.request.get('/v1/copytrading/chain_list');
    return data;
  };

  getCopyTradingTokenList = async (params: {
    chain_id: string;
    limit: number; // default 10 max 20
    start_time: number; // default 0
  }): Promise<CopyTradeTokenListResponse> => {
    const { data } = await this.request.get('/v1/copytrading/token/list', {
      params,
    });
    return data;
  };

  getCopyTradingTokenListV2 = async (params: {
    chain_id: string;
    limit: number; // default 10 max 20
    cursor: string;
    order_by: 'price_change' | 'buy_address_count' | 'token_create_at';
    order?: 'asc' | 'desc';
    time_range?: '24h' | '7d' | '30d';
  }): Promise<CopyTradeTokenListV2Response> => {
    const { data } = await this.request.get('/v2/copytrading/token/list', {
      params,
    });
    return data;
  };

  getCopyTradingRecentBuyList = async (params: {
    chain_id: string;
    token_id: string;
    limit: number; // default 10 max 20
  }): Promise<CopyTradeRecentBuyListResponse> => {
    const { data } = await this.request.get('/v1/copytrading/recent_buy/list', {
      params,
    });
    return data;
  };

  getCopyTradingRecentBuyListV2 = async (params: {
    chain_id: string;
    token_id: string;
    limit: number; // default 10 max 20
    cursor: string;
  }): Promise<CopyTradeRecentBuyListV2Response> => {
    const { data } = await this.request.get('/v2/copytrading/recent_buy/list', {
      params,
    });
    return data;
  };

  getCopyTradingDetail = async (params: {
    chain_id: string;
    token_id: string;
  }): Promise<CopyTradeTokenItemV2> => {
    const { data } = await this.request.get('/v2/copytrading/token/detail', {
      params,
    });
    return data;
  };

  getCopyTradingSameName = async (params: {
    chain_id: string;
    token_id: string;
  }): Promise<CopyTradeSameToken[]> => {
    const { data } = await this.request.get('/v1/token/same_name', {
      params,
    });
    return data;
  };

  getCopyTradingPnlList = async (params: {
    user_addr: string;
  }): Promise<CopyTradePnlListResponse> => {
    const { data } = await this.request.get(
      '/v1/copytrading/smart_money/pnl/list',
      {
        params,
      }
    );
    return data;
  };

  batchQueryTokens = async (uuids: string | string[]): Promise<TokenItem[]> => {
    const { data } = await this.request.get('/v1/token/list_by_uuids', {
      params: {
        uuids: Array.isArray(uuids) ? uuids.join(',') : uuids,
      },
    });

    return data;
  };

  getBuySupportedCountryList = async () => {
    const { data } = await this.request.get<BuyCountryItem[]>(
      '/v1/buy/supported_country_list'
    );
    return data;
  };
  getBuySupportedTokenList = async () => {
    const { data } = await this.request.get<
      (TokenItem & { currency_code: string })[]
    >('/v1/buy/supported_token_list');
    return data;
  };
  getBuyQuote = async (params: {
    country_code: string;
    user_addr: string;
    usd_amount: string;
    currency_code: string;
    receive_token_uuid: string;
  }) => {
    const { data } = await this.request.get<BuyQuoteItem[]>('/v1/buy/quote', {
      params,
    });
    return data;
  };
  getBuyWidgetUrl = async (params: {
    country_code: string;
    user_addr: string;
    usd_amount: string;
    receive_token_uuid: string;
    service_provider: string;
    currency_code: string;
    redirect_url?: string;
  }) => {
    const { data } = await this.request.get<{
      url: string;
      msg: number;
    }>('/v1/buy/get_widget_url', { params });
    return data;
  };

  getBuyHistory = async (params: {
    user_addr: string;
    start?: number;
    limit?: number;
  }) => {
    const { data } = await this.request.get<BuyHistoryList>('/v1/buy/history', {
      params: {
        ...params,
        start: params.start || 0,
        limit: params.limit || 20,
      },
    });
    return data;
  };
  getBuyPaymentMethods = async (params: {
    currency_code: string;
    country_code: string;
    service_provider: string;
  }): Promise<BuyPaymentMethod[]> => {
    const { data } = await this.request.get('/v1/buy/get_payment_method', {
      params,
    });
    return data;
  };

  getBuyCurrencyList = async () => {
    const { data } = await this.request.get<
      {
        id: string;
        name: string;
        image_url: string;
      }[]
    >('/v1/buy/supported_currency_list');
    return data;
  };

  getOfflineChainList = async () => {
    const { data } = await this.request.get<
      {
        id: string;
        offline_at: number;
      }[]
    >('/v1/chain/offline_list');
    return data;
  };

  isBlockedAddress = async (id: string) => {
    const { data } = await this.request.get<{
      is_blocked: boolean;
    }>('/v1/engine/addr/is_blocked', {
      params: { id },
    });
    return data;
  };

  estimateGasUsd = async ({
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
  }): Promise<{ gas_used?: number; safe_gas_used?: number }> => {
    const { data } = await this.request.post('/v1/wallet/estimate_gas', {
      tx,
      user_addr: address,
      origin,
      update_nonce: updateNonce,
      pending_tx_list,
    });

    return data;
  };
  getCexSupportList = async (): Promise<ProjectItem[]> => {
    const { data } = await this.request.get('/v1/cex/supported_list');
    return data;
  };
  getAppChainList = async (id: string): Promise<AppChainListResponse> => {
    const { data } = await this.request.get('/v1/user/complex_app_list', {
      params: { id },
    });
    return data;
  };
  checkCex = async (postData: {
    chain_id: string;
    id: string;
    cex_id: string;
  }): Promise<{ success: boolean }> => {
    const { data } = await this.request.post('/v1/token/check_cex', postData);
    return data;
  };
  // top 20 tokens
  getHotTokenList = async (): Promise<TokenDetailWithPriceCurve[]> => {
    const { data } = await this.request.get('/v1/token/hot_list');
    return data;
  };
  // uuid: 'chain:token_id'
  getTokensDetailByUuids = async (
    uuids: string[]
  ): Promise<TokenDetailWithPriceCurve[]> => {
    const { data } = await this.request.get('/v1/token/list_by_uuids', {
      params: {
        uuids: uuids.join(','),
      },
    });
    return data;
  };
  getTokenKlineData = async (params: {
    chain_id: string;
    token_id: string;
    interval: string;
    after_time_at?: number;
  }): Promise<{ data_list: KlineDataItem[] }> => {
    const { data } = await this.request.get('/v1/token/market/kline', {
      params,
    });
    return data;
  };
  getTokenMarketInfo = async (params: {
    chain_id: string;
    token_id: string;
  }): Promise<TokenMarketInfo> => {
    const { data } = await this.request.get('/v1/token/market/info', {
      params,
    });
    return data;
  };
  getTokenHolderInfo = async (params: {
    chain_id: string;
    token_id: string;
  }): Promise<TokenHolderInfo> => {
    const { data } = await this.request.get('/v1/token/market/info/holders', {
      params,
    });
    return data;
  };
  getTokenSupplyInfo = async (params: {
    chain_id: string;
    token_id: string;
  }): Promise<TokenSupplyInfo> => {
    const { data } = await this.request.get('/v1/token/market/info/supply', {
      params,
    });
    return data;
  };
  postUserFeedback = async (data: {
    title: string;
    image_url_list: string[];
    content: string;
    extra?: UserFeedbackItem['extra'];
  }): Promise<UserFeedbackItem> => {
    const { data: response } = await this.request.post(
      '/v1/feedback/app',
      data
    );
    return response;
  };

  getUserFeedback = async (id: string): Promise<UserFeedbackItem> => {
    const { data } = await this.request.get('/v1/feedback/app', {
      params: { id },
    });
    return data;
  };

  getUserFeedbackList = async (
    id: string | string[]
  ): Promise<UserFeedbackItem[]> => {
    const ids = Array.isArray(id) ? id : [id];
    const { data } = await this.request.post('/v1/feedback/app/list', {
      ids,
    });
    return data;
  };

  getCurrencyList = async (): Promise<CurrencyItem[]> => {
    const { data } = await this.request.get('/v1/currency/exchange_list');
    return data;
  };

  getMarketSummary = async ({
    token_id,
    chain_id,
  }: {
    token_id: string;
    chain_id: string;
  }): Promise<MarketSummary> => {
    const { data } = await this.request.get('/v1/token/market/summary', {
      params: {
        token_id,
        chain_id,
      },
    });
    return data;
  };

  getMarketTradingHistory = async (params: {
    token_id: string;
    chain_id: string;
    action?: 'buy' | 'sell';
    after_time_at?: number;
    limit?: number; // default 20 max 20
    cursor?: string;
  }): Promise<{
    pagination: {
      limit: number;
      has_next: boolean;
      next_cursor?: string;
    };
    data_list: MarketTradingHistoryItem[];
  }> => {
    const { data } = await this.request.get(
      '/v1/token/market/trading_history/list',
      {
        params,
      }
    );
    return data;
  };

  getTokenHolderSummary = async (params: {
    token_id: string;
    chain_id: string;
  }): Promise<TokenHolderSummary> => {
    const { data } = await this.request.get(
      '/v1/token/market/holders/summary',
      {
        params,
      }
    );
    return data;
  };

  // top 10 holders
  getTokenHolderList = async (params: {
    token_id: string;
    chain_id: string;
  }): Promise<{
    data_list: TokenHolderItem[];
  }> => {
    const { data } = await this.request.get('/v1/token/market/holders/list', {
      params,
    });
    return data;
  };

  // top 5
  getLiquidityPoolList = async (params: {
    token_id: string;
    chain_id: string;
  }): Promise<LiquidityPoolItem[]> => {
    const { data } = await this.request.get(
      '/v1/token/market/liquidity_pool/list',
      {
        params,
      }
    );
    return data;
  };

  getLiquidityPoolHistoryList = async (params: {
    token_id: string;
    chain_id: string;
    action?: 'add' | 'remove';
    limit?: number; // default 20 max 20
    cursor?: string;
  }): Promise<{
    pagination: {
      limit: number;
      has_next: boolean;
      next_cursor?: string;
    };
    data_list: LiquidityPoolHistoryItem[];
  }> => {
    const { data } = await this.request.get(
      '/v1/token/market/liquidity_pool/history/list',
      {
        params,
      }
    );
    return data;
  };

  getNFTTradingConfig = async (): Promise<NFTTradingConfig> => {
    const { data } = await this.request.get('/v1/nft/trading_config');
    return data;
  };

  getNFTDetail = async (params: {
    chain_id: string;
    id: string;
    user_addr: string;
  }): Promise<NFTDetail> => {
    const { data } = await this.request.get('/v1/nft', {
      params,
    });
    return data;
  };

  getNFTListingOrders = async (params: {
    maker: string;
    chain_id: string;
    collection_id: string;
    inner_id: string;
    limit?: number;
    cursor?: string;
  }): Promise<NFTListingResponse> => {
    const { data } = await this.request.get('/v1/nft/order/listing', {
      params,
    });
    return data;
  };

  getNFTFees = async (params: {
    chain_id: string;
    collection_id: string;
    inner_id: string;
  }): Promise<{
    marketplace_fees: {
      recipient: string;
      fee: number;
      required: boolean;
    }[];
    custom_royalties: {
      recipient: string;
      fee: number;
      required: boolean;
    }[];
  }> => {
    const { data } = await this.request.get('/v1/nft/fee', {
      params,
    });
    return data;
  };

  prepareListingNFT = async (postData: {
    maker: string;
    chain_id: string;
    collection_id: string;
    inner_id: string;
    wei_price: string;
    quantity?: number;
    marketplace_fees: {
      recipient: string;
      fee: number;
    }[];
    custom_royalties: {
      recipient: string;
      fee: number;
    }[];
    listing_time_at?: number;
    expiration_time_at?: number;
    currency: string;
    salt?: string;
  }): Promise<PrepareListingNFTResponse> => {
    const { data } = await this.request.post(
      '/v1/nft/order/listing/prepare',
      postData
    );
    return data;
  };

  createListingNFT = async (postData: {
    chain_id: string;
    order: PrepareListingNFTResponse['data']['post']['body']['order'];
    signature: string;
    protocol_address?: string;
  }): Promise<CreateListingNFTOfferResponse> => {
    const { data } = await this.request.post(
      '/v1/nft/order/listing/post',
      postData
    );
    return data;
  };

  prepareAcceptNFTOffer = async (postData: {
    chain_id: string;
    order_hash: string;
    fulfiller: string;
    collection_id: string;
    inner_id: string;
    quantity?: number;
    include_optional_creator_fees?: boolean;
  }): Promise<PrepareAcceptNFTOfferResponse> => {
    const { data } = await this.request.post(
      '/v1/nft/order/offer/accept/prepare',
      postData
    );
    return data;
  };

  submitAcceptNFTOfferTx = async (postData: {
    tx_id: string;
    data: Tx;
  }): Promise<{ success: boolean }> => {
    const { data } = await this.request.post(
      '/v1/nft/order/offer/accept/tx',
      postData
    );
    return data;
  };

  checkTokenDepositForbidden = async (params: {
    chain_id: string;
    id: string;
    user_addr: string;
    to_addr: string;
  }): Promise<{
    msg: string;
  }> => {
    const { data } = await this.request.get(
      '/v1/engine/token/deposit_forbidden',
      {
        params,
      }
    );
    return data;
  };

  getPolyMarketPermission = async (params: {
    id?: string;
  }): Promise<{
    has_permission: boolean;
  }> => {
    const { data } = await this.request.get(
      'v1/user/has_polymarket_permission',
      {
        params,
      }
    );
    return data;
  };

  getDappPermission = async (params: {
    id?: string;
    dapp: string;
  }): Promise<{
    has_permission: boolean;
  }> => {
    const { data } = await this.request.get('v1/user/has_dapp_permission', {
      params,
    });
    return data;
  };
}
