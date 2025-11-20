/**
 * Accessibility Tree Snapshot Collector
 *
 * Extracts and analyzes the accessibility tree from web pages using
 * Playwright's accessibility snapshot API and axe-core for WCAG validation.
 */

import type { Page } from 'playwright';
import type {
  AccessibilityTree,
  AccessibilityNode,
  AccessibilityViolation,
} from '../../types/index';

/**
 * Collects accessibility tree snapshot from a Playwright page
 */
export class AccessibilitySnapshotCollector {
  /**
   * Capture the full accessibility tree from a page
   */
  async capture(page: Page, wcagLevel: 'A' | 'AA' | 'AAA' = 'AA'): Promise<AccessibilityTree> {
    try {
      // Get the accessibility snapshot from Playwright
      const snapshot = await page.accessibility.snapshot();

      if (!snapshot) {
        throw new Error('Failed to capture accessibility snapshot');
      }

      // Convert Playwright snapshot to our AccessibilityNode structure
      const root = this.convertPlaywrightSnapshot(snapshot);

      // Run axe-core for WCAG validation
      const violations = await this.runAxeCore(page, wcagLevel);

      return {
        root,
        violations,
        wcagLevel,
        capturedAt: new Date(),
      };
    } catch (error) {
      console.error('Error capturing accessibility snapshot:', error);
      throw error;
    }
  }

  /**
   * Convert Playwright's accessibility snapshot to our AccessibilityNode format
   */
  private convertPlaywrightSnapshot(
    snapshot: any,
    path = 'root',
    level = 0
  ): AccessibilityNode {
    const node: AccessibilityNode = {
      role: snapshot.role || 'generic',
      name: snapshot.name,
      description: snapshot.description,
      value: snapshot.value,
      children: [],
      path,
      level,
      properties: {},
      states: {},
    };

    // Extract properties
    if (snapshot.checked !== undefined) {
      node.states!.checked = snapshot.checked === 'mixed' ? 'mixed' : snapshot.checked;
    }
    if (snapshot.disabled !== undefined) node.states!.disabled = snapshot.disabled;
    if (snapshot.expanded !== undefined) node.states!.expanded = snapshot.expanded;
    if (snapshot.pressed !== undefined) {
      node.states!.pressed = snapshot.pressed === 'mixed' ? 'mixed' : snapshot.pressed;
    }
    if (snapshot.selected !== undefined) node.states!.selected = snapshot.selected;
    if (snapshot.readonly !== undefined) node.states!.readonly = snapshot.readonly;
    if (snapshot.required !== undefined) node.states!.required = snapshot.required;
    if (snapshot.invalid !== undefined) node.states!.invalid = snapshot.invalid;

    // Store additional properties
    if (snapshot.valuemin !== undefined) node.properties!.valuemin = snapshot.valuemin;
    if (snapshot.valuemax !== undefined) node.properties!.valuemax = snapshot.valuemax;
    if (snapshot.valuenow !== undefined) node.properties!.valuenow = snapshot.valuenow;
    if (snapshot.orientation !== undefined) node.properties!.orientation = snapshot.orientation;
    if (snapshot.autocomplete !== undefined) node.properties!.autocomplete = snapshot.autocomplete;
    if (snapshot.haspopup !== undefined) node.properties!.haspopup = snapshot.haspopup;
    if (snapshot.level !== undefined) node.properties!.level = snapshot.level;
    if (snapshot.multiselectable !== undefined) node.properties!.multiselectable = snapshot.multiselectable;

    // Process children recursively
    if (snapshot.children && Array.isArray(snapshot.children)) {
      node.children = snapshot.children.map((child: any, index: number) =>
        this.convertPlaywrightSnapshot(child, `${path}[${index}]`, level + 1)
      );
    }

    return node;
  }

  /**
   * Run axe-core accessibility testing
   */
  private async runAxeCore(
    page: Page,
    wcagLevel: 'A' | 'AA' | 'AAA'
  ): Promise<AccessibilityViolation[]> {
    try {
      // Inject axe-core into the page
      await this.injectAxeCore(page);

      // Run axe with the specified WCAG level
      const results = await page.evaluate(
        async (level: 'A' | 'AA' | 'AAA') => {
          // @ts-ignore - axe is injected globally
          if (typeof window.axe === 'undefined') {
            return { violations: [] };
          }

          // Configure axe to run only the specified WCAG level
          const runConfig = {
            runOnly: {
              type: 'tag',
              values: [`wcag2${level.toLowerCase()}`, `wcag2${level.toLowerCase()}a`],
            },
          };

          // @ts-ignore
          return await window.axe.run(runConfig);
        },
        wcagLevel
      );

      // Transform axe violations to our format
      return results.violations.map((violation: any) => ({
        id: violation.id,
        impact: violation.impact || 'moderate',
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.map((node: any) => ({
          target: node.target,
          html: node.html,
          failureSummary: node.failureSummary,
        })),
        wcagTags: violation.tags.filter((tag: string) => tag.startsWith('wcag')),
      }));
    } catch (error) {
      console.warn('Error running axe-core:', error);
      // Return empty violations if axe fails - don't block the snapshot
      return [];
    }
  }

