import { CHAINS_ENUM } from '@debank/common';

export interface Chain {
  id: number;
  name: string;
  hex: string;
  logo: string;
  enum: CHAINS_ENUM;
  serverId: string;
  network: string;
  nativeTokenSymbol: string;
  whiteLogo?: string;
  nativeTokenLogo: string;
  nativeTokenAddress: string;
  scanLink: string;
  nativeTokenDecimals: number;
  selectChainLogo?: string;
  eip: Record<string, boolean>;
}

export interface ServerChain {
  id: string;
  community_id: number;
  name: string;
  native_token_id: string;
  logo_url: string;
  wrapped_token_id: string;
  symbol: string;
  is_support_history: boolean;
}

export interface ChainWithBalance extends ServerChain {
  usd_value: number;
}

export interface ChainWithPendingCount extends ServerChain {
  pending_tx_count: number;
}

export type SecurityCheckDecision =
  | 'pass'
  | 'warning'
  | 'danger'
  | 'forbidden'
  | 'loading'
  | 'pending';

export interface SecurityCheckItem {
  alert: string;
  description: string;
  is_alert: boolean;
  decision: SecurityCheckDecision;
  id: number;
}

export interface SecurityCheckResponse {
  decision: SecurityCheckDecision;
  alert: string;
  danger_list: SecurityCheckItem[];
  warning_list: SecurityCheckItem[];
  forbidden_list: SecurityCheckItem[];
  forbidden_count: number;
  warning_count: number;
  danger_count: number;
  alert_count: number;
  trace_id: string;
  error?: {
    code: number;
    msg: string;
  } | null;
}

export interface Tx {
  chainId: number;
  data: string;
  from: string;
  gas?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
  nonce: string;
  to: string;
  value: string;
  r?: string;
  s?: string;
  v?: string;
}

export interface Eip1559Tx {
  chainId: number;
  data: string;
  from: string;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  nonce: string;
  to: string;
  value: string;
  r?: string;
  s?: string;
  v?: string;
}

export interface TotalBalanceResponse {
  total_usd_value: number;
  chain_list: ChainWithBalance[];
}

export interface TokenItem {
  content_type?: 'image' | 'image_url' | 'video_url' | 'audio_url' | undefined;
  content?: string | undefined;
  inner_id?: any;
  amount: number;
  chain: string;
  decimals: number;
  display_symbol: string | null;
  id: string;
  is_core: boolean;
  is_verified: boolean;
  is_wallet: boolean;
  is_scam?: boolean;
  is_suspicious?: boolean;
  is_infinity?: boolean;
  logo_url: string;
  name: string;
  optimized_symbol: string;
  price: number;
  symbol: string;
  time_at: number;
  usd_value?: number;
  raw_amount?: number;
  raw_amount_hex_str?: string;
}

export interface TransferingNFTItem {
  chain: string;
  collection: {
    id: string;
    name: string;
    create_at: number;
    chains: string[];
  };
  content: string;
  content_type: NFTItem['content_type'];
  contract_id: string;
  description: string | null;
  detail_url: string;
  id: string;
  inner_id: string;
  name: string;
  total_supply: number;
  amount: number;
}

export interface NFTApprovalResponse {
  tokens: NFTApproval[];
  contracts: NFTApprovalContract[];
  total: string;
}

export interface NFTApprovalContract {
  chain: string;
  contract_name: string;
  contract_id: string;
  amount: string;
  spender: Spender;
  is_erc721: boolean;
  is_erc1155: boolean;
}

export interface NFTApprovalSpender {
  id: string;
  protocol: {
    id: string;
    name: string;
    logo_url: string;
    chain: string;
  } | null;
}

export interface NFTApproval {
  id: string;
  contract_id: string;
  inner_id: string;
  chain: string;
  name: null;
  symbol: string;
  description: null;
  content_type: 'image' | 'image_url' | 'video_url' | 'audio_url' | undefined;
  content: string;
  total_supply: number;
  detail_url: string;
  contract_name: string;
  is_erc721: boolean;
  is_erc1155: boolean;
  amount: string;
  spender: Spender;
}

export interface TokenApproval {
  id: string;
  name: string;
  symbol: string;
  logo_url: string;
  chain: string;
  price: number;
  balance: number;
  spenders: Spender[];
  sum_exposure_usd: number;
  exposure_balance: number;
}

