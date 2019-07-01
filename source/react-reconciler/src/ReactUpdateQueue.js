/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// UpdateQueue 是一个按优先级排列的更新的链表。
//
// 与 fiber 一样，更新队列也是成对出现的：当前队列(表示屏幕的可见状态)
// 和正在工作的队列(可以在提交前进行异步修改和处理)，
// 这是一种双缓冲技术。
// 如果在完成之前丢弃正在进行的渲染工作，
// 则通过克隆当前队列来创建一个新的正在进行的工作。

// Both queues share a persistent, singly-linked list structure. To schedule an
// update, we append it to the end of both queues. Each queue maintains a
// pointer to first update in the persistent list that hasn't been processed.
// The work-in-progress pointer always has a position equal to or greater than
// the current queue, since we always work on that one. The current queue's
// pointer is only updated during the commit phase, when we swap in the
// work-in-progress.
// 两个队列共享一个持久的单链列表结构。
// 为了调度更新，我们将它附加到两个队列的末尾。
// 每个队列都维护一个指针，指向未处理的持久列表中的第一个更新。
// 正在工作的指针的位置总是等于或大于当前队列，因为我们总是处理当前队列。
// 当前队列的指针仅在提交阶段(交换正在进行的工作)更新。
//
// 例如:
//
//   Current pointer:           A - B - C - D - E - F
//   Work-in-progress pointer:              D - E - F
//                                          ^
//                                          正在进行的工作队列处理的更新比当前更新多。
//
// The reason we append to both queues is because otherwise we might drop
// updates without ever processing them. For example, if we only add updates to
// the work-in-progress queue, some updates could be lost whenever a work-in
// -progress render restarts by cloning from current. Similarly, if we only add
// updates to the current queue, the updates will be lost whenever an already
// in-progress queue commits and swaps with the current queue. However, by
// adding to both queues, we guarantee that the update will be part of the next
// work-in-progress. (And because the work-in-progress queue becomes the
// current queue once it commits, there's no danger of applying the same
// update twice.)
// 我们将更新附加到两个队列后面的原因是，
// 否则我们可能会在不处理更新的情况下删除它。
// 例如，如果我们只向正在进行的工作队列添加更新，
// 那么每当通过克隆当前的正在进行的渲染重新启动时，
// 一些更新可能会丢失。类似地，如果我们只向当前队列添加更新，
// 那么当已经在进行中的队列提交并与当前队列交换时，更新将丢失。
// 但是，通过向这两个队列添加，我们保证更新将成为下一个正在进行的工作的一部分。
// (由于在进行中的工作队列一旦提交就会成为当前队列，因此不会有两次应用相同更新的危险。)
//
// 优先级
// --------------
//
// 更新不是按优先级排序，而是按插入排序;新的更新总是附加到列表的末尾。
//
// The priority is still important, though. When processing the update queue
// during the render phase, only the updates with sufficient priority are
// included in the result. If we skip an update because it has insufficient
// priority, it remains in the queue to be processed later, during a lower
// priority render. Crucially, all updates subsequent to a skipped update also
// remain in the queue *regardless of their priority*. That means high priority
// updates are sometimes processed twice, at two separate priorities. We also
// keep track of a base state, that represents the state before the first
// update in the queue is applied.
//
// 然而，优先级仍然很重要。
// 在渲染阶段处理更新队列时，结果中只包含具有足够优先级的更新。
// 如果我们因为更新的优先级不够而跳过它，它将留在队列中，
// 稍后在较低优先级的渲染期间处理。
// 至关重要的是，跳过更新之后的所有更新都将保留在队列中*而不考虑它们的优先级*。
// 这意味着高优先级更新有时要处理两次，分别处理两个优先级。
// 我们还跟踪一个基本状态，它表示队列中的被应用的第一个更新之前的状态。

