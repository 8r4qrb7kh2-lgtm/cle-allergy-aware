import {
  createInitialState,
  createOrderDraft,
  DEFAULT_ALLERGENS,
  ORDER_STATUSES,
  requestServerCode,
  submitOrderToServer,
  serverApprove,
  serverDispatchToKitchen,
  kitchenAcknowledge,
  kitchenAskQuestion,
  userRespondToQuestion,
  canKitchenAcknowledge,
  canKitchenAskQuestion,
  canUserRespond
} from './tablet-simulation-logic.mjs';
import { setupNav } from './shared-nav.js';

const state = createInitialState();
let selectedAllergies = new Set();
let selectedOrderId = null;
let formBoundOrderId = null;
let pendingFaceIdOrderId = null;
const questionDrafts = new Map();

const STATUS_LABELS = {
  [ORDER_STATUSES.CODE_ASSIGNED]: 'Awaiting diner submission',
  [ORDER_STATUSES.SUBMITTED_TO_SERVER]: 'Waiting for server approval',
  [ORDER_STATUSES.QUEUED_FOR_KITCHEN]: 'Ready for kitchen timing',
  [ORDER_STATUSES.WITH_KITCHEN]: 'At kitchen tablet',
  [ORDER_STATUSES.ACKNOWLEDGED]: 'Chef acknowledged allergies',
  [ORDER_STATUSES.AWAITING_USER_RESPONSE]: 'Waiting for diner response',
  [ORDER_STATUSES.QUESTION_ANSWERED]: 'Follow-up answered'
};

const STATUS_TONES = {
  [ORDER_STATUSES.CODE_ASSIGNED]: 'info',
  [ORDER_STATUSES.SUBMITTED_TO_SERVER]: 'warn',
  [ORDER_STATUSES.QUEUED_FOR_KITCHEN]: 'info',
  [ORDER_STATUSES.WITH_KITCHEN]: 'active',
  [ORDER_STATUSES.ACKNOWLEDGED]: 'success',
  [ORDER_STATUSES.AWAITING_USER_RESPONSE]: 'warn',
  [ORDER_STATUSES.QUESTION_ANSWERED]: 'muted'
};

const ORDER_FLOW_ORDER = [
  ORDER_STATUSES.CODE_ASSIGNED,
  ORDER_STATUSES.SUBMITTED_TO_SERVER,
  ORDER_STATUSES.QUEUED_FOR_KITCHEN,
  ORDER_STATUSES.WITH_KITCHEN,
  ORDER_STATUSES.ACKNOWLEDGED,
  ORDER_STATUSES.AWAITING_USER_RESPONSE,
  ORDER_STATUSES.QUESTION_ANSWERED
];

const orderForm = document.getElementById('order-form');
const requestCodeBtn = document.getElementById('request-code-btn');
const requestStatus = document.getElementById('request-status');
const codeEntryBlock = document.getElementById('code-entry-block');
const generatedCodeEl = document.getElementById('generated-code');
const submitToServerBtn = document.getElementById('submit-to-server-btn');
const submissionStatus = document.getElementById('submission-status');
const serverCodeInput = document.getElementById('server-code-input');
const startNewOrderBtn = document.getElementById('start-new-order-btn');
const userOrderListEl = document.getElementById('user-order-list');
const userOrderDetailEl = document.getElementById('user-order-detail');
const serverQueueEl = document.getElementById('server-tablet-queue');
const kitchenQueueEl = document.getElementById('kitchen-tablet-queue');

document.addEventListener('DOMContentLoaded', () => {
  setupNav('tablet-simulation');
  renderAllergyChips();
  bindModeSwitcher();
  renderAll();
});

requestCodeBtn.addEventListener('click', () => {
  requestStatus.textContent = '';
  requestStatus.classList.remove('error', 'success');
  try {
    if (!orderForm.reportValidity()) {
      return;
    }
    const formPayload = collectFormData();
    const draft = createOrderDraft(formPayload);
    const allergiesMessage = draft.allergies.length
      ? `Flagged allergens: ${draft.allergies.join(', ')}`
      : 'No allergens selected; sending confirmation request.';
    draft.history.push({
      at: new Date().toISOString(),
      actor: 'Diner',
      message: allergiesMessage
    });
    if (draft.customNotes) {
      draft.history.push({
        at: new Date().toISOString(),
        actor: 'Diner',
        message: `Added kitchen note: "${draft.customNotes}"`
      });
    }
    const order = requestServerCode(state, draft);
    formBoundOrderId = order.id;
    selectedOrderId = order.id;
    requestCodeBtn.disabled = true;
    generatedCodeEl.textContent = order.serverCode;
    codeEntryBlock.hidden = false;
    serverCodeInput.value = '';
    announceSuccess(requestStatus, 'Server code generated. Share it with your server.');
    renderAll();
  } catch (error) {
    announceError(requestStatus, error.message);
  }
});

