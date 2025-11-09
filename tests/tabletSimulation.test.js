import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const htmlPath = path.resolve('public/tablet-simulation.html');
const scriptPath = path.resolve('public/js/tablet-simulation.js');

let dom;
let debugApi;

before(async () => {
  const html = await readFile(htmlPath, 'utf-8');
  const sanitized = html
    .replace(/<script type="module"[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, '');
  dom = new JSDOM(sanitized, {
    url: 'https://clarivore.local/',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
    resources: 'usable'
  });

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator
  });
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.CustomEvent = dom.window.CustomEvent;
  if (!('requestAnimationFrame' in globalThis)) {
    globalThis.requestAnimationFrame = cb => setTimeout(cb, 16);
    globalThis.cancelAnimationFrame = id => clearTimeout(id);
  }

  const moduleUrl = pathToFileURL(scriptPath).href;
  await import(moduleUrl);
  debugApi = window.__tabletSimDebug;
  if (!debugApi) {
    throw new Error('Simulation debug API did not initialize.');
  }
});

after(() => {
  dom?.window.close();
});

test('full acknowledgement workflow reaches kitchen confirmation', async () => {
  const debug = window.__tabletSimDebug;

  debug.reset('Test start');
  debug.submitOrder({
    guestName: 'Jamie Rivera',
    diningMode: 'dine-in',
    orderSummary: '1x Grilled Salmon',
    guestNotes: 'No butter on vegetables',
    allergens: ['dairy', 'peanut']
  });

  let snapshot = debug.getStateSnapshot();
  assert.equal(snapshot.step, 'awaiting_server_code');

  debug.generateCode();
  snapshot = debug.getStateSnapshot();
  assert.match(snapshot.serverCode, /^[0-9]{4}$/);

  debug.enterCode(snapshot.serverCode);
  snapshot = debug.getStateSnapshot();
  assert.equal(snapshot.step, 'awaiting_server_approval');
  assert.ok(snapshot.codeValidated);

  debug.serverApprove();
  snapshot = debug.getStateSnapshot();
  assert.equal(snapshot.step, 'awaiting_hardware');
  assert.ok(snapshot.serverApproved);

  debug.hardware.pressButton();
  snapshot = debug.getStateSnapshot();
  assert.ok(snapshot.hardware.readyPressed);

  debug.hardware.runFaceId();
  await new Promise(resolve => setTimeout(resolve, 1700));
  snapshot = debug.getStateSnapshot();
  assert.equal(snapshot.hardware.faceIdStatus, 'passed');

  debug.hardware.acknowledge();
  snapshot = debug.getStateSnapshot();
  assert.equal(snapshot.step, 'acknowledged');
  assert.ok(snapshot.hardware.ackConfirmed);
});

test('kitchen question flow gates on yes/no response', async () => {
  const debug = window.__tabletSimDebug;

  debug.reset('Test start');
  debug.submitOrder({
    guestName: 'Casey',
    diningMode: 'delivery',
    orderSummary: 'Clarivore Bowl',
    guestNotes: '',
    allergens: ['sesame']
  });

  debug.generateCode();
  let snapshot = debug.getStateSnapshot();
  debug.enterCode(snapshot.serverCode);
  debug.serverApprove();

  debug.sendKitchenQuestion('Can we swap tahini for lemon dressing?');
  snapshot = debug.getStateSnapshot();
  assert.ok(snapshot.kitchenQuestion);
  assert.equal(snapshot.kitchenQuestion.status, 'awaiting_user');

  debug.dinerRespond('yes');
  snapshot = debug.getStateSnapshot();
  assert.equal(snapshot.kitchenQuestion.status, 'answered');
  assert.equal(snapshot.kitchenQuestion.response, 'yes');
});