// 例如：
//
//  给定基本状态为 '', 以及以下更新队列
//
//     A1 - B2 - C1 - D2
//
//   where the number indicates the priority, and the update is applied to the
//   previous state by appending a letter, React will process these updates as
//   two separate renders, one per distinct priority level:
//   如果数字表示优先级，并且更新是通过添加一个字母应用于前一状态，
//   React 将以两种不同的渲染方式处理这些更新，每一种渲染方式具有不同的优先级:
//
//   第一次渲染，在优先级1:
//     Base state: ''
//     Updates: [A1, C1]
//     Result state: 'AC'
//
//   第一次渲染，在优先级2:
//     Base state: 'A'            <-  基本状态不包括C1，
//                                    因为跳过了 B2
//     Updates: [B2, C1, D2]      <-  C1 是基于 B2 之上的
//     Result state: 'ABCD'
//
// Because we process updates in insertion order, and rebase high priority
// updates when preceding updates are skipped, the final result is deterministic
// regardless of priority. Intermediate state may vary according to system
// resources, but the final state is always the same.
// 因为我们按照插入顺序处理更新，
// 并且在跳过之前的更新时重新以高优先级更新作基础，
// 所以无论优先级如何，最终结果都是确定的。
// 中间状态可能因系统资源的不同而不同，但是最终状态总是相同的。

import type {Fiber} from './ReactFiber';
import type {ExpirationTime} from './ReactFiberExpirationTime';

import {NoWork} from './ReactFiberExpirationTime';
import {
  enterDisallowedContextReadInDEV,
  exitDisallowedContextReadInDEV,
} from './ReactFiberNewContext';
import {Callback, ShouldCapture, DidCapture} from 'shared/ReactSideEffectTags';
import {ClassComponent} from 'shared/ReactWorkTags';

import {
  debugRenderPhaseSideEffects,
  debugRenderPhaseSideEffectsForStrictMode,
} from 'shared/ReactFeatureFlags';

import {StrictMode} from './ReactTypeOfMode';

import invariant from 'shared/invariant';
import warningWithoutStack from 'shared/warningWithoutStack';

export type Update<State> = {
  expirationTime: ExpirationTime, // 到期时间

  tag: 0 | 1 | 2 | 3, // 更新类型
  payload: any, // 负载
  callback: (() => mixed) | null, // 回调函数

  next: Update<State> | null, // 下一个更新
  nextEffect: Update<State> | null, // 下一个效果
};

export type UpdateQueue<State> = {
  baseState: State,

  firstUpdate: Update<State> | null,
  lastUpdate: Update<State> | null,

  firstCapturedUpdate: Update<State> | null,
  lastCapturedUpdate: Update<State> | null,

  firstEffect: Update<State> | null,
  lastEffect: Update<State> | null,

  firstCapturedEffect: Update<State> | null,
  lastCapturedEffect: Update<State> | null,
};

export const UpdateState = 0; // 更新状态
export const ReplaceState = 1; // 替换状态
export const ForceUpdate = 2; // 强制更新
export const CaptureUpdate = 3; // 捕获更新

// 全局状态，在调用 `processUpdateQueue` 开始时重置。\
// 它应该只在调用 `processUpdateQueue` 之后
// 通过 `checkHasForceUpdateAfterProcessing` 读取。
let hasForceUpdate = false;

let didWarnUpdateInsideUpdate;
let currentlyProcessingQueue;
export let resetCurrentlyProcessingQueue;
if (__DEV__) {
  didWarnUpdateInsideUpdate = false;
  currentlyProcessingQueue = null;
  resetCurrentlyProcessingQueue = () => {
    currentlyProcessingQueue = null;
  };
}

/**
 * 创建更新队列
 * @param baseState
 * @returns {UpdateQueue<State>}
 */
export function createUpdateQueue<State>(baseState: State): UpdateQueue<State> {
  const queue: UpdateQueue<State> = {
    baseState,
    firstUpdate: null,
    lastUpdate: null,
    firstCapturedUpdate: null,
    lastCapturedUpdate: null,
    firstEffect: null,
    lastEffect: null,
    firstCapturedEffect: null,
    lastCapturedEffect: null,
  };
  return queue;
}

/**
 * 克隆更新队列
 * @param currentQueue
 * @returns {UpdateQueue<State>}
 */
function cloneUpdateQueue<State>(
  currentQueue: UpdateQueue<State>,
): UpdateQueue<State> {
  const queue: UpdateQueue<State> = {
    baseState: currentQueue.baseState,
    firstUpdate: currentQueue.firstUpdate,
    lastUpdate: currentQueue.lastUpdate,

    // TODO: With resuming, if we bail out and resuse the child tree, we should
    // keep these effects.
    firstCapturedUpdate: null,
    lastCapturedUpdate: null,

    firstEffect: null,
    lastEffect: null,

    firstCapturedEffect: null,
    lastCapturedEffect: null,
  };
  return queue;
}

