/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import React from 'react';
import warning from 'shared/warning';
import {getToStringValue, toString} from './ToStringValue';

let didWarnSelectedSetOnOption = false;
let didWarnInvalidChild = false;

/**
 * 扁平化 Children
 * @param children
 * @returns {string}
 */
function flattenChildren(children) {
  let content = '';

  // 扁平化 Children。我们将在 validateProps() 期间警告它们是否无效，validateProps() 也用于 hydration。
  // 注意，这将抛出非元素对象。
  // 元素是字符串化的(通常不相关，但对于 <fbt> 很重要)。
  React.Children.forEach(children, function(child) {
    if (child == null) {
      return;
    }
    content += child;

    // 注意: 我们这里不警告无效 children。
    // 相反，这是在下面单独完成的，以便在 hydration 代码路径期间也会发生。
  });

  return content;
}

/**
 * Implements an <option> host component that warns when `selected` is set.
 */

export function validateProps(element: Element, props: Object) {
  if (__DEV__) {
    // This mirrors the codepath above, but runs for hydration too.
    // Warn about invalid children here so that client and hydration are consistent.
    // TODO: this seems like it could cause a DEV-only throw for hydration
    // if children contains a non-element object. We should try to avoid that.
    if (typeof props.children === 'object' && props.children !== null) {
      React.Children.forEach(props.children, function(child) {
        if (child == null) {
          return;
        }
        if (typeof child === 'string' || typeof child === 'number') {
          return;
        }
        if (typeof child.type !== 'string') {
          return;
        }
        if (!didWarnInvalidChild) {
          didWarnInvalidChild = true;
          warning(
            false,
            'Only strings and numbers are supported as <option> children.',
          );
        }
      });
    }

    // TODO: Remove support for `selected` in <option>.
    if (props.selected != null && !didWarnSelectedSetOnOption) {
      warning(
        false,
        'Use the `defaultValue` or `value` props on <select> instead of ' +
          'setting `selected` on <option>.',
      );
      didWarnSelectedSetOnOption = true;
    }
  }
}

export function postMountWrapper(element: Element, props: Object) {
  // value="" should make a value attribute (#6219)
  if (props.value != null) {
    element.setAttribute('value', toString(getToStringValue(props.value)));
  }
}

export function getHostProps(element: Element, props: Object) {
  const hostProps = {children: undefined, ...props};
  const content = flattenChildren(props.children);

  if (content) {
    hostProps.children = content;
  }

  return hostProps;
}
