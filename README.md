# rabby-api

## Install

```bash
npm install @rabby-wallet/rabby-api @debank/common
```

## Usage

```ts
import { OpenApiService } from '@rabby-wallet/rabby-api';
import { WebSignApiPlugin } from '@rabby-wallet/rabby-api/dist/plugins/web-sign.ts';

const service = new OpenApiService({
  store: {
    host: 'https://api.rabby.io',
  },
  // you can also customize plugin as you requirement
  plugin: WebSignApiPlugin,
});

// init service
await service.init();

// call api
await service.getTotalBalance('0x1234');
```
