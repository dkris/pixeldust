/**
 * ShadowInjector — applies UIMutation objects to the live DOM.
 *
 * Rules:
 *  - css_patch      → inject a <style id="pixeldust-mutation-{id}"> into document.head
 *  - dom_attribute  → setAttribute on matching element
 *  - copy_change    → set element.textContent / innerHTML
 *  - component_swap → replace matching element with a shadow-DOM wrapper
 *  - layout_change  → apply inline CSS class via a <style> injection
 *  - flow_redirect  → attach a click handler that calls history.pushState / location.href
 *
 * All operations are idempotent: applying the same mutation twice is a no-op.
 * Reverting a mutation removes the injected artefact from the DOM.
 */

export interface MutationDescriptor {
  id: string;
  type: string;
  targetSelector: string;
  cssRule?: string;
  attributeChanges?: Record<string, string>;
  newContent?: string;
  script?: string;
  description: string;
}

export class ShadowInjector {
  private static STYLE_PREFIX = 'pixeldust-mutation-';

  /**
   * Apply an array of mutations. Idempotent.
   */
  static applyMutations(mutations: MutationDescriptor[]): void {
    for (const m of mutations) {
      try {
        ShadowInjector.apply(m);
      } catch (err) {
        console.warn(`[PixelDust] Failed to apply mutation ${m.id}:`, err);
      }
    }
  }

  /**
   * Revert (remove) all injected mutations.
   */
  static revertAll(): void {
    const prefix = ShadowInjector.STYLE_PREFIX;
    document.querySelectorAll(`[id^="${prefix}"]`).forEach(el => el.remove());
    // Remove attribute overrides stored in data attributes
    document.querySelectorAll('[data-pixeldust-id]').forEach(el => {
      const id = el.getAttribute('data-pixeldust-id')!;
      const backup = (el as any).__pixeldustBackup as Record<string, string> | undefined;
      if (backup) {
        for (const [attr, val] of Object.entries(backup)) {
          el.setAttribute(attr, val);
        }
      }
      el.removeAttribute('data-pixeldust-id');
    });
  }

  /**
   * Revert a single mutation by id.
   */
  static revert(mutationId: string): void {
    const styleEl = document.getElementById(`${ShadowInjector.STYLE_PREFIX}${mutationId}`);
    if (styleEl) styleEl.remove();
    document.querySelectorAll(`[data-pixeldust-id="${mutationId}"]`).forEach(el => {
      const backup = (el as any).__pixeldustBackup as Record<string, string> | undefined;
      if (backup) {
        for (const [attr, val] of Object.entries(backup)) {
          el.setAttribute(attr, val);
        }
      }
      el.removeAttribute('data-pixeldust-id');
    });
  }

  private static apply(m: MutationDescriptor): void {
    switch (m.type) {
      case 'css_patch':
        ShadowInjector.applyCssPatch(m);
        break;
      case 'dom_attribute':
        ShadowInjector.applyDomAttribute(m);
        break;
      case 'copy_change':
        ShadowInjector.applyCopyChange(m);
        break;
      case 'layout_change':
        ShadowInjector.applyCssPatch(m); // layout changes expressed as CSS
        break;
      case 'flow_redirect':
        ShadowInjector.applyFlowRedirect(m);
        break;
      case 'component_swap':
        ShadowInjector.applyComponentSwap(m);
        break;
      default:
        console.warn(`[PixelDust] Unknown mutation type: ${m.type}`);
    }
  }

  private static applyCssPatch(m: MutationDescriptor): void {
    const styleId = `${ShadowInjector.STYLE_PREFIX}${m.id}`;
    if (document.getElementById(styleId)) return; // idempotent
    if (!m.cssRule) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.setAttribute('data-pixeldust-mutation', m.id);
    style.textContent = m.cssRule;
    document.head.appendChild(style);
  }

