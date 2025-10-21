(function () {
  const KEYWORDS = [
    'menu',
    'dish',
    'dishes',
    'ingredient',
    'ingredients',
    'allergen',
    'allergens',
    'allergy',
    'entree',
    'entrée',
    'appetizer',
    'starter',
    'main course',
    'special',
    'beverage',
    'drink',
    'dessert',
    'soup',
    'salad',
    'sauce',
    'side',
    'chef',
    'combo',
    'plate'
  ];

  const keywordRegex = new RegExp(`\\b(${KEYWORDS.map(escapeRegex).join('|')})\\b`, 'i');
  const observedTextMap = new WeakMap();
  const notifiedChanges = new Set();
  const elementContextMap = new WeakMap();
  const NOTIFICATION_LIFETIME = 12000;
  const HIGHLIGHT_CLASS = 'menu-change-monitor__highlight';
  let notificationContainer = null;

  injectStyles();
  scanForExistingElements();
  startMutationObserver();
  listenForFormEvents();

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function listenForFormEvents() {
    document.addEventListener('input', event => {
      handlePotentialChange(event.target);
    }, true);

    document.addEventListener('change', event => {
      handlePotentialChange(event.target);
    }, true);
  }

  function scanForExistingElements() {
    const selectorParts = KEYWORDS.map(keyword => {
      const attrSelector = `[class*="${keyword}" i], [id*="${keyword}" i], [name*="${keyword}" i], [data-type*="${keyword}" i], [data-section*="${keyword}" i], [data-category*="${keyword}" i], [aria-label*="${keyword}" i]`;
      return attrSelector;
    });

    const keywordSelectors = selectorParts.join(', ');
    if (keywordSelectors.trim().length > 0) {
      document.querySelectorAll(keywordSelectors).forEach(element => {
        if (element.nodeType === Node.ELEMENT_NODE) {
          cacheElementValue(element);
        }
      });
    }

    document.querySelectorAll('input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]').forEach(element => {
      cacheElementValue(element);
    });
  }

  function startMutationObserver() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          handlePotentialChange(parent);
        }

        if (mutation.type === 'attributes') {
          handlePotentialChange(mutation.target);
        }

        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              cacheElementValue(node, { deep: true });
              handlePotentialChange(node);
            } else if (node.nodeType === Node.TEXT_NODE) {
              handlePotentialChange(node.parentElement);
            }
          });

          mutation.removedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              notifyIfRemoved(node);
            }
          });
        }
      });
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }

  function notifyIfRemoved(element) {
    if (!element) return;

    const previousValue = observedTextMap.get(element);
    if (previousValue === undefined) return;

    const context = elementContextMap.get(element) || getElementContext(element);
    elementContextMap.set(element, context);

    observedTextMap.delete(element);
    notifyChange({
      type: 'removed',
      element,
      previousValue,
      currentValue: '',
      context
    });
  }

  function handlePotentialChange(node) {
    const element = normalizeNode(node);
    if (!element) return;

    const context = getElementContext(element);
    elementContextMap.set(element, context);
    if (!context.matches) return;

    const currentValue = getElementValue(element);
    const previousValue = observedTextMap.get(element);

    if (typeof currentValue !== 'string') return;

    if (previousValue === undefined) {
      observedTextMap.set(element, currentValue);
      return;
    }

    if (normalizeWhitespace(previousValue) === normalizeWhitespace(currentValue)) {
      return;
    }

    observedTextMap.set(element, currentValue);
    notifyChange({
      type: 'changed',
      element,
      previousValue,
      currentValue,
      context
    });
  }

  function cacheElementValue(element, options = {}) {
    const targetElements = options.deep ? collectRelevantDescendants(element) : [element];
    targetElements.forEach(target => {
      const context = getElementContext(target);
      elementContextMap.set(target, context);
      if (!context.matches) return;
      const value = getElementValue(target);
      if (typeof value === 'string') {
        observedTextMap.set(target, value);
      }
    });
  }

  function collectRelevantDescendants(root) {
    const elements = [root];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      elements.push(walker.currentNode);
    }

    return elements;
  }

  function normalizeNode(node) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) {
      return node.parentElement;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      return node;
    }

    return null;
  }

  function getElementValue(element) {
    if (!element) return null;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value || '';
    }

    if (element instanceof HTMLSelectElement) {
      return Array.from(element.selectedOptions || []).map(option => option.textContent || '').join(', ');
    }

    if (element.isContentEditable) {
      return element.textContent || '';
    }

    return (element.textContent || '').trim();
  }

  function normalizeWhitespace(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function getElementContext(element) {
    if (!element) return { matches: false, contextStrings: [] };
    if (element === document.body || element === document.documentElement) {
      return { matches: false, contextStrings: [] };
    }

    if (element.dataset && element.dataset.menuChangeIgnore === 'true') {
      return { matches: false, contextStrings: [] };
    }

    if (typeof element.closest === 'function') {
      const ignoredAncestor = element.closest('[data-menu-change-ignore="true"]');
      if (ignoredAncestor && ignoredAncestor !== element) {
        return { matches: false, contextStrings: [] };
      }
    }

    const contextStrings = new Set();

    addContextString(contextStrings, element.tagName);

    const attributesToCheck = ['id', 'name', 'placeholder', 'aria-label', 'aria-description', 'title', 'data-type', 'data-section', 'data-category', 'data-name'];
    attributesToCheck.forEach(attribute => {
      const value = element.getAttribute && element.getAttribute(attribute);
      addContextString(contextStrings, value);
    });

    if (element.classList && element.classList.length) {
      element.classList.forEach(className => addContextString(contextStrings, className));
    }

    if (element.dataset) {
      Object.values(element.dataset).forEach(value => addContextString(contextStrings, value));
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.labels) {
        Array.from(element.labels).forEach(label => addContextString(contextStrings, label && label.textContent));
      }

      addContextString(contextStrings, element.placeholder);
    }

    if (element.parentElement) {
      addContextString(contextStrings, element.parentElement.textContent);
    }

    let ancestor = element.parentElement;
    let depth = 0;
    while (ancestor && depth < 3) {
      addContextString(contextStrings, ancestor.id);
      if (ancestor.classList) {
        ancestor.classList.forEach(className => addContextString(contextStrings, className));
      }
      if (ancestor.getAttribute) {
        ['data-section', 'data-group', 'data-block', 'aria-label'].forEach(attribute => {
          addContextString(contextStrings, ancestor.getAttribute(attribute));
        });
      }
      ancestor = ancestor.parentElement;
      depth += 1;
    }

    const aggregated = Array.from(contextStrings);
    const matches = aggregated.some(value => keywordRegex.test(value));

    return {
      matches,
      contextStrings: aggregated
    };
  }

  function addContextString(container, value) {
    if (!value) return;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return;
    const truncated = normalized.length > 260 ? normalized.slice(0, 260) : normalized;
    container.add(truncated);
  }

  function notifyChange({ type, element, previousValue, currentValue, context }) {
    if (!context || !context.matches) {
      return;
    }

    const messageKey = `${type}:${normalizeWhitespace(previousValue)}=>${normalizeWhitespace(currentValue)}`;
    if (notifiedChanges.has(messageKey)) {
      return;
    }

    notifiedChanges.add(messageKey);
    setTimeout(() => notifiedChanges.delete(messageKey), NOTIFICATION_LIFETIME * 2);

    highlightElement(element);

    const message = buildMessage(type, previousValue, currentValue, context);
    renderNotification(message);
  }

  function buildMessage(type, previousValue, currentValue, context) {
    const summary = type === 'removed' ? 'Menu item removed' : 'Menu content updated';
    const changeDetail = type === 'removed'
      ? truncate(`Removed: ${previousValue}`)
      : truncate(`Updated: ${previousValue || '[empty]'} → ${currentValue || '[empty]'}`);

    return {
      title: summary,
      detail: changeDetail,
      location: describeContext(context),
      reminder: 'Please update the external allergen information to match this change.'
    };
  }

  function describeContext(context) {
    if (!context || !Array.isArray(context.contextStrings)) return '';

    const interesting = context.contextStrings.find(entry => {
      return KEYWORDS.some(keyword => entry.includes(keyword));
    });

    const fallback = context.contextStrings.find(entry => entry.trim().length > 0);
    return truncate(interesting || fallback || '', 80);
  }

  function truncate(text, length = 160) {
    if (!text) return '';
    if (text.length <= length) return text;
    return `${text.slice(0, length - 1)}…`;
  }

  function highlightElement(element) {
    if (!element || !element.classList) return;
    if (!document.contains(element)) return;

    element.classList.add(HIGHLIGHT_CLASS);
    setTimeout(() => {
      element.classList.remove(HIGHLIGHT_CLASS);
    }, NOTIFICATION_LIFETIME);
  }

  function renderNotification(content) {
    ensureNotificationContainer();

    const notification = document.createElement('div');
    notification.className = 'menu-change-monitor__notification';

    const title = document.createElement('div');
    title.className = 'menu-change-monitor__title';
    title.textContent = content.title;

    const detail = document.createElement('div');
    detail.className = 'menu-change-monitor__detail';
    detail.textContent = content.detail;

    const reminder = document.createElement('div');
    reminder.className = 'menu-change-monitor__reminder';
    reminder.textContent = content.reminder;

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'menu-change-monitor__dismiss';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => {
      notification.remove();
    });

    notification.appendChild(dismiss);
    notification.appendChild(title);
    notification.appendChild(detail);
    if (content.location) {
      const location = document.createElement('div');
      location.className = 'menu-change-monitor__context';
      location.textContent = `Detected near: ${content.location}`;
      notification.appendChild(location);
    }
    notification.appendChild(reminder);

    notificationContainer.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, NOTIFICATION_LIFETIME);
  }

  function ensureNotificationContainer() {
    if (notificationContainer) return;

    notificationContainer = document.createElement('div');
    notificationContainer.className = 'menu-change-monitor__container';
    document.body.appendChild(notificationContainer);
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .menu-change-monitor__container {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: min(360px, 80vw);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .menu-change-monitor__notification {
        background: rgba(18, 57, 166, 0.95);
        color: #fff;
        padding: 16px;
        border-radius: 12px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.25);
        animation: menu-change-monitor__fade-in 200ms ease-out;
      }

      .menu-change-monitor__notification::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0));
        pointer-events: none;
      }

      .menu-change-monitor__title {
        font-weight: 700;
        margin-bottom: 4px;
        font-size: 15px;
      }

      .menu-change-monitor__detail {
        font-size: 13px;
        margin-bottom: 8px;
        opacity: 0.9;
      }

      .menu-change-monitor__context {
        font-size: 12px;
        margin-bottom: 6px;
        opacity: 0.85;
      }

      .menu-change-monitor__reminder {
        font-size: 12px;
        opacity: 0.85;
      }

      .menu-change-monitor__dismiss {
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.25);
        color: #fff;
        border: none;
        border-radius: 9999px;
        padding: 4px 10px;
        font-size: 11px;
        cursor: pointer;
      }

      .menu-change-monitor__dismiss:hover {
        background: rgba(0, 0, 0, 0.4);
      }

      .menu-change-monitor__highlight {
        outline: 3px solid rgba(18, 57, 166, 0.65);
        outline-offset: 2px;
        transition: outline 120ms ease-out;
      }

      @keyframes menu-change-monitor__fade-in {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;

    document.head.appendChild(style);
  }

  if (typeof window !== 'undefined') {
    window.__MENU_CHANGE_MONITOR_TEST_HOOKS__ = {
      buildMessage: (type, previousValue, currentValue, context) =>
        buildMessage(type, previousValue, currentValue, context),
      describeContext: context => describeContext(context),
      truncate: (text, length) => truncate(text, length),
      normalizeWhitespace: value => normalizeWhitespace(value),
      keywordRegex
    };
  }
})();