export interface Spender {
  id: string;
  value: number;
  exposure_usd: number;
  protocol: {
    id: string;
    name: string;
    logo_url: string;
    chain: string;
  };
  is_contract: boolean;
  is_open_source: boolean;
  is_hacked: boolean;
  is_abandoned: boolean;
  risk_alert: string;
  risk_level: string;
}

export interface AssetItem {
  id: string;
  chain: string;
  name: string;
  site_url: string;
  logo_url: string;
  has_supported_portfolio: boolean;
  tvl: number;
  net_usd_value: number;
  asset_usd_value: number;
  debt_usd_value: number;
}
export interface NFTCollection {
  create_at: string;
  id: string;
  is_core: boolean;
  name: string;
  price: number;
  chain: string;
  tokens: NFTItem[];
  floor_price: number;
  is_scam: boolean;
  is_suspicious: boolean;
  is_verified: boolean;
}

export interface UserCollection {
  collection: Collection;
  list: NFTItem[];
}
export interface NFTItem {
  chain: string;
  id: string;
  contract_id: string;
  inner_id: string;
  token_id: string;
  name: string;
  contract_name: string;
  description: string;
  usd_price: number;
  amount: number;
  collection_id?: string;
  pay_token: {
    id: string;
    name: string;
    symbol: string;
    amount: number;
    logo_url: string;
    time_at: number;
    date_at?: string;
    price?: number;
  };
  content_type: 'image' | 'image_url' | 'video_url' | 'audio_url';
  content: string;
  detail_url: string;
  total_supply?: string;
  collection?: Collection | null;
  is_erc1155?: boolean;
  is_erc721: boolean;
}

export interface Collection {
  id: string;
  name: string;
  description: null | string;
  logo_url: string;
  is_core: boolean;
  contract_uuids: string[];
  create_at: number;
  floor_price: number;
  is_scam: boolean;
  is_suspicious: boolean;
  is_verified: boolean;
}

export interface TxDisplayItem extends TxHistoryItem {
  projectDict: TxHistoryResult['project_dict'];
  cateDict: TxHistoryResult['cate_dict'];
  tokenDict: TxHistoryResult['token_dict'];
}
export interface TxHistoryItem {
  cate_id: string | null;
  chain: string;
  debt_liquidated: null;
  id: string;
  is_scam: boolean;
  other_addr: string;
  project_id: null | string;
  receives: {
    amount: number;
    from_addr: string;
    token_id: string;
  }[];
  sends: {
    amount: number;
    to_addr: string;
    token_id: string;
  }[];
  time_at: number;
  token_approve: {
    spender: string;
    token_id: string;
    value: number;
  } | null;
  tx: {
    eth_gas_fee: number;
    from_addr: string;
    name: string;
    params: any[];
    status: number;
    to_addr: string;
    usd_gas_fee: number;
    value: number;
  } | null;
}
export interface TxHistoryResult {
  cate_dict: Record<string, { id: string; name: string }>;
  history_list: TxHistoryItem[];
  project_dict: Record<
    string,
    {
      chain: string;
      id: string;
      logo_url: string;
      name: string;
    }
  >;
  token_dict: Record<string, TokenItem>;
}
export interface GasResult {
  estimated_gas_cost_usd_value: number;
  estimated_gas_cost_value: number;
  estimated_gas_used: number;
  estimated_seconds: number;
  front_tx_count: number;
  max_gas_cost_usd_value: number;
  max_gas_cost_value: number;
  fail?: boolean;
}

export interface GasLevel {
  level: string;
  price: number;
  front_tx_count: number;
  estimated_seconds: number;
  base_fee: number;
}