submitToServerBtn.addEventListener('click', () => {
  submissionStatus.textContent = '';
  submissionStatus.classList.remove('error', 'success');
  if (!formBoundOrderId) {
    announceError(submissionStatus, 'Request a server code first.');
    return;
  }
  const codeValue = serverCodeInput.value.trim();
  if (!codeValue) {
    announceError(submissionStatus, 'Enter the code your server provided.');
    return;
  }
  try {
    const order = submitOrderToServer(state, formBoundOrderId, codeValue);
    announceSuccess(submissionStatus, 'Sent to server tablet for approval.');
    if (order.status !== ORDER_STATUSES.CODE_ASSIGNED) {
      codeEntryBlock.hidden = true;
      requestCodeBtn.disabled = true;
    }
    renderAll();
  } catch (error) {
    announceError(submissionStatus, error.message);
  }
});

startNewOrderBtn.addEventListener('click', () => {
  resetFormForNewOrder();
});

function collectFormData() {
  const diningMode = orderForm.elements['diningMode'].value;
  const tableNumber = document.getElementById('table-number').value.trim();
  const deliveryNotes = document.getElementById('delivery-notes').value.trim();
  const data = {
    customerName: document.getElementById('customer-name').value,
    restaurantName: document.getElementById('restaurant-name').value,
    diningMode,
    tableOrPickup: diningMode === 'dine-in' ? tableNumber : '',
    deliveryAddress: diningMode === 'delivery' ? deliveryNotes : '',
    allergies: Array.from(selectedAllergies),
    customNotes: document.getElementById('custom-notes').value
  };
  return data;
}

function renderAll() {
  ensureSelection();
  renderUserOrderList();
  renderUserOrderDetail();
  renderServerTablet();
  renderKitchenTablet();
}

function ensureSelection() {
  if (state.orders.length === 0) {
    selectedOrderId = null;
    return;
  }
  if (!selectedOrderId || !state.orders.find(order => order.id === selectedOrderId)) {
    selectedOrderId = state.orders[state.orders.length - 1].id;
  }
}

function renderAllergyChips() {
  const container = document.getElementById('allergy-chips');
  container.innerHTML = '';
  DEFAULT_ALLERGENS.forEach(allergen => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${selectedAllergies.has(allergen) ? ' active' : ''}`;
    chip.textContent = allergen;
    chip.addEventListener('click', () => {
      if (selectedAllergies.has(allergen)) {
        selectedAllergies.delete(allergen);
      } else {
        selectedAllergies.add(allergen);
      }
      renderAllergyChips();
    });
    container.appendChild(chip);
  });
}

function renderUserOrderList() {
  userOrderListEl.innerHTML = '';
  if (state.orders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No allergy notices yet. Build an order to see it appear here.';
    userOrderListEl.appendChild(empty);
    return;
  }

  const sorted = [...state.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const order of sorted) {
    const card = document.createElement('article');
    card.className = `order-card${order.id === selectedOrderId ? ' is-active' : ''}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', order.id === selectedOrderId ? 'true' : 'false');
    card.addEventListener('click', () => {
      selectedOrderId = order.id;
      renderAll();
    });
    card.addEventListener('keyup', evt => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        selectedOrderId = order.id;
        renderAll();
      }
    });

    const title = document.createElement('h3');
    title.textContent = `${order.customerName} @ ${order.restaurantName}`;
    card.appendChild(title);

    const info = document.createElement('p');
    info.className = 'muted-text';
    info.textContent = formatDiningSummary(order);
    card.appendChild(info);

    card.appendChild(createStatusBadge(order.status));

    userOrderListEl.appendChild(card);
  }
}

