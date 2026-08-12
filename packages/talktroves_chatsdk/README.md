# TalkTroves Chat SDK (React Native)

Visitor chat widget for React Native — floating Support launcher, live chat panel, Socket.IO + HTTP polling.

## Install

```bash
npm install talktroves_chatsdk
# or
yarn add talktroves_chatsdk
```

## Usage

```tsx
import React from 'react';
import { View } from 'react-native';
import { TalktrovesChatSDK } from 'talktroves_chatsdk';

TalktrovesChatSDK.init({
  baseUrl: 'https://App.talktroves.com',
  tenantId: 'YOUR_TENANT_ID',
  domain: 'App.talktroves.com',
  title: 'Support',
  isMobile: true,
});

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      {/* Your app content */}
      <TalktrovesChatSDK.Host />
    </View>
  );
}
```

## Demo config

```tsx
TalktrovesChatSDK.init(TalktrovesChatSDK.demoConfig());
```

## Headless service

```tsx
const service = TalktrovesChatSDK.createService();
await service.start();
service.subscribe((event) => { /* ... */ });
await service.sendMessage('Hello');
```
