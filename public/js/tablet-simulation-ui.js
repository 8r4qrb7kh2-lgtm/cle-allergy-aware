import { createSimulationEngine, ORDER_STATUSES, BUTTON_PANEL } from './tablet-simulation-core.mjs';

const engine = createSimulationEngine();

const elements = {
  form: document.getElementById('guestOrderForm'),
  nameInput: document.getElementById('guestName'),
  partyInput: document.getElementById('partySize'),
  notesInput: document.getElementById('guestNotes'),
  allergenInputs: Array.from(document.querySelectorAll('.allergen-grid input[type="checkbox"]')),
  modeOptions: Array.from(document.querySelectorAll('.mode-option')),
  startBtn: document.getElementById('startWorkflowBtn'),
  resetBtn: document.getElementById('resetWorkflowBtn'),
  requestCodeBtn: document.getElementById('requestCodeBtn'),
  codeInput: document.getElementById('codeInput'),
  submitCodeBtn: document.getElementById('submitCodeBtn'),
  statusChip: document.getElementById('orderStatusChip'),
  submissionCodeDisplay: document.getElementById('submissionCodeDisplay'),
  chefAcknowledgementDisplay: document.getElementById('chefAcknowledgementDisplay'),
  lastActionDisplay: document.getElementById('lastActionDisplay'),
  timelineList: document.getElementById('timelineList'),
  userQuestion: document.getElementById('userQuestion'),
  userQuestionText: document.querySelector('#userQuestion .question-text'),
  userQuestionButtons: Array.from(document.querySelectorAll('#userQuestion button[data-response]')),
  openSidebarBtn: document.getElementById('openSidebarBtn'),
  floatingSidebarBtn: document.getElementById('floatingSidebarBtn'),
  sidebarBackdrop: document.getElementById('tabletSidebarBackdrop'),
  sidebar: document.getElementById('tabletSidebar'),
  closeSidebarBtn: document.getElementById('closeSidebarBtn'),
  serverRequestState: document.getElementById('serverRequestState'),
  serverReviewState: document.getElementById('serverReviewState'),
  kitchenActiveOrder: document.getElementById('kitchenActiveOrder'),
  kitchenButtonDeck: document.getElementById('kitchenButtonDeck'),
  chefList: document.getElementById('chefList'),
  kitchenQuestionInput: document.getElementById('kitchenQuestionInput'),
  sendKitchenQuestionBtn: document.getElementById('sendKitchenQuestionBtn')
};

const state = {
  mode: 'dine-in',
  activeOrderId: null,
  latestOrder: null
};

function formatStatus(status) {
  switch (status) {
    case ORDER_STATUSES.DRAFT:
      return 'Draft — guest composing notice';
    case ORDER_STATUSES.AWAITING_CODE:
      return 'Waiting on server authorization code';
    case ORDER_STATUSES.CODE_ISSUED:
      return 'Code issued — guest must submit to server';
    case ORDER_STATUSES.PENDING_SERVER_REVIEW:
      return 'Server reviewing notice';
    case ORDER_STATUSES.QUEUED_FOR_KITCHEN:
      return 'Kitchen notified — awaiting tactile response';
    case ORDER_STATUSES.AWAITING_USER_RESPONSE:
      return 'Kitchen awaiting guest response';
    case ORDER_STATUSES.ACKNOWLEDGED:
      return 'Kitchen acknowledged allergies';
    case ORDER_STATUSES.COMPLETED:
      return 'Workflow complete';
    default:
      return 'Not started';
  }
}

