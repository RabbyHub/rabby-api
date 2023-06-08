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
  Protocol,
  ComplexProtocol,
  ExplainTypedDataResponse,
  SwapTradeList,
  SlippageStatus,
  CEXQuote,
  Summary,
  Cex,
  ContractCredit,
  AddrDescResponse,
  ParseTxResponse,
  CollectionWithFloorPrice,
} from './types';

interface OpenApiStore {
  host: string;
}

interface Options {
  store: OpenApiStore;
  adapter?: AxiosAdapter;
}

const maxRPS = 500;

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
      config.headers[SIGN_HDS[0]] = encodeURIComponent(res.ts);
      config.headers[SIGN_HDS[1]] = encodeURIComponent(res.nonce);
      config.headers[SIGN_HDS[2]] = encodeURIComponent(res.version);
      config.headers[SIGN_HDS[3]] = encodeURIComponent(res.signature);

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

  getCachedTokenList = async (id: string): Promise<TokenItem[]> => {
    const { data } = await this.request.get('/v1/user/cache_token_list', {
      params: {
        id,
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
    addr: string
  ): Promise<{ timestamp: number; usd_value: number }[]> => {
    const { data } = await this.request.get('/v1/user/total_net_curve', {
      params: {
        id: addr,
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

  // 授权风险敞口
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
}
