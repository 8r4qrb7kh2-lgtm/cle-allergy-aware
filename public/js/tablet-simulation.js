const ALLERGENS = [
  { id: 'dairy', label: 'Dairy', emoji: '🥛' },
  { id: 'egg', label: 'Egg', emoji: '🥚' },
  { id: 'peanut', label: 'Peanut', emoji: '🥜' },
  { id: 'tree-nut', label: 'Tree nut', emoji: '🌰' },
  { id: 'shellfish', label: 'Shellfish', emoji: '🦐' },
  { id: 'fish', label: 'Fish', emoji: '🐟' },
  { id: 'soy', label: 'Soy', emoji: '🫘' },
  { id: 'sesame', label: 'Sesame', emoji: '🌾' },
  { id: 'wheat', label: 'Wheat', emoji: '🍞' },
  { id: 'gluten', label: 'Gluten', emoji: '🌾' },
  { id: 'sulfite', label: 'Sulfites', emoji: '🥂' },
  { id: 'nightshade', label: 'Nightshade', emoji: '🍅' }
];

const dom = {
  dinerForm: document.getElementById('diner-form'),
  dinerFormStatus: document.getElementById('diner-form-status'),
  resetSimulationBtn: document.getElementById('reset-simulation-btn'),
  requestCodeBtn: document.getElementById('request-code-btn'),
  allergenChipGrid: document.getElementById('allergen-chip-grid'),
  userCodeStep: document.getElementById('user-code-step'),
  dinerCodeInput: document.getElementById('diner-code-input'),
  submitOrderBtn: document.getElementById('submit-order-btn'),
  dinerCodeStatus: document.getElementById('diner-code-status'),
  dinerAlertsBlock: document.getElementById('diner-alerts-block'),
  dinerAlertsContent: document.getElementById('diner-alerts-content'),
  dinerTimeline: document.getElementById('diner-timeline'),
  serverTimeline: document.getElementById('server-timeline'),
  kitchenTimeline: document.getElementById('kitchen-timeline'),
  generateCodeBtn: document.getElementById('generate-code-btn'),
  serverCodeDisplay: document.getElementById('server-code-display'),
  serverApproveBtn: document.getElementById('server-approve-btn'),
  serverApprovalStatus: document.getElementById('server-approval-status'),
  hardwareReadyBtn: document.getElementById('hardware-ready-btn'),
  hardwareFaceIdBtn: document.getElementById('hardware-faceid-btn'),
  hardwareAckBtn: document.getElementById('hardware-ack-btn'),
  faceIdStatus: document.getElementById('faceid-status'),
  kitchenOrderContent: document.getElementById('kitchen-order-content'),
  kitchenQuestionInput: document.getElementById('kitchen-question-input'),
  sendQuestionBtn: document.getElementById('send-question-btn'),
  kitchenQuestionStatus: document.getElementById('kitchen-question-status'),
  kitchenResponseDisplay: document.getElementById('kitchen-response-display')
};

const dinerFields = {
  guestName: document.getElementById('guest-name'),
  diningMode: document.getElementById('dining-mode'),
  orderSummary: document.getElementById('order-summary'),
  guestNotes: document.getElementById('guest-notes')
};

const TIMELINE_LIMIT = 25;

let state = createInitialState();

init();

function createInitialState() {
  return {
    step: 'idle',
    order: null,
    selectedAllergens: [],
    serverCode: null,
    codeValidated: false,
    serverApproved: false,
    hardware: {
      readyPressed: false,
      faceIdStatus: 'idle', // idle | waiting | scanning | passed
      scanning: false,
      ackConfirmed: false
    },
    kitchenQuestion: null,
    timelines: {
      diner: [],
      server: [],
      kitchen: []
    }
  };
}

function init() {
  buildAllergenChips();
  dom.dinerForm.addEventListener('submit', handleDinerFormSubmit);
  dom.resetSimulationBtn.addEventListener('click', () => {
    resetSimulation('Simulation reset');
  });
  dom.generateCodeBtn.addEventListener('click', handleGenerateCode);
  dom.submitOrderBtn.addEventListener('click', handleSubmitCode);
  dom.serverApproveBtn.addEventListener('click', handleServerApproval);
  dom.hardwareReadyBtn.addEventListener('click', handleHardwareReady);
  dom.hardwareFaceIdBtn.addEventListener('click', handleHardwareFaceId);
  dom.hardwareAckBtn.addEventListener('click', handleHardwareAcknowledge);
  dom.sendQuestionBtn.addEventListener('click', handleKitchenQuestionSend);
  render();
}

