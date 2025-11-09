import assert from 'node:assert/strict';
import { createSimulationEngine, ORDER_STATUSES, BUTTON_PANEL } from '../tablet-simulation-core.mjs';

function latestTimeline(order) {
  return order.timeline[order.timeline.length - 1];
}

async function run() {
  const engine = createSimulationEngine();

  const order = engine.createOrder({
    customerName: 'Jordan Carter',
    partySize: 2,
    allergies: ['Peanuts', 'Shellfish'],
    deliveryMode: 'delivery',
    notes: 'Please seal sauces separately.'
  });

  assert.equal(order.status, ORDER_STATUSES.DRAFT, 'Order should start in draft.');
  assert.equal(order.allergies.length, 2, 'Allergies should be stored.');

  const awaitingCode = engine.requestServerCode(order.id);
  assert.equal(awaitingCode.status, ORDER_STATUSES.AWAITING_CODE, 'Order should be awaiting code.');

  const { code } = engine.issueServerCode(order.id);
  assert.equal(code.length, 4, 'Server code should be 4 digits.');

  let caught = false;
  try {
    engine.submitOrderWithCode(order.id, '9999');
  } catch (err) {
    caught = true;
    assert.equal(err.message, 'Code mismatch');
  }
  assert.ok(caught, 'Submitting with wrong code should throw.');

  const submitted = engine.submitOrderWithCode(order.id, code);
  assert.equal(submitted.status, ORDER_STATUSES.PENDING_SERVER_REVIEW, 'Order should be pending server review.');

  const approved = engine.serverApproveOrder(order.id);
  assert.equal(approved.status, ORDER_STATUSES.QUEUED_FOR_KITCHEN, 'Order should be queued for kitchen.');
  assert.ok(approved.kitchenReceivedAt, 'Kitchen should have received timestamp.');

  const panelButtons = BUTTON_PANEL.map(btn => btn.id);
  assert.ok(panelButtons.includes('acknowledge'), 'Button panel should include acknowledge button.');

  const pressed = engine.recordButtonPress(order.id, 'acknowledge');
  assert.equal(latestTimeline(pressed).type, 'kitchen_button_press', 'Button press should be recorded.');

  const acknowledged = engine.acknowledgeAllergies(order.id, 'chef-2');
  assert.equal(
    acknowledged.status,
    ORDER_STATUSES.ACKNOWLEDGED,
    'Order should be marked acknowledged after chef confirmation.'
  );
  assert.equal(acknowledged.acknowledgedByChefId, 'chef-2', 'Chef ID should be tracked.');

  const questioned = engine.sendKitchenQuestion(order.id, 'Do you approve sesame oil?', { requiresResponse: true });
  assert.equal(
    questioned.status,
    ORDER_STATUSES.AWAITING_USER_RESPONSE,
    'Order should wait for user response after kitchen question.'
  );

  const responded = engine.userRespond(order.id, 'yes');
  assert.equal(responded.userResponse.response, 'yes', 'User response should be stored.');
  assert.equal(
    responded.status,
    ORDER_STATUSES.COMPLETED,
    'Workflow should complete after user responds to acknowledged order.'
  );

  assert.ok(responded.timeline.length >= 7, 'Timeline should include all major events.');

  console.log('tablet-simulation-core.test.mjs: all assertions passed ✅');
}

run().catch(err => {
  console.error('tablet-simulation-core.test.mjs: test run failed', err);
  process.exit(1);
});
