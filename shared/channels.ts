// IPC Channel name constants - single source of truth

export const CHANNELS = {
  // Suppliers
  SUPPLIERS_LIST: 'suppliers:list',
  SUPPLIERS_GET: 'suppliers:get',
  SUPPLIERS_CREATE: 'suppliers:create',
  SUPPLIERS_UPDATE: 'suppliers:update',
  SUPPLIERS_DELETE: 'suppliers:delete',

  // Projects
  PROJECTS_LIST: 'projects:list',
  PROJECTS_GET: 'projects:get',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_UPDATE: 'projects:update',
  PROJECTS_DELETE: 'projects:delete',

  // Project Milestones
  MILESTONES_LIST: 'milestones:list',
  MILESTONES_CREATE: 'milestones:create',
  MILESTONES_UPDATE: 'milestones:update',
  MILESTONES_DELETE: 'milestones:delete',

  // Activity Templates
  ACTIVITY_TEMPLATES_LIST: 'activity-templates:list',
  ACTIVITY_TEMPLATES_GET: 'activity-templates:get',
  ACTIVITY_TEMPLATES_CREATE: 'activity-templates:create',
  ACTIVITY_TEMPLATES_UPDATE: 'activity-templates:update',
  ACTIVITY_TEMPLATES_DELETE: 'activity-templates:delete',
  ACTIVITY_TEMPLATES_DUPLICATE: 'activity-templates:duplicate',

  // Template Schedule Items
  TEMPLATE_SCHEDULE_ITEMS_LIST: 'template-schedule-items:list',
  TEMPLATE_SCHEDULE_ITEMS_GET: 'template-schedule-items:get',
  TEMPLATE_SCHEDULE_ITEMS_CREATE: 'template-schedule-items:create',
  TEMPLATE_SCHEDULE_ITEMS_UPDATE: 'template-schedule-items:update',
  TEMPLATE_SCHEDULE_ITEMS_DELETE: 'template-schedule-items:delete',
  TEMPLATE_SCHEDULE_ITEMS_REORDER: 'template-schedule-items:reorder',

  // Applicability Rules
  APPLICABILITY_RULES_GET: 'applicability-rules:get',
  APPLICABILITY_RULES_CREATE: 'applicability-rules:create',
  APPLICABILITY_RULES_UPDATE: 'applicability-rules:update',
  APPLICABILITY_RULES_DELETE: 'applicability-rules:delete',

  // Applicability Clauses
  APPLICABILITY_CLAUSES_LIST: 'applicability-clauses:list',
  APPLICABILITY_CLAUSES_CREATE: 'applicability-clauses:create',
  APPLICABILITY_CLAUSES_UPDATE: 'applicability-clauses:update',
  APPLICABILITY_CLAUSES_DELETE: 'applicability-clauses:delete',

  // Project Activities
  PROJECT_ACTIVITIES_LIST: 'project-activities:list',
  PROJECT_ACTIVITIES_ADD: 'project-activities:add',
  PROJECT_ACTIVITIES_REMOVE: 'project-activities:remove',

  // Supplier Instances
  SUPPLIER_INSTANCES_APPLY_PROJECT: 'supplier-instances:apply-project',
  SUPPLIER_INSTANCES_REMOVE_PROJECT: 'supplier-instances:remove-project',
  SUPPLIER_INSTANCES_GET_GRID: 'supplier-instances:get-grid',
  SUPPLIER_INSTANCES_UPDATE_STATUS: 'supplier-instances:update-status',
  SUPPLIER_INSTANCES_BATCH_UPDATE_STATUS: 'supplier-instances:batch-update-status',
  SUPPLIER_INSTANCES_UPDATE_NOTES: 'supplier-instances:update-notes',
  SUPPLIER_INSTANCES_TOGGLE_OVERRIDE: 'supplier-instances:toggle-override',
  SUPPLIER_INSTANCES_TOGGLE_LOCK: 'supplier-instances:toggle-lock',
  SUPPLIER_INSTANCES_TOGGLE_SCOPE: 'supplier-instances:toggle-scope',
  SUPPLIER_INSTANCES_TOGGLE_APPLICABILITY: 'supplier-instances:toggle-applicability',
  SUPPLIER_INSTANCES_GET_SUPPLIER_PROJECT: 'supplier-instances:get-supplier-project',
  SUPPLIER_INSTANCES_LIST_SUPPLIER_PROJECTS: 'supplier-instances:list-supplier-projects',

  // Propagation
  PROPAGATION_PREVIEW: 'propagation:preview',
  PROPAGATION_APPLY: 'propagation:apply',

  // Import/Export
  IMPORT_EXPORT_EXPORT: 'import-export:export',
  IMPORT_EXPORT_IMPORT: 'import-export:import',
  IMPORT_EXPORT_WIPE: 'import-export:wipe',
  IMPORT_EXPORT_BACKUP: 'import-export:backup',

  // Dashboard
  DASHBOARD_STATS: 'dashboard:stats',
  DASHBOARD_OVERDUE: 'dashboard:overdue',

  // Settings
  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
} as const;
