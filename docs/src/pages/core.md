---
layout: ../layouts/Layout.astro
title: core
description: The ultimate state manager
---

Tiny, efficient, featured and extensible core to handle reactivity right. The ultimate state manager. Build easily anything, from a small widget to a huge application.

> included in [@reatom/framework](/packages/framework)

[Main introduction]().

The raw API description is [below](#api).

## Installation

```sh
npm i @reatom/core
```

## Usage

Reatom allows you to describe both super dumb and extremely complex logic by a three main things: **atoms** for data storing, **actions** for logic processing, **context** (`ctx`) for system isolation.

Reatom is inspired by React and Redux architecture. All processed data should be [immutable](https://developer.mozilla.org/en-US/docs/Glossary/Immutable), computations should be pure. All side effects should be scheduled for a separate effects queue by `ctx.schedule(callback)`. Only consistent data transaction applying. All prerequisites you could check in this article: [What is a state manager](/general/what-is-state-manager).

```ts
import { createCtx, action, atom } from "@reatom/core";

// create context in the app root
const ctx = createCtx();

// define your base mutable data references
// by passing a primitive initial values
const searchAtom = atom("");
const isSearchingAtom = atom(false);
const goodsAtom = atom<Array<Goods>>([]);

// define computed atoms to infer data
// with smart and optimized caching
const tipAtom = atom((ctx) => {
  // read and subscribe by `spy`
  const goodsCount = ctx.spy(goodsAtom).length;

  if (goodsCount === 0) {
    // read without subscribing by `get`
    return ctx.get(searchAtom) ? "Nothing found" : "Try to search something";
  }
  if (goodsCount === 1) {
    return `We found one treasure`;
  }
  return `Found ${goodsCount} goods`;
});

// define your actions to handle any IO and work with atoms
const onSearch = action((ctx, event) => {
  // mutate base atoms by passing relative ctx and the new state
  searchAtom(ctx, event.currentTarget.value);
});
const fetchGoods = action((ctx) => {
  const search = ctx.get(searchAtom);
  // [OPTIONAL] get your services from the context
  const api = ctx.get(apiAtom);

  // all sync updates inside action automatically batched
  // and dependent computations will call after the action callback return
  isSearchingAtom(ctx, true);

  // schedule side-effects
  // which will be called after successful execution of all computations
  const promise = ctx.schedule(async () => {
    const goods = await api.getGoods(search);

    // pass a callback to `get` to batch a few updates inside async resolve
    ctx.get(() => {
      isSearchingAtom(ctx, false);
      goodsAtom(ctx, goods);
    });
  });

  // returned promise could be handled in place of the action call
  return promise;
});
```

As you can see, most passed callbacks in Reatom units accepts `ctx` by the first argument - it is a main convention, which allow you to not use imports and write more clean. Some advanced helpers could extends or redefine ctx for additional features typesafety, so when you will need it, there will no feature code changes.

```ts
// subscribe to your atoms
ctx.subscribe(tipAtom, (tip) => {
  document.getElementById("goods-tip").innerText = tip;
});
// handle user interactions by your actions
document.getElementById("search-input").addEventListener("input", (event) => {
  onSearch(ctx, event);
});
// log all things
ctx.subscribe((logs) => {
  console.log(logs);
});
```

> Do you want to see next [the docs for React adapter](https://reatom.dev/packages/npm-react)?

Use Reatom ecosystem to made your code clean and readable

```ts
import { onUpdate } from "@reatom/hooks";

onUpdate(searchAtom, fetchGoods);
```

### Action handling (advanced)

It is better to stay atoms stupid and handle all logic inside action. But sometimes you need to turn direction of your code coupling and make atom depends from an action. And you could do it!

Action is an atom with a temporal state, which array of all passed payloads. This state is clearing after transaction end, if you will try to `get` or `spy` action which wasn't called you will receive an empty array. But if action was called, the array will contain some elements.

```ts
// ~/modules/someFlow
import { newMessage } from "~/modules/ws";

const FLOW_NAME = "someFlow";

export const someFlowAtom = atom(0);

// you need to subscribe to it to start watching `newMessage`
export const someFlowManagerAtom = atom((ctx) => {
  console.log("example log for `ctx.get(newMessage)`", ctx.get(newMessage));

  ctx.spy(newMessage).forEach(({ payload }) => {
    if (payload.relation === FLOW_NAME) someFlowAtom(ctx, payload);

    console.log("example log for `ctx.spy(newMessage)[N]`.payload", payload);
  });
});

// socket service:
socket.on(
  throttle(150, (msgs) =>
    // batch  updates
    ctx.get(() => {
      msgs.forEach((msg) => newMessage(ctx, msg));
    })
  )
);

// someFlowManagerAtom reducer:
// example log for `ctx.get(newMessage)` [{ params: [1], payload: 1 }, { params: [2], payload: 2 }]
// example log for `ctx.spy(newMessage)[N]` 1
// example log for `ctx.spy(newMessage)[N]` 2
```

> You need to know one **rare** tricky thing. If during transaction you will call an action and will read it dependent atom a few time step by step, `ctx.get` will return the whole array of all passed payload, but `ctx.spy` will return array with only new elements, which wasn't handled in this reducer during this transaction. And to made this rare case correct you should spying your dependencies in same way each time, without conditions. In other words, for this case your dependencies list should be static.

## API

### `atom` API

```ts
import { atom } from "@reatom/core";
```

`atom` function is a fabric for an atom - base reactive primitive. Atom don't store it data (state, listeners, dependencies) in itself, it only key to a cache in [ctx](#ctx-api) (context). You may imagine atom as a prototype for a cache. One of the most powerful Reatom feature is that a cache is immutable, it recreates on each relative update. Cache immutability helps to process [transactions](#transaction-api) and it super handy for debugging. Don't worry, it is pretty [efficient](https://reatom.dev#performance).

As atom is a key, it should be mapped somewhere to it cache. `ctx` has internal [WeakMap](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap) `caches`, which store your data until you have a link to atom. When you subscribe (connect) and unsubscribe (disconnect) from atom the state isn't reseted or deleted, it still stored in cache, which will cleared by GC only after link to the atom disappears from you closures. This behavior is most intuitive and works just like any variable storing. So, if you define global atom available in a few your modules the state will always persists in memory during application lifetime, neither you subscribed or unsubscribed for the atom, which is useful. If you need to clear state on disconnect or doing other lifetime transformations check the [hooks package](https://reatom.dev/packages/hooks) and [withreset](/packages/lens#withreset) helper.

If you need to create base mutable atom just pass the initial value to `atom`. Pass the atom name by a second argument (it is optional, but strongly recommended). Resulted atom will be mutable (`Mut`) with a callable signature (a function), you could mutate it by passing context and new value or reducer function.

```ts
// create
const countAtom = atom(0, "countAtom");
// countAtom: AtomMut<number>

// mutate by setter
countAtom(ctx, 10);
// updates and return 10

// mutate by reducer
countAtom(ctx, (state) => state + 1);
// updates and return 11
```

**All atom state changes should be immutable**.

```ts
export const listAtom = atom([], "listAtom");
// add item
listAtom(ctx, (list) => [...list, newItem]);
```

You could create a computed derived atoms by passing a function to `atom`. First argument of passed reducer is special kind of `ctx` with `spy` function, which allow you to subscribe to passed atom and receive it fresh state. Second argument is a previous `state` and it optional, you could initiate it by defining a default value.

> TypeScript users note. It is impossible to describe reducer type with optional generic state argument, which is returned from the function. If you use the second `state` argument you should define it type, do not rely on return type.

```ts
const isCountEvenAtom = atom(
  (ctx) => ctx.spy(countAtom) % 2 === 0,
  "isCountEven"
);
// isCountEvenAtom: Atom<number>
```

> To store a function in reatom state just wrap it to a container, like `atom({ fn })`.

Reatom allows you to use native language features to describe your conditions, all reactive dependencies reconnecting in a real time.

```ts
export const currencyAtom = atom<"us" | "eu">("us");
export const rateAtom = atom(1);
export const usCurrencyAtom = atom(0);
export const euCurrencyAtom = atom(0);
export const currencyValueAtom = atom((ctx) => {
  const currency = ctx.spy(currencyAtom);
  // use `if` or `switch` if you want
  const valueAtom = { us: usCurrencyAtom, eu: euCurrencyAtom }[currency];
  return ctx.spy(valueAtom);
});
```

Moreover, you could dynamically create and manage atoms.

```ts
const currencyAtom = atom("us");
const currenciesAtom = atom({ us: atom(0) });
export const currencyValueAtom = atom((ctx) => {
  const currency = ctx.spy(currencyAtom);
  let valueAtom = ctx.spy(currenciesAtom)[currency];

  if (!valueAtom) {
    valueAtom = atom(0);
    currenciesAtom(ctx, (state) => ({
      ...state,
      [currency]: valueAtom,
    }));
  }

  return ctx.spy(valueAtom);
});

// update could look like
ctx.get(currenciesAtom)[ctx.get(currencyAtom)](ctx, newValue);
```

### `atom.pipe` API

Pipe is a general chain helper, it applies an operator to the atom to map it to another thing. Classic operator interface is `<T extends Atom>(options?: any) => (anAtom: T) => aNewThing`.

```ts
const doubleCountAtom = atom(0).pipe(
  mapState((ctx, state) => state * 1),
  withStateHistory(1)
);
// equals to
const doubleCountAtom = withStateHistory(1)(
  mapState((ctx, state) => state * 1)(atom(0))
);
```

> `withStateHistory` adds additional `historyAtom` to store previous states and `mapState` operator creates new atom to compute a new state. Check naming conventions and more examples in [this guild](/guides/naming#operator-prefix).

Chain operator is just a more prettier way to apply decorations

```ts
// ugly for a few decorators, the applying order is less obvious
const doubleCountAtom = withStateHistory(
  1,
  mapState((ctx, state) => state * 1, atom(0))
);
```

Btw, actions has `pipe` too!

### `action` API

Actions is atom with temporal state, which lives only during transaction. Action state is array of params and payload. Array needed to handle a few actions call during transaction batch. Action callback could mutate atoms or call other actions, but their dependencies will be notified only after the callback end - it is what batch mean.

Possible usage:

```ts
const increment = action();
// increment: Action<[], void>
const increment = action("increment");
// increment: Action<[], void>

const add = action<number>();
// add: Action<[number], number>
const add = action<number>("add");
// add: Action<[number], number>
const add = action((ctx, value: number) => value);
// add: Action<[number], number>
const add = action((ctx, value: number) => value, "add");
// add: Action<[number], number>
const splice = action((ctx, start: number, deleteCount?: number) => {
  listAtom(ctx, (list) => {
    const newList = list.slice(0);
    newList.splice(start, deleteCount);
    return newList;
  });
});
// splice: Action<[number, number?], number>
```

Action state is `Array<{ params: Array<any>, payload: any }>`, but action call returns the payload:

```ts
const submit = action((ctx, name, password) => ({ name, password }));

ctx.get(() => {
  submit(ctx, "Joe", "Bom");
  // { name: 'Joe', password: 'Bom' }

  submit(ctx, "Koe", "Rog");
  // { name: 'Koe', password: 'Rog' }

  ctx.get(submit);
  // [{ name: 'Joe', password: 'Bom' }, { name: 'Koe', password: 'Rog' }]
});
```

### `ctx` API

#### `ctx.get` atom API

Get fresh atom state

`get<T>(anAtom: Atom<T>): T`

#### `ctx.get` batch API

Start transaction and batch all updates, same as in action call

`get<T>(cb: () => T): T`

#### `ctx.subscribe` atom API

Subscribe to atom new state

`subscribe<T>(anAtom: Atom<T>, cb: (newState: T) => void): () => void`

#### `ctx.subscribe` log API

Subscribe to transaction end. Useful for logging.

`subscribe(cb: (logs: Array<AtomCache>, error?: Error) => void): () => void`

### `ctx.schedule`

To archive [atomicity](/general/what-is-state-manager#state) each update (action call / atom mutation) starts complex batch operation, which trying to optimize your updates and collect them to new immutable [log](#ctx.subscribe-log-API) of new immutable caches snapshot. If some computation throw an error (like `can't use property of undefined`) whole updates will be canceled, otherwise new caches will be merged to context internal `caches` weak map. To archive pureness of computations and ability to cancel it all side-effects should be called separately in different queue, after all computation. Here is `schedule` come, it accept effect callback and returns a promise which will be resolved after effect call or rejected if transaction will fall.

```ts
const fetchData = action((ctx) => {
  loadingAtom(ctx, true);
  ctx.schedule(effect).then((data) => {
    loadingAtom(ctx, false);
    dataAtom(ctx, data);
  });
});
```

The unique feature of Reatom and the schedule specially is ability to define the target queue. The second argument of `schedule` is a priority number:

- `-1` - rollback queue, useful when you need to do a side-effect during pure computations. Check example [below](#ctxschedule-rollback-api).
- `0` - computations queue, schedule **pure** computation, which will call right after current batch.
- `1` - the **default** near effect queue, used to schedule regular effects. This effects calling could be redefined (delayed) in `callNearEffect` option of `createCtx`
- `2` - lates effect queue, used to schedule subscribers. This effects calling could be redefined (delayed) in `callLateEffect` option of `createCtx`.

### `ctx.schedule` rollback API

Sometimes you want to do a side-effect during clean calculations or need to store some artifact of an effect and store it. To made it clean you should describe a rollback (cleanup) function for case of unexpected error by passing `-1` as a second of `ctx.schedule`. Check this example with a debounced action:

```ts
const timeoutIdAtom = atom(-1);

// `timeoutIdAtom` update is in a schedule cause an extra transaction - not handy
export const doSome = action((ctx) => {
  const timeoutId = ctx.get(timeoutIdAtom);

  ctx.schedule(() => {
    clearTimeout(timeoutId);
    const newTimeoutId = setTimeout(some);
    timeoutIdAtom(ctx, newTimeoutId);
  });
});
// `timeoutIdAtom` update is during transaction more obvious
export const doSome = action((ctx) => {
  const timeoutId = ctx.get(timeoutIdAtom);
  ctx.schedule(() => clearTimeout(timeoutId));

  const newTimeoutId = setTimeout(some);
  timeoutIdAtom(ctx, newTimeoutId);
  ctx.schedule(() => clearTimeout(newTimeoutId), -1);
});
```
