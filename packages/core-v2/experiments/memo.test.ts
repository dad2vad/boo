import { test } from "uvu";
import * as assert from "uvu/assert";

import { createTransaction } from "@reatom/core-v2";
import { createPrimitiveAtom } from "@reatom/core/primitives";

import { isShallowEqual, memo } from "./memo";

test(``, () => {
  const setAtom = createPrimitiveAtom(new Set());
  const setMemoAtom = createPrimitiveAtom(new Set(), null, {
    decorators: [memo((a, b) => isShallowEqual([...a], [...b]))],
  });

  const setCache = setAtom(
    createTransaction([setAtom.change((set) => new Set(set).add(1))])
  );
  const setMemoCache = setMemoAtom(
    createTransaction([setMemoAtom.change((set) => new Set(set).add(1))])
  );

  assert.is.not(
    setCache.state,
    setAtom(
      createTransaction([setAtom.change((set) => new Set(set).add(1))]),
      setCache
    ).state
  );
  assert.is(
    setMemoCache.state,
    setMemoAtom(
      createTransaction([setMemoAtom.change((set) => new Set(set).add(1))]),
      setMemoCache
    ).state
  );
  `👍`; //?
});

test.run();