/**
 * 创建更新
 * @param expirationTime
 * @returns {{next: null, payload: null, expirationTime: ExpirationTime, callback: null, tag: number, nextEffect: null}}
 */
export function createUpdate(expirationTime: ExpirationTime): Update<*> {
  return {
    expirationTime: expirationTime,

    tag: UpdateState,
    payload: null,
    callback: null,

    next: null,
    nextEffect: null,
  };
}

/**
 * 添加更新到队列中
 * @param queue
 * @param update
 */
function appendUpdateToQueue<State>(
  queue: UpdateQueue<State>,
  update: Update<State>,
) {
  // 将更新追加到列表的末尾。
  if (queue.lastUpdate === null) {
    // 队列是空的
    queue.firstUpdate = queue.lastUpdate = update;
  } else {
    queue.lastUpdate.next = update;
    queue.lastUpdate = update;
  }
}

/**
 * 排队更新
 * @param fiber
 * @param update
 */
export function enqueueUpdate<State>(fiber: Fiber, update: Update<State>) {
  // 更新队列是惰性创建的。
  const alternate = fiber.alternate;
  let queue1;
  let queue2;
  if (alternate === null) {
    // 只有一个 fiber
    queue1 = fiber.updateQueue;
    queue2 = null;
    if (queue1 === null) {
      queue1 = fiber.updateQueue = createUpdateQueue(fiber.memoizedState);
    }
  } else {
    // 有两个 owner。
    queue1 = fiber.updateQueue;
    queue2 = alternate.updateQueue;
    if (queue1 === null) {
      if (queue2 === null) {
        // Neither fiber has an update queue. Create new ones.
        // 这两种 fiber 都没有更新队列。创造一个新队列。
        queue1 = fiber.updateQueue = createUpdateQueue(fiber.memoizedState);
        queue2 = alternate.updateQueue = createUpdateQueue(
          alternate.memoizedState,
        );
      } else {
        // Only one fiber has an update queue. Clone to create a new one.
        // 只有一个 fiber 有更新队列。克隆以创建一个新的。
        queue1 = fiber.updateQueue = cloneUpdateQueue(queue2);
      }
    } else {
      if (queue2 === null) {
        // Only one fiber has an update queue. Clone to create a new one.
        // 只有一个 fiber 有更新队列。克隆以创建一个新的。
        queue2 = alternate.updateQueue = cloneUpdateQueue(queue1);
      } else {
        // Both owners have an update queue.
        // 两个所有者都有一个更新队列。
      }
    }
  }
  if (queue2 === null || queue1 === queue2) {
    // There's only a single queue.
    // 只有一个队列。
    appendUpdateToQueue(queue1, update);
  } else {
    // There are two queues. We need to append the update to both queues,
    // while accounting for the persistent structure of the list — we don't
    // want the same update to be added multiple times.
    // 有两个队列。我们需要将更新附加到两个队列，
    // 同时考虑到列表的持久结构——我们不希望将相同的更新添加多次。
    if (queue1.lastUpdate === null || queue2.lastUpdate === null) {
      // One of the queues is not empty. We must add the update to both queues.
      // 其中一个队列不是空的。我们必须将更新添加到两个队列。
      appendUpdateToQueue(queue1, update);
      appendUpdateToQueue(queue2, update);
    } else {
      // Both queues are non-empty. The last update is the same in both lists,
      // because of structural sharing. So, only append to one of the lists.
      // 两个队列都不是空的。由于结构共享，这两个列表中的最新更新是相同的。
      // 因此，只向其中一个列表追加。
      appendUpdateToQueue(queue1, update);
      // But we still need to update the `lastUpdate` pointer of queue2.
      // 但是我们仍然需要更新 queue2 的 `lastUpdate` 指针。
      queue2.lastUpdate = update;
    }
  }

  if (__DEV__) {
    if (
      fiber.tag === ClassComponent &&
      (currentlyProcessingQueue === queue1 ||
        (queue2 !== null && currentlyProcessingQueue === queue2)) &&
      !didWarnUpdateInsideUpdate
    ) {
      warningWithoutStack(
        false,
        'An update (setState, replaceState, or forceUpdate) was scheduled ' +
          'from inside an update function. Update functions should be pure, ' +
          'with zero side-effects. Consider using componentDidUpdate or a ' +
          'callback.',
      );
      didWarnUpdateInsideUpdate = true;
    }
  }
}

