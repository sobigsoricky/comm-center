/**
 * In-process event bus for SSE fan-out.
 *
 * Worker → eventBus.emit('draft', d) → all SSE clients receive it.
 * Browser opens GET /api/events → subscribes → receives push.
 *
 * One bus per Node process. Survives until container restart.
 */

import { EventEmitter } from 'events';

export type CommEvent =
  | { type: 'draft'; payload: { id: string } } // a new draft was added
  | { type: 'draft-updated'; payload: { id: string } }
  | { type: 'draft-removed'; payload: { id: string } }
  | { type: 'log'; payload: { ts: string; level: 'info' | 'success' | 'error'; msg: string } }
  | { type: 'whatsapp-status'; payload: { state: string; phone?: string } };

class CommBus extends EventEmitter {
  emitEvent(e: CommEvent) {
    this.emit('event', e);
  }
  subscribe(cb: (e: CommEvent) => void): () => void {
    this.on('event', cb);
    return () => this.off('event', cb);
  }
}

// Singleton across hot-reloads in dev
const globalAny = globalThis as unknown as { __commBus?: CommBus };
export const eventBus: CommBus = globalAny.__commBus ?? (globalAny.__commBus = new CommBus());
// Many simultaneous subscribers in long sessions — bump the listener cap
eventBus.setMaxListeners(50);
