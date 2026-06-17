export class ExtensionEventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Le handler d’événement doit être une fonction.');
    }

    const handlers = this.listeners.get(eventName) || new Set();
    handlers.add(handler);
    this.listeners.set(eventName, handlers);

    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    this.listeners.get(eventName)?.delete(handler);
  }

  emit(eventName, payload) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`Erreur extension pendant ${eventName}:`, error);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}
