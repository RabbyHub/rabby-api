import { OpenApiService } from '../src';
import { genSignParams, INITIAL_OPENAPI_URL, SIGN_HDS } from '../src/utils';
import mockAxios from 'jest-mock-axios';

const MOCK_HF =
  'chrome-extension://obkcgnighkbncpmikckhjejibagknpee/bridge.html';

describe('rabby-api', () => {
  let service: OpenApiService;
  beforeEach(() => {
    service = new OpenApiService({
      store: {
        host: INITIAL_OPENAPI_URL,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockAxios.reset();
  });

  it('init', async () => {
    await service.init(MOCK_HF);
    expect(service.ethRpc).toBeDefined();
  });

  it('request: get', async () => {
    const catchFn = jest.fn();
    const thenFn = jest.fn();

    await service.init(MOCK_HF);

    service.getRecommendChains('0x', 'origin').then(thenFn).catch(catchFn);

    expect(mockAxios.get).toHaveBeenCalledWith('/v1/wallet/recommend_chains', {
      params: {
        origin: 'origin',
        user_addr: '0x',
      },
    });

    const req = (await mockAxios.lastReqGet()) as any;
    expect(req.headers).toMatchObject({
      'x-api-nonce': expect.any(String),
      'x-api-sign': expect.any(String),
      'x-api-ts': expect.any(String),
      'x-api-ver': expect.any(String),
    });
  });

  it('request: post', async () => {
    const catchFn = jest.fn();
    const thenFn = jest.fn();

    await service.init(MOCK_HF);

    service
      .ethRpc('1', {
        origin: 'https://google.com',
        method: 'call',
        params: [],
      })
      .then(thenFn)
      .catch(catchFn);

    expect(mockAxios.post).toHaveBeenCalledWith(
      '/v1/wallet/eth_rpc?origin=https://google.com&method=call',
      {
        chain_id: '1',
        method: 'call',
        params: [],
      },
      undefined
    );

    const req = (await mockAxios.lastReqGet()) as any;
    expect(req.headers).toMatchObject({
      'x-api-nonce': expect.any(String),
      'x-api-sign': expect.any(String),
      'x-api-ts': expect.any(String),
      'x-api-ver': expect.any(String),
    });
  });
});

describe('utils', () => {
  it('SIGN_HDS', () => {
    expect(SIGN_HDS).toEqual([
      'x-api-ts',
      'x-api-nonce',
      'x-api-ver',
      'x-api-sign',
    ]);
  });

  it('genSignParams:GET', () => {
    expect(
      genSignParams({
        method: 'get',
        url: 'https://api.rabby.io/v1/wallet/recommend_chains?origin=https%3A%2F%2Fgoogle.com&user_addr=0x',
      })
    ).toEqual({
      method: 'GET',
      url: 'https://api.rabby.io/v1/wallet/recommend_chains',
      params: {
        origin: 'https://google.com',
        user_addr: '0x',
      },
    });
  });

  it('genSignParams:POST', () => {
    expect(
      genSignParams({
        method: 'post',
        url: 'https://api.rabby.io/v1/wallet/eth_rpc?origin=https%3A%2F%2Fgoogle.com&method=call',
        data: {
          chain_id: '1',
          method: 'call',
          params: [],
        },
      })
    ).toEqual({
      method: 'POST',
      url: 'https://api.rabby.io/v1/wallet/eth_rpc',
      params: {
        origin: 'https://google.com',
        method: 'call',
      },
    });
  });
});
