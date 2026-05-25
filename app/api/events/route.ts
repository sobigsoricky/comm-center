/**
 * Server-Sent Events stream. The browser opens this once and receives pushes:
 *   - new draft created
 *   - draft updated / removed
 *   - activity log entries
 *   - WhatsApp status changes
 *
 * EventSource is native and auto-reconnects. No client library needed.
 */

import { eventBus, type CommEvent } from '@/lib/event-bus';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: CommEvent) => {
        const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Client disconnected
        }
      };

      // Initial keep-alive comment so browsers don't hold the response until first event
      controller.enqueue(encoder.encode(': connected\n\n'));

      const unsubscribe = eventBus.subscribe(send);

      // Heartbeat every 25s — defeats proxy idle timeouts (Railway is fine, but cheap insurance)
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 25_000);

      // Cleanup on client disconnect — controller.close throws after first close
      // We hook into the stream's cancel via the ReadableStream contract by returning a closer.
      // (Next.js will call cancel() when the response is aborted.)
      // Stash cleanup on the controller-bound symbol so cancel() can find it.
      (controller as unknown as { __cleanup: () => void }).__cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    },
    cancel(reason) {
      // Best-effort cleanup
      console.log('[events] client disconnected', reason);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
