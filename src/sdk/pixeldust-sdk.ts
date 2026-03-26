/**
 * PixelDust Browser SDK
 *
 * Lightweight session telemetry + shadow-DOM mutation injector.
 * No external dependencies. Target: < 10KB gzipped when bundled.
 *
 * Usage:
 *   <script src="/pixeldust-sdk.js"></script>
 *   <script>
 *     PixelDust.init({ appId: 'my-app', endpoint: 'https://pd.example.com' });
 *   </script>
 */

import { ShadowInjector, MutationDescriptor } from './shadow-injector';

// ============================================================================
// Types (browser-side subset — no Node.js imports)
// ============================================================================

export interface SDKConfig {
  appId: string;
  endpoint: string;
  samplingRate?: number;      // 0-1, default 0.1
  flushIntervalMs?: number;   // default 3000
  maxQueueSize?: number;      // default 50
  debug?: boolean;
}

interface QueuedEvent {
  id: string;
  type: string;
  timestamp: number;
  url: string;
  selector?: string;
  elementText?: string;
  position?: { x: number; y: number };
  viewport?: { width: number; height: number };
  value?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Polyfill for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getCssSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.className) {
      const cls = Array.from(current.classList).slice(0, 2).join('.');
      if (cls) selector += `.${cls}`;
    }
    parts.unshift(selector);
    current = current.parentElement;
    if (parts.length >= 4) break;
  }
  return parts.join(' > ');
}

// ============================================================================
// Core SDK class
// ============================================================================

class PixelDustSDK {
  private config!: Required<SDKConfig>;
  private sessionId!: string;
  private anonymousId!: string;
  private cohortId: string | null = null;
  private queue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  // Rage-click tracking
  private clickHistory: { el: Element; time: number }[] = [];
  // Form tracking
  private focusedForm: HTMLFormElement | null = null;
  private focusedFormFields = 0;
  // Applied mutations (keyed by experimentId)
  private appliedMutations: MutationDescriptor[] = [];

  init(config: SDKConfig): void {
    if (this.initialized) return;
    this.config = {
      samplingRate: 0.1,
      flushIntervalMs: 3000,
      maxQueueSize: 50,
      debug: false,
      ...config,
    };

    // Sampling: skip if this session is outside sample
    if (Math.random() > this.config.samplingRate) return;

    this.sessionId = sessionStorage.getItem('_pd_sid') || generateId();
    sessionStorage.setItem('_pd_sid', this.sessionId);

    this.anonymousId = localStorage.getItem('_pd_aid') || generateId();
    localStorage.setItem('_pd_aid', this.anonymousId);

    this.cohortId = sessionStorage.getItem('_pd_cohort');

    this.initialized = true;
    this.attachListeners();
    this.startFlushTimer();
    this.registerSession();
    this.log('SDK initialized', { sessionId: this.sessionId });
  }

  track(eventType: string, metadata?: Record<string, any>): void {
    if (!this.initialized) return;
    this.enqueue({
      id: generateId(),
      type: eventType,
      timestamp: Date.now(),
      url: window.location.href,
      metadata,
    });
  }

