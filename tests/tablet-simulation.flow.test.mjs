import assert from 'node:assert/strict';
import {
  createInitialState,
  createOrderDraft,
  requestServerCode,
  submitOrderToServer,
  serverApprove,
  serverDispatchToKitchen,
  kitchenAcknowledge,
  kitchenAskQuestion,
  userRespondToQuestion,
  ORDER_STATUSES
} from '../public/js/tablet-simulation-logic.mjs';

function runHappyPath() {
  const state = createInitialState();
  const draft = createOrderDraft({
    customerName: 'Jordan Smith',
    restaurantName: 'Olive & Thyme',
    diningMode: 'dine-in',
    tableOrPickup: 'Table 12',
    allergies: ['Peanuts', 'Soy'],
    customNotes: 'Carry-out container is fine.'
  });
  const order = requestServerCode(state, draft, { code: '4312' });
  assert.equal(order.serverCode, '4312');
  assert.equal(order.status, ORDER_STATUSES.CODE_ASSIGNED);
  assert.equal(state.orders.length, 1);

  const submitted = submitOrderToServer(state, order.id, '4312');
  assert.equal(submitted.status, ORDER_STATUSES.SUBMITTED_TO_SERVER);

  const staged = serverApprove(state, order.id);
  assert.equal(staged.status, ORDER_STATUSES.QUEUED_FOR_KITCHEN);

  const dispatched = serverDispatchToKitchen(state, order.id);
  assert.equal(dispatched.status, ORDER_STATUSES.WITH_KITCHEN);

  const chef = state.chefs[0];
  const acknowledged = kitchenAcknowledge(state, order.id, chef.id);
  assert.equal(acknowledged.status, ORDER_STATUSES.ACKNOWLEDGED);
  assert.equal(acknowledged.faceIdAudit.length, 1);

  const asked = kitchenAskQuestion(state, order.id, 'Do you want fries cooked in a dedicated fryer?');
  assert.equal(asked.status, ORDER_STATUSES.AWAITING_USER_RESPONSE);

  const answered = userRespondToQuestion(state, order.id, 'yes');
  assert.equal(answered.status, ORDER_STATUSES.QUESTION_ANSWERED);
  assert.equal(answered.kitchenQuestion.response, 'yes');
}

function runErrorGuards() {
  const state = createInitialState();
  const draft = createOrderDraft({
    customerName: 'Taylor Lee',
    restaurantName: 'Night Market',
    diningMode: 'delivery',
    deliveryAddress: 'Ring buzzer 418',
    allergies: []
  });
  const order = requestServerCode(state, draft, { code: '9999' });
  assert.equal(order.serverCode, '9999');
  assert.throws(
    () => submitOrderToServer(state, order.id, '0000'),
    /Server code does not match/
  );
  submitOrderToServer(state, order.id, '9999');
  serverApprove(state, order.id);
  serverDispatchToKitchen(state, order.id);

  assert.throws(
    () => kitchenAskQuestion(state, order.id, ''),
    /Question text is required/
  );
}

runHappyPath();
runErrorGuards();

console.log('✅ Tablet simulation logic scenarios passed.');