function renderUserOrderDetail() {
  userOrderDetailEl.innerHTML = '';
  if (!selectedOrderId) {
    const placeholder = document.createElement('div');
    placeholder.className = 'empty-state';
    placeholder.textContent = 'Select an order to view its timeline and respond to the kitchen.';
    userOrderDetailEl.appendChild(placeholder);
    return;
  }
  const order = state.orders.find(o => o.id === selectedOrderId);
  if (!order) return;

  const header = document.createElement('div');
  header.className = 'order-detail-head';
  const title = document.createElement('h3');
  title.textContent = `${order.customerName}'s request`;
  header.appendChild(title);
  header.appendChild(createStatusBadge(order.status));
  userOrderDetailEl.appendChild(header);

  const summary = document.createElement('div');
  summary.className = 'order-summary';
  summary.innerHTML = `
    <dl>
      <div><dt>Restaurant</dt><dd>${order.restaurantName}</dd></div>
      <div><dt>Mode</dt><dd>${formatDiningSummary(order)}</dd></div>
      <div><dt>Allergies</dt><dd>${order.allergies.length ? order.allergies.join(', ') : 'None selected'}</dd></div>
      <div><dt>Notes</dt><dd>${order.customNotes || '—'}</dd></div>
    </dl>
  `;
  userOrderDetailEl.appendChild(summary);

  const timeline = document.createElement('ol');
  timeline.className = 'timeline';
  for (const event of order.history) {
    const item = document.createElement('li');
    item.innerHTML = `
      <div class="timeline-marker"></div>
      <div class="timeline-content">
        <span class="timeline-actor">${event.actor}</span>
        <p>${event.message}</p>
        <time>${formatTimestamp(event.at)}</time>
      </div>
    `;
    timeline.appendChild(item);
  }
  userOrderDetailEl.appendChild(timeline);

  if (canUserRespond(order)) {
    const question = order.kitchenQuestion;
    if (question) {
      const responseBlock = document.createElement('div');
      responseBlock.className = 'user-response-block';
      responseBlock.innerHTML = `
        <h4>Kitchen follow-up</h4>
        <p>${question.text}</p>
        <p class="muted-text">Respond with the physical confirm buttons on your phone.</p>
      `;

      const responseButtons = document.createElement('div');
      responseButtons.className = 'response-buttons';

      const yesBtn = document.createElement('button');
      yesBtn.type = 'button';
      yesBtn.className = 'primary-btn';
      yesBtn.textContent = 'Yes';
      yesBtn.addEventListener('click', () => handleUserResponse(order.id, 'yes'));

      const noBtn = document.createElement('button');
      noBtn.type = 'button';
      noBtn.className = 'secondary-btn';
      noBtn.textContent = 'No';
      noBtn.addEventListener('click', () => handleUserResponse(order.id, 'no'));

      responseButtons.appendChild(yesBtn);
      responseButtons.appendChild(noBtn);
      responseBlock.appendChild(responseButtons);
      userOrderDetailEl.appendChild(responseBlock);
    }
  } else if (order.kitchenQuestion && order.kitchenQuestion.response) {
    const answered = document.createElement('div');
    answered.className = 'user-response-block';
    answered.innerHTML = `
      <h4>Follow-up complete</h4>
      <p class="muted-text">You responded <strong>${order.kitchenQuestion.response.toUpperCase()}</strong> to the kitchen.</p>
    `;
    userOrderDetailEl.appendChild(answered);
  }
}

