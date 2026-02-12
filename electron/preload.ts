import { contextBridge, ipcRenderer } from 'electron';

// Preload API surface - exposes window.sqts
const api = {
  // Suppliers
  suppliers: {
    list: (params?: any) => ipcRenderer.invoke('suppliers:list', params),
    get: (id: number) => ipcRenderer.invoke('suppliers:get', id),
    create: (params: any) => ipcRenderer.invoke('suppliers:create', params),
    update: (id: number, params: any) => ipcRenderer.invoke('suppliers:update', id, params),
    delete: (id: number) => ipcRenderer.invoke('suppliers:delete', id),
  },

  // Projects
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    get: (id: number) => ipcRenderer.invoke('projects:get', id),
    create: (params: any) => ipcRenderer.invoke('projects:create', params),
    update: (id: number, params: any) => ipcRenderer.invoke('projects:update', id, params),
    delete: (id: number) => ipcRenderer.invoke('projects:delete', id),
  },

  // Project Milestones
  milestones: {
    list: (projectId: number) => ipcRenderer.invoke('milestones:list', projectId),
    create: (params: any) => ipcRenderer.invoke('milestones:create', params),
    update: (id: number, params: any) => ipcRenderer.invoke('milestones:update', id, params),
    delete: (id: number) => ipcRenderer.invoke('milestones:delete', id),
  },

  // Activity Templates
  activityTemplates: {
    list: () => ipcRenderer.invoke('activity-templates:list'),
    get: (id: number) => ipcRenderer.invoke('activity-templates:get', id),
    create: (params: any) => ipcRenderer.invoke('activity-templates:create', params),
    update: (id: number, params: any) => ipcRenderer.invoke('activity-templates:update', id, params),
    delete: (id: number) => ipcRenderer.invoke('activity-templates:delete', id),
    duplicate: (id: number, newName: string) => ipcRenderer.invoke('activity-templates:duplicate', id, newName),
  },

  // Template Schedule Items
  templateScheduleItems: {
    list: (templateId: number) => ipcRenderer.invoke('template-schedule-items:list', templateId),
    get: (id: number) => ipcRenderer.invoke('template-schedule-items:get', id),
    create: (params: any) => ipcRenderer.invoke('template-schedule-items:create', params),
    update: (id: number, params: any) => ipcRenderer.invoke('template-schedule-items:update', id, params),
    delete: (id: number) => ipcRenderer.invoke('template-schedule-items:delete', id),
    reorder: (items: Array<{ id: number; sortOrder: number }>) => ipcRenderer.invoke('template-schedule-items:reorder', items),
  },

  // Template Versions
  templateVersions: {
    list: (templateId: number) => ipcRenderer.invoke('template-versions:list', templateId),
    get: (id: number) => ipcRenderer.invoke('template-versions:get', id),
    save: (params: { activityTemplateId: number; name: string; description?: string }) => ipcRenderer.invoke('template-versions:save', params),
    restore: (id: number) => ipcRenderer.invoke('template-versions:restore', id),
    delete: (id: number) => ipcRenderer.invoke('template-versions:delete', id),
  },

  // Applicability Rules
  applicabilityRules: {
    get: (templateId: number) => ipcRenderer.invoke('applicability-rules:get', templateId),
    create: (params: any) => ipcRenderer.invoke('applicability-rules:create', params),
    update: (id: number, params: any) => ipcRenderer.invoke('applicability-rules:update', id, params),
    delete: (id: number) => ipcRenderer.invoke('applicability-rules:delete', id),
  },

  // Applicability Clauses
  applicabilityClauses: {
    list: (ruleId: number) => ipcRenderer.invoke('applicability-clauses:list', ruleId),
    create: (params: any) => ipcRenderer.invoke('applicability-clauses:create', params),
    update: (id: number, params: any) => ipcRenderer.invoke('applicability-clauses:update', id, params),
    delete: (id: number) => ipcRenderer.invoke('applicability-clauses:delete', id),
  },

  // Project Activities
  projectActivities: {
    list: (projectId: number) => ipcRenderer.invoke('project-activities:list', projectId),
    add: (params: any) => ipcRenderer.invoke('project-activities:add', params),
    remove: (projectActivityId: number) => ipcRenderer.invoke('project-activities:remove', projectActivityId),
  },

  // Supplier Instances
  supplierInstances: {
    applyProject: (params: any) => ipcRenderer.invoke('supplier-instances:apply-project', params),
    removeProject: (projectId: number, supplierId: number) => ipcRenderer.invoke('supplier-instances:remove-project', projectId, supplierId),
    getGrid: (projectId: number, activityId?: number) => ipcRenderer.invoke('supplier-instances:get-grid', projectId, activityId),
    updateStatus: (params: any) => ipcRenderer.invoke('supplier-instances:update-status', params),
    batchUpdateStatus: (params: any) => ipcRenderer.invoke('supplier-instances:batch-update-status', params),
    updateNotes: (params: any) => ipcRenderer.invoke('supplier-instances:update-notes', params),
    toggleOverride: (instanceId: number, enabled: boolean, date?: string | null) => ipcRenderer.invoke('supplier-instances:toggle-override', instanceId, enabled, date),
    toggleLock: (instanceId: number, locked: boolean) => ipcRenderer.invoke('supplier-instances:toggle-lock', instanceId, locked),
    toggleScope: (instanceId: number, scope: any) => ipcRenderer.invoke('supplier-instances:toggle-scope', instanceId, scope),
    toggleApplicability: (params: any) => ipcRenderer.invoke('supplier-instances:toggle-applicability', params),
    getSupplierProject: (supplierId: number, projectId: number) => ipcRenderer.invoke('supplier-instances:get-supplier-project', supplierId, projectId),
    listSupplierProjects: (supplierId: number) => ipcRenderer.invoke('supplier-instances:list-supplier-projects', supplierId),
  },

  // Propagation
  propagation: {
    preview: (projectId: number) => ipcRenderer.invoke('propagation:preview', projectId),
    apply: (params: any) => ipcRenderer.invoke('propagation:apply', params),
  },

  // Template Sync
  templateSync: {
    checkOutOfSync: (projectId: number) => ipcRenderer.invoke('template-sync:check-out-of-sync', projectId),
    preview: (projectActivityId: number) => ipcRenderer.invoke('template-sync:preview', projectActivityId),
    apply: (projectActivityId: number) => ipcRenderer.invoke('template-sync:apply', projectActivityId),
  },

  // Dashboard
  dashboard: {
    stats: () => ipcRenderer.invoke('dashboard:stats'),
    overdue: (params?: any) => ipcRenderer.invoke('dashboard:overdue', params),
    dueSoon: (params?: any) => ipcRenderer.invoke('dashboard:due-soon', params),
    supplierProgress: () => ipcRenderer.invoke('dashboard:supplier-progress'),
    projectProgress: () => ipcRenderer.invoke('dashboard:project-progress'),
  },

  // Import/Export
  importExport: {
    export: (params?: any) => ipcRenderer.invoke('import-export:export', params),
    import: (params: any) => ipcRenderer.invoke('import-export:import', params),
    wipe: () => ipcRenderer.invoke('import-export:wipe'),
    backup: () => ipcRenderer.invoke('import-export:backup'),
  },

  // Settings
  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    update: (params: any) => ipcRenderer.invoke('settings:update', params),
  },

  // Parts & Location Codes
  parts: {
    list: (supplierProjectId: number) => ipcRenderer.invoke('parts:list', supplierProjectId),
    get: (id: number) => ipcRenderer.invoke('parts:get', id),
    create: (params: any) => ipcRenderer.invoke('parts:create', params),
    update: (id: number, params: any) => ipcRenderer.invoke('parts:update', id, params),
    delete: (id: number) => ipcRenderer.invoke('parts:delete', id),
  },

  locationCodes: {
    list: (supplierId: number) => ipcRenderer.invoke('location-codes:list', supplierId),
    get: (id: number) => ipcRenderer.invoke('location-codes:get', id),
    create: (params: any) => ipcRenderer.invoke('location-codes:create', params),
    update: (id: number, params: any) => ipcRenderer.invoke('location-codes:update', id, params),
    delete: (id: number) => ipcRenderer.invoke('location-codes:delete', id),
  },

  // Window (Electron focus workaround)
  window: {
    refocus: () => ipcRenderer.invoke('window:refocus'),
  },
};

contextBridge.exposeInMainWorld('sqts', api);

// Type-only export for global.d.ts — stripped at compile time, no JS output
export type SQTSApi = typeof api;
