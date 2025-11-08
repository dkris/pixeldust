import { BaseAgent } from './base-agent';
import {
  AgentType,
  AgentContext,
  AgentResult,
  ComparisonResult,
  Difference,
  DifferenceType,
  DifferenceCategory,
  Severity,
  VisualDiff,
  DOMDiff,
} from '../types';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'fs/promises';
import path from 'path';
import { JSDOM } from 'jsdom';
import { v4 as uuidv4 } from 'uuid';

/**
 * Analysis Agent - Compares results across versions
 *
 * Responsibilities:
 * - Visual comparison (pixel-perfect + perceptual)
 * - DOM structure comparison
 * - Performance comparison
 * - Accessibility comparison
 * - Generate detailed difference reports
 */
export class AnalysisAgent extends BaseAgent {
  constructor() {
    super(AgentType.ANALYSIS);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { config, session, data } = context;
    const testResults = data?.results || [];

    try {
      this.logger.info('Analyzing differences between versions');

      const comparisons: ComparisonResult[] = [];

      // Compare each version against the baseline (first version)
      const baselineVersion = session.versions[0];

      for (let i = 1; i < session.versions.length; i++) {
        const targetVersion = session.versions[i];

        this.logger.info(`Comparing ${baselineVersion} → ${targetVersion}`);

        const comparison = await this.compareVersions(
          baselineVersion,
          targetVersion,
          testResults,
          config,
          session.id
        );

        comparisons.push(comparison);
      }

      this.logger.info(`Generated ${comparisons.length} comparison reports`);

      return this.success({
        comparisons,
        differences: comparisons.flatMap(c => c.differences),
      });
    } catch (error) {
      return this.failure(error as Error);
    }
  }

  private async compareVersions(
    baseVersion: string,
    targetVersion: string,
    allResults: any[],
    config: any,
    sessionId: string
  ): Promise<ComparisonResult> {
    const baseResults = allResults.filter(r => r.version === baseVersion);
    const targetResults = allResults.filter(r => r.version === targetVersion);

    const differences: Difference[] = [];

    // Visual comparison
    const visualDiffs = await this.compareVisuals(
      baseResults,
      targetResults,
      config,
      sessionId
    );
    differences.push(...visualDiffs);

    // DOM comparison
    const domDiffs = await this.compareDOMs(baseResults, targetResults, config);
    differences.push(...domDiffs);

    // Performance comparison
    const perfDiffs = this.comparePerformance(baseResults, targetResults, config);
    differences.push(...perfDiffs);

    // Determine overall severity
    const severity = this.calculateSeverity(differences);

    return {
      id: uuidv4(),
      sessionId,
      baseVersion,
      targetVersion,
      component: 'all', // Would be more specific in real implementation
      differences,
      severity,
      createdAt: new Date(),
    };
  }

  private async compareVisuals(
    baseResults: any[],
    targetResults: any[],
    config: any,
    sessionId: string
  ): Promise<Difference[]> {
    const differences: Difference[] = [];

    for (const baseResult of baseResults) {
      const targetResult = targetResults.find(r => r.testId === baseResult.testId);
      if (!targetResult) continue;

      for (const baseScreenshot of baseResult.screenshots) {
        const targetScreenshot = targetResult.screenshots.find(
          (s: any) => s.name === baseScreenshot.name
        );
        if (!targetScreenshot) continue;

        try {
          const visualDiff = await this.compareScreenshots(
            baseScreenshot.path,
            targetScreenshot.path,
            config.analysis.visualThreshold,
            sessionId
          );

          if (visualDiff.pixelDiffPercentage > config.analysis.visualThreshold) {
            differences.push({
              type: DifferenceType.VISUAL,
              category: DifferenceCategory.BREAKING,
              severity: this.getVisualSeverity(visualDiff.pixelDiffPercentage),
              description: `Visual difference detected: ${visualDiff.pixelDiffPercentage.toFixed(2)}% pixels differ`,
              location: `${baseResult.testId}/${baseScreenshot.name}`,
              visualDiff,
            });
          }
        } catch (error) {
          this.logger.warn('Failed to compare screenshots', error as Error);
        }
      }
    }

    return differences;
  }

  private async compareScreenshots(
    basePath: string,
    targetPath: string,
    threshold: number,
    sessionId: string
  ): Promise<VisualDiff> {
    const baseImg = PNG.sync.read(await fs.readFile(basePath));
    const targetImg = PNG.sync.read(await fs.readFile(targetPath));

    const { width, height } = baseImg;
    const diff = new PNG({ width, height });

    const pixelDiffCount = pixelmatch(
      baseImg.data,
      targetImg.data,
      diff.data,
      width,
      height,
      { threshold }
    );

    const totalPixels = width * height;
    const pixelDiffPercentage = (pixelDiffCount / totalPixels) * 100;

    // Save diff image
    const diffDir = path.join(process.cwd(), 'data', 'screenshots', sessionId, 'diffs');
    await fs.mkdir(diffDir, { recursive: true });

    const diffImagePath = path.join(diffDir, `${uuidv4()}.png`);
    await fs.writeFile(diffImagePath, PNG.sync.write(diff));

    return {
      pixelDiffCount,
      pixelDiffPercentage,
      diffImagePath,
      baseImagePath: basePath,
      targetImagePath: targetPath,
    };
  }

