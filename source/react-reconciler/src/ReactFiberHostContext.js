/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactFiber';
import type {StackCursor} from './ReactFiberStack';
import type {Container, HostContext} from './ReactFiberHostConfig';

import invariant from 'shared/invariant';

import {getChildHostContext, getRootHostContext} from './ReactFiberHostConfig';
import {createCursor, push, pop} from './ReactFiberStack';

declare class NoContextT {}
const NO_CONTEXT: NoContextT = ({}: any);

let contextStackCursor: StackCursor<HostContext | NoContextT> = createCursor(
  NO_CONTEXT,
);
let contextFiberStackCursor: StackCursor<Fiber | NoContextT> = createCursor(
  NO_CONTEXT,
);
let rootInstanceStackCursor: StackCursor<Container | NoContextT> = createCursor(
  NO_CONTEXT,
);

function requiredContext<Value>(c: Value | NoContextT): Value {
  invariant(
    c !== NO_CONTEXT,
    'Expected host context to exist. This error is likely caused by a bug ' +
      'in React. Please file an issue.',
  );
  return (c: any);
}

/**
 * 获取根宿主容器
 * @returns {T}
 */
function getRootHostContainer(): Container {
  const rootInstance = requiredContext(rootInstanceStackCursor.current);
  return rootInstance;
}

/**
 * 将宿主 dom 实例存入栈
 * 1. 将宿主 dom 实例存入栈 rootInstanceStackCursor
 * 2. 将宿主 dom 实例对应的 fiber 存入栈 contextFiberStackCursor
 * 3. 将宿主 dom 实例对应的上下文（namespace）存入栈 contextStackCursor
 * @param fiber
 * @param nextRootInstance
 */
function pushHostContainer(fiber: Fiber, nextRootInstance: Container) {
  // Push current root instance onto the stack;
  // This allows us to reset root when portals are popped.
  // 将当前 root 实例推入堆栈;
  // 这允许我们在弹出 portals 时重置根目录。
  push(rootInstanceStackCursor, nextRootInstance, fiber);
  // Track the context and the Fiber that provided it.
  // This enables us to pop only Fibers that provide unique contexts.
  // 跟踪上下文和提供上下文的 Fiber。
  // 这使我们能够只弹出提供唯一上下文的 Fiber。
  push(contextFiberStackCursor, fiber, fiber);

  // Finally, we need to push the host context to the stack.
  // However, we can't just call getRootHostContext() and push it because
  // we'd have a different number of entries on the stack depending on
  // whether getRootHostContext() throws somewhere in renderer code or not.
  // So we push an empty value first. This lets us safely unwind on errors.
  // 最后，我们需要将宿主上下文推入堆栈。
  // 然而，我们不能仅仅调用 getRootHostContext() 并推送它，因为
  // 我们在堆栈上有不同数量的条目，这取决于
  // getRootHostContext() 是否在渲染器代码中抛出。
  // 所以我们先推一个空值。这让我们可以安全地解除错误。
  push(contextStackCursor, NO_CONTEXT, fiber);
  // 获取 namespace
  const nextRootContext = getRootHostContext(nextRootInstance);
  // Now that we know this function doesn't throw, replace it.
  // 现在我们知道这个函数不会抛出，替换它。
  pop(contextStackCursor, fiber);
  push(contextStackCursor, nextRootContext, fiber);
}

/**
 * pop 从 valueStack 栈中取值
 *
 * 问题：为啥这三个指针的值是联系的
 *
 * @param fiber
 */
function popHostContainer(fiber: Fiber) {
  pop(contextStackCursor, fiber); // 更新 contextStackCursor
  pop(contextFiberStackCursor, fiber); // 更新 contextFiberStackCursor
  pop(rootInstanceStackCursor, fiber); // 更新 rootInstanceStackCursor
}

/**
 * 获取宿主上下文
 * @returns {T}
 */
function getHostContext(): HostContext {
  const context = requiredContext(contextStackCursor.current);
  return context;
}

function pushHostContext(fiber: Fiber): void {
  const rootInstance: Container = requiredContext(
    rootInstanceStackCursor.current,
  );
  const context: HostContext = requiredContext(contextStackCursor.current);
  const nextContext = getChildHostContext(context, fiber.type, rootInstance);

  // Don't push this Fiber's context unless it's unique.
  if (context === nextContext) {
    return;
  }

  // Track the context and the Fiber that provided it.
  // This enables us to pop only Fibers that provide unique contexts.
  push(contextFiberStackCursor, fiber, fiber);
  push(contextStackCursor, nextContext, fiber);
}

function popHostContext(fiber: Fiber): void {
  // Do not pop unless this Fiber provided the current context.
  // pushHostContext() only pushes Fibers that provide unique contexts.
  // 除非此 fiber 提供 current 上下文，否则不要弹出。
  // pushHostContext() 只 push 提供唯一上下文的 fiber。
  if (contextFiberStackCursor.current !== fiber) {
    return;
  }

  pop(contextStackCursor, fiber);
  pop(contextFiberStackCursor, fiber);
}

export {
  getHostContext,
  getRootHostContainer,
  popHostContainer,
  popHostContext,
  pushHostContainer,
  pushHostContext,
};
