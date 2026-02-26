import { AsyncLocalStorage } from 'async_hooks';

const asyncLocalStorage = new AsyncLocalStorage();

export function withCorrelationId(fn, id) {
  const correlationId = id || generateId();
  return asyncLocalStorage.run({ correlationId }, fn);
}

export function getCorrelationId() {
  const store = asyncLocalStorage.getStore();
  return store?.correlationId;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
