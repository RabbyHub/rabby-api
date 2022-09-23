# rabby-api

## Install

```bash
npm install rabby-api @debank/common
```

## Usage

```ts
import { OpenApiService } from 'rabby-api';

const service = new OpenApiService({
  store: {
    host: 'https://api.rabby.io'
  }
});

// init service
await service.init();

// call api
await service.getTotalBalance('0x1234');
```