function formatTimestamp(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setSidebarOpen(isOpen) {
  if (!elements.sidebar) return;
  elements.sidebar.classList.toggle('is-open', isOpen);
  elements.sidebarBackdrop.classList.toggle('is-visible', isOpen);
  elements.sidebar.setAttribute('aria-hidden', String(!isOpen));
  elements.floatingSidebarBtn.setAttribute('aria-expanded', String(isOpen));
}

function collectAllergies() {
  return elements.allergenInputs.filter(input => input.checked).map(input => input.value);
}

function resetFormControls() {
  elements.form.reset();
  elements.modeOptions.forEach(btn => btn.classList.toggle('is-active', btn.dataset.mode === 'dine-in'));
  elements.allergenInputs.forEach(input => input.closest('label').classList.remove('is-checked'));
  state.mode = 'dine-in';
}

function clearWorkflowState() {
  state.activeOrderId = null;
  state.latestOrder = null;
  elements.requestCodeBtn.disabled = true;
  elements.codeInput.disabled = true;
  elements.codeInput.value = '';
  elements.submitCodeBtn.disabled = true;
  elements.resetBtn.disabled = true;
  elements.statusChip.textContent = 'No order yet';
  elements.submissionCodeDisplay.textContent = '—';
  elements.chefAcknowledgementDisplay.textContent = 'Waiting for server approval';
  elements.lastActionDisplay.textContent = '—';
  elements.userQuestion.hidden = true;
  elements.timelineList.innerHTML = '<li class="empty-state">Actions will appear here when you start a workflow.</li>';
  renderServerTablet(null);
  renderKitchenTablet(null);
}

function renderTimeline(order) {
  if (!order || !order.timeline.length) {
    elements.timelineList.innerHTML = '<li class="empty-state">Actions will appear here when you start a workflow.</li>';
    return;
  }
  const items = order.timeline
    .slice()
    .reverse()
    .map(entry => {
      const actor = entry.actor.replace('_', ' ');
      const time = formatTimestamp(entry.createdAt);
      return `
        <li>
          <div class="meta">${time} • ${actor}</div>
          <div class="message">${entry.message}</div>
        </li>
      `;
    })
    .join('');
  elements.timelineList.innerHTML = items;
}

function renderGuestStatus(order) {
  if (!order) return;
  elements.statusChip.textContent = formatStatus(order.status);
  elements.submissionCodeDisplay.textContent = order.serverCode ? `${order.serverCode}` : '—';
  if (order.acknowledgedByChefId) {
    const chef = engine.getChefs().find(c => c.id === order.acknowledgedByChefId);
    elements.chefAcknowledgementDisplay.textContent = chef
      ? `${chef.name} at ${formatTimestamp(order.kitchenAcknowledgedAt)}`
      : `Chef certified at ${formatTimestamp(order.kitchenAcknowledgedAt)}`;
  } else if (order.status === ORDER_STATUSES.QUEUED_FOR_KITCHEN) {
    elements.chefAcknowledgementDisplay.textContent = 'Waiting for kitchen confirmation';
  } else if (order.status === ORDER_STATUSES.PENDING_SERVER_REVIEW) {
    elements.chefAcknowledgementDisplay.textContent = 'Server reviewing before sending to kitchen';
  } else if (order.status === ORDER_STATUSES.CODE_ISSUED) {
    elements.chefAcknowledgementDisplay.textContent = 'Submit to server after entering code';
  } else if (order.status === ORDER_STATUSES.AWAITING_CODE) {
    elements.chefAcknowledgementDisplay.textContent = 'Waiting on server for submission code';
  } else {
    elements.chefAcknowledgementDisplay.textContent = 'Waiting for server approval';
  }

  const lastEntry = order.timeline[order.timeline.length - 1];
  elements.lastActionDisplay.textContent = lastEntry ? `${lastEntry.message}` : '—';

  elements.requestCodeBtn.disabled = order.status !== ORDER_STATUSES.DRAFT;
  elements.codeInput.disabled = order.status !== ORDER_STATUSES.CODE_ISSUED;
  elements.submitCodeBtn.disabled = order.status !== ORDER_STATUSES.CODE_ISSUED;
  elements.resetBtn.disabled = false;

  if (order.status === ORDER_STATUSES.AWAITING_USER_RESPONSE && order.pendingQuestion) {
    elements.userQuestion.hidden = false;
    elements.userQuestionText.textContent = order.pendingQuestion.question;
    elements.userQuestionButtons.forEach(btn => (btn.disabled = false));
  } else {
    elements.userQuestion.hidden = true;
  }

  if (order.status === ORDER_STATUSES.CODE_ISSUED) {
    elements.codeInput.value = '';
    setTimeout(() => elements.codeInput.focus(), 50);
  }
}

function renderServerTablet(order) {
  if (!order) {
    elements.serverRequestState.classList.add('empty');
    elements.serverRequestState.textContent = 'No guest has requested a code yet.';
    elements.serverReviewState.classList.add('empty');
    elements.serverReviewState.textContent = 'Waiting for a guest to submit their allergies.';
    return;
  }

  // Pending code request
  if (order.status === ORDER_STATUSES.AWAITING_CODE) {
    elements.serverRequestState.classList.remove('empty');
    elements.serverRequestState.innerHTML = `
      <div>
        <strong>${order.customerName || 'Guest'} needs a submission code</strong>
        <p class="muted-text">Party of ${order.partySize} • ${order.deliveryMode}</p>
      </div>
      <button class="primary-btn" type="button" data-action="generate-code">Generate 4-digit code</button>
    `;
  } else if (order.status === ORDER_STATUSES.CODE_ISSUED) {
    elements.serverRequestState.classList.remove('empty');
    elements.serverRequestState.innerHTML = `
      <div>
        <strong>Code shared with guest</strong>
        <p class="muted-text">Tell them: <span style="font-size:1.4rem;font-weight:700;letter-spacing:0.08em;">${order.serverCode}</span></p>
      </div>
    `;
  } else {
    elements.serverRequestState.classList.add('empty');
    elements.serverRequestState.textContent = 'No guest has requested a code yet.';
  }

  const generateBtn = elements.serverRequestState.querySelector('[data-action="generate-code"]');
  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      try {
        engine.issueServerCode(order.id);
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Review state
  if (order.status === ORDER_STATUSES.PENDING_SERVER_REVIEW) {
    elements.serverReviewState.classList.remove('empty');
    elements.serverReviewState.innerHTML = `
      <div>
        <strong>Review and forward to kitchen</strong>
        <dl>
          <div>
            <dt>Allergens</dt>
            <dd>${order.allergies.length ? order.allergies.join(', ') : 'None selected'}</dd>
          </div>
          <div>
            <dt>Guest notes</dt>
            <dd>${order.notes || '—'}</dd>
          </div>
        </dl>
      </div>
      <textarea rows="2" placeholder="Optional note for kitchen (e.g., expedite ticket)" data-role="server-comment"></textarea>
      <button class="primary-btn" type="button" data-action="approve-order">Approve &amp; send to kitchen</button>
    `;
  } else if (order.status === ORDER_STATUSES.QUEUED_FOR_KITCHEN || order.status === ORDER_STATUSES.AWAITING_USER_RESPONSE || order.status === ORDER_STATUSES.ACKNOWLEDGED || order.status === ORDER_STATUSES.COMPLETED) {
    elements.serverReviewState.classList.remove('empty');
    elements.serverReviewState.innerHTML = `
      <div>
        <strong>Released to kitchen</strong>
        <p class="muted-text">Sent at ${formatTimestamp(order.serverApprovedAt)}</p>
      </div>
    `;
  } else {
    elements.serverReviewState.classList.add('empty');
    elements.serverReviewState.textContent = 'Waiting for a guest to submit their allergies.';
  }

  const approveBtn = elements.serverReviewState.querySelector('[data-action="approve-order"]');
  if (approveBtn) {
    approveBtn.addEventListener('click', () => {
      const commentField = elements.serverReviewState.querySelector('[data-role="server-comment"]');
      try {
        engine.serverApproveOrder(order.id, { comment: commentField?.value || '' });
      } catch (err) {
        console.error(err);
      }
    });
  }
}

function renderKitchenTablet(order) {
  const chefs = engine.getChefs();

  // Active order card
  if (!order || (order.status !== ORDER_STATUSES.QUEUED_FOR_KITCHEN && order.status !== ORDER_STATUSES.AWAITING_USER_RESPONSE && order.status !== ORDER_STATUSES.ACKNOWLEDGED && order.status !== ORDER_STATUSES.COMPLETED)) {
    elements.kitchenActiveOrder.classList.add('empty');
    elements.kitchenActiveOrder.textContent = 'Server has not released an order yet.';
    elements.sendKitchenQuestionBtn.disabled = true;
  } else {
    elements.kitchenActiveOrder.classList.remove('empty');
    const statusLine = formatStatus(order.status);
    const pending = order.pendingQuestion
      ? `<p><strong>Awaiting guest:</strong> ${order.pendingQuestion.question}</p>`
      : '';
    elements.kitchenActiveOrder.innerHTML = `
      <div>
        <strong>${order.customerName || 'Guest'} • Party of ${order.partySize}</strong>
        <p class="muted-text">${order.deliveryMode === 'dine-in' ? 'Dine-in service' : 'Delivery / takeout'}</p>
      </div>
      <dl>
        <div>
          <dt>Allergens</dt>
          <dd>${order.allergies.length ? order.allergies.join(', ') : 'None supplied'}</dd>
        </div>
        <div>
          <dt>Guest notes</dt>
          <dd>${order.notes || '—'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>${statusLine}</dd>
        </div>
      </dl>
      ${pending}
    `;
    elements.sendKitchenQuestionBtn.disabled = Boolean(order.pendingQuestion);
  }

  // Button deck
  elements.kitchenButtonDeck.innerHTML = '';
  BUTTON_PANEL.forEach(btn => {
    const buttonEl = document.createElement('button');
    buttonEl.type = 'button';
    buttonEl.textContent = btn.label;
    buttonEl.dataset.tone = btn.tone;
    buttonEl.disabled = !order || (order.status !== ORDER_STATUSES.QUEUED_FOR_KITCHEN && order.status !== ORDER_STATUSES.AWAITING_USER_RESPONSE && order.status !== ORDER_STATUSES.ACKNOWLEDGED);
    if (order) {
      buttonEl.addEventListener('click', () => {
        try {
          engine.recordButtonPress(order.id, btn.id);
        } catch (err) {
          console.error(err);
        }
      });
    }
    elements.kitchenButtonDeck.appendChild(buttonEl);
  });

  // Chef list
  elements.chefList.innerHTML = '';
  chefs.forEach(chef => {
    const card = document.createElement('div');
    card.className = 'chef-card';
    card.innerHTML = `
      <header>
        <strong>${chef.name}</strong>
        <span>${chef.title}</span>
      </header>
      <button class="primary-btn" type="button">Scan Face &amp; certify</button>
    `;
    const button = card.querySelector('button');
    button.disabled = !order || (order.status !== ORDER_STATUSES.QUEUED_FOR_KITCHEN && order.status !== ORDER_STATUSES.AWAITING_USER_RESPONSE);
    button.addEventListener('click', () => {
      if (!order) return;
      try {
        engine.recordButtonPress(order.id, 'acknowledge');
        engine.acknowledgeAllergies(order.id, chef.id);
      } catch (err) {
        console.error(err);
      }
    });
    elements.chefList.appendChild(card);
  });
}

function refreshUI(order) {
  state.latestOrder = order;
  renderGuestStatus(order);
  renderTimeline(order);
  renderServerTablet(order);
  renderKitchenTablet(order);
}

elements.modeOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    elements.modeOptions.forEach(option => option.classList.toggle('is-active', option === btn));
  });
});