  private async compareDOMs(
    baseResults: any[],
    targetResults: any[],
    config: any
  ): Promise<Difference[]> {
    const differences: Difference[] = [];

    for (const baseResult of baseResults) {
      const targetResult = targetResults.find(r => r.testId === baseResult.testId);
      if (!targetResult || !baseResult.domSnapshot || !targetResult.domSnapshot) {
        continue;
      }

      try {
        const domDiff = this.diffDOM(
          baseResult.domSnapshot,
          targetResult.domSnapshot,
          config.analysis.domIgnoreAttributes || []
        );

        if (domDiff.added.length > 0 || domDiff.removed.length > 0 || domDiff.modified.length > 0) {
          differences.push({
            type: DifferenceType.STRUCTURAL,
            category: DifferenceCategory.BREAKING,
            severity: this.getDOMSeverity(domDiff),
            description: `DOM structure changed: ${domDiff.added.length} added, ${domDiff.removed.length} removed, ${domDiff.modified.length} modified`,
            location: baseResult.testId,
            domDiff,
          });
        }
      } catch (error) {
        this.logger.warn('Failed to compare DOM', error as Error);
      }
    }

    return differences;
  }

  private diffDOM(baseHTML: string, targetHTML: string, ignoreAttrs: string[]): DOMDiff {
    const baseDOM = new JSDOM(baseHTML);
    const targetDOM = new JSDOM(targetHTML);

    const baseElements = this.extractElements(baseDOM.window.document.body, ignoreAttrs);
    const targetElements = this.extractElements(targetDOM.window.document.body, ignoreAttrs);

    const added = targetElements.filter(te =>
      !baseElements.some(be => this.elementsEqual(be, te))
    );

    const removed = baseElements.filter(be =>
      !targetElements.some(te => this.elementsEqual(be, te))
    );

    const modified = baseElements
      .map(be => {
        const te = targetElements.find(t => t.path === be.path);
        if (!te) return null;

        const changes = [];
        for (const [attr, baseValue] of Object.entries(be.attributes)) {
          if (te.attributes[attr] !== baseValue) {
            changes.push({
              path: be.path,
              attribute: attr,
              oldValue: baseValue,
              newValue: te.attributes[attr],
            });
          }
        }
        return changes;
      })
      .filter(Boolean)
      .flat() as any[];

    return { added, removed, modified };
  }

  private extractElements(element: Element, ignoreAttrs: string[], path: string = ''): any[] {
    const elements = [];
    const currentPath = path ? `${path}/${element.tagName}` : element.tagName;

    const attributes: Record<string, string> = {};
    for (const attr of element.attributes) {
      if (!ignoreAttrs.includes(attr.name)) {
        attributes[attr.name] = attr.value;
      }
    }

    elements.push({
      tagName: element.tagName,
      attributes,
      path: currentPath,
    });

    for (const child of element.children) {
      elements.push(...this.extractElements(child, ignoreAttrs, currentPath));
    }

    return elements;
  }

  private elementsEqual(a: any, b: any): boolean {
    return a.tagName === b.tagName &&
           a.path === b.path &&
           JSON.stringify(a.attributes) === JSON.stringify(b.attributes);
  }

  private comparePerformance(
    baseResults: any[],
    targetResults: any[],
    config: any
  ): Difference[] {
    const differences: Difference[] = [];

    const baseMetrics = this.aggregateMetrics(baseResults);
    const targetMetrics = this.aggregateMetrics(targetResults);

    if (!baseMetrics || !targetMetrics) return differences;

    const thresholds = config.analysis.performanceThresholds || {};

    // Compare FCP
    if (Math.abs(targetMetrics.fcp - baseMetrics.fcp) > (thresholds.fcp || 100)) {
      differences.push({
        type: DifferenceType.PERFORMANCE,
        category: DifferenceCategory.BREAKING,
        severity: targetMetrics.fcp > baseMetrics.fcp ? Severity.HIGH : Severity.INFO,
        description: `First Contentful Paint changed: ${baseMetrics.fcp}ms → ${targetMetrics.fcp}ms`,
        baseValue: baseMetrics.fcp,
        targetValue: targetMetrics.fcp,
      });
    }

    return differences;
  }

  private aggregateMetrics(results: any[]): any {
    const validResults = results.filter(r => r.metrics);
    if (validResults.length === 0) return null;

    const sum = validResults.reduce((acc, r) => ({
      fcp: acc.fcp + r.metrics.fcp,
      lcp: acc.lcp + r.metrics.lcp,
      tti: acc.tti + r.metrics.tti,
    }), { fcp: 0, lcp: 0, tti: 0 });

    return {
      fcp: sum.fcp / validResults.length,
      lcp: sum.lcp / validResults.length,
      tti: sum.tti / validResults.length,
    };
  }

  private calculateSeverity(differences: Difference[]): Severity {
    if (differences.some(d => d.severity === Severity.CRITICAL)) return Severity.CRITICAL;
    if (differences.some(d => d.severity === Severity.HIGH)) return Severity.HIGH;
    if (differences.some(d => d.severity === Severity.MEDIUM)) return Severity.MEDIUM;
    if (differences.some(d => d.severity === Severity.LOW)) return Severity.LOW;
    return Severity.INFO;
  }

  private getVisualSeverity(percentage: number): Severity {
    if (percentage > 50) return Severity.CRITICAL;
    if (percentage > 20) return Severity.HIGH;
    if (percentage > 5) return Severity.MEDIUM;
    if (percentage > 1) return Severity.LOW;
    return Severity.INFO;
  }

  private getDOMSeverity(domDiff: DOMDiff): Severity {
    const totalChanges = domDiff.added.length + domDiff.removed.length + domDiff.modified.length;
    if (totalChanges > 50) return Severity.HIGH;
    if (totalChanges > 20) return Severity.MEDIUM;
    if (totalChanges > 5) return Severity.LOW;
    return Severity.INFO;
  }
}

export default AnalysisAgent;
