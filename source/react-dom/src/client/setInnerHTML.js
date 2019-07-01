/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {Namespaces} from '../shared/DOMNamespaces';
import createMicrosoftUnsafeLocalFunction from '../shared/createMicrosoftUnsafeLocalFunction';

// SVG temp container for IE lacking innerHTML
let reusableSVGContainer;

/**
 * 设置节点的 innerHTML 属性
 *
 * @param {DOMElement} node
 * @param {string} html
 * @internal
 */
const setInnerHTML = createMicrosoftUnsafeLocalFunction(function(
  node: Element,
  html: string,
): void {
  // IE没有针对 SVG 节点的 innerHTML，
  // 因此我们将新标记注入临时节点，然后将子节点移动到目标节点
  // 也就是下面的，先创建了一个 div 容器，然后将 innerHTML 跟 svg标签拼成一个字符串
  // 然后将这个字符串设置为容器的 innerHTML，以达到将原始的 html 字符串写入 svg 的目的

  if (node.namespaceURI === Namespaces.svg && !('innerHTML' in node)) {
    reusableSVGContainer =
      reusableSVGContainer || document.createElement('div');
    reusableSVGContainer.innerHTML = '<svg>' + html + '</svg>';
    const svgNode = reusableSVGContainer.firstChild;
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
    while (svgNode.firstChild) {
      node.appendChild(svgNode.firstChild);
    }
  } else {
    node.innerHTML = html;
  }
});

export default setInnerHTML;
