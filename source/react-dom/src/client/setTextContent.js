/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {TEXT_NODE} from '../shared/HTMLNodeType';

/**
 *
 * 设置节点的 textContent 属性。
 * 对于文本更新，直接设置文本节点的 “nodeValue” 比使用 `.textContent` 更快，
 * 后者将删除现有节点并创建一个新节点。
 *
 * @param {DOMElement} node
 * @param {string} text
 * @internal
 */
let setTextContent = function(node: Element, text: string): void {
  if (text) {
    let firstChild = node.firstChild;

    if (
      firstChild &&
      firstChild === node.lastChild &&
      firstChild.nodeType === TEXT_NODE
    ) {
      firstChild.nodeValue = text;
      return;
    }
  }
  node.textContent = text;
};

export default setTextContent;
