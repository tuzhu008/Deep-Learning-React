/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 *  使用 invariant() 来断言程序认为为真的状态。
 *
 * Provide sprintf-style format (only %s is supported) and arguments
 * to provide information about what broke and what you were
 * expecting.
 * *提供 sprintf 风格的格式(只支持 %s)和参数，以提供关于崩溃和您期望的信息。
 *
 * The invariant message will be stripped in production, but the invariant
 * will remain to ensure logic does not differ in production.
 * invariant 信息将在生产中被剥离，但 invariant 将保持不变，以确保逻辑在生产中没有不同。
 */

let validateFormat = () => {};

if (__DEV__) {
  validateFormat = function(format) {
    if (format === undefined) {
      throw new Error('invariant requires an error message argument');
    }
  };
}
/**
 *
 * @param condition
 * @param format
 * @param a
 * @param b
 * @param c
 * @param d
 * @param e
 * @param f
 */
export default function invariant(condition, format, a, b, c, d, e, f) {
  validateFormat(format);

  if (!condition) {
    let error;
    if (format === undefined) {
      error = new Error(
        'Minified exception occurred; use the non-minified dev environment ' +
          'for the full error message and additional helpful warnings.',
      );
    } else {
      const args = [a, b, c, d, e, f];
      let argIndex = 0;
      error = new Error(
        format.replace(/%s/g, function() {
          return args[argIndex++];
        }),
      );
      error.name = 'Invariant Violation';
    }

    error.framesToPop = 1; // we don't care about invariant's own frame
    throw error;
  }
}