function buildAllergenChips() {
  dom.allergenChipGrid.innerHTML = '';
  ALLERGENS.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'allergen-chip';
    button.dataset.id = item.id;
    button.textContent = `${item.emoji} ${item.label}`;
    button.addEventListener('click', () => {
      if (state.step !== 'idle') {
        flashFormStatus('The order is already in progress. Reset to start over.', 'error');
        return;
      }
      toggleAllergen(item.id);
    });
    dom.allergenChipGrid.appendChild(button);
  });
  syncAllergenChips();
}

function toggleAllergen(id) {
  const has = state.selectedAllergens.includes(id);
  if (has) {
    state.selectedAllergens = state.selectedAllergens.filter(a => a !== id);
  } else {
    state.selectedAllergens = [...state.selectedAllergens, id];
  }
  syncAllergenChips();
}

function syncAllergenChips() {
  dom.allergenChipGrid.querySelectorAll('.allergen-chip').forEach(chip => {
    const active = state.selectedAllergens.includes(chip.dataset.id);
    chip.dataset.active = active ? 'true' : 'false';
  });
}

function handleDinerFormSubmit(event) {
  event.preventDefault();
  if (state.step !== 'idle') {
    flashFormStatus('Your request is already with the server.', 'error');
    return;
  }

  const guestName = dinerFields.guestName.value.trim();
  const diningMode = dinerFields.diningMode.value;
  const orderSummary = dinerFields.orderSummary.value.trim();
  const guestNotes = dinerFields.guestNotes.value.trim();

  if (!guestName || !orderSummary) {
    flashFormStatus('Provide your name and order summary before requesting the code.', 'error');
    return;
  }

  const order = {
    guestName,
    diningMode,
    orderSummary,
    guestNotes,
    allergens: [...state.selectedAllergens],
    createdAt: new Date()
  };

  state.order = order;
  state.step = 'awaiting_server_code';
  state.serverCode = null;
  state.codeValidated = false;
  state.serverApproved = false;
  state.hardware = {
    readyPressed: false,
    faceIdStatus: 'waiting',
    scanning: false,
    ackConfirmed: false
  };
  state.kitchenQuestion = null;

  clearTimelines();
  addTimeline('diner', `Submitted allergy notice for ${orderSummary}. Waiting for the server code.`);
  addTimeline('server', `New allergy alert from ${guestName}. Review order and generate a code.`);

  flashFormStatus('The server now sees your allergy notice. Ask them for the 4-digit code.', 'success');

  lockDinerForm(true);
  dom.dinerCodeInput.value = '';
  dom.dinerCodeStatus.textContent = '';
  dom.dinerCodeStatus.dataset.tone = '';
  dom.dinerAlertsContent.innerHTML = '';
  dom.dinerAlertsBlock.hidden = true;
  dom.kitchenQuestionStatus.textContent = '';
  dom.kitchenQuestionStatus.dataset.tone = '';
  dom.kitchenQuestionInput.value = '';
  dom.kitchenResponseDisplay.hidden = true;
  dom.kitchenResponseDisplay.textContent = '';

  render();
}

function flashFormStatus(text, tone = '') {
  dom.dinerFormStatus.textContent = text || '';
  dom.dinerFormStatus.dataset.tone = tone;
}

function clearTimelines() {
  state.timelines = {
    diner: [],
    server: [],
    kitchen: []
  };
}

function handleGenerateCode() {
  if (state.step !== 'awaiting_server_code') {
    addTimeline('server', 'Attempted to generate code without a pending order.');
    renderTimelines();
    return;
  }

  state.serverCode = String(Math.floor(1000 + Math.random() * 9000));
  addTimeline('server', `Generated guest code ${state.serverCode}. Read aloud to guest.`);
  addTimeline('diner', 'Server generated the hand-off code. Enter it to continue.');
  flashFormStatus('Enter the code the server gives you to confirm your order.', 'success');
  render();
}