elements.allergenInputs.forEach(input => {
  input.addEventListener('change', () => {
    const label = input.closest('label');
    if (!label) return;
    label.classList.toggle('is-checked', input.checked);
  });
});

elements.form.addEventListener('submit', event => {
  event.preventDefault();
  const order = engine.createOrder({
    customerName: elements.nameInput.value.trim(),
    partySize: Number(elements.partyInput.value) || 1,
    allergies: collectAllergies(),
    deliveryMode: state.mode,
    notes: elements.notesInput.value.trim()
  });
  state.activeOrderId = order.id;
  refreshUI(order);
  elements.requestCodeBtn.disabled = false;
  elements.resetBtn.disabled = false;
  if (!elements.sidebar.classList.contains('is-open')) {
    setSidebarOpen(true);
  }
});

elements.resetBtn.addEventListener('click', () => {
  resetFormControls();
  clearWorkflowState();
});

elements.requestCodeBtn.addEventListener('click', () => {
  if (!state.activeOrderId) return;
  try {
    const updated = engine.requestServerCode(state.activeOrderId);
    refreshUI(updated);
  } catch (err) {
    console.error(err);
  }
});

elements.submitCodeBtn.addEventListener('click', () => {
  if (!state.activeOrderId) return;
  try {
    const updated = engine.submitOrderWithCode(state.activeOrderId, elements.codeInput.value.trim());
    refreshUI(updated);
  } catch (err) {
    elements.lastActionDisplay.textContent = err.message === 'Code mismatch'
      ? 'Code incorrect — double check with your server.'
      : err.message;
  }
});

