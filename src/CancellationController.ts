import type { Cancellation, CancellationLink } from './types.js';

/**
 * A native abort controller that owns directional links from borrowed signals.
 * An upstream request is forwarded with its original reason; local abortion
 * does not abort upstream sources or independently owned siblings.
 *
 * The owner closes links after all work and cleanup that require them. Closing
 * does not abort the controller, revoke local abort authority, or establish that
 * work has completed. A controller owns links, not the work observing its signal.
 */
class CancellationController extends AbortController implements Cancellation {
  private readonly links = new Map<AbortSignal, CancellationLink>();
  private closed = false;

  /**
   * Attach an upstream signal and return an independent, idempotent detach.
   * Repeated attachments to the same signal share one physical listener; the
   * listener remains until every attachment is detached or this owner closes.
   * A failed removal disables forwarding and can be retried by detach or close.
   * While this owner is open and not aborted, reentrant attachment to a signal
   * being installed or removed is rejected. An already-aborted owner returns an
   * inert detach; a closed owner rejects attachments.
   */
  public link(signal: AbortSignal): () => void {
    return this.attach(signal);
  }

  private attach(signal: AbortSignal): () => void {
    if (this.closed) throw new Error('Cancellation controller is closed');
    if (this.signal.aborted) return () => {};

    let link = this.links.get(signal);
    if (link?.installing) {
      throw new Error('Cancellation link installation is in progress');
    }
    if (link != null && !link.active) {
      this.removeLink(link);
      link = undefined;
    }
    if (link == null) {
      if (signal.aborted) {
        this.abort(signal.reason);
        return () => {};
      }
      const created: CancellationLink = {
        signal,
        references: 1,
        active: true,
        installing: true,
        removing: false,
        propagate: () => {
          if (created.active && !this.closed && signal.aborted) {
            this.abort(signal.reason);
          }
        },
      };
      this.links.set(signal, created);
      try {
        // Synthetic abort events must not consume the listener for a real abort.
        signal.addEventListener('abort', created.propagate);
        if (signal.aborted) created.propagate();
        if (this.closed) {
          // A structural signal or abort observer may close during setup.
          throw new Error('Cancellation controller closed during link setup');
        }
        created.installing = false;
      } catch (primary) {
        created.installing = false;
        created.active = false;
        // Reentrant close may have removed tracking before installation failed.
        this.links.set(signal, created);
        try {
          this.removeLink(created);
        } catch (cleanup) {
          throw new SuppressedError(cleanup, primary);
        }
        throw primary;
      }
      link = created;
    } else {
      link.references += 1;
    }

    const owned = link;
    let detached = false;
    return () => {
      if (!detached) {
        detached = true;
        owned.references -= 1;
      }
      if (owned.references === 0 && this.links.get(signal) === owned) {
        owned.active = false;
        this.removeLink(owned);
      }
    };
  }

  /**
   * Disable forwarding and attempt every unlink without aborting this controller.
   * Failed physical removals remain retryable. One failure is thrown unchanged;
   * multiple failures are reported in an AggregateError. Repeated successful
   * close calls are inert, and new links are rejected once closing begins.
   */
  public close(): void {
    this.closed = true;
    const failures: unknown[] = [];
    for (const link of this.links.values()) {
      link.active = false;
      try {
        this.removeLink(link);
      } catch (reason) {
        failures.push(reason);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Cancellation unlink failures');
    }
  }

  private removeLink(link: CancellationLink): void {
    if (link.removing) {
      throw new Error('Cancellation link removal is in progress');
    }
    link.removing = true;
    try {
      link.signal.removeEventListener('abort', link.propagate);
      if (this.links.get(link.signal) === link) this.links.delete(link.signal);
    } finally {
      link.removing = false;
    }
  }

  /**
   * Create independent local authority, optionally linked to upstream signals.
   * Duplicate inputs share one listener. If inputs are already aborted, the first
   * in input order supplies the reason; otherwise the first observed request wins.
   * Partial setup is unwound, preserving both setup and cleanup failures.
   */
  public constructor(upstream?: AbortSignal | readonly AbortSignal[]) {
    super();
    const parents: readonly AbortSignal[] =
      upstream == null
        ? []
        : Array.isArray(upstream)
          ? [...new Set(upstream)]
          : [upstream as AbortSignal];
    try {
      // Already-aborted inputs are arbitrated in caller-supplied input order.
      const aborted = parents.find((parent) => parent.aborted);
      if (aborted != null) {
        this.abort(aborted.reason);
      } else {
        for (const parent of parents) {
          this.attach(parent);
        }
      }
    } catch (primary) {
      try {
        this.close();
      } catch (cleanup) {
        throw new SuppressedError(cleanup, primary);
      }
      throw primary;
    }
  }
}

export default CancellationController;
