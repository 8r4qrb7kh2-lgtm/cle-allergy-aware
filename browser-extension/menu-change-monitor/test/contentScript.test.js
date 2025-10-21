const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createStubElement(tagName = 'div') {
  const element = {
    tagName: String(tagName).toUpperCase(),
    nodeType: 1,
    parentElement: null,
    children: [],
    attributes: {},
    dataset: {},
    style: {},
    textContent: '',
    className: '',
    _classSet: new Set(),
    appendChild(child) {
      if (!child) return null;
      child.parentElement = element;
      element.children.push(child);
      if (typeof child.remove !== 'function') {
        child.remove = function removeChild() {
          if (!child.parentElement) return;
          const siblings = child.parentElement.children;
          const index = siblings.indexOf(child);
          if (index >= 0) {
            siblings.splice(index, 1);
          }
          child.parentElement = null;
        };
      }
      return child;
    },
    remove() {
      if (!element.parentElement) return;
      const siblings = element.parentElement.children || [];
      const index = siblings.indexOf(element);
      if (index >= 0) {
        siblings.splice(index, 1);
      }
      element.parentElement = null;
    },
    setAttribute(name, value) {
      element.attributes[name] = String(value);
      if (name === 'class') {
        element._classSet.clear();
        String(value)
          .split(/\s+/)
          .filter(Boolean)
          .forEach(token => element._classSet.add(token));
        element.className = Array.from(element._classSet).join(' ');
      }
      if (name.startsWith('data-')) {
        const key = name
          .slice(5)
          .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        element.dataset[key] = String(value);
      }
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(element.attributes, name)
        ? element.attributes[name]
        : null;
    },
    addEventListener() {},
    closest() {
      return null;
    }
  };

  element.classList = {
    add: (...tokens) => {
      tokens.filter(Boolean).forEach(token => {
        element._classSet.add(token);
      });
      element.className = Array.from(element._classSet).join(' ');
    },
    remove: (...tokens) => {
      tokens.filter(Boolean).forEach(token => {
        element._classSet.delete(token);
      });
      element.className = Array.from(element._classSet).join(' ');
    },
    contains: token => element._classSet.has(token),
    forEach: callback => {
      element._classSet.forEach(callback);
    }
  };

  return element;
}

function createStubDocument() {
  const head = createStubElement('head');
  const body = createStubElement('body');
  const documentElement = createStubElement('html');

  const document = {
    head,
    body,
    documentElement,
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
    createElement: createStubElement,
    createTreeWalker() {
      return {
        currentNode: null,
        nextNode() {
          return false;
        }
      };
    },
    contains(target) {
      if (!target) return false;
      let current = target;
      while (current) {
        if (current === body || current === head || current === documentElement) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    }
  };

  return document;
}

function createTestContext() {
  const document = createStubDocument();

  class StubMutationObserver {
    constructor() {}
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }

  class HTMLElement {}
  class HTMLInputElement extends HTMLElement {}
  class HTMLTextAreaElement extends HTMLElement {}
  class HTMLSelectElement extends HTMLElement {}

  const context = {
    window: {},
    document,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    NodeFilter: { SHOW_ELEMENT: 1, FILTER_ACCEPT: 1 },
    MutationObserver: StubMutationObserver,
    HTMLElement,
    HTMLInputElement,
    HTMLTextAreaElement,
    HTMLSelectElement,
    setTimeout,
    clearTimeout,
    console
  };

  context.window.document = document;
  context.window.Node = context.Node;
  context.window.NodeFilter = context.NodeFilter;
  context.window.MutationObserver = StubMutationObserver;
  context.window.HTMLElement = HTMLElement;
  context.window.HTMLInputElement = HTMLInputElement;
  context.window.HTMLTextAreaElement = HTMLTextAreaElement;
  context.window.HTMLSelectElement = HTMLSelectElement;
  context.window.setTimeout = setTimeout;
  context.window.clearTimeout = clearTimeout;
  context.document = document;

  return context;
}

function loadContentScript() {
  const context = createTestContext();
  const scriptPath = path.join(__dirname, '..', 'contentScript.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');
  const vmContext = vm.createContext(context);
  vm.runInContext(scriptContent, vmContext, { filename: 'contentScript.js' });
  return context.window.__MENU_CHANGE_MONITOR_TEST_HOOKS__;
}

function runTests() {
  const hooks = loadContentScript();
  assert.ok(hooks, 'Expected test hooks to be available');

  const { keywordRegex, buildMessage, describeContext, truncate, normalizeWhitespace } = hooks;

  assert.ok(keywordRegex.test('Seasonal Menu Update'), 'keywordRegex should match known keywords');
  assert.ok(!keywordRegex.test('Completely unrelated text'), 'keywordRegex should not match unrelated text');

  const context = {
    matches: true,
    contextStrings: ['header area', 'entree specials section']
  };
  const message = buildMessage('changed', 'Roasted Salmon', 'Roasted Salmon with Lemon', context);

  assert.strictEqual(message.title, 'Menu content updated');
  assert.ok(
    message.detail.includes('Roasted Salmon') && message.detail.includes('Roasted Salmon with Lemon'),
    'detail should describe the change'
  );
  assert.strictEqual(
    message.reminder,
    'Please update the external allergen information to match this change.'
  );
  assert.strictEqual(message.location, 'entree specials section');

  const truncated = truncate('a'.repeat(100), 20);
  assert.strictEqual(truncated.length, 20, 'truncate should limit the output length');
  assert.ok(truncated.endsWith('…'), 'truncate should append an ellipsis when trimming');

  const normalized = normalizeWhitespace('  Fresh   salad \n with   herbs  ');
  assert.strictEqual(normalized, 'Fresh salad with herbs', 'normalizeWhitespace should collapse whitespace');

  const described = describeContext({ matches: true, contextStrings: ['random', 'dessert menu items'] });
  assert.strictEqual(described, 'dessert menu items', 'describeContext should surface keyword-rich context');

  console.log('All content script tests passed.');
}

runTests();