/**
 * 排队捕获的更新
 * @param workInProgress
 * @param update
 */
export function enqueueCapturedUpdate<State>(
  workInProgress: Fiber,
  update: Update<State>,
) {
  // 捕获的更新进入一个单独的列表，并且只在正在进行的队列中。
  let workInProgressQueue = workInProgress.updateQueue;
  if (workInProgressQueue === null) {
    workInProgressQueue = workInProgress.updateQueue = createUpdateQueue(
      workInProgress.memoizedState,
    );
  } else {
    // TODO：我把它放在这里，而不是 createWorkInProgress，这样我们就不会不必要地克隆队列。也许有更好的方法来构造它。。
    // 未必需要克隆队列。也许有更好的方法来构造它。
    workInProgressQueue = ensureWorkInProgressQueueIsAClone(
      workInProgress,
      workInProgressQueue,
    );
  }

  // Append the update to the end of the list.
  // 将更新追加到列表的末尾。
  if (workInProgressQueue.lastCapturedUpdate === null) {
    // This is the first render phase update
    // 这是第一个渲染阶段的更新
    workInProgressQueue.firstCapturedUpdate = workInProgressQueue.lastCapturedUpdate = update;
  } else {
    workInProgressQueue.lastCapturedUpdate.next = update;
    workInProgressQueue.lastCapturedUpdate = update;
  }
}

/**
 * 确保工作中的处理队列是复制品
 *  1. 判断当前队列和更新队列是不是相等
 *  2. 若相等则克隆，若不等则返回当前队列
 * @param workInProgress
 * @param queue
 * @returns {UpdateQueue<State>}
 */
function ensureWorkInProgressQueueIsAClone<State>(
  workInProgress: Fiber,
  queue: UpdateQueue<State>,
): UpdateQueue<State> {
  const current = workInProgress.alternate;
  if (current !== null) {
    // 如果正在工作的队列等于当前队列，我们需要首先克隆它。
    if (queue === current.updateQueue) {
      queue = workInProgress.updateQueue = cloneUpdateQueue(queue);
    }
  }
  return queue;
}

/**
 * 从跟新获取状态
 * @param workInProgress
 * @param queue
 * @param update
 * @param prevState
 * @param nextProps
 * @param instance
 * @returns {State|*}
 */
function getStateFromUpdate<State>(
  workInProgress: Fiber,
  queue: UpdateQueue<State>,
  update: Update<State>,
  prevState: State,
  nextProps: any,
  instance: any,
): any {
  switch (update.tag) {
    case ReplaceState: {
      const payload = update.payload;
      if (typeof payload === 'function') {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
          if (
            debugRenderPhaseSideEffects ||
            (debugRenderPhaseSideEffectsForStrictMode &&
              workInProgress.mode & StrictMode)
          ) {
            payload.call(instance, prevState, nextProps);
          }
        }
        const nextState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          exitDisallowedContextReadInDEV();
        }
        return nextState;
      }
      // State object
      return payload;
    }
    case CaptureUpdate: {
      workInProgress.effectTag =
        (workInProgress.effectTag & ~ShouldCapture) | DidCapture;
    }
    // Intentional fallthrough
    case UpdateState: {
      const payload = update.payload;
      let partialState;
      if (typeof payload === 'function') {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
          if (
            debugRenderPhaseSideEffects ||
            (debugRenderPhaseSideEffectsForStrictMode &&
              workInProgress.mode & StrictMode)
          ) {
            payload.call(instance, prevState, nextProps);
          }
        }
        partialState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          exitDisallowedContextReadInDEV();
        }
      } else {
        // Partial state object
        partialState = payload;
      }
      if (partialState === null || partialState === undefined) {
        // Null and undefined are treated as no-ops.
        // Null 和 undefine d被视为 no-ops。
        return prevState;
      }
      // Merge the partial state and the previous state.
      // 合并部分状态和前一个状态。
      return Object.assign({}, prevState, partialState);
    }
    case ForceUpdate: {
      hasForceUpdate = true;
      return prevState;
    }
  }
  return prevState;
}

/**
 * 处理更新队列
 * 1. 迭代更新队列链表，计算 state、过期时间等，将其赋值给更新队列和更新
 * 2. 迭代更新队列链表，生成一个 effect 链表
 *
 * @param workInProgress
 * @param queue
 * @param props
 * @param instance
 * @param renderExpirationTime
 */
