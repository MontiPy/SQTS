import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne, run, withTransaction } from '../database';
import { autoBackup } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import type {
  Supplier,
  Project,
  ProjectMilestone,
  ActivityTemplate,
  ActivityTemplateScheduleItem,
} from '@shared/types';

// Zod schemas
const exportDatabaseSchema = z.object({
  includeSuppliers: z.boolean().optional(),
  includeProjects: z.boolean().optional(),
  includeTemplates: z.boolean().optional(),
  includeInstances: z.boolean().optional(),
});

const importDatabaseSchema = z.object({
  data: z.object({
    suppliers: z.array(z.any()).optional(),
    projects: z.array(z.any()).optional(),
    activityTemplates: z.array(z.any()).optional(),
    // Add other entities as needed
  }),
  mode: z.enum(['MERGE', 'REPLACE']).optional(), // MERGE = add/update, REPLACE = wipe and import
});

export function registerImportExportHandlers() {
  // Export database as JSON
  ipcMain.handle('import-export:export', async (_, params: unknown) => {
    try {
      const validated = params ? exportDatabaseSchema.parse(params) : {
        includeSuppliers: true,
        includeProjects: true,
        includeTemplates: true,
        includeInstances: true,
      };

      const exportData: any = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
      };

      if (validated.includeSuppliers !== false) {
        exportData.suppliers = query<Supplier>('SELECT * FROM suppliers ORDER BY id');
      }

      if (validated.includeProjects !== false) {
        const projects = query<Project>('SELECT * FROM projects ORDER BY id');
        exportData.projects = projects;

        // Export milestones
        exportData.projectMilestones = query<ProjectMilestone>(
          'SELECT * FROM project_milestones ORDER BY project_id, sort_order'
        );

        // Export project activities
        exportData.projectActivities = query(
          'SELECT * FROM project_activities ORDER BY project_id, sort_order'
        );

        // Export project schedule items
        exportData.projectScheduleItems = query(
          'SELECT * FROM project_schedule_items ORDER BY project_activity_id, sort_order'
        );
      }

      if (validated.includeTemplates !== false) {
        exportData.activityTemplates = query<ActivityTemplate>(
          'SELECT * FROM activity_templates ORDER BY id'
        );
        exportData.activityTemplateScheduleItems = query<ActivityTemplateScheduleItem>(
          'SELECT * FROM activity_template_schedule_items ORDER BY activity_template_id, sort_order'
        );

        // Export applicability rules
        exportData.applicabilityRules = query(
          'SELECT * FROM activity_template_applicability_rules ORDER BY id'
        );
        exportData.applicabilityClauses = query(
          'SELECT * FROM activity_template_applicability_clauses ORDER BY rule_id, id'
        );
      }

      if (validated.includeInstances !== false) {
        // Export supplier projects and instances
        exportData.supplierProjects = query('SELECT * FROM supplier_projects ORDER BY id');
        exportData.supplierActivityInstances = query('SELECT * FROM supplier_activity_instances ORDER BY id');
        exportData.supplierScheduleItemInstances = query('SELECT * FROM supplier_schedule_item_instances ORDER BY id');
      }

      // Export settings
      exportData.settings = query('SELECT * FROM settings ORDER BY key');

      createAuditEvent('import_export', null, 'export', {
        includeSuppliers: validated.includeSuppliers,
        includeProjects: validated.includeProjects,
        includeTemplates: validated.includeTemplates,
        includeInstances: validated.includeInstances,
      });

      return createSuccessResponse(exportData);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Import database from JSON
  ipcMain.handle('import-export:import', async (_, params: unknown) => {
    try {
      const validated = importDatabaseSchema.parse(params);

      // Create backup before import
      autoBackup();

      return await withTransaction(async () => {
        let importedCount = 0;
        const errors: string[] = [];

        // Import suppliers
        if (validated.data.suppliers && validated.data.suppliers.length > 0) {
          for (const supplier of validated.data.suppliers) {
            try {
              // Check if exists by name
              const existing = queryOne<{ id: number }>(
                'SELECT id FROM suppliers WHERE name = ?',
                [supplier.name]
              );

              if (existing) {
                // Update existing
                run(
                  `UPDATE suppliers SET notes = ?, nmr_rank = ?, contact_name = ?, contact_email = ?, contact_phone = ?
                   WHERE id = ?`,
                  [
                    supplier.notes,
                    supplier.nmrRank,
                    supplier.contactName,
                    supplier.contactEmail,
                    supplier.contactPhone,
                    existing.id,
                  ]
                );
              } else {
                // Insert new
                run(
                  `INSERT INTO suppliers (name, notes, nmr_rank, contact_name, contact_email, contact_phone)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [
                    supplier.name,
                    supplier.notes,
                    supplier.nmrRank,
                    supplier.contactName,
                    supplier.contactEmail,
                    supplier.contactPhone,
                  ]
                );
              }
              importedCount++;
            } catch (error: any) {
              errors.push(`Supplier ${supplier.name}: ${error.message}`);
            }
          }
        }

        // Import projects
        if (validated.data.projects && validated.data.projects.length > 0) {
          for (const project of validated.data.projects) {
            try {
              const existing = queryOne<{ id: number }>(
                'SELECT id FROM projects WHERE name = ? AND version = ?',
                [project.name, project.version]
              );

              if (existing) {
                run(
                  `UPDATE projects SET default_anchor_rule = ?, updated_at = datetime('now') WHERE id = ?`,
                  [project.defaultAnchorRule, existing.id]
                );
              } else {
                run(
                  `INSERT INTO projects (name, version, default_anchor_rule)
                   VALUES (?, ?, ?)`,
                  [project.name, project.version, project.defaultAnchorRule]
                );
              }
              importedCount++;
            } catch (error: any) {
              errors.push(`Project ${project.name}: ${error.message}`);
            }
          }
        }

        // Import activity templates
        if (validated.data.activityTemplates && validated.data.activityTemplates.length > 0) {
          for (const template of validated.data.activityTemplates) {
            try {
              const existing = queryOne<{ id: number }>(
                'SELECT id FROM activity_templates WHERE name = ?',
                [template.name]
              );

              if (existing) {
                run(
                  `UPDATE activity_templates SET description = ?, category = ?, version = ?, updated_at = datetime('now')
                   WHERE id = ?`,
                  [template.description, template.category, template.version, existing.id]
                );
              } else {
                run(
                  `INSERT INTO activity_templates (name, description, category, version)
                   VALUES (?, ?, ?, ?)`,
                  [template.name, template.description, template.category, template.version || 1]
                );
              }
              importedCount++;
            } catch (error: any) {
              errors.push(`Template ${template.name}: ${error.message}`);
            }
          }
        }

        createAuditEvent('import_export', null, 'import', {
          importedCount,
          errorCount: errors.length,
        });

        return createSuccessResponse({
          imported: importedCount,
          errors,
        });
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Wipe database (destructive - requires confirmation)
  ipcMain.handle('import-export:wipe', async () => {
    try {
      // Create backup before wipe
      autoBackup();

      return await withTransaction(async () => {
        // Delete all data in reverse dependency order
        const tables = [
          'supplier_schedule_item_instances',
          'supplier_activity_instances',
          'supplier_projects',
          'activity_template_applicability_clauses',
          'activity_template_applicability_rules',
          'activity_template_schedule_items',
          'project_schedule_items',
          'project_activities',
          'project_milestones',
          'activity_templates',
          'projects',
          'suppliers',
        ];

        for (const table of tables) {
          run(`DELETE FROM ${table}`);
        }

        createAuditEvent('import_export', null, 'wipe_database', {});

        return createSuccessResponse({ message: 'Database wiped successfully' });
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Manual backup
  ipcMain.handle('import-export:backup', async () => {
    try {
      autoBackup();
      createAuditEvent('import_export', null, 'manual_backup', {});
      return createSuccessResponse({ message: 'Backup created successfully' });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });
}