  private static applyDomAttribute(m: MutationDescriptor): void {
    if (!m.attributeChanges) return;
    const els = document.querySelectorAll(m.targetSelector);
    els.forEach(el => {
      if (el.getAttribute('data-pixeldust-id') === m.id) return; // idempotent

      // Back up originals
      const backup: Record<string, string> = {};
      for (const attr of Object.keys(m.attributeChanges!)) {
        backup[attr] = el.getAttribute(attr) ?? '';
      }
      (el as any).__pixeldustBackup = backup;
      el.setAttribute('data-pixeldust-id', m.id);

      for (const [attr, val] of Object.entries(m.attributeChanges!)) {
        el.setAttribute(attr, val);
      }
    });
  }

  private static applyCopyChange(m: MutationDescriptor): void {
    if (!m.newContent) return;
    const styleId = `${ShadowInjector.STYLE_PREFIX}${m.id}`;
    if (document.getElementById(styleId)) return; // idempotent (marker element)

    const els = document.querySelectorAll(m.targetSelector);
    els.forEach(el => {
      if (el.getAttribute('data-pixeldust-id') === m.id) return;
      const backup = { textContent: el.textContent ?? '' };
      (el as any).__pixeldustBackup = backup;
      el.setAttribute('data-pixeldust-id', m.id);
      // Use textContent to avoid XSS risk
      el.textContent = m.newContent!;
    });

    // Plant a marker so revertAll can find this mutation
    const marker = document.createElement('meta');
    marker.id = styleId;
    marker.setAttribute('data-pixeldust-mutation', m.id);
    document.head.appendChild(marker);
  }

  private static applyFlowRedirect(m: MutationDescriptor): void {
    if (!m.script) return;
    const styleId = `${ShadowInjector.STYLE_PREFIX}${m.id}`;
    if (document.getElementById(styleId)) return; // idempotent

    const els = document.querySelectorAll(m.targetSelector);
    els.forEach(el => {
      if (el.getAttribute('data-pixeldust-id') === m.id) return;
      el.setAttribute('data-pixeldust-id', m.id);

      const handler = () => {
        // The script field contains a target URL for redirect
        try {
          window.location.href = m.script!;
        } catch {
          /* noop */
        }
      };
      el.addEventListener('click', handler);
      (el as any).__pixeldustFlowHandler = handler;
    });

    const marker = document.createElement('meta');
    marker.id = styleId;
    marker.setAttribute('data-pixeldust-mutation', m.id);
    document.head.appendChild(marker);
  }

  private static applyComponentSwap(m: MutationDescriptor): void {
    if (!m.cssRule && !m.attributeChanges) return;
    const styleId = `${ShadowInjector.STYLE_PREFIX}${m.id}`;
    if (document.getElementById(styleId)) return; // idempotent

    // For component_swap we use shadow DOM to isolate the mutation
    const els = document.querySelectorAll(m.targetSelector);
    els.forEach(el => {
      if (el.getAttribute('data-pixeldust-id') === m.id) return;
      el.setAttribute('data-pixeldust-id', m.id);

      // Wrap with shadow DOM if CSS patch is provided
      if (m.cssRule && el.shadowRoot === null) {
        try {
          const shadow = el.attachShadow({ mode: 'open' });
          const style = document.createElement('style');
          style.textContent = m.cssRule;
          shadow.appendChild(style);
          // Re-slot original children
          const slot = document.createElement('slot');
          shadow.appendChild(slot);
        } catch {
          // Element may not support shadow DOM; fall back to CSS patch
          ShadowInjector.applyCssPatch({ ...m, id: `${m.id}-fallback` });
        }
      }

      // Apply attribute changes on top
      if (m.attributeChanges) {
        const backup: Record<string, string> = {};
        for (const attr of Object.keys(m.attributeChanges)) {
          backup[attr] = el.getAttribute(attr) ?? '';
        }
        (el as any).__pixeldustBackup = { ...(el as any).__pixeldustBackup, ...backup };
        for (const [attr, val] of Object.entries(m.attributeChanges)) {
          el.setAttribute(attr, val);
        }
      }
    });

    const marker = document.createElement('meta');
    marker.id = styleId;
    marker.setAttribute('data-pixeldust-mutation', m.id);
    document.head.appendChild(marker);
  }
}

export default ShadowInjector;