function handleSubmitCode() {
  if (state.step !== 'awaiting_server_code' && state.step !== 'awaiting_server_approval') {
    dom.dinerCodeStatus.textContent = 'No pending code entry right now.';
    dom.dinerCodeStatus.dataset.tone = 'error';
    return;
  }
  if (!state.serverCode) {
    dom.dinerCodeStatus.textContent = 'Wait for the server to read the code aloud.';
    dom.dinerCodeStatus.dataset.tone = 'error';
    return;
  }

  const value = dom.dinerCodeInput.value.trim();
  if (value !== state.serverCode) {
    dom.dinerCodeStatus.textContent = 'Code mismatch. Double-check with your server.';
    dom.dinerCodeStatus.dataset.tone = 'error';
    addTimeline('diner', 'Entered an incorrect code. Retrying.');
    return;
  }

  state.step = 'awaiting_server_approval';
  state.codeValidated = true;
  dom.dinerCodeStatus.textContent = 'Code accepted! The server will sync the order to the kitchen.';
  dom.dinerCodeStatus.dataset.tone = 'success';
  addTimeline('diner', 'Allergy notice released to the server.');
  addTimeline('server', 'Guest confirmed the code. Approve when the POS order is sent.');

  render();
}

function handleServerApproval() {
  if (state.step !== 'awaiting_server_approval' || !state.order) {
    addTimeline('server', 'Tried to approve with no order awaiting confirmation.');
    renderTimelines();
    return;
  }

  state.serverApproved = true;
  state.step = 'awaiting_hardware';
  addTimeline('server', 'Approved the diner-entered order and synced to kitchen tablet.');
  addTimeline('kitchen', `Received allergy alert for ${state.order.guestName}. Hardware acknowledgement required.`);
  addTimeline('diner', 'Server passed your order to the kitchen tablet.');

  flashFormStatus('Kitchen received your order. They will acknowledge allergies shortly.', 'success');
  render();
}

function handleHardwareReady() {
  if (state.step !== 'awaiting_hardware') return;
  state.hardware.readyPressed = true;
  addTimeline('kitchen', 'Physical “Allergies Posted” button pressed.');
  addTimeline('server', 'Kitchen pressed the hardware confirm button.');
  render();
}

function handleHardwareFaceId() {
  if (!state.hardware.readyPressed || state.hardware.scanning || state.hardware.faceIdStatus === 'passed') {
    return;
  }
  state.hardware.scanning = true;
  state.hardware.faceIdStatus = 'scanning';
  addTimeline('kitchen', 'Initiated FaceID scan for enrolled chef.');
  addTimeline('diner', 'Kitchen is verifying an approved chef via FaceID.');
  render();

  setTimeout(() => {
    state.hardware.faceIdStatus = 'passed';
    state.hardware.scanning = false;
    addTimeline('kitchen', 'FaceID matched Chef on approved roster.');
    addTimeline('server', 'Kitchen verified chef via FaceID.');
    render();
  }, 1600);
}

function handleHardwareAcknowledge() {
  if (state.hardware.faceIdStatus !== 'passed' || state.hardware.ackConfirmed) {
    return;
  }
  state.hardware.ackConfirmed = true;
  state.step = 'acknowledged';
  addTimeline('kitchen', 'Allergies acknowledged and logged for this order.');
  addTimeline('diner', 'Kitchen acknowledged your allergies and logged the confirmation.');
  addTimeline('server', 'Kitchen acknowledgement complete. Guest notified.');
  flashFormStatus('Allergies acknowledged! Enjoy your meal and feel free to reset to try again.', 'success');
  render();
}

function handleKitchenQuestionSend() {
  if (!state.order || !state.serverApproved) {
    dom.kitchenQuestionStatus.textContent = 'No active order to message.';
    dom.kitchenQuestionStatus.dataset.tone = 'error';
    return;
  }
  const text = dom.kitchenQuestionInput.value.trim();
  if (!text) {
    dom.kitchenQuestionStatus.textContent = 'Dictate a quick yes/no question before sending.';
    dom.kitchenQuestionStatus.dataset.tone = 'error';
    return;
  }

  state.kitchenQuestion = {
    text,
    status: 'awaiting_user',
    response: null,
    createdAt: new Date()
  };
  dom.kitchenQuestionInput.value = '';
  dom.kitchenQuestionStatus.textContent = 'Question sent to diner. Awaiting response.';
  dom.kitchenQuestionStatus.dataset.tone = 'success';
  addTimeline('kitchen', `Sent follow-up: “${text}”`);
  addTimeline('diner', `Kitchen asked: “${text}”`);
  render();
}