export function processUpdateQueue<State>(
  workInProgress: Fiber,
  queue: UpdateQueue<State>,
  props: any,
  instance: any,
  renderExpirationTime: ExpirationTime,
): void {
  hasForceUpdate = false;

  // 确保处理的更新队列的 work 是一个复制品
  queue = ensureWorkInProgressQueueIsAClone(workInProgress, queue);

  if (__DEV__) {
    currentlyProcessingQueue = queue;
  }

  // These values may change as we process the queue.
  // 当我们处理队列时，这些值可能会改变。
  let newBaseState = queue.baseState;
  let newFirstUpdate = null;
  let newExpirationTime = NoWork;

  // Iterate through the list of updates to compute the result.
  // 迭代更新列表以计算结果。
  let update = queue.firstUpdate;
  let resultState = newBaseState;
  while (update !== null) {
    const updateExpirationTime = update.expirationTime;
    if (updateExpirationTime < renderExpirationTime) {
      // This update does not have sufficient priority. Skip it.
      // 此更新没有足够的优先级。跳过它。
      if (newFirstUpdate === null) {
        // This is the first skipped update. It will be the first update in
        // the new list.
        // 这是第一个跳过的更新。这将是新列表中的第一个更新。
        newFirstUpdate = update;
        // Since this is the first update that was skipped, the current result
        // is the new base state.
        // 由于这是跳过的第一个更新，所以当前结果是 new base state。
        newBaseState = resultState;
      }
      // Since this update will remain in the list, update the remaining
      // expiration time.
      // 由于此更新将保留在列表中，所以更新剩余的过期时间。
      if (newExpirationTime < updateExpirationTime) {
        newExpirationTime = updateExpirationTime;
      }
    } else {
      // This update does have sufficient priority. Process it and compute
      // a new result.
      // 这次更新确实有足够的优先级。处理它并计算一个新的结果。
      resultState = getStateFromUpdate(
        workInProgress,
        queue,
        update,
        resultState,
        props,
        instance,
      );
      const callback = update.callback;
      if (callback !== null) {
        workInProgress.effectTag |= Callback;
        // Set this to null, in case it was mutated during an aborted render.
        // 将其设置为null，以防在中止渲染期间发生突变。
        update.nextEffect = null;
        if (queue.lastEffect === null) {
          queue.firstEffect = queue.lastEffect = update;
        } else {
          queue.lastEffect.nextEffect = update;
          queue.lastEffect = update;
        }
      }
    }
    // Continue to the next update.
    // 继续下一个更新。
    update = update.next;
  }

  // Separately, iterate though the list of captured updates.
  // 另外，遍历捕获的更新列表。
  let newFirstCapturedUpdate = null;
  update = queue.firstCapturedUpdate;
  while (update !== null) {
    const updateExpirationTime = update.expirationTime;
    if (updateExpirationTime < renderExpirationTime) {
      // This update does not have sufficient priority. Skip it.
      // 这个更新没有足够的优先级。跳过它。
      if (newFirstCapturedUpdate === null) {
        // This is the first skipped captured update. It will be the first
        // update in the new list.
        // 这是第一次跳过捕获的更新。这将是新列表中的第一个更新。
        newFirstCapturedUpdate = update;
        // If this is the first update that was skipped, the current result is
        // the new base state.
        // 如果这是跳过的第一个更新，则当前结果是新的基本状态。
        if (newFirstUpdate === null) {
          newBaseState = resultState;
        }
      }
      // Since this update will remain in the list, update the remaining
      // expiration time.
      // 由于此更新将保留在列表中，所以更新剩余的过期时间。
      if (newExpirationTime < updateExpirationTime) {
        newExpirationTime = updateExpirationTime;
      }
    } else {
      // This update does have sufficient priority. Process it and compute
      // a new result.
      // 这次更新确实有足够的优先级。处理它并计算一个新的结果。
      resultState = getStateFromUpdate(
        workInProgress,
        queue,
        update,
        resultState,
        props,
        instance,
      );
      const callback = update.callback;
      if (callback !== null) {
        workInProgress.effectTag |= Callback;
        // Set this to null, in case it was mutated during an aborted render.
        // 将其设置为 null，以防在中止 render 期间发生突变。
        update.nextEffect = null;
        if (queue.lastCapturedEffect === null) {
          queue.firstCapturedEffect = queue.lastCapturedEffect = update;
        } else {
          queue.lastCapturedEffect.nextEffect = update;
          queue.lastCapturedEffect = update;
        }
      }
    }
    update = update.next;
  }

  if (newFirstUpdate === null) {
    queue.lastUpdate = null;
  }
  if (newFirstCapturedUpdate === null) {
    queue.lastCapturedUpdate = null;
  } else {
    workInProgress.effectTag |= Callback;
  }
  if (newFirstUpdate === null && newFirstCapturedUpdate === null) {
    // We processed every update, without skipping. That means the new base
    // state is the same as the result state.
    // 我们处理了每个更新，没有跳过。这意味着新的基状态与结果状态相同。
    newBaseState = resultState;
  }

  queue.baseState = newBaseState;
  queue.firstUpdate = newFirstUpdate;
  queue.firstCapturedUpdate = newFirstCapturedUpdate;

  // Set the remaining expiration time to be whatever is remaining in the queue.
  // This should be fine because the only two other things that contribute to
  // expiration time are props and context. We're already in the middle of the
  // begin phase by the time we start processing the queue, so we've already
  // dealt with the props. Context in components that specify
  // shouldComponentUpdate is tricky; but we'll have to account for
  // that regardless.
  // 将剩余的过期时间设置为队列中剩余的时间。
  // 这应该没问题，因为影响过期时间的另外两个因素是 props 和 context。
  // 在开始处理队列时，我们已经处于 begin 阶段的中间，
  // 所以我们已经处理了这些 props。
  // 指定 shouldComponentUpdate 的组件中的 Context 比较复杂;
  // 但无论如何我们都要考虑到这一点。
  workInProgress.expirationTime = newExpirationTime;
  workInProgress.memoizedState = resultState;

  if (__DEV__) {
    currentlyProcessingQueue = null;
  }
}