  identify(_userId: string): void {
    // Store for future use; not sent to server in this version
    localStorage.setItem('_pd_uid', _userId);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private log(...args: any[]): void {
    if (this.config.debug) console.log('[PixelDust]', ...args);
  }

  private enqueue(event: QueuedEvent): void {
    this.queue.push(event);
    if (this.queue.length >= this.config.maxQueueSize) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
    // Flush on tab hide (reliable for SPA navigation)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushBeacon();
      }
    });
    // Flush on unload
    window.addEventListener('pagehide', () => this.flushBeacon());
  }

  private flush(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    this.sendBatch(batch);
  }

  private flushBeacon(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    const payload = JSON.stringify(this.buildPayload(batch));
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${this.config.endpoint}/api/sdk/ingest`, payload);
    }
  }

  private buildPayload(events: QueuedEvent[]) {
    return {
      appId: this.config.appId,
      userSessionId: this.sessionId,
      anonymousId: this.anonymousId,
      cohortId: this.cohortId,
      userAgent: navigator.userAgent,
      pageUrl: window.location.href,
      events,
    };
  }

  private async sendBatch(events: QueuedEvent[]): Promise<void> {
    try {
      const resp = await fetch(`${this.config.endpoint}/api/sdk/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildPayload(events)),
        keepalive: true,
      });

      if (!resp.ok) {
        this.log('Ingest failed:', resp.status);
        return;
      }

      const data = await resp.json() as {
        cohortId?: string;
        mutations?: MutationDescriptor[];
      };

      if (data.cohortId && data.cohortId !== this.cohortId) {
        this.cohortId = data.cohortId;
        sessionStorage.setItem('_pd_cohort', data.cohortId);
      }

      if (data.mutations && data.mutations.length > 0) {
        this.applyMutations(data.mutations);
      }
    } catch (err) {
      this.log('Ingest error:', err);
    }
  }

  private applyMutations(mutations: MutationDescriptor[]): void {
    const newMutations = mutations.filter(
      m => !this.appliedMutations.some(a => a.id === m.id)
    );
    if (newMutations.length === 0) return;
    ShadowInjector.applyMutations(newMutations);
    this.appliedMutations.push(...newMutations);
    this.log('Applied mutations:', newMutations.map(m => m.id));
  }

  private async registerSession(): Promise<void> {
    try {
      const resp = await fetch(`${this.config.endpoint}/api/sdk/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: this.config.appId,
          userSessionId: this.sessionId,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });
      if (resp.ok) {
        const data = await resp.json() as { cohortId?: string; mutations?: MutationDescriptor[] };
        if (data.cohortId) {
          this.cohortId = data.cohortId;
          sessionStorage.setItem('_pd_cohort', data.cohortId);
        }
        if (data.mutations?.length) {
          this.applyMutations(data.mutations);
        }
      }
    } catch {
      /* non-critical */
    }
  }

  // ── Event Listeners ────────────────────────────────────────────────────────

  private attachListeners(): void {
    this.listenForRageClicks();
    this.listenForFormAbandonment();
    this.listenForJsErrors();
    this.listenForNavigation();
    this.listenForScrollDepth();
    this.listenForDeadClicks();
  }

  private listenForRageClicks(): void {
    document.addEventListener('mousedown', (e) => {
      const el = e.target as Element;
      const now = Date.now();
      this.clickHistory = this.clickHistory.filter(c => now - c.time < 700 && c.el === el);
      this.clickHistory.push({ el, time: now });

      if (this.clickHistory.length >= 3) {
        this.clickHistory = [];
        this.enqueue({
          id: generateId(), type: 'rage_click', timestamp: now,
          url: window.location.href, selector: getCssSelector(el),
          elementText: el.textContent?.trim().slice(0, 100),
          position: { x: e.clientX, y: e.clientY },
          viewport: { width: window.innerWidth, height: window.innerHeight },
        });
        this.log('Rage click detected', getCssSelector(el));
      }
    }, { passive: true });
  }

  private listenForDeadClicks(): void {
    document.addEventListener('click', (e) => {
      const el = e.target as Element;
      const domBefore = el.outerHTML;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (el.outerHTML === domBefore && !el.closest('a, button, [role="button"], input, select, textarea')) {
            this.enqueue({
              id: generateId(), type: 'dead_click', timestamp: Date.now(),
              url: window.location.href, selector: getCssSelector(el),
              elementText: el.textContent?.trim().slice(0, 100),
              position: { x: e.clientX, y: e.clientY },
            });
          }
        });
      });
    }, { passive: true });
  }

  private listenForFormAbandonment(): void {
    document.addEventListener('focusin', (e) => {
      const field = e.target as HTMLElement;
      const form = field.closest('form');
      if (!form) return;
      if (form !== this.focusedForm) {
        this.focusedForm = form as HTMLFormElement;
        this.focusedFormFields = 0;
      }
      this.focusedFormFields++;
    }, { passive: true });

    document.addEventListener('submit', () => {
      this.focusedForm = null;
      this.focusedFormFields = 0;
    }, { passive: true });

    window.addEventListener('beforeunload', () => {
      if (this.focusedForm && this.focusedFormFields >= 2) {
        const selector = getCssSelector(this.focusedForm);
        this.enqueue({
          id: generateId(), type: 'form_abandonment', timestamp: Date.now(),
          url: window.location.href, selector,
          metadata: { fieldCount: this.focusedFormFields },
        });
        this.flushBeacon();
      }
    });
  }

  private listenForJsErrors(): void {
    window.addEventListener('error', (e) => {
      this.enqueue({
        id: generateId(), type: 'js_error', timestamp: Date.now(),
        url: window.location.href,
        metadata: { message: e.message, filename: e.filename, lineno: e.lineno },
      });
    });
    window.addEventListener('unhandledrejection', (e) => {
      this.enqueue({
        id: generateId(), type: 'js_error', timestamp: Date.now(),
        url: window.location.href,
        metadata: { message: String(e.reason) },
      });
    });
  }

  private listenForNavigation(): void {
    const emit = (url: string) => {
      this.enqueue({
        id: generateId(), type: 'navigation', timestamp: Date.now(), url,
      });
    };
    const origPush = history.pushState.bind(history);
    history.pushState = function (...args) {
      origPush(...args);
      emit(window.location.href);
    };
    window.addEventListener('popstate', () => emit(window.location.href));
  }

  private listenForScrollDepth(): void {
    let maxDepth = 0;
    let ticking = false;
    document.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrolled = window.scrollY + window.innerHeight;
        const total = document.documentElement.scrollHeight;
        const depth = Math.round((scrolled / total) * 100);
        if (depth > maxDepth) {
          maxDepth = depth;
          if (maxDepth < 25) {
            this.enqueue({
              id: generateId(), type: 'scroll_depth_low', timestamp: Date.now(),
              url: window.location.href, metadata: { depthPercent: maxDepth },
            });
          }
        }
        ticking = false;
      });
    }, { passive: true });
  }
}

// ── Global export ─────────────────────────────────────────────────────────────

const _sdk = new PixelDustSDK();

declare global {
  interface Window {
    PixelDust: {
      init(config: SDKConfig): void;
      track(eventType: string, metadata?: Record<string, any>): void;
      identify(userId: string): void;
    };
  }
}

if (typeof window !== 'undefined') {
  window.PixelDust = {
    init: (cfg) => _sdk.init(cfg),
    track: (type, meta) => _sdk.track(type, meta),
    identify: (uid) => _sdk.identify(uid),
  };
}

export { _sdk as PixelDustSDK };
export default _sdk;
