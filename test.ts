import { OpenApiService } from './src';
import { INITIAL_OPENAPI_URL } from './src/utils';
import mockAxios from 'jest-mock-axios';

describe('rabby-api', () => {
  let service: OpenApiService;
  beforeEach(() => {
    service = new OpenApiService({
      store: {
        host: INITIAL_OPENAPI_URL
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockAxios.reset();
  });

  it(' should be defined "__rb_is"', () => {
    expect(global.__rb_is()).toEqual(true);
  });

  it('init', async () => {
    await service.init();
    expect(service.ethRpc).toBeDefined();
  });

  it('request', async () => {
    const catchFn = jest.fn();
    const thenFn = jest.fn();

    await service.init();

    service.getRecommendChains('0x', 'origin').then(thenFn).catch(catchFn);

    expect(mockAxios.get).toHaveBeenCalledWith('/v1/wallet/recommend_chains', {
      params: {
        origin: 'origin',
        user_addr: '0x'
      }
    });

    const req = mockAxios.lastReqGet() as any;
    expect(req.headers).toMatchObject({
      'x-api-nonce': expect.any(String),
      'x-api-sign': expect.any(String),
      'x-api-ts': expect.any(Number),
      'x-api-ver': expect.any(String)
    });
  });
});