/**
 * 调用回调
 * 1. 回调不存在则抛出错误
 * 2. 回调存在则使用上下文执行回调
 *
 * @param callback
 * @param context
 */
function callCallback(callback, context) {
  invariant(
    typeof callback === 'function',
    'Invalid argument passed as callback. Expected a function. Instead ' +
      'received: %s',
    callback,
  );
  callback.call(context);
}

export function resetHasForceUpdateBeforeProcessing() {
  hasForceUpdate = false;
}

export function checkHasForceUpdateAfterProcessing(): boolean {
  return hasForceUpdate;
}

/**
 * 提交更新队列
 * @param finishedWork
 * @param finishedQueue
 * @param instance
 * @param renderExpirationTime
 */
export function commitUpdateQueue<State>(
  finishedWork: Fiber,
  finishedQueue: UpdateQueue<State>,
  instance: any,
  renderExpirationTime: ExpirationTime,
): void {
  // 如果已完成的渲染包含捕获的更新，
  // 并且仍然有较低优先级的更新遗留下来，
  // 那么我们需要将捕获的更新保存在队列中，
  // 以便在以较低优先级再次处理队列时重新基于它们，而不是丢弃它们。
  if (finishedQueue.firstCapturedUpdate !== null) {
    // 将捕获的更新列表连接到普通列表的末尾。
    if (finishedQueue.lastUpdate !== null) {
      finishedQueue.lastUpdate.next = finishedQueue.firstCapturedUpdate;
      finishedQueue.lastUpdate = finishedQueue.lastCapturedUpdate;
    }
    // 清除捕获的更新列表。
    finishedQueue.firstCapturedUpdate = finishedQueue.lastCapturedUpdate = null;
  }

  // 提交效果
  commitUpdateEffects(finishedQueue.firstEffect, instance);
  finishedQueue.firstEffect = finishedQueue.lastEffect = null;

  commitUpdateEffects(finishedQueue.firstCapturedEffect, instance);
  finishedQueue.firstCapturedEffect = finishedQueue.lastCapturedEffect = null;
}

/**
 * 提交更新效果
 * @param effect
 * @param instance
 */
function commitUpdateEffects<State>(
  effect: Update<State> | null,
  instance: any,
): void {
  while (effect !== null) {
    const callback = effect.callback;
    if (callback !== null) {
      effect.callback = null;
      callCallback(callback, instance);
    }
    effect = effect.nextEffect;
  }
}
