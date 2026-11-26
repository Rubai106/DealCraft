// DealCraft — AppLink subscription adapter (sandbox).
// Sandbox behaviour: subscribe() immediately returns ACTIVE with a sandbox
// subscription id and keeps it in memory. No real billing happens here.
const crypto = require('node:crypto');
const { appendLog } = require('./log');

const subscriptions = new Map(); // phone -> { subscriptionId, plan, status }

function subscribe(phone, plan = 'monthly') {
  const subscriptionId = 'sub_' + crypto.randomBytes(10).toString('hex');
  const sub = { subscriptionId, phone, plan, status: 'ACTIVE', sandbox: true };
  subscriptions.set(phone, sub);
  appendLog({ api: 'subscription.subscribe', request: { phone, plan }, response: { subscriptionId, status: 'ACTIVE' }, mode: 'sandbox' });
  return { subscriptionId, status: 'ACTIVE', sandbox: true };
}

function getSubscription(phone) {
  const sub = subscriptions.get(phone) || null;
  appendLog({ api: 'subscription.get', request: { phone }, response: sub ? { subscriptionId: sub.subscriptionId, status: sub.status } : { status: 'NONE' }, mode: 'sandbox' });
  return sub;
}

module.exports = { subscribe, getSubscription };
