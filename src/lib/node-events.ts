/**
 * Browser-safe replacement for Node's `events` module.
 *
 * The avatar SDKs (and LiveKit underneath them) subclass `EventEmitter` from
 * the CommonJS `events` package. Once bundled, that CommonJS module could be
 * evaluated after its subclasses, so the base class resolved to `undefined`
 * and the whole avatar bundle crashed with
 * "Class extends value undefined is not a constructor or null".
 * This ESM implementation has no such ordering hazard.
 */
type Handler = (...args: any[]) => void;

export class EventEmitter {
  static defaultMaxListeners = 100;

  private readonly _handlers = new Map<string | symbol, Handler[]>();
  private _maxListeners = EventEmitter.defaultMaxListeners;

  addListener(event: string | symbol, handler: Handler): this {
    const list = this._handlers.get(event);
    if (list) list.push(handler);
    else this._handlers.set(event, [handler]);
    return this;
  }

  on(event: string | symbol, handler: Handler): this {
    return this.addListener(event, handler);
  }

  prependListener(event: string | symbol, handler: Handler): this {
    const list = this._handlers.get(event);
    if (list) list.unshift(handler);
    else this._handlers.set(event, [handler]);
    return this;
  }

  once(event: string | symbol, handler: Handler): this {
    const wrapped: Handler = (...args: any[]) => {
      this.off(event, wrapped);
      handler(...args);
    };
    (wrapped as Handler & { listener?: Handler }).listener = handler;
    return this.addListener(event, wrapped);
  }

  prependOnceListener(event: string | symbol, handler: Handler): this {
    const wrapped: Handler = (...args: any[]) => {
      this.off(event, wrapped);
      handler(...args);
    };
    (wrapped as Handler & { listener?: Handler }).listener = handler;
    return this.prependListener(event, wrapped);
  }

  removeListener(event: string | symbol, handler: Handler): this {
    const list = this._handlers.get(event);
    if (!list) return this;
    const index = list.findIndex(
      (item) => item === handler || (item as Handler & { listener?: Handler }).listener === handler,
    );
    if (index >= 0) list.splice(index, 1);
    if (!list.length) this._handlers.delete(event);
    return this;
  }

  off(event: string | symbol, handler: Handler): this {
    return this.removeListener(event, handler);
  }

  removeAllListeners(event?: string | symbol): this {
    if (event === undefined) this._handlers.clear();
    else this._handlers.delete(event);
    return this;
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    const list = this._handlers.get(event);
    if (!list?.length) return false;
    for (const handler of [...list]) handler(...args);
    return true;
  }

  listeners(event: string | symbol): Handler[] {
    return [...(this._handlers.get(event) ?? [])];
  }

  rawListeners(event: string | symbol): Handler[] {
    return this.listeners(event);
  }

  listenerCount(event: string | symbol): number {
    return this._handlers.get(event)?.length ?? 0;
  }

  eventNames(): (string | symbol)[] {
    return [...this._handlers.keys()];
  }

  setMaxListeners(count: number): this {
    this._maxListeners = count;
    return this;
  }

  getMaxListeners(): number {
    return this._maxListeners;
  }
}

export const EventEmitterAsyncResource = EventEmitter;
export default EventEmitter;