function handleUserResponse(orderId, answer) {
  try {
    userRespondToQuestion(state, orderId, answer);
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

function renderServerTablet() {
  serverQueueEl.innerHTML = '';
  const serverRelevant = state.orders.filter(order =>
    [
      ORDER_STATUSES.CODE_ASSIGNED,
      ORDER_STATUSES.SUBMITTED_TO_SERVER,
      ORDER_STATUSES.QUEUED_FOR_KITCHEN
    ].includes(order.status)
  );
  if (serverRelevant.length === 0) {
    serverQueueEl.appendChild(buildTabletEmpty('No allergy submissions waiting on the server tablet.'));
    return;
  }

  const ordered = [...serverRelevant].sort((a, b) => ORDER_FLOW_ORDER.indexOf(a.status) - ORDER_FLOW_ORDER.indexOf(b.status));
  for (const order of ordered) {
    const card = document.createElement('article');
    card.className = 'tablet-order';

    card.innerHTML = `
      <header>
        <h3>${order.customerName} · ${order.restaurantName}</h3>
        <div class="meta">${formatDiningSummary(order)}</div>
      </header>
    `;
    card.appendChild(createStatusBadge(order.status));

    const body = document.createElement('div');
    body.className = 'tablet-order-body';

    if (order.status === ORDER_STATUSES.CODE_ASSIGNED) {
      const info = document.createElement('p');
      info.innerHTML = `
        Share code <strong class="tablet-code">${order.serverCode}</strong> with the diner. Waiting for them to confirm before POS entry.
      `;
      body.appendChild(info);
      body.appendChild(makeHardwarePanel([{ label: 'Awaiting diner...', disabled: true }]));
    }

    if (order.status === ORDER_STATUSES.SUBMITTED_TO_SERVER) {
      body.appendChild(makeHardwarePanel([
        {
          label: 'Approve & stage for kitchen',
          action: () => handleServerApprove(order.id),
          tone: 'primary'
        },
        {
          label: 'Hold for follow-up',
          disabled: true
        }
      ]));
    }

    if (order.status === ORDER_STATUSES.QUEUED_FOR_KITCHEN) {
      const note = document.createElement('p');
      note.className = 'muted-text';
      note.textContent = 'Ready when you send the order through the POS.';
      body.appendChild(note);
      body.appendChild(makeHardwarePanel([
        {
          label: 'Send to kitchen now',
          action: () => handleServerDispatch(order.id),
          tone: 'primary'
        },
        {
          label: 'Keep holding',
          disabled: true
        }
      ]));
    }

    card.appendChild(body);
    serverQueueEl.appendChild(card);
  }
}

function handleServerApprove(orderId) {
  try {
    serverApprove(state, orderId);
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

function handleServerDispatch(orderId) {
  try {
    serverDispatchToKitchen(state, orderId);
    if (formBoundOrderId === orderId) {
      requestCodeBtn.disabled = false;
      formBoundOrderId = null;
      codeEntryBlock.hidden = true;
    }
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

function renderKitchenTablet() {
  kitchenQueueEl.innerHTML = '';
  const kitchenRelevant = state.orders.filter(order =>
    [
      ORDER_STATUSES.WITH_KITCHEN,
      ORDER_STATUSES.ACKNOWLEDGED,
      ORDER_STATUSES.AWAITING_USER_RESPONSE,
      ORDER_STATUSES.QUESTION_ANSWERED
    ].includes(order.status)
  );

  if (kitchenRelevant.length === 0) {
    kitchenQueueEl.appendChild(buildTabletEmpty('No allergy notices on the line right now.'));
    return;
  }

  const sorted = [...kitchenRelevant].sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
  for (const order of sorted) {
    const card = document.createElement('article');
    card.className = 'tablet-order';
    card.innerHTML = `
      <header>
        <h3>${order.customerName} · ${order.restaurantName}</h3>
        <div class="meta">${order.allergies.length ? `Allergies: ${order.allergies.join(', ')}` : 'No allergens flagged'}</div>
      </header>
    `;
    card.appendChild(createStatusBadge(order.status));

    const body = document.createElement('div');
    body.className = 'tablet-order-body';

    if (canKitchenAcknowledge(order)) {
      body.appendChild(makeHardwarePanel([
        {
          label: 'Acknowledge & FaceID',
          action: () => openFaceIdPrompt(order.id),
          tone: 'primary'
        },
        {
          label: 'Need manager',
          disabled: true
        }
      ]));
    } else {
      body.appendChild(makeHardwarePanel([
        {
          label: order.status === ORDER_STATUSES.ACKNOWLEDGED ? 'Acknowledged' : 'Awaiting response',
          disabled: true
        }
      ]));
    }

    if (pendingFaceIdOrderId === order.id) {
      body.appendChild(renderFaceIdPrompt(order.id));
    }

    if (canKitchenAskQuestion(order)) {
      body.appendChild(renderQuestionComposer(order.id));
    } else if (order.kitchenQuestion) {
      const questionBlock = document.createElement('div');
      questionBlock.className = 'question-card';
      questionBlock.innerHTML = `
        <h4>Follow-up sent</h4>
        <p>${order.kitchenQuestion.text}</p>
        <p class="muted-text">
          ${order.kitchenQuestion.response
            ? `Diner responded ${order.kitchenQuestion.response.toUpperCase()}`
            : 'Awaiting diner response'}
        </p>
      `;
      body.appendChild(questionBlock);
    }

    if (order.faceIdAudit.length > 0) {
      const audit = document.createElement('div');
      audit.className = 'faceid-audit';
      audit.innerHTML = '<h4>FaceID acknowledgements</h4>';
      const items = document.createElement('ul');
      for (const entry of order.faceIdAudit) {
        const li = document.createElement('li');
        li.textContent = `${entry.chefName} • ${entry.role ?? ''} • ${formatTimestamp(entry.at)}`;
        items.appendChild(li);
      }
      audit.appendChild(items);
      body.appendChild(audit);
    }

    card.appendChild(body);
    kitchenQueueEl.appendChild(card);
  }
}

function openFaceIdPrompt(orderId) {
  pendingFaceIdOrderId = orderId;
  renderAll();
}

function renderFaceIdPrompt(orderId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'faceid-prompt';
  wrapper.innerHTML = '<h4>Select enrolled chef for FaceID scan</h4>';
  const list = document.createElement('div');
  list.className = 'faceid-grid';

  for (const chef of state.chefs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'faceid-option';
    btn.innerHTML = `
      <span class="faceid-name">${chef.name}</span>
      <span class="faceid-role">${chef.role}</span>
      <span class="faceid-tag">${chef.faceIdTag}</span>
    `;
    btn.addEventListener('click', () => {
      try {
        kitchenAcknowledge(state, orderId, chef.id);
        pendingFaceIdOrderId = null;
        renderAll();
      } catch (error) {
        alert(error.message);
      }
    });
    list.appendChild(btn);
  }

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary-btn';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => {
    pendingFaceIdOrderId = null;
    renderAll();
  });

  wrapper.appendChild(list);
  wrapper.appendChild(cancel);
  return wrapper;
}

function renderQuestionComposer(orderId) {
  const composer = document.createElement('div');
  composer.className = 'question-composer';
  composer.innerHTML = '<h4>Dictate a yes/no follow-up</h4>';

  const textarea = document.createElement('textarea');
  textarea.rows = 2;
  textarea.placeholder = 'e.g. Would you like us to cook this on a dedicated allergen-free pan?';
  textarea.value = questionDrafts.get(orderId) ?? '';
  textarea.addEventListener('input', () => {
    questionDrafts.set(orderId, textarea.value);
  });

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'hardware-btn hardware-btn--primary';
  sendBtn.textContent = 'Send to diner';
  sendBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) {
      alert('Add the question you want the diner to answer yes or no.');
      return;
    }
    try {
      kitchenAskQuestion(state, orderId, text);
      questionDrafts.set(orderId, '');
      renderAll();
    } catch (error) {
      alert(error.message);
    }
  });

  composer.appendChild(textarea);
  composer.appendChild(sendBtn);
  return composer;
}

function bindModeSwitcher() {
  const radios = orderForm.querySelectorAll('input[name="diningMode"]');
  const conditionalLabels = orderForm.querySelectorAll('.conditional-inputs [data-mode]');
  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      conditionalLabels.forEach(label => {
        const mode = label.getAttribute('data-mode');
        const matches = radio.checked && radio.value === mode;
        label.hidden = !matches;
      });
    });
  });
  // initialize
  const active = orderForm.querySelector('input[name="diningMode"]:checked');
  if (active) {
    conditionalLabels.forEach(label => {
      const mode = label.getAttribute('data-mode');
      label.hidden = active.value !== mode;
    });
  }
}