export interface BalanceChange {
  error?: {
    code: number;
    msg: string;
  } | null;
  receive_nft_list: TransferingNFTItem[];
  receive_token_list: TokenItem[];
  send_nft_list: TransferingNFTItem[];
  send_token_list: TokenItem[];
  success: boolean;
  usd_value_change: number;
}
interface NFTContractItem {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  is_core: boolean;
  time_at: number;
  collection: {
    id: string;
    name: string;
    create_at: number;
  };
}
export interface ExplainTxResponse {
  pre_exec_version: 'v0' | 'v1' | 'v2';
  abi?: {
    func: string;
    params: Array<string[] | number | string>;
  };
  abi_str?: string;
  balance_change: BalanceChange;
  gas: {
    success?: boolean;
    error?: {
      code: number;
      msg: string;
    } | null;
    gas_used: number;
    gas_limit: number;
    estimated_gas_cost_usd_value: number;
    estimated_gas_cost_value: number;
    estimated_gas_used: number;
    estimated_seconds: number;
  };
  native_token: TokenItem;
  pre_exec: {
    success: boolean;
    error?: {
      code: number;
      msg: string;
    } | null;
  };
  recommend: {
    gas: string;
    nonce: string;
  };
  support_balance_change: true;
  type_call?: {
    action: string;
    contract: string;
    contract_protocol_logo_url: string;
    contract_protocol_name: string;
  };
  type_send?: {
    to_addr: string;
    token_symbol: string;
    token_amount: number;
    token: TokenItem;
  };
  type_token_approval?: {
    spender: string;
    spender_protocol_logo_url: string;
    spender_protocol_name: string;
    token_symbol: string;
    token_amount: number;
    is_infinity: boolean;
    token: TokenItem;
  };
  type_cancel_token_approval?: {
    spender: string;
    spender_protocol_logo_url: string;
    spender_protocol_name: string;
    token_symbol: string;
  };
  type_cancel_tx?: any; // TODO
  type_deploy_contract?: any; // TODO
  is_gnosis?: boolean;
  gnosis?: ExplainTxResponse;
  type_cancel_single_nft_approval?: {
    spender: string;
    spender_protocol_name: null;
    spender_protocol_logo_url: string;
    token_symbol: null;
    is_nft: boolean;
    nft: NFTItem;
  };
  type_cancel_nft_collection_approval?: {
    spender: string;
    spender_protocol_name: string;
    spender_protocol_logo_url: string;
    token_symbol: string;
    is_nft: boolean;
    nft_contract: NFTContractItem;
    token: TokenItem;
  };
  type_nft_collection_approval?: {
    spender: string;
    spender_protocol_name: string;
    spender_protocol_logo_url: string;
    token_symbol: string;
    is_nft: boolean;
    nft_contract: NFTContractItem;
    token: TokenItem;
    token_amount: number;
    is_infinity: boolean;
  };
  type_single_nft_approval?: {
    spender: string;
    spender_protocol_name: string;
    spender_protocol_logo_url: string;
    token_symbol: string;
    is_nft: boolean;
    nft: NFTItem;
    token: TokenItem;
    token_amount: number;
    is_infinity: boolean;
  };
  type_nft_send?: {
    spender: string;
    spender_protocol_name: null;
    spender_protocol_logo_url: string;
    token_symbol: string;
    token_amount: number;
    is_infinity: boolean;
    is_nft: boolean;
    nft: NFTItem;
  };
  type_list_nft?: {
    action: string;
    contract: string;
    contract_protocol_logo_url: string;
    contract_protocol_name: string;
    offerer: string;
    total_usd_value: number;
    offer_list: {
      item_type: number;
      amount: number;
      nft: NFTItem;
    }[];
    buyer_list: { id: string }[];
  };
}

export interface RPCResponse<T> {
  result: T;
  id: number;
  jsonrpc: string;
  error?: {
    code: number;
    message: string;
  };
}

export interface GetTxResponse {
  blockHash: string;
  blockNumber: string;
  from: string;
  gas: string;
  gasPrice: string;
  hash: string;
  input: string;
  nonce: string;
  to: string;
  transactionIndex: string;
  value: string;
  type: string;
  v: string;
  r: string;
  s: string;
  front_tx_count: number;
  code: 0 | -1; // 0: success, -1: failed
  status: -1 | 0 | 1; // -1: failed, 0: pending, 1: success
  gas_used: number;
  token: TokenItem;
}

export interface ApprovalStatus {
  chain: string;
  token_approval_danger_cnt: number;
  nft_approval_danger_cnt: number;
}

export interface UsedChain {
  id: string;
  community_id: number;
  name: string;
  native_token_id: string;
  logo_url: string;
  wrapped_token_id: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  site_url: string;
  logo_url: string;
}

export interface PoolItem {
  id: string;
  chain: string;
  project_id: string;
  adapter_id: string;
  controller: string;
  time_at: number;
}

export interface PortfolioItem {
  asset_token_list: TokenItem[];
  stats: {
    asset_usd_value: number;
    debt_usd_value: number;
    net_usd_value: number;
  };
  asset_dict: Record<string, number>;
  update_at: number;
  name: number;
  detail_types: string[];
  detail: {
    supply_token_list: TokenItem[];
    reward_token_list: TokenItem[];
    borrow_token_list: TokenItem[];
  };
  proxy_detail: {
    project: ProjectItem;
    proxy_contract_id: string;
  };
  pool: PoolItem;
  position_index: string;
}