function handleDinerResponse(choice) {
  if (!state.kitchenQuestion || state.kitchenQuestion.status !== 'awaiting_user') {
    return;
  }

  state.kitchenQuestion.status = 'answered';
  state.kitchenQuestion.response = choice;
  state.kitchenQuestion.respondedAt = new Date();
  addTimeline('diner', `Responded "${choice.toUpperCase()}" to kitchen.`);
  addTimeline('kitchen', `Diner replied "${choice.toUpperCase()}" to the follow-up question.`);
  render();
}

function resetSimulation(reason) {
  state = createInitialState();
  buildAllergenChips();
  dom.dinerForm.reset();
  lockDinerForm(false);
  dom.dinerFormStatus.textContent = reason || '';
  dom.dinerFormStatus.dataset.tone = '';
  dom.dinerCodeStatus.textContent = '';
  dom.dinerCodeStatus.dataset.tone = '';
  dom.dinerAlertsContent.innerHTML = '';
  dom.dinerAlertsBlock.hidden = true;
  dom.kitchenQuestionStatus.textContent = '';
  dom.kitchenQuestionStatus.dataset.tone = '';
  dom.kitchenResponseDisplay.hidden = true;
  dom.kitchenResponseDisplay.textContent = '';
  render();
}

function lockDinerForm(lock) {
  const elements = dom.dinerForm.querySelectorAll('input, select, textarea, button');
  elements.forEach(el => {
    if (el === dom.resetSimulationBtn) return;
    if (el === dom.submitOrderBtn || el === dom.dinerCodeInput) return;
    el.disabled = lock;
  });
}

function render() {
  renderServerSection();
  renderDinerSection();
  renderKitchenSection();
  renderTimelines();
}

function renderServerSection() {
  const hasOrder = Boolean(state.order);
  dom.generateCodeBtn.disabled = !hasOrder || state.step !== 'awaiting_server_code';

  if (state.serverCode) {
    dom.serverCodeDisplay.textContent = state.serverCode.split('').join(' ');
    dom.serverCodeDisplay.dataset.empty = 'false';
  } else {
    dom.serverCodeDisplay.textContent = 'Code pending';
    dom.serverCodeDisplay.dataset.empty = 'true';
  }

  dom.serverApproveBtn.disabled = !state.codeValidated || state.serverApproved;

  if (!hasOrder) {
    dom.serverApprovalStatus.textContent = 'Waiting for diner submission';
    dom.serverApprovalStatus.dataset.state = 'idle';
  } else if (!state.codeValidated) {
    dom.serverApprovalStatus.textContent = 'Waiting for diner to enter the 4-digit code';
    dom.serverApprovalStatus.dataset.state = 'waiting';
  } else if (!state.serverApproved) {
    dom.serverApprovalStatus.textContent = 'Ready to send once POS order dispatched';
    dom.serverApprovalStatus.dataset.state = 'active';
  } else if (state.step === 'acknowledged') {
    dom.serverApprovalStatus.textContent = 'Kitchen acknowledged allergies';
    dom.serverApprovalStatus.dataset.state = 'success';
  } else {
    dom.serverApprovalStatus.textContent = 'Dispatched to kitchen tablet';
    dom.serverApprovalStatus.dataset.state = 'active';
  }
}

