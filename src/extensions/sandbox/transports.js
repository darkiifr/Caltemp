import { startGuest } from './guest.js';
import { cloneData } from './protocol.js';

/**
 * A transport is `{ post(message), onMessage(handler), terminate() }` seen
 * from the host side.
 */

// Production transport: one dedicated module worker per plugin.
export function createWorkerTransport() {
  const worker = new Worker(new URL('./pluginWorker.js', import.meta.url), {
    type: 'module',
    name: 'caltemp-plugin',
  });
  let handler = () => {};
  worker.addEventListener('message', (event) => handler(event.data));
  worker.addEventListener('error', (event) => {
    event.preventDefault?.();
    handler({ kind: 'crash', error: { message: event.message || 'Le plugin a planté.' } });
  });
  return {
    post: (message) => worker.postMessage(message),
    onMessage: (next) => {
      handler = next;
    },
    terminate: () => worker.terminate(),
  };
}

/**
 * Runs the guest runtime in the current realm, with messages cloned and
 * delivered asynchronously like a worker would. Used by tests and by hosts
 * without Worker support; it offers no isolation.
 */
export function createInProcessTransport({ importModule }) {
  let hostHandler = () => {};
  let terminated = false;
  const deliver = (fn, message) => {
    const copy = cloneData(message);
    queueMicrotask(() => {
      if (!terminated) fn(copy);
    });
  };
  const guestHandler = startGuest({
    post: (message) => deliver((data) => hostHandler(data), message),
    importModule,
  });
  return {
    post: (message) => deliver(guestHandler, message),
    onMessage: (next) => {
      hostHandler = next;
    },
    terminate: () => {
      terminated = true;
    },
  };
}
