/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {
  getPropertyInfo,
  shouldIgnoreAttribute,
  shouldRemoveAttribute,
  isAttributeNameSafe,
  BOOLEAN,
  OVERLOADED_BOOLEAN,
} from '../shared/DOMProperty';

import type {PropertyInfo} from '../shared/DOMProperty';

/**
 * Get the value for a property on a node. Only used in DEV for SSR validation.
 * The "expected" argument is used as a hint of what the expected value is.
 * Some properties have multiple equivalent values.
 */
export function getValueForProperty(
  node: Element,
  name: string,
  expected: mixed,
  propertyInfo: PropertyInfo,
): mixed {
  if (__DEV__) {
    if (propertyInfo.mustUseProperty) {
      const {propertyName} = propertyInfo;
      return (node: any)[propertyName];
    } else {
      const attributeName = propertyInfo.attributeName;

      let stringValue = null;

      if (propertyInfo.type === OVERLOADED_BOOLEAN) {
        if (node.hasAttribute(attributeName)) {
          const value = node.getAttribute(attributeName);
          if (value === '') {
            return true;
          }
          if (shouldRemoveAttribute(name, expected, propertyInfo, false)) {
            return value;
          }
          if (value === '' + (expected: any)) {
            return expected;
          }
          return value;
        }
      } else if (node.hasAttribute(attributeName)) {
        if (shouldRemoveAttribute(name, expected, propertyInfo, false)) {
          // We had an attribute but shouldn't have had one, so read it
          // for the error message.
          return node.getAttribute(attributeName);
        }
        if (propertyInfo.type === BOOLEAN) {
          // If this was a boolean, it doesn't matter what the value is
          // the fact that we have it is the same as the expected.
          return expected;
        }
        // Even if this property uses a namespace we use getAttribute
        // because we assume its namespaced name is the same as our config.
        // To use getAttributeNS we need the local name which we don't have
        // in our config atm.
        stringValue = node.getAttribute(attributeName);
      }

      if (shouldRemoveAttribute(name, expected, propertyInfo, false)) {
        return stringValue === null ? expected : stringValue;
      } else if (stringValue === '' + (expected: any)) {
        return expected;
      } else {
        return stringValue;
      }
    }
  }
}

/**
 * Get the value for a attribute on a node. Only used in DEV for SSR validation.
 * The third argument is used as a hint of what the expected value is. Some
 * attributes have multiple equivalent values.
 */
export function getValueForAttribute(
  node: Element,
  name: string,
  expected: mixed,
): mixed {
  if (__DEV__) {
    if (!isAttributeNameSafe(name)) {
      return;
    }
    if (!node.hasAttribute(name)) {
      return expected === undefined ? undefined : null;
    }
    const value = node.getAttribute(name);
    if (value === '' + (expected: any)) {
      return expected;
    }
    return value;
  }
}

/**
 * 设置节点上属性的值。
 *
 * @param {DOMElement} node
 * @param {string} name
 * @param {*} value
 */

export function setValueForProperty(
  node: Element,
  name: string,
  value: mixed,
  isCustomComponentTag: boolean,
) {
  // 根据属性名称从属性描述表中取出其描述
  const propertyInfo = getPropertyInfo(name);
  // 根据 propertyInfo 中的 type 属性，也就是属性的类型来判断是否应该忽略该属性
  if (shouldIgnoreAttribute(name, propertyInfo, isCustomComponentTag)) {
    return;
  }

  // 根号有属性的类型，判断其值是否合法或者无关紧要（false)，是则删除
  if (shouldRemoveAttribute(name, value, propertyInfo, isCustomComponentTag)) {
    value = null;
  }
  // 如果为自定义组件，这个属性不在特殊列表中，就把它当作一个简单的属性。
  if (isCustomComponentTag || propertyInfo === null) {
    if (isAttributeNameSafe(name)) { // 判断是否是安全的属性名，也就是属性名命名是否合法
      const attributeName = name;
      if (value === null) { // 值不存在的时候删除该属性
        node.removeAttribute(attributeName);
      } else { // 设置此属性
        node.setAttribute(attributeName, '' + (value: any));
      }
    }
    return;
  }
  const {mustUseProperty} = propertyInfo;
  if (mustUseProperty) { // dom props 属性：checked、multiple、muted、selected
    const {propertyName} = propertyInfo;
    if (value === null) {
      const {type} = propertyInfo;
      (node: any)[propertyName] = type === BOOLEAN ? false : '';
    } else {
      // Contrary to `setAttribute`, object properties are properly
      // `toString`ed by IE8/9.
      (node: any)[propertyName] = value;
    }
    return;
  }
  // 其余的则作为特殊情况下的属性处理。
  const {attributeName, attributeNamespace} = propertyInfo;
  if (value === null) {
    node.removeAttribute(attributeName);
  } else {
    const {type} = propertyInfo;
    let attributeValue;
    // 为 true 的 boolean 值只需要设置为 ''
    if (type === BOOLEAN || (type === OVERLOADED_BOOLEAN && value === true)) {
      attributeValue = '';
    } else {
      // IE8/9 中使用 `setAttribute` 会将对象转变成 `[object]`
      // ('' + value) 可以使它能够正确地使用 toString() 输出
      attributeValue = '' + (value: any);
    }
    // 判断是否有名称空间
    if (attributeNamespace) {
      node.setAttributeNS(attributeNamespace, attributeName, attributeValue);
    } else {
      node.setAttribute(attributeName, attributeValue);
    }
  }
}
