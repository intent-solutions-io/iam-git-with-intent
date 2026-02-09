/**
 * IaC Export Layer
 *
 * Auto-generate infrastructure code from sandbox diffs.
 * Converts file system changes to declarative IaC configurations.
 */

export { IaCExporter, type ExportOptions, type ExportResult } from './base.js';
export { TerraformExporter } from './terraform.js';
