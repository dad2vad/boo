import {
  Action,
  addToSetsMap,
  Atom,
  AtomsCache,
  Cache,
  callSafety as originalCallSafety,
  createReatomError,
  createTemplateCache as originalCreateTemplateCache,
  createTransaction,
  delFromSetsMap,
  Effect,
  isAction,
  isAtom,
  isFunction,
  Patch,
  Store,
} from "@reatom/core-v2";

export type TestStore = Store & {
  setState: <T>(
    atom: Atom<T>,
    newState: T
  ) => Action<{ atom: Atom<T>; newState: T }>;
};

export type StoreOnError = Parameters<Store[`onError`]>[0];
export type StoreOnPatch = Parameters<Store[`onPatch`]>[0];

function isCacheFresh(atom: Atom, getCache: Store["getCache"]): boolean {
  const cache = getCache(atom);

  if (cache.tracks === undefined) return false;

  // @ts-expect-error
  if (cache.listeners?.size > 0) return true;

  const stack = [cache.tracks];
  while (stack.length > 0) {
    const deps = stack.pop()!;
    for (let i = 0; i < deps.length; i++) {
      const dep = deps[i];
      if (dep != getCache(dep.atom)) return false;
      stack.push(dep.tracks);
    }
  }

  return true;
}

export function createTestStore({
  callSafety = originalCallSafety,
  createTemplateCache = originalCreateTemplateCache,
  onError,
  onPatch,
  now = Date.now.bind(Date),
}: {
  callSafety?: typeof originalCallSafety;
  createTemplateCache?: typeof originalCreateTemplateCache;
  onError?: StoreOnError;
  onPatch?: StoreOnPatch;
  /** Current time getter. Tip: use `performance.now` to accurate tracking */
  now?: typeof Date.now;
  // TODO:
  // createTransaction
} = {}): TestStore {
  const setStateType = `createTestStore.setState`;
  const atomsByAction = new Map<Action["type"], Set<Atom>>();
  const cache: AtomsCache = new WeakMap();
  let errorHandlers: Array<Parameters<Store[`onError`]>[0]> = [];
  let patchHandlers: Array<Parameters<Store[`onPatch`]>[0]> = [];

  if (onError) errorHandlers.push(onError);
  if (onPatch) patchHandlers.push(onPatch);

  function invalidateAtomCache(atom: Atom) {
    if (isAtom(atom)) {
      if (!isCacheFresh(atom, store.getCache)) {
        store.dispatch({
          type: `invalidate ${atom.id} [~${Math.random()}]`,
          payload: null,
          targets: [atom],
        });
      }
    } else {
      throw createReatomError(`passed thing is not an atom`);
    }
  }

  const dispatch: Store["dispatch"] = (action, causes) => {
    const start = now();

    const actions = Array.isArray(action) ? action : [action];

    if (actions.length == 0 || !actions.every(isAction)) {
      throw createReatomError(`dispatch arguments`);
    }

    const patch: Patch = new Map();
    const effects: Array<Effect> = [];
    const transaction = createTransaction(actions, {
      patch,
      getCache,
      effects,
      causes,
    });
    const getTransactionResult = () => ({
      actions,
      patch,
      causes: causes ?? [],
      start,
      end: now(),
    });

    const actionsForMocking = actions
      .filter((action) => action.type === setStateType)
      .map(({ payload: { atom, newState } }) => ({ atom, newState }));

    actionsForMocking.forEach(({ atom, newState }) => {
      patch.set(
        atom,
        Object.assign(
          {},
          cache.get(atom) ?? (createTemplateCache(atom) as Cache),
          {
            state: newState,
          }
        )
      );
    });

    try {
      actions.forEach(({ type, targets }) => {
        targets?.forEach((atom) => transaction.process(atom));
        atomsByAction.get(type)?.forEach((atom) => transaction.process(atom));
        actionsForMocking.forEach(({ atom }) => {
          atomsByAction
            .get(atom.types[0])
            ?.forEach((atom) => transaction.process(atom));
        });
      });

      patch.forEach((atomPatch, atom) => cache.set(atom, atomPatch));
    } catch (error) {
      const patchResult = getTransactionResult();
      errorHandlers.forEach((cb) => cb(error, patchResult));
      throw error;
    }

    const patchResult = getTransactionResult();
    patchHandlers.forEach((cb) => cb(patchResult));

    effects.forEach((cb) => callSafety(cb, dispatch));
  };

  const getCache: Store["getCache"] = (atom, fallback) =>
    cache.get(atom) ?? fallback ?? createTemplateCache(atom);

  const getState: Store["getState"] = (atom) => {
    invalidateAtomCache(atom);

    return getCache(atom).state!;
  };

  const subscribe: Store["subscribe"] = (atom, cb) => {
    if (!isFunction(cb)) {
      throw createReatomError(`subscribe callback is not a function`);
    }

    invalidateAtomCache(atom);

    const cache = getCache(atom);

    // @ts-expect-error
    const listeners: Set<AtomListener> = (cache.listeners ??= new Set());

    if (listeners.size == 0) {
      atom.types.forEach((type) => addToSetsMap(atomsByAction, type, atom));
    }

    listeners.add(cb);

    callSafety(cb, cache.state!, []);

    return () => {
      listeners.delete(cb);
      if (listeners.size == 0) {
        atom.types.forEach((type) => delFromSetsMap(atomsByAction, type, atom));
      }
    };
  };

  const store: TestStore = {
    dispatch,
    getCache,
    getState,
    onError(cb) {
      errorHandlers.push(cb);
      return () => (errorHandlers = errorHandlers.filter((el) => el !== cb));
    },
    onPatch(cb) {
      patchHandlers.push(cb);
      return () => (patchHandlers = patchHandlers.filter((el) => el !== cb));
    },
    subscribe,
    setState: (atom, newState) => ({
      type: setStateType,
      payload: { atom, newState },
    }),
  };

  return store;
}