function makeHardwarePanel(buttons) {
  const panel = document.createElement('div');
  panel.className = 'hardware-panel';
  for (const config of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hardware-btn';
    if (config.tone === 'primary') {
      btn.classList.add('hardware-btn--primary');
    }
    btn.textContent = config.label;
    if (config.disabled) {
      btn.disabled = true;
    } else if (typeof config.action === 'function') {
      btn.addEventListener('click', config.action);
    }
    panel.appendChild(btn);
  }
  return panel;
}

function buildTabletEmpty(message) {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = message;
  return empty;
}

function createStatusBadge(status) {
  const badge = document.createElement('span');
  badge.className = 'status-badge';
  badge.dataset.tone = STATUS_TONES[status] ?? 'muted';
  badge.textContent = STATUS_LABELS[status] ?? status;
  return badge;
}

function formatDiningSummary(order) {
  if (order.diningMode === 'delivery') {
    return order.deliveryAddress ? `Delivery · ${order.deliveryAddress}` : 'Delivery / pickup';
  }
  return order.tableOrPickup ? `Dine-in · ${order.tableOrPickup}` : 'Dine-in service';
}

function formatTimestamp(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function announceError(target, message) {
  target.textContent = message;
  target.classList.add('error');
  target.classList.remove('success');
}

function announceSuccess(target, message) {
  target.textContent = message;
  target.classList.add('success');
  target.classList.remove('error');
}

function resetFormForNewOrder() {
  orderForm.reset();
  selectedAllergies = new Set();
  renderAllergyChips();
  bindModeSwitcher();
  requestCodeBtn.disabled = false;
  requestStatus.textContent = '';
  requestStatus.classList.remove('error', 'success');
  submissionStatus.textContent = '';
  submissionStatus.classList.remove('error', 'success');
  codeEntryBlock.hidden = true;
  generatedCodeEl.textContent = '';
  serverCodeInput.value = '';
  formBoundOrderId = null;
}
