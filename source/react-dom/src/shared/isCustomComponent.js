/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

/**
 * 判断组件是否为自定义标签，即 WebComponent
 * @param tagName
 * @param props
 * @returns {boolean}
 */
function isCustomComponent(tagName: string, props: Object) {
  if (tagName.indexOf('-') === -1) { // 不包含 - 的则检查是否传入了 is 参数
    return typeof props.is === 'string';
  }
  switch (tagName) {
    // 这些是保留的 SVG 和 MathML 元素。
    // 我们不太在意这个白名单，因为我们希望它永远不会增长。
    // 另一种方法是在几个复杂的地方跟踪名称空间。
    // https://w3c.github.io/webcomponents/spec/custom/#custom-elements-core-concepts
    case 'annotation-xml':
    case 'color-profile':
    case 'font-face':
    case 'font-face-src':
    case 'font-face-uri':
    case 'font-face-format':
    case 'font-face-name':
    case 'missing-glyph':
      return false;
    default:
      return true;
  }
}

export default isCustomComponent;
