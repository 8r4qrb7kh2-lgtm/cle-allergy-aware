const DEFAULT_CHEFS = [
  { id: 'chef-1', name: 'Chef Amara Lee', title: 'Executive Chef', faceId: 'face-amara' },
  { id: 'chef-2', name: 'Chef Mateo Ramos', title: 'Sous Chef', faceId: 'face-mateo' },
  { id: 'chef-3', name: 'Chef Priya Kapoor', title: 'Pastry Lead', faceId: 'face-priya' }
];

export const ORDER_STATUSES = {
  DRAFT: 'draft',
  AWAITING_CODE: 'awaiting_server_code',
  CODE_ISSUED: 'awaiting_user_submission',
  PENDING_SERVER_REVIEW: 'pending_server_review',
  QUEUED_FOR_KITCHEN: 'pending_kitchen_ack',
  AWAITING_USER_RESPONSE: 'awaiting_user_confirmation',
  ACKNOWLEDGED: 'acknowledged',
  COMPLETED: 'completed'
};

export const BUTTON_PANEL = [
  { id: 'acknowledge', label: 'Acknowledge Allergies', tone: 'ok' },
  { id: 'clarify', label: 'Need Clarification', tone: 'warn' },
  { id: 'delay', label: 'Delay Order', tone: 'warn' },
  { id: 'escalate', label: 'Escalate', tone: 'bad' }
];