export interface Protocol {
  chain: string;
  dao_id: null | string;
  has_supported_portfolio: boolean;
  id: string;
  is_tvl: boolean;
  logo_url: string;
  name: string;
  platform_token_id: string;
  site_url: string;
  tag_ids: string[];
  tvl: number;
}

export interface ComplexProtocol {
  id: string;
  chain: string;
  name: string;
  site_url: string;
  logo_url: string;
  has_supported_portfolio: boolean;
  tvl: number;
  portfolio_item_list: PortfolioItem[];
}

export interface ExplainTypedDataResponse {
  type_list_nft?: ExplainTxResponse['type_list_nft'];
  type_token_approval?: ExplainTxResponse['type_token_approval'];
  type_common_sign?: {
    contract: string;
    contract_protocol_logo_url?: string;
    contract_protocol_name?: string;
  };
}
export interface CEXQuote {
  pay_token: TokenItem;
  receive_token: TokenItem;
}
export interface SwapItem {
  chain: string;
  tx_id: string;
  create_at: number;
  finished_at: number;
  status: 'Pending' | 'Completed' | 'Finished';
  dex_id: string;
  pay_token: TokenItem;
  receive_token: TokenItem;
  gas: {
    native_token: TokenItem;
    native_gas_fee: number;
    usd_gas_fee: number;
    gas_price: number;
  };
  quote: {
    pay_token_amount: number;
    receive_token_amount: number;
    slippage: number;
  };
  actual: {
    pay_token_amount: number;
    receive_token_amount: number;
    slippage: number;
  };
}

export interface SwapTradeList {
  history_list: SwapItem[];
  total_cnt: number;
}

export interface SlippageStatus {
  is_valid: boolean;
  suggest_slippage: number;
}

export interface SummaryToken {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  display_symbol?: string;
  optimized_symbol: string;
  decimals: number;
  logo_url?: string;
  protocol_id: string;
  price: number;
  is_verified: boolean;
  is_core: boolean;
  is_wallet: boolean;
  time_at?: number;
  amount: number;
}

export interface SummaryCoin {
  id: string;
  symbol: string;
  logo_url: string;
  parent_coin_id?: string;
  token_uuids: string[];
  peg_token_uuids: string[];
  circulating_supply: number;
  total_supply: number;
  price: number;
  amount: number;
}

export interface Summary {
  token_list: SummaryToken[];
  coin_list: SummaryCoin[];
}

export interface Cex {
  id: string;
  logo_url: string;
  name: string;
  is_deposit: boolean;
}

export interface ContractCredit {
  value: null | number;
  popularity_level: 'very_low' | 'low' | 'medium' | 'high';
  rank_at: number | null;
}

export interface ContractDesc {
  multisig?: {
    id: string;
    logo_url: string;
    name: string;
  };
  create_at: number;
}

export interface AddrDescResponse {
  desc: {
    cex?: Cex;
    contract?: Record<string, ContractDesc>;
    usd_value: number;
    protocol?: Record<string, { id: string; logo_url: string; name: string }>;
    born_at: number;
    is_danger: boolean | null;
    is_spam: boolean | null;
    name: string;
  };
}

export interface SendAction {
  to: string;
  token: TokenItem;
}

export interface ApproveAction {
  spender: string;
  token: TokenItem;
}

export interface SwapReceiveToken extends TokenItem {
  min_amount: number;
}

export interface SwapAction {
  pay_token: TokenItem;
  receive_token: SwapReceiveToken;
  receiver: string;
}
export interface SendNFTAction {
  to: string;
  nft: NFTItem;
}

export interface ApproveNFTAction {
  spender: string;
  nft: NFTItem;
}

export type RevokeNFTAction = ApproveNFTAction;

export interface ApproveNFTCollectionAction {
  spender: string;
  collection: NFTCollection;
}

export type RevokeNFTCollectionAction = ApproveNFTCollectionAction;
export interface ParseTxResponse {
  action: {
    type: string;
    data:
      | SwapAction
      | ApproveAction
      | SendAction
      | SendNFTAction
      | ApproveNFTAction
      | RevokeNFTAction
      | ApproveNFTCollectionAction
      | RevokeNFTCollectionAction
      | null;
  };
  contract_call?: {
    func: string;
    contract: {
      id: string;
      protocol: {
        name: string;
        logo_url: string;
      };
    };
  };
}

export interface CollectionWithFloorPrice {
  id: string;
  name: string;
  floor_price: number;
}
