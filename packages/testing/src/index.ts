import {
  Action,
  Atom,
  AtomCache,
  AtomProto,
  createCtx,
  Ctx,
  CtxOptions,
  Fn,
  isAtom,
  throwReatomError,
  Unsubscribe,
} from "@reatom/core";

export function mockFn<I extends any[], O>(
  fn: (...input: I) => O = (...i: any) => void 0 as any
) {
  const _fn = Object.assign(
    function (...i: I) {
      try {
        // @ts-ignore
        var o = fn.apply(this, i);
      } catch (error) {
        // @ts-ignore
        _fn.calls.push({ i, o: error });

        throw error;
      }

      _fn.calls.push({ i, o });

      return o;
    },
    {
      calls: new Array<{ i: I; o: O }>(),
      lastInput(index = 0): I[number] {
        const { length } = _fn.calls;
        if (length === 0) throw new TypeError(`Array is empty`);
        return _fn.calls[length - 1]!.i[index];
      },
    }
  );

  return _fn;
}

export const getDuration = async (cb: () => void) => {
  const start = Date.now();
  await cb();
  return Date.now() - start;
};

export interface TestCtx extends Ctx {
  mock<T>(anAtom: Atom<T>, fallback: T): Unsubscribe;

  mockAction<T>(anAction: Action<any[], T>, cb: Fn<[Ctx], T>): Unsubscribe;

  subscribeTrack<T, F extends Fn<[T]>>(
    anAtom: Atom<T>,
    cb?: F
  ): F & {
    unsubscribe: Unsubscribe;
    calls: ReturnType<typeof mockFn<[T], any>>["calls"];
    lastInput: ReturnType<typeof mockFn<[T], any>>["lastInput"];
  };
}

export const createTestCtx = (options?: CtxOptions): TestCtx => {
  const ctx = createCtx(options);
  const { get } = ctx;
  const mocks = new Map<AtomProto, any>();
  const actionMocks = new Map<AtomProto, Fn<[Ctx, ...any[]]>>();

  return Object.assign(ctx, {
    get(value: Atom | Fn) {
      if (isAtom(value)) {
        // @ts-expect-error
        return get.call(ctx, value);
      }
      return get.call(ctx, (read, actualize) =>
        value(read, (ctx: Ctx, proto: AtomProto, mutator: Fn) => {
          if (mocks.has(proto)) {
            mutator = (patchCtx: Ctx, patch: AtomCache) => {
              const state = mocks.get(proto);
              patch.state = proto.isAction ? state.slice() : state;
            };
          }
          if (actionMocks.has(proto)) {
            mutator = (patchCtx: Ctx, patch: AtomCache) => {
              patch.state = [
                ...patch.state,
                { params: [], payload: actionMocks.get(proto)!(ctx) },
              ];
            };
          }

          return actualize!(ctx, proto, mutator);
        })
      );
    },
    subscribeTrack(anAtom: Atom, cb: Fn = () => {}): any {
      const track = Object.assign(mockFn(cb), cb);
      const unsubscribe = ctx.subscribe(anAtom, track);

      return Object.assign(track, { unsubscribe });
    },
    mock<T>(anAtom: Atom<T>, fallback: T) {
      const proto = anAtom.__reatom;
      let read: Fn;

      get((_read, actualize) => {
        read = _read;
        actualize!(ctx, proto, (patchCtx: Ctx, patch: AtomCache) => {
          patch.state = fallback;
          // disable computer
          patch.pubs = [ctx.cause];
        });
        mocks.set(proto, fallback);
      });

      return () => {
        read(proto).pubs = [];
        mocks.delete(proto);
      };
    },
    mockAction<I extends any[], O>(
      anAction: Action<I, O>,
      cb: Fn<[Ctx, ...I], O>
    ) {
      const proto = anAction.__reatom;

      throwReatomError(!proto.isAction, "action expected");

      actionMocks.set(proto, cb as Fn<[Ctx, ...any[]]>);

      return () => actionMocks.delete(proto);
    },
  });
};