export class TabletSimulationCore {
  constructor({ chefs = DEFAULT_CHEFS } = {}) {
    this.orders = new Map();
    this.chefs = chefs.map(chef => ({ ...chef }));
    this.listeners = new Map();
    this._orderCounter = 0;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).delete(callback);
  }

  _notify(event, payload) {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    const snapshot = this._snapshotOrder(payload);
    callbacks.forEach(cb => {
      try {
        cb(snapshot);
      } catch (err) {
        console.error('TabletSimulationCore listener error:', err);
      }
    });
  }

  _snapshotOrder(order) {
    return JSON.parse(JSON.stringify(order));
  }

  _addTimeline(order, entry) {
    order.timeline.push({
      id: `${order.id}-timeline-${order.timeline.length + 1}`,
      createdAt: new Date().toISOString(),
      ...entry
    });
  }

  _generateCode() {
    return `${Math.floor(1000 + Math.random() * 9000)}`;
  }

  createOrder({
    customerName,
    partySize = 1,
    allergies = [],
    deliveryMode = 'dine-in',
    notes = ''
  }) {
    const orderId = `order-${++this._orderCounter}`;
    const order = {
      id: orderId,
      customerName,
      partySize,
      allergies,
      deliveryMode,
      notes,
      status: ORDER_STATUSES.DRAFT,
      serverCode: null,
      serverCodeRequestedAt: null,
      serverCodeExpiresAt: null,
      lastUserSubmissionAt: null,
      serverApprovedAt: null,
      kitchenReceivedAt: null,
      kitchenAcknowledgedAt: null,
      acknowledgedByChefId: null,
      pendingQuestion: null,
      userResponse: null,
      lastButtonPress: null,
      timeline: [],
      createdAt: new Date().toISOString()
    };

    this._addTimeline(order, {
      type: 'user_created_order',
      actor: 'guest',
      message: `${customerName || 'Guest'} started an allergy-aware order (${deliveryMode}).`
    });

    this.orders.set(orderId, order);
    this._notify('orderCreated', order);
    return this._snapshotOrder(order);
  }

  requestServerCode(orderId) {
    const order = this._requireOrder(orderId);
    order.status = ORDER_STATUSES.AWAITING_CODE;
    order.serverCodeRequestedAt = new Date().toISOString();
    this._addTimeline(order, {
      type: 'user_requested_code',
      actor: 'guest',
      message: 'Guest requested a server authorization code to submit allergies.'
    });
    this._notify('orderUpdated', order);
    return this._snapshotOrder(order);
  }

  issueServerCode(orderId) {
    const order = this._requireOrder(orderId);
    const code = this._generateCode();
    order.serverCode = code;
    order.serverCodeExpiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString(); // 10 minutes
    order.status = ORDER_STATUSES.CODE_ISSUED;
    this._addTimeline(order, {
      type: 'server_issued_code',
      actor: 'server_tablet',
      message: `Server tablet generated a submission code: ${code}.`
    });
    this._notify('orderUpdated', order);
    return { code, order: this._snapshotOrder(order) };
  }

  submitOrderWithCode(orderId, codeAttempt) {
    const order = this._requireOrder(orderId);
    if (!order.serverCode || order.status !== ORDER_STATUSES.CODE_ISSUED) {
      throw new Error('Order is not ready for submission.');
    }
    if (order.serverCode !== codeAttempt) {
      this._addTimeline(order, {
        type: 'user_code_failed',
        actor: 'guest',
        message: 'Guest attempted to submit with an incorrect code.'
      });
      this._notify('orderUpdated', order);
      throw new Error('Code mismatch');
    }
    order.status = ORDER_STATUSES.PENDING_SERVER_REVIEW;
    order.lastUserSubmissionAt = new Date().toISOString();
    this._addTimeline(order, {
      type: 'user_submitted',
      actor: 'guest',
      message: 'Guest successfully submitted allergies for server review.'
    });
    this._notify('orderUpdated', order);
    return this._snapshotOrder(order);
  }

  serverApproveOrder(orderId, { comment = '' } = {}) {
    const order = this._requireOrder(orderId);
    if (order.status !== ORDER_STATUSES.PENDING_SERVER_REVIEW) {
      throw new Error('Order is not awaiting server review.');
    }
    order.status = ORDER_STATUSES.QUEUED_FOR_KITCHEN;
    order.serverApprovedAt = new Date().toISOString();
    order.kitchenReceivedAt = new Date().toISOString();
    this._addTimeline(order, {
      type: 'server_approved',
      actor: 'server_tablet',
      message: `Server approved and released allergy notice to kitchen.${comment ? ` Note: ${comment}` : ''}`
    });
    this._notify('orderUpdated', order);
    return this._snapshotOrder(order);
  }

  recordButtonPress(orderId, buttonId) {
    const order = this._requireOrder(orderId);
    const button = BUTTON_PANEL.find(btn => btn.id === buttonId);
    if (!button) throw new Error(`Unknown button ${buttonId}`);
    order.lastButtonPress = {
      id: buttonId,
      label: button.label,
      pressedAt: new Date().toISOString()
    };
    this._addTimeline(order, {
      type: 'kitchen_button_press',
      actor: 'kitchen_tablet',
      tone: button.tone,
      message: `Kitchen pressed "${button.label}" on the tactile panel.`
    });
    this._notify('orderUpdated', order);
    return this._snapshotOrder(order);
  }

  acknowledgeAllergies(orderId, chefId) {
    const order = this._requireOrder(orderId);
    if (order.status !== ORDER_STATUSES.QUEUED_FOR_KITCHEN && order.status !== ORDER_STATUSES.AWAITING_USER_RESPONSE) {
      throw new Error('Order is not ready for acknowledgment.');
    }
    const chef = this.chefs.find(c => c.id === chefId);
    if (!chef) throw new Error('Chef not enrolled');

    order.status = ORDER_STATUSES.ACKNOWLEDGED;
    order.kitchenAcknowledgedAt = new Date().toISOString();
    order.acknowledgedByChefId = chefId;

    this._addTimeline(order, {
      type: 'kitchen_ack',
      actor: 'kitchen_tablet',
      message: `${chef.name} confirmed allergen notice via FaceID scan and tactile button.`
    });
    this._notify('orderUpdated', order);
    return this._snapshotOrder(order);
  }

  sendKitchenQuestion(orderId, question, { requiresResponse = true } = {}) {
    const order = this._requireOrder(orderId);
    order.pendingQuestion = {
      question,
      requiresResponse,
      askedAt: new Date().toISOString()
    };
    order.status = ORDER_STATUSES.AWAITING_USER_RESPONSE;
    this._addTimeline(order, {
      type: 'kitchen_question',
      actor: 'kitchen_tablet',
      message: `Kitchen asked guest: "${question}" (response required: ${requiresResponse ? 'Yes/No' : 'info only'}).`
    });
    this._notify('orderUpdated', order);
    return this._snapshotOrder(order);
  }

  userRespond(orderId, response) {
    const order = this._requireOrder(orderId);
    if (!order.pendingQuestion) {
      throw new Error('No question pending.');
    }
    const normalized = String(response).toLowerCase();
    if (!['yes', 'no'].includes(normalized)) {
      throw new Error('Response must be "yes" or "no".');
    }
    order.userResponse = {
      response: normalized,
      respondedAt: new Date().toISOString()
    };
    this._addTimeline(order, {
      type: 'user_response',
      actor: 'guest',
      message: `Guest responded "${normalized.toUpperCase()}" to kitchen question.`
    });
    order.pendingQuestion = null;
    // If the kitchen had already acknowledged, we can consider the workflow completed.
    if (order.status === ORDER_STATUSES.AWAITING_USER_RESPONSE && order.kitchenAcknowledgedAt) {
      order.status = ORDER_STATUSES.COMPLETED;
      this._addTimeline(order, {
        type: 'workflow_complete',
        actor: 'system',
        message: 'Workflow completed. Guest response delivered to kitchen.'
      });
    } else if (order.status === ORDER_STATUSES.AWAITING_USER_RESPONSE) {
      order.status = ORDER_STATUSES.QUEUED_FOR_KITCHEN;
    }
    this._notify('orderUpdated', order);
    return this._snapshotOrder(order);
  }

  resetOrder(orderId) {
    const order = this._requireOrder(orderId);
    order.status = ORDER_STATUSES.DRAFT;
    order.serverCode = null;
    order.serverCodeExpiresAt = null;
    order.pendingQuestion = null;
    order.userResponse = null;
    order.lastButtonPress = null;
    order.serverApprovedAt = null;
    order.kitchenReceivedAt = null;
    order.kitchenAcknowledgedAt = null;
    order.acknowledgedByChefId = null;
    order.timeline = [];
    this._addTimeline(order, {
      type: 'reset',
      actor: 'system',
      message: 'Order workflow was reset.'
    });
    this._notify('orderUpdated', order);
    return this._snapshotOrder(order);
  }

  getOrder(orderId) {
    const order = this._requireOrder(orderId);
    return this._snapshotOrder(order);
  }

  getAllOrders() {
    return Array.from(this.orders.values()).map(order => this._snapshotOrder(order));
  }

  getChefs() {
    return this.chefs.map(chef => ({ ...chef }));
  }

  _requireOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    return order;
  }
}

export function createSimulationEngine(options) {
  return new TabletSimulationCore(options);
}
