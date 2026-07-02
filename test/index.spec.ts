import mockAxios from 'jest-mock-axios';

import { OpenApiService } from '../src';
import { genSignParams, INITIAL_OPENAPI_URL } from '../src/utils';
import { SIGN_HDS } from '../src/const';
import { WebSignApiPlugin } from '../src/plugins/web-sign';

const MOCK_HF =
  'chrome-extension://obkcgnighkbncpmikckhjejibagknpee/bridge.html';

describe('rabby-api', () => {
  let service: OpenApiService;
  beforeEach(() => {
    service = new OpenApiService({
      store: {
        host: INITIAL_OPENAPI_URL,
        apiKey: null,
        apiTime: null,
      },
      plugin: WebSignApiPlugin,
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
      }
    );

    const req = (await mockAxios.lastReqGet()) as any;
    expect(req.headers).toMatchObject({
      'x-api-nonce': expect.any(String),
      'x-api-sign': expect.any(String),
      'x-api-ts': expect.any(String),
      'x-api-ver': expect.any(String),
    });
  });

  it('client feedback APIs', async () => {
    const catchFn = jest.fn();

    await service.init(MOCK_HF);

    const messageData = {
      device_id: 'dev-123',
      content: 'transfer failed',
      image_url_list: ['https://static.debank.com/image/feedback/a.png'],
      extra: {
        version: '1.0.0',
      },
    };
    service.postClientFeedbackMessage(messageData).catch(catchFn);
    service
      .getClientFeedbackMessages({
        device_id: 'dev-123',
        start: 0,
        limit: 20,
      })
      .catch(catchFn);
    service.getClientFeedbackUnread({ device_id: 'dev-123' }).catch(catchFn);

    const file = new Blob(['image'], { type: 'image/png' });
    service
      .uploadClientFeedback({
        file,
        filename: 'feedback.png',
      })
      .catch(catchFn);

    expect(mockAxios.post).toHaveBeenNthCalledWith(
      1,
      '/v1/client_feedback/message',
      messageData
    );
    expect(mockAxios.get).toHaveBeenNthCalledWith(
      1,
      '/v1/client_feedback/messages',
      {
        params: {
          device_id: 'dev-123',
          start: 0,
          limit: 20,
        },
      }
    );
    expect(mockAxios.get).toHaveBeenNthCalledWith(
      2,
      '/v1/client_feedback/unread',
      {
        params: {
          device_id: 'dev-123',
        },
      }
    );

    const uploadCall = (mockAxios.post as jest.Mock).mock.calls[1];
    expect(uploadCall[0]).toBe('/v1/client_feedback/upload');
    expect(uploadCall[1]).toBeInstanceOf(FormData);
  });

  it('staking APIs', async () => {
    const catchFn = jest.fn();

    await service.init(MOCK_HF);

    service
      .getStakingPoolList({
        q: 'eth',
        chain_id: 'eth',
        protocol_id: 'lido',
        user_addr: '0x',
        holding_only: true,
        start: 0,
        limit: 20,
        order_by: 'tvl',
        order: 'desc',
      })
      .catch(catchFn);
    service.getStakingFilterList({ user_addr: '0x' }).catch(catchFn);
    service
      .getStakingPool({ pool_id: 'eth_lido', user_addr: '0x' })
      .catch(catchFn);
    service
      .getStakingPoolCurve({ pool_id: 'eth_lido', metric: 'apr' })
      .catch(catchFn);

    expect(mockAxios.get).toHaveBeenNthCalledWith(1, '/v1/staking/pool_list', {
      params: {
        q: 'eth',
        chain_id: 'eth',
        protocol_id: 'lido',
        user_addr: '0x',
        holding_only: true,
        start: 0,
        limit: 20,
        order_by: 'tvl',
        order: 'desc',
      },
    });
    expect(mockAxios.get).toHaveBeenNthCalledWith(
      2,
      '/v1/staking/filter_list',
      {
        params: {
          user_addr: '0x',
        },
      }
    );
    expect(mockAxios.get).toHaveBeenNthCalledWith(3, '/v1/staking/pool', {
      params: {
        pool_id: 'eth_lido',
        user_addr: '0x',
      },
    });
    expect(mockAxios.get).toHaveBeenNthCalledWith(4, '/v1/staking/pool_curve', {
      params: {
        pool_id: 'eth_lido',
        metric: 'apr',
      },
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