elements.userQuestionButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!state.activeOrderId) return;
    const response = btn.dataset.response;
    try {
      const updated = engine.userRespond(state.activeOrderId, response);
      refreshUI(updated);
    } catch (err) {
      console.error(err);
    }
  });
});

elements.sendKitchenQuestionBtn.addEventListener('click', () => {
  if (!state.activeOrderId) return;
  const question = elements.kitchenQuestionInput.value.trim();
  if (!question) {
    elements.kitchenQuestionInput.focus();
    return;
  }
  try {
    const updated = engine.sendKitchenQuestion(state.activeOrderId, question);
    elements.kitchenQuestionInput.value = '';
    refreshUI(updated);
  } catch (err) {
    console.error(err);
  }
});

[elements.openSidebarBtn, elements.floatingSidebarBtn].forEach(btn => {
  if (!btn) return;
  btn.addEventListener('click', () => setSidebarOpen(true));
});

elements.sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));
elements.closeSidebarBtn.addEventListener('click', () => setSidebarOpen(false));

engine.on('orderCreated', order => {
  if (order.id === state.activeOrderId) {
    refreshUI(order);
  }
});

engine.on('orderUpdated', order => {
  if (order.id === state.activeOrderId) {
    refreshUI(order);
  }
});

resetFormControls();
clearWorkflowState();
