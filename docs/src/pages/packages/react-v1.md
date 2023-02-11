---
layout: ../../layouts/Layout.astro
title: react-v1
description: Reatom for react-v1
---

This is compatible package witch allow you to use `@reatom/core-v1` with react. All docs is [here](https://reatom.js.org/#/packages/react).

## Setup batching for old React

For React 16 and 17 you need to setup batching by yourself in the root fo your app

For `react-dom`

```js
import { unstable_batchedUpdates } from "react-dom";
import { setupBatch } from "@reatom/react-v1";

setupBatch(unstable_batchedUpdates)``;
```

For `react-native`

```js
import { unstable_batchedUpdates } from "react-native";
import { setupBatch } from "@reatom/react-v1";

setupBatch(unstable_batchedUpdates)``;
```
