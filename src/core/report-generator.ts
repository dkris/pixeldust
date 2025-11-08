import { DatabaseManager } from '../storage/database';
import { Session, Report, ReportSummary } from '../types';
import { marked } from 'marked';
import Handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';

/**
 * Report Generator - Creates comprehensive reports
 *
 * Supports multiple formats:
 * - Markdown
 * - HTML
 * - JSON
 */
export class ReportGenerator {
  constructor(private db: DatabaseManager) {}

  async generate(session: Session, format: string = 'markdown'): Promise<string> {
    const report = this.buildReport(session);

    switch (format) {
      case 'markdown':
        return this.generateMarkdown(report, session);
      case 'html':
        return this.generateHTML(report, session);
      case 'json':
        return this.generateJSON(report, session);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private buildReport(session: Session): Report {
    const comparisons = this.db.getComparisons(session.id);
    const remediations = this.db.getRemediations(session.id);

    const summary: ReportSummary = {
      totalVersions: session.versions.length,
      totalTests: 0, // Would be calculated from test results
      totalDifferences: comparisons.reduce((sum, c) => sum + c.differences.length, 0),
      criticalIssues: comparisons.reduce(
        (sum, c) => sum + c.differences.filter(d => d.severity === 'CRITICAL').length,
        0
      ),
      highIssues: comparisons.reduce(
        (sum, c) => sum + c.differences.filter(d => d.severity === 'HIGH').length,
        0
      ),
      mediumIssues: comparisons.reduce(
        (sum, c) => sum + c.differences.filter(d => d.severity === 'MEDIUM').length,
        0
      ),
      lowIssues: comparisons.reduce(
        (sum, c) => sum + c.differences.filter(d => d.severity === 'LOW').length,
        0
      ),
      approvedRemediations: remediations.filter(r => r.status === 'APPROVED').length,
      pendingRemediations: remediations.filter(r => r.status === 'PROPOSED').length,
    };

    return {
      sessionId: session.id,
      title: `PixelDust Report - ${session.config.framework.name}`,
      summary,
      comparisons,
      remediations,
      generatedAt: new Date(),
    };
  }

  private async generateMarkdown(report: Report, session: Session): Promise<string> {
    let md = `# ${report.title}\n\n`;
    md += `**Session ID:** ${report.sessionId}\n`;
    md += `**Generated:** ${report.generatedAt.toISOString()}\n\n`;

    // Summary
    md += `## Summary\n\n`;
    md += `- **Versions Tested:** ${report.summary.totalVersions}\n`;
    md += `- **Total Differences:** ${report.summary.totalDifferences}\n`;
    md += `- **Critical Issues:** ${report.summary.criticalIssues}\n`;
    md += `- **High Issues:** ${report.summary.highIssues}\n`;
    md += `- **Medium Issues:** ${report.summary.mediumIssues}\n`;
    md += `- **Low Issues:** ${report.summary.lowIssues}\n`;
    md += `- **Approved Remediations:** ${report.summary.approvedRemediations}\n`;
    md += `- **Pending Remediations:** ${report.summary.pendingRemediations}\n\n`;

    // Comparisons
    md += `## Version Comparisons\n\n`;
    for (const comparison of report.comparisons) {
      md += `### ${comparison.baseVersion} → ${comparison.targetVersion}\n\n`;
      md += `**Severity:** ${comparison.severity}\n`;
      md += `**Differences:** ${comparison.differences.length}\n\n`;

      if (comparison.differences.length > 0) {
        md += `#### Detected Differences\n\n`;
        for (const diff of comparison.differences) {
          md += `- **[${diff.severity}]** ${diff.type}: ${diff.description}\n`;
          if (diff.location) {
            md += `  - Location: ${diff.location}\n`;
          }
        }
        md += `\n`;
      }
    }

    // Remediations
    md += `## Remediation Proposals\n\n`;
    for (const remediation of report.remediations) {
      md += `### ${remediation.proposal.title}\n\n`;
      md += `**Status:** ${remediation.status}\n`;
      md += `**ID:** ${remediation.id}\n\n`;
      md += `${remediation.proposal.description}\n\n`;

      md += `**Root Cause:**\n${remediation.proposal.rootCause}\n\n`;

      md += `**Recommended Solution:** ${remediation.proposal.recommendedSolution}\n\n`;

      md += `**Impact:**\n`;
      md += `- Breaking Changes: ${remediation.proposal.estimatedImpact.breakingChanges}\n`;
      md += `- Migration Complexity: ${remediation.proposal.estimatedImpact.migrationComplexity}\n`;
      md += `- Estimated Effort: ${remediation.proposal.estimatedImpact.estimatedEffort}\n\n`;
    }

    // Save to file
    const reportDir = path.join(process.cwd(), session.config.reporting.outputPath);
    await fs.mkdir(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, `report-${session.id}.md`);
    await fs.writeFile(reportPath, md);

    return reportPath;
  }

  private async generateHTML(report: Report, session: Session): Promise<string> {
    const md = await this.generateMarkdown(report, session);
    const markdown = await fs.readFile(md, 'utf-8');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${report.title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
    }
    h1, h2, h3 { color: #333; }
    .summary { background: #f5f5f5; padding: 1rem; border-radius: 8px; }
    .critical { color: #d32f2f; font-weight: bold; }
    .high { color: #f57c00; font-weight: bold; }
    .medium { color: #fbc02d; font-weight: bold; }
    .low { color: #388e3c; font-weight: bold; }
  </style>
</head>
<body>
  ${marked(markdown)}
</body>
</html>
    `;

    const reportDir = path.join(process.cwd(), session.config.reporting.outputPath);
    const reportPath = path.join(reportDir, `report-${session.id}.html`);
    await fs.writeFile(reportPath, html);

    return reportPath;
  }

  private async generateJSON(report: Report, session: Session): Promise<string> {
    const reportDir = path.join(process.cwd(), session.config.reporting.outputPath);
    await fs.mkdir(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, `report-${session.id}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return reportPath;
  }
}

export default ReportGenerator;