function renderDinerSection() {
  const hasOrder = Boolean(state.order);
  dom.userCodeStep.hidden = !hasOrder || (!state.serverCode && !state.codeValidated);

  if (state.step === 'idle') {
    flashFormStatus('Describe your allergies to begin the simulation.');
  } else if (state.step === 'awaiting_server_code') {
    flashFormStatus('Ask your server for the code to release this order.');
  } else if (state.step === 'awaiting_server_approval') {
    flashFormStatus('Server is preparing to send your order to the kitchen.');
  } else if (state.step === 'awaiting_hardware') {
    flashFormStatus('Kitchen is reviewing your allergies on their tablet.');
  } else if (state.step === 'acknowledged') {
    flashFormStatus('Allergies acknowledged! Reset to simulate another order.', 'success');
  }

  if (state.step === 'idle') {
    lockDinerForm(false);
  } else {
    lockDinerForm(true);
  }

  dom.dinerCodeInput.disabled = !state.serverCode || state.codeValidated;
  dom.submitOrderBtn.disabled = !state.serverCode || state.codeValidated;

  renderDinerAlerts();
}

function renderDinerAlerts() {
  const question = state.kitchenQuestion;
  dom.dinerAlertsContent.innerHTML = '';
  if (!question) {
    dom.dinerAlertsBlock.hidden = true;
    return;
  }
  dom.dinerAlertsBlock.hidden = false;

  const wrapper = document.createElement('div');
  wrapper.className = 'diner-alert';

  const title = document.createElement('div');
  title.className = 'diner-alert__question';
  title.textContent = question.text;
  wrapper.appendChild(title);

  if (question.status === 'awaiting_user') {
    const actions = document.createElement('div');
    actions.className = 'diner-alert__actions';

    const yesBtn = document.createElement('button');
    yesBtn.className = 'primary-btn';
    yesBtn.type = 'button';
    yesBtn.textContent = 'Yes';
    yesBtn.addEventListener('click', () => handleDinerResponse('yes'));

    const noBtn = document.createElement('button');
    noBtn.className = 'secondary-btn';
    noBtn.type = 'button';
    noBtn.textContent = 'No';
    noBtn.addEventListener('click', () => handleDinerResponse('no'));

    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);
    wrapper.appendChild(actions);
  } else if (question.status === 'answered') {
    const reply = document.createElement('p');
    reply.textContent = `You replied: ${question.response?.toUpperCase()}`;
    wrapper.appendChild(reply);
  }

  dom.dinerAlertsContent.appendChild(wrapper);
}

function renderKitchenSection() {
  const hasOrder = Boolean(state.order);
  if (!hasOrder || !state.serverApproved) {
    dom.kitchenOrderContent.className = 'kitchen-order-empty';
    dom.kitchenOrderContent.textContent = hasOrder
      ? 'Waiting for server approval…'
      : 'Waiting for server approval…';
  } else {
    dom.kitchenOrderContent.className = 'kitchen-order-summary';
    dom.kitchenOrderContent.innerHTML = buildKitchenOrderSummary(state.order);
  }

  dom.hardwareReadyBtn.disabled = !state.serverApproved || state.hardware.readyPressed;
  dom.hardwareFaceIdBtn.disabled =
    !state.hardware.readyPressed || state.hardware.scanning || state.hardware.faceIdStatus === 'passed';
  dom.hardwareAckBtn.disabled = state.hardware.faceIdStatus !== 'passed' || state.hardware.ackConfirmed;

  if (!state.serverApproved) {
    dom.faceIdStatus.textContent = 'Waiting for hardware button press';
    dom.faceIdStatus.dataset.state = 'idle';
  } else if (!state.hardware.readyPressed) {
    dom.faceIdStatus.textContent = 'Press the “Allergies Posted” hardware button';
    dom.faceIdStatus.dataset.state = 'waiting';
  } else if (state.hardware.scanning) {
    dom.faceIdStatus.textContent = 'Scanning FaceID…';
    dom.faceIdStatus.dataset.state = 'active';
  } else if (state.hardware.faceIdStatus === 'passed' && !state.hardware.ackConfirmed) {
    dom.faceIdStatus.textContent = 'FaceID verified. Confirm acknowledgement to log it.';
    dom.faceIdStatus.dataset.state = 'active';
  } else if (state.hardware.ackConfirmed) {
    dom.faceIdStatus.textContent = 'Allergies acknowledged and logged.';
    dom.faceIdStatus.dataset.state = 'success';
  } else {
    dom.faceIdStatus.textContent = 'Press “Start FaceID scan” to continue.';
    dom.faceIdStatus.dataset.state = 'active';
  }

  const question = state.kitchenQuestion;
  dom.kitchenQuestionInput.disabled = !state.serverApproved;
  dom.sendQuestionBtn.disabled = !state.serverApproved || (question && question.status === 'awaiting_user');

  if (!question) {
    dom.kitchenResponseDisplay.hidden = true;
    dom.kitchenResponseDisplay.textContent = '';
  } else if (question.status === 'answered') {
    dom.kitchenResponseDisplay.hidden = false;
    dom.kitchenResponseDisplay.textContent = `Diner replied "${question.response?.toUpperCase()}"`;
    dom.kitchenQuestionStatus.textContent = 'Question resolved.';
    dom.kitchenQuestionStatus.dataset.tone = 'success';
  } else {
    dom.kitchenResponseDisplay.hidden = true;
    dom.kitchenResponseDisplay.textContent = '';
  }
}