  /**
   * Inject axe-core library into the page
   */
  private async injectAxeCore(page: Page): Promise<void> {
    try {
      // Try to load axe-core from CDN
      await page.addScriptTag({
        url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.3/axe.min.js',
      });

      // Wait for axe to be available
      await page.waitForFunction(() => typeof (window as any).axe !== 'undefined', {
        timeout: 5000,
      });
    } catch (error) {
      console.warn('Failed to inject axe-core, accessibility violations will not be available');
      // Don't throw - we can still capture the tree without violations
    }
  }

  /**
   * Get a simplified accessibility tree for LLM consumption
   * This creates a more compact representation suitable for AI analysis
   */
  getSimplifiedTree(tree: AccessibilityTree): string {
    return this.simplifyNode(tree.root, 0);
  }

  /**
   * Recursively simplify accessibility nodes into a readable string format
   */
  private simplifyNode(node: AccessibilityNode, depth: number): string {
    const indent = '  '.repeat(depth);
    let result = `${indent}${node.role}`;

    if (node.name) result += ` "${node.name}"`;
    if (node.value) result += ` [value: "${node.value}"]`;

    // Add important states
    const states = [];
    if (node.states?.checked) states.push('checked');
    if (node.states?.disabled) states.push('disabled');
    if (node.states?.expanded !== undefined) {
      states.push(node.states.expanded ? 'expanded' : 'collapsed');
    }
    if (node.states?.selected) states.push('selected');
    if (node.states?.required) states.push('required');
    if (node.states?.invalid) states.push('invalid');

    if (states.length > 0) {
      result += ` (${states.join(', ')})`;
    }

    result += '\n';

    // Process children
    for (const child of node.children) {
      result += this.simplifyNode(child, depth + 1);
    }

    return result;
  }

  /**
   * Compare two accessibility trees and identify differences
   * This is a helper method used by the AnalysisAgent
   */
  compareNodes(
    baseNode: AccessibilityNode | null,
    targetNode: AccessibilityNode | null,
    path: string = 'root'
  ): {
    added: AccessibilityNode[];
    removed: AccessibilityNode[];
    modified: Array<{
      path: string;
      field: string;
      oldValue: any;
      newValue: any;
    }>;
  } {
    const added: AccessibilityNode[] = [];
    const removed: AccessibilityNode[] = [];
    const modified: Array<{
      path: string;
      field: string;
      oldValue: any;
      newValue: any;
    }> = [];

    // Node was removed
    if (baseNode && !targetNode) {
      removed.push(baseNode);
      return { added, removed, modified };
    }

    // Node was added
    if (!baseNode && targetNode) {
      added.push(targetNode);
      return { added, removed, modified };
    }

    // Both nodes exist - check for modifications
    if (baseNode && targetNode) {
      // Compare role
      if (baseNode.role !== targetNode.role) {
        modified.push({
          path,
          field: 'role',
          oldValue: baseNode.role,
          newValue: targetNode.role,
        });
      }

      // Compare name
      if (baseNode.name !== targetNode.name) {
        modified.push({
          path,
          field: 'name',
          oldValue: baseNode.name,
          newValue: targetNode.name,
        });
      }

      // Compare value
      if (baseNode.value !== targetNode.value) {
        modified.push({
          path,
          field: 'value',
          oldValue: baseNode.value,
          newValue: targetNode.value,
        });
      }

      // Compare states
      const baseStates = JSON.stringify(baseNode.states || {});
      const targetStates = JSON.stringify(targetNode.states || {});
      if (baseStates !== targetStates) {
        modified.push({
          path,
          field: 'states',
          oldValue: baseNode.states,
          newValue: targetNode.states,
        });
      }

      // Compare children by matching roles and names
      const baseChildren = baseNode.children || [];
      const targetChildren = targetNode.children || [];

      // Simple comparison - could be enhanced with better matching algorithm
      const maxLength = Math.max(baseChildren.length, targetChildren.length);
      for (let i = 0; i < maxLength; i++) {
        const baseChild = baseChildren[i] || null;
        const targetChild = targetChildren[i] || null;
        const childPath = `${path}[${i}]`;

        const childDiff = this.compareNodes(baseChild, targetChild, childPath);
        added.push(...childDiff.added);
        removed.push(...childDiff.removed);
        modified.push(...childDiff.modified);
      }
    }

    return { added, removed, modified };
  }
}

/**
 * Singleton instance for easy access
 */
export const accessibilityCollector = new AccessibilitySnapshotCollector();
