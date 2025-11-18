import { WorkflowDiscoveryResult, Workflow, Page, ComponentUsageSummary } from '../types';
import fs from 'fs/promises';
import path from 'path';

/**
 * Workflow Reporter - Generates comprehensive workflow documentation
 *
 * Produces human-readable documentation from workflow discovery results
 * Supports multiple output formats (Markdown, JSON, HTML)
 */
export class WorkflowReporter {
  /**
   * Generate comprehensive workflow documentation
   */
  async generateReport(
    result: WorkflowDiscoveryResult,
    outputPath: string,
    format: 'markdown' | 'json' | 'html' = 'markdown'
  ): Promise<string> {
    switch (format) {
      case 'markdown':
        return this.generateMarkdownReport(result, outputPath);
      case 'json':
        return this.generateJsonReport(result, outputPath);
      case 'html':
        return this.generateHtmlReport(result, outputPath);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Generate Markdown documentation
   */
  private async generateMarkdownReport(
    result: WorkflowDiscoveryResult,
    outputPath: string
  ): Promise<string> {
    const lines: string[] = [];

    // Header
    lines.push('# Application Workflow Documentation');
    lines.push('');
    lines.push(`**Generated**: ${result.discoveredAt.toISOString()}`);
    lines.push(`**Application**: ${result.applicationUrl}`);
    lines.push(`**Driver**: ${result.driver}`);
    lines.push(`**Pages Discovered**: ${result.pages.length}`);
    lines.push(`**Workflows Identified**: ${result.workflows.length}`);
    lines.push(`**Components Found**: ${result.componentUsage.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Table of Contents
    lines.push('## Table of Contents');
    lines.push('');
    lines.push('1. [Executive Summary](#executive-summary)');
    lines.push('2. [Application Structure](#application-structure)');
    lines.push('3. [Discovered Pages](#discovered-pages)');
    lines.push('4. [User Workflows](#user-workflows)');
    lines.push('5. [Component Usage](#component-usage)');
    lines.push('6. [Workflow Diagrams](#workflow-diagrams)');
    lines.push('');
    lines.push('---');
    lines.push('');

    // Executive Summary
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(this.generateExecutiveSummary(result));
    lines.push('');

    // Application Structure
    lines.push('## Application Structure');
    lines.push('');
    lines.push(this.generateApplicationStructure(result));
    lines.push('');

    // Discovered Pages
    lines.push('## Discovered Pages');
    lines.push('');
    for (const page of result.pages) {
      lines.push(this.generatePageSection(page));
      lines.push('');
    }

    // User Workflows
    lines.push('## User Workflows');
    lines.push('');
    lines.push(this.generateWorkflowsOverview(result.workflows));
    lines.push('');

    for (const workflow of result.workflows) {
      lines.push(this.generateWorkflowSection(workflow));
      lines.push('');
    }

    // Component Usage
    lines.push('## Component Usage');
    lines.push('');
    lines.push(this.generateComponentUsageSection(result.componentUsage));
    lines.push('');

    // Workflow Diagrams
    lines.push('## Workflow Diagrams');
    lines.push('');
    lines.push(this.generateWorkflowDiagrams(result));
    lines.push('');

    const content = lines.join('\n');
    await fs.writeFile(outputPath, content, 'utf-8');
    return outputPath;
  }

  private generateExecutiveSummary(result: WorkflowDiscoveryResult): string {
    const lines: string[] = [];

    lines.push('This document provides a comprehensive overview of the application workflow,');
    lines.push('automatically discovered by analyzing the running application.');
    lines.push('');

    // Statistics
    lines.push('### Key Metrics');
    lines.push('');
    lines.push('| Metric | Count |');
    lines.push('|--------|-------|');
    lines.push(`| Total Pages | ${result.pages.length} |`);
    lines.push(`| User Workflows | ${result.workflows.length} |`);
    lines.push(`| Unique Components | ${result.componentUsage.length} |`);
    lines.push(`| Total Component Instances | ${result.componentUsage.reduce((sum, c) => sum + c.totalInstances, 0)} |`);
    lines.push(
      `| Interactive Elements | ${result.pages.reduce((sum, p) => sum + p.interactiveElements.length, 0)} |`
    );
    lines.push(
      `| High Priority Workflows | ${result.workflows.filter((w) => w.priority === 'high').length} |`
    );
    lines.push('');

    // Workflow Priority Breakdown
    const priorityCount = {
      high: result.workflows.filter((w) => w.priority === 'high').length,
      medium: result.workflows.filter((w) => w.priority === 'medium').length,
      low: result.workflows.filter((w) => w.priority === 'low').length,
    };

    lines.push('### Workflow Priority Distribution');
    lines.push('');
    lines.push('```');
    lines.push(`High Priority:   ${priorityCount.high} (${Math.round((priorityCount.high / result.workflows.length) * 100)}%)`);
    lines.push(`Medium Priority: ${priorityCount.medium} (${Math.round((priorityCount.medium / result.workflows.length) * 100)}%)`);
    lines.push(`Low Priority:    ${priorityCount.low} (${Math.round((priorityCount.low / result.workflows.length) * 100)}%)`);
    lines.push('```');

    return lines.join('\n');
  }

  private generateApplicationStructure(result: WorkflowDiscoveryResult): string {
    const lines: string[] = [];

    lines.push('### Site Map');
    lines.push('');
    lines.push('```');
    lines.push(`Application Root: ${result.applicationUrl}`);

    // Build tree structure
    const tree = this.buildPageTree(result.pages);
    lines.push(tree);

    lines.push('```');
    lines.push('');

    lines.push('### Navigation Graph');
    lines.push('');
    lines.push('```mermaid');
    lines.push('graph LR');

    // Generate navigation graph
    for (const page of result.pages) {
      const pageId = this.sanitizeId(page.url);
      const pageLabel = page.title || page.url;

      for (const link of page.links) {
        const linkId = this.sanitizeId(link);
        const targetPage = result.pages.find((p) => p.url === link);
        const linkLabel = targetPage?.title || link;

        lines.push(`    ${pageId}["${pageLabel}"] --> ${linkId}["${linkLabel}"]`);
      }
    }

    lines.push('```');

    return lines.join('\n');
  }

  private buildPageTree(pages: Page[]): string {
    const lines: string[] = [];
    const processed = new Set<string>();

    // Start with root pages
    const rootPages = pages.filter((p) => p.url === '/' || p.url.split('/').length <= 2);

    for (const page of rootPages) {
      if (!processed.has(page.url)) {
        lines.push(this.buildPageTreeNode(page, pages, processed, 1));
      }
    }

    return lines.join('\n');
  }

  private buildPageTreeNode(page: Page, allPages: Page[], processed: Set<string>, depth: number): string {
    const indent = '  '.repeat(depth);
    const lines: string[] = [];

    const title = page.title || page.url;
    const components = page.components.length;
    const interactions = page.interactiveElements.length;

    lines.push(`${indent}├─ ${title} (${page.url})`);
    lines.push(`${indent}│  Components: ${components}, Interactions: ${interactions}`);

    processed.add(page.url);

    // Add linked pages
    for (const link of page.links.slice(0, 3)) {
      // Limit depth
      if (!processed.has(link)) {
        const linkedPage = allPages.find((p) => p.url === link);
        if (linkedPage && depth < 3) {
          lines.push(this.buildPageTreeNode(linkedPage, allPages, processed, depth + 1));
        }
      }
    }

    return lines.join('\n');
  }

  private generatePageSection(page: Page): string {
    const lines: string[] = [];

    lines.push(`### ${page.title || 'Untitled Page'}`);
    lines.push('');
    lines.push(`**URL**: \`${page.url}\``);
    lines.push(`**Discovered**: ${page.discoveredAt.toISOString()}`);
    lines.push('');

    // Components
    if (page.components.length > 0) {
      lines.push('#### Components on This Page');
      lines.push('');
      lines.push('| Component | Instances | Visible | Selectors |');
      lines.push('|-----------|-----------|---------|-----------|');

      for (const comp of page.components) {
        const selectors = comp.selectors.slice(0, 2).join(', ');
        const more = comp.selectors.length > 2 ? ` (+${comp.selectors.length - 2} more)` : '';
        lines.push(
          `| \`${comp.tag}\` | ${comp.count} | ${comp.visible ? '✅' : '❌'} | ${selectors}${more} |`
        );
      }

      lines.push('');
    }

    // Interactive Elements
    if (page.interactiveElements.length > 0) {
      lines.push('#### Interactive Elements');
      lines.push('');
      lines.push('| Type | Selector | Description |');
      lines.push('|------|----------|-------------|');

      for (const el of page.interactiveElements.slice(0, 10)) {
        // Limit to 10
        const desc = el.text || el.href || el.action || '-';
        lines.push(`| ${el.type} | \`${el.selector}\` | ${desc.substring(0, 50)} |`);
      }

      if (page.interactiveElements.length > 10) {
        lines.push(`| ... | ... | *+${page.interactiveElements.length - 10} more elements* |`);
      }

      lines.push('');
    }

    // Navigation Links
    if (page.links.length > 0) {
      lines.push('#### Navigation Links');
      lines.push('');
      lines.push('```');
      for (const link of page.links) {
        lines.push(`→ ${link}`);
      }
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  private generateWorkflowsOverview(workflows: Workflow[]): string {
    const lines: string[] = [];

    lines.push('### Overview');
    lines.push('');
    lines.push('| # | Workflow Name | Priority | Steps | Components |');
    lines.push('|---|---------------|----------|-------|------------|');

    workflows.forEach((workflow, idx) => {
      const priority = workflow.priority.toUpperCase();
      const priorityEmoji =
        workflow.priority === 'high' ? '🔴' : workflow.priority === 'medium' ? '🟡' : '🟢';

      lines.push(
        `| ${idx + 1} | ${workflow.name} | ${priorityEmoji} ${priority} | ${workflow.steps.length} | ${workflow.components.length} |`
      );
    });

    lines.push('');

    return lines.join('\n');
  }

  private generateWorkflowSection(workflow: Workflow): string {
    const lines: string[] = [];

    const priorityEmoji =
      workflow.priority === 'high' ? '🔴' : workflow.priority === 'medium' ? '🟡' : '🟢';

    lines.push(`### ${priorityEmoji} ${workflow.name}`);
    lines.push('');
    lines.push(`**ID**: \`${workflow.id}\``);
    lines.push(`**Priority**: ${workflow.priority.toUpperCase()}`);
    lines.push(`**Starting Page**: ${workflow.startPage}`);
    lines.push(`**Components**: ${workflow.components.join(', ')}`);
    if (workflow.estimatedDuration) {
      lines.push(`**Estimated Duration**: ${workflow.estimatedDuration}s`);
    }
    if (workflow.tags && workflow.tags.length > 0) {
      lines.push(`**Tags**: ${workflow.tags.join(', ')}`);
    }
    lines.push('');

    // Preconditions (Phase 3)
    if (workflow.preconditions && workflow.preconditions.length > 0) {
      lines.push('#### Prerequisites');
      lines.push('');
      for (const pre of workflow.preconditions) {
        const required = pre.required ? '**Required**' : '*Optional*';
        lines.push(`- ${required} (${pre.type}): ${pre.description}`);
      }
      lines.push('');
    }

    // Steps
    lines.push('#### Workflow Steps');
    lines.push('');

    for (const step of workflow.steps) {
      lines.push(`**Step ${step.order}**: ${step.action?.description || 'Navigate'}`);
      lines.push('');
      lines.push(`- **Page**: \`${step.page}\``);

      if (step.action) {
        lines.push(`- **Action**: ${step.action.type}`);
        if (step.action.selector) {
          lines.push(`  - Selector: \`${step.action.selector}\``);
        }
        if (step.action.value) {
          lines.push(`  - Value: \`${step.action.value}\``);
        }
      }

      if (step.expectedOutcome) {
        lines.push(`- **Expected Outcome**: ${step.expectedOutcome}`);
      }

      // Phase 3: Data dependencies
      if (step.requiredData && step.requiredData.length > 0) {
        lines.push(`- **Required Data**: ${step.requiredData.join(', ')}`);
      }
      if (step.producedData && step.producedData.length > 0) {
        lines.push(`- **Produces Data**: ${step.producedData.join(', ')}`);
      }

      lines.push('');
    }

    // Postconditions (Phase 3)
    if (workflow.postconditions && workflow.postconditions.length > 0) {
      lines.push('#### Expected Outcomes');
      lines.push('');
      for (const post of workflow.postconditions) {
        lines.push(`- (${post.type}): ${post.description}`);
      }
      lines.push('');
    }

    // Data Flow (Phase 3)
    if (workflow.dataFlow && workflow.dataFlow.length > 0) {
      lines.push('#### Data Flow');
      lines.push('');
      lines.push('```mermaid');
      lines.push('graph LR');

      for (const flow of workflow.dataFlow) {
        lines.push(`    Step${flow.sourceStep}[Step ${flow.sourceStep}] -->|${flow.dataKey}| Step${flow.targetStep}[Step ${flow.targetStep}]`);
      }

      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  private generateComponentUsageSection(componentUsage: ComponentUsageSummary[]): string {
    const lines: string[] = [];

    lines.push('### Component Usage Summary');
    lines.push('');
    lines.push('| Component | Pages | Total Instances | Usage Pattern |');
    lines.push('|-----------|-------|-----------------|---------------|');

    // Sort by total instances descending
    const sorted = [...componentUsage].sort((a, b) => b.totalInstances - a.totalInstances);

    for (const comp of sorted) {
      const patterns = comp.patterns.length > 0 ? comp.patterns.join(', ') : 'general';
      lines.push(`| \`${comp.tag}\` | ${comp.pageCount} | ${comp.totalInstances} | ${patterns} |`);
    }

    lines.push('');

    // Detailed breakdown
    lines.push('### Component Details');
    lines.push('');

    for (const comp of sorted) {
      lines.push(`#### \`${comp.tag}\``);
      lines.push('');
      lines.push(`- **Used on ${comp.pageCount} page(s)**`);
      lines.push(`- **Total instances**: ${comp.totalInstances}`);
      lines.push(`- **Average per page**: ${Math.round((comp.totalInstances / comp.pageCount) * 10) / 10}`);

      if (comp.patterns.length > 0) {
        lines.push(`- **Common patterns**: ${comp.patterns.join(', ')}`);
      }

      lines.push('');
      lines.push('**Pages**:');
      for (const page of comp.pages) {
        lines.push(`- ${page}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private generateWorkflowDiagrams(result: WorkflowDiscoveryResult): string {
    const lines: string[] = [];

    lines.push('### Workflow Visualizations');
    lines.push('');

    for (const workflow of result.workflows) {
      lines.push(`#### ${workflow.name}`);
      lines.push('');
      lines.push('```mermaid');
      lines.push('graph TD');

      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        const nextStep = workflow.steps[i + 1];

        const stepId = `S${step.order}`;
        const stepLabel = step.action?.description || 'Navigate';

        lines.push(`    ${stepId}["${stepLabel}"]`);

        if (nextStep) {
          const nextId = `S${nextStep.order}`;
          lines.push(`    ${stepId} --> ${nextId}`);
        }
      }

      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate JSON report
   */
  private async generateJsonReport(
    result: WorkflowDiscoveryResult,
    outputPath: string
  ): Promise<string> {
    const content = JSON.stringify(result, null, 2);
    await fs.writeFile(outputPath, content, 'utf-8');
    return outputPath;
  }

  /**
   * Generate HTML report
   */
  private async generateHtmlReport(
    result: WorkflowDiscoveryResult,
    outputPath: string
  ): Promise<string> {
    // Convert markdown to HTML
    const mdPath = outputPath.replace('.html', '.md');
    await this.generateMarkdownReport(result, mdPath);

    const mdContent = await fs.readFile(mdPath, 'utf-8');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workflow Documentation</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1, h2, h3, h4 { color: #2c3e50; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background: #f8f9fa; font-weight: 600; }
    tr:hover { background: #f8f9fa; }
    .toc { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .workflow-priority-high { color: #dc3545; }
    .workflow-priority-medium { color: #ffc107; }
    .workflow-priority-low { color: #28a745; }
  </style>
</head>
<body>
  <div id="content">
    ${this.convertMarkdownToHtml(mdContent)}
  </div>
</body>
</html>
`;

    await fs.writeFile(outputPath, html, 'utf-8');
    return outputPath;
  }

  private convertMarkdownToHtml(markdown: string): string {
    // Basic markdown to HTML conversion
    return markdown
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$2</h2>')
      .replace(/^### (.*$)/gim, '<h3>$3</h3>')
      .replace(/^#### (.*$)/gim, '<h4>$4</h4>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');
  }

  private sanitizeId(url: string): string {
    return url
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
}
