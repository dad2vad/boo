import { AtomCache, AtomProto, Ctx, Fn, Rec, __root } from "@reatom/core";

export interface unstable_ChangeMsg {
  newState?: any;
  oldState?: any;
  payload?: any;
  patch: AtomCache;
  cause?: string;
  history: Array<AtomCache>;
  param?: any;
  [k: `param${number}`]: any;
}
export interface LogMsg {
  error: undefined | Error;
  changes: Rec<unstable_ChangeMsg>;
  logs: Array<AtomCache>;
  ctx: Ctx;
}

export const getCause = (patch: AtomCache) => {
  let log = "";
  let cause: typeof patch.cause = patch;

  while (cause.cause !== null && cause.cause.proto !== __root) {
    if (log.length > 0) log += " <-- ";
    log += (cause = cause.cause).proto.name ?? "unnamed";
  }

  return log || "root";
};

const getTimeStampDefault = () => {
  let ms: number | string = new Date().getMilliseconds();
  ms = ms.toString().padStart(3, "0");
  return `${new Date().toLocaleTimeString()} ${ms}ms`;
};

export const createLogBatched = ({
  debounce = 500,
  getTimeStamp = getTimeStampDefault,
  limit = 5000,
  log = console.log,
}: {
  debounce?: number;
  getTimeStamp?: () => string;
  limit?: number;
  log?: typeof console.log;
} = {}) => {
  let queue: Array<LogMsg & { time: string }> = [];
  let isBatching = false;
  let batchingStart = Date.now();
  const logBatched = (msg: LogMsg) => {
    if (Object.keys(msg.changes).length === 0) return;

    if (!isBatching) {
      isBatching = true;
      batchingStart = Date.now();
    }

    setTimeout(
      (length) => {
        isBatching =
          queue.length !== length && Date.now() - batchingStart < limit;

        if (isBatching) return;

        const isFewTransactions = queue.length > 0;

        console.groupCollapsed(
          length ? `Reatom ${length} transactions` : `Reatom transaction`
        );
        for (const { changes, time, error } of queue) {
          console.log(
            `%c transaction ${time} end`,
            "padding-right: 1ch; border-bottom: 1px solid currentcolor; box-sizing: border-box;"
          );

          if (error) console.error(error);

          let inGroup = false;
          Object.entries(changes).forEach(([k, change], i, arr) => {
            const name = k.replace(/(\d)*\./, "");
            const head = name.replace(/\..*/, "");
            const nextK = arr[i + 1]?.[0];
            const nextName = nextK?.replace(/(\d)*\./, "");
            const isGroup = nextName?.startsWith(head);
            if (!inGroup && isGroup && isFewTransactions) {
              inGroup = true;
              // TODO show name?
              console.groupCollapsed(head);
            }
            const title = `%c ${name}`;
            const isAction = "payload" in change;
            const data = isAction ? change!.payload : change!.newState;
            const color = isAction
              ? "background: #ffff80; color: #151134;"
              : "background: #151134; color: white;";
            log(
              title,
              `${color}font-size: 1.1em; padding: 0.15em;  padding-right: 1ch;`,
              "\n",
              data,
              "\n",
              change
            );

            if (!isGroup && inGroup) {
              inGroup = false;
              console.groupEnd();
            }
          });
        }
        console.groupEnd();
        queue = [];
      },
      debounce,
      queue.push(Object.assign(msg, { time: getTimeStamp() }))
    );
  };

  return logBatched;
};

// export const log = action((ctx, message: any, name?: string) => ({
//   message,
//   name,
// }), '@reatom/logger.log')

// declare global {
//   REATOM_LOG: typeof log
// }

// globalThis.REATOM_LOG = log

export const connectLogger = (
  ctx: Ctx,
  {
    historyLength = 10,
    log = createLogBatched(),
    showCause = true,
    skip = () => false,
    skipUnnamed = true,
  }: {
    historyLength?: number;
    log?: Fn<[LogMsg]>;
    showCause?: boolean;
    skipUnnamed?: boolean;
    skip?: (patch: AtomCache) => boolean;
  } = {}
) => {
  const history = new WeakMap<AtomProto, Array<AtomCache>>();
  let read: Fn<[AtomProto], undefined | AtomCache>;
  ctx.get((r) => (read = r));

  return ctx.subscribe((logs, error) => {
    const states = new WeakMap<AtomProto, any>();
    const changes = logs.reduce((acc, patch, i) => {
      const { proto, state } = patch;
      const { isAction } = proto;
      let { name } = proto;

      if (skip(patch)) return acc;

      if (!name || name.startsWith("_") || /\._/.test(name)) {
        if (skipUnnamed) return acc;
        name ??= "unnamed";
      }

      const oldCache = read(proto);
      const oldState = states.has(proto) ? states.get(proto) : oldCache?.state;
      states.set(proto, state);

      const isConnection =
        !oldCache &&
        patch.cause!.proto.name === "root" &&
        (!isAction || state.length === 0);

      if (isConnection || Object.is(state, oldState)) {
        return acc;
      }

      let atomHistory = history.get(proto) ?? [];
      if (historyLength) {
        atomHistory = atomHistory.slice(0, historyLength - 1);
        atomHistory.unshift(isAction ? { ...patch, state: [...state] } : patch);
        history.set(proto, atomHistory);
      }

      const changeMsg: unstable_ChangeMsg = (acc[`${i + 1}.${name}`] = {
        patch,
        history: atomHistory,
      });

      if (isAction) {
        const call = state.at(-1) as { params: Array<any>; payload: any };
        changeMsg.payload = call.payload;
        if (call.params.length <= 1) {
          changeMsg.param = call.params[0];
        } else
          call.params.forEach((param, i) => {
            changeMsg[`param${i + 1}`] = param;
          });
      } else {
        changeMsg.newState = state;
        changeMsg.oldState = oldState;
      }
      changeMsg.patch = patch;
      if (showCause) changeMsg.cause = getCause(patch);

      return acc;
    }, {} as LogMsg["changes"]);

    log({
      error,
      changes,
      logs,
      ctx,
    });
  });
};