function buildKitchenOrderSummary(order) {
  const allergenText = order.allergens.length
    ? order.allergens.map(id => formatAllergenLabel(id)).join(', ')
    : 'None reported';
  return `
    <h3>${order.guestName} • ${formatDiningMode(order.diningMode)}</h3>
    <p><strong>Order:</strong><br>${escapeHtml(order.orderSummary)}</p>
    <p><strong>Allergens:</strong> ${escapeHtml(allergenText)}</p>
    ${order.guestNotes ? `<p><strong>Kitchen notes:</strong><br>${escapeHtml(order.guestNotes)}</p>` : ''}
  `;
}

function formatDiningMode(mode) {
  switch (mode) {
    case 'delivery':
      return 'Delivery';
    case 'takeout':
      return 'Takeout';
    default:
      return 'Dining in';
  }
}

function formatAllergenLabel(id) {
  const record = ALLERGENS.find(item => item.id === id);
  return record ? record.label : id;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function addTimeline(role, message) {
  const bucket = state.timelines[role];
  bucket.push({
    message,
    timestamp: new Date()
  });
  if (bucket.length > TIMELINE_LIMIT) {
    bucket.shift();
  }
}

function renderTimelines() {
  renderTimelineList(dom.dinerTimeline, state.timelines.diner);
  renderTimelineList(dom.serverTimeline, state.timelines.server);
  renderTimelineList(dom.kitchenTimeline, state.timelines.kitchen);
}

function renderTimelineList(container, items) {
  container.innerHTML = '';
  if (!items.length) {
    const placeholder = document.createElement('li');
    placeholder.className = 'muted-text';
    placeholder.textContent = 'No activity yet.';
    container.appendChild(placeholder);
    return;
  }

  items.slice().reverse().forEach(entry => {
    const li = document.createElement('li');
    const message = document.createElement('div');
    message.textContent = entry.message;
    const time = document.createElement('time');
    time.dateTime = entry.timestamp.toISOString();
    time.textContent = entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    li.appendChild(message);
    li.appendChild(time);
    container.appendChild(li);
  });
}

if (typeof window !== 'undefined') {
  window.__tabletSimDebug = {
    getStateSnapshot: () => JSON.parse(JSON.stringify(state)),
    submitOrder(payload) {
      dinerFields.guestName.value = payload.guestName || '';
      dinerFields.diningMode.value = payload.diningMode || 'dine-in';
      dinerFields.orderSummary.value = payload.orderSummary || '';
      dinerFields.guestNotes.value = payload.guestNotes || '';
      state.selectedAllergens = payload.allergens ? [...payload.allergens] : [];
      syncAllergenChips();
      handleDinerFormSubmit({ preventDefault() {} });
    },
    generateCode: handleGenerateCode,
    enterCode(code) {
      dom.dinerCodeInput.value = code;
      handleSubmitCode();
    },
    serverApprove: handleServerApproval,
    hardware: {
      pressButton: handleHardwareReady,
      runFaceId: handleHardwareFaceId,
      acknowledge: handleHardwareAcknowledge
    },
    sendKitchenQuestion(text) {
      dom.kitchenQuestionInput.value = text;
      handleKitchenQuestionSend();
    },
    dinerRespond(choice) {
      handleDinerResponse(choice);
    },
    reset(reason) {
      resetSimulation(reason);
    }
  };
}
