// ============================================================
// SQTS Shared Type System
// ============================================================

// --- API Response Envelope ---

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Enums / Literals ---

export type ScheduleItemKind = 'MILESTONE' | 'TASK';

export type AnchorType =
  | 'FIXED_DATE'
  | 'SCHEDULE_ITEM'
  | 'COMPLETION'
  | 'PROJECT_MILESTONE';

export type ActivityStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Under Review'
  | 'Blocked'
  | 'Complete'
  | 'Not Required';

export type ScopeOverride = 'REQUIRED' | 'NOT_REQUIRED' | null;

export type ApplicabilityOperator = 'ALL' | 'ANY';
export type ApplicabilitySubject = 'SUPPLIER_NMR' | 'PART_PA';
export type ApplicabilityComparator = 'IN' | 'NOT_IN' | 'EQ' | 'NEQ' | 'GTE' | 'LTE';

// --- Core Entities ---

export interface Supplier {
  id: number;
  name: string;
  notes: string | null;
  nmrRank: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
}

export interface Project {
  id: number;
  name: string;
  version: string;
  defaultAnchorRule: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ActivityTemplate {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  version: number;
  updatedAt: string | null;
  createdAt: string;
  latestVersionName?: string | null;
}

// --- Project Structure ---

export interface ProjectMilestone {
  id: number;
  projectId: number;
  name: string;
  date: string | null;
  category: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ProjectActivity {
  id: number;
  projectId: number;
  activityTemplateId: number;
  sortOrder: number;
  templateVersion: number;
  createdAt: string;
}

export interface ProjectScheduleItem {
  id: number;
  projectActivityId: number;
  templateItemId: number | null;
  kind: ScheduleItemKind;
  name: string;
  anchorType: AnchorType;
  anchorRefId: number | null;
  offsetDays: number | null;
  fixedDate: string | null;
  overrideDate: string | null;
  overrideEnabled: boolean;
  projectMilestoneId: number | null;
  sortOrder: number;
  createdAt: string;
}

// --- Supplier Instances ---

export interface SupplierProject {
  id: number;
  supplierId: number;
  projectId: number;
  projectVersion: string;
  supplierProjectNmrRank: string | null;
  createdAt: string;
}

export interface SupplierActivityInstance {
  id: number;
  supplierProjectId: number;
  projectActivityId: number;
  status: ActivityStatus;
  scopeOverride: ScopeOverride;
  createdAt: string;
}

export interface SupplierScheduleItemInstance {
  id: number;
  supplierActivityInstanceId: number;
  projectScheduleItemId: number;
  plannedDate: string | null;
  actualDate: string | null;
  status: ActivityStatus;
  plannedDateOverride: boolean;
  scopeOverride: ScopeOverride;
  locked: boolean;
  notes: string | null;
  createdAt: string;
}

// --- Scheduler Types ---

export interface ScheduleItemWithDates extends ProjectScheduleItem {
  plannedDate: string | null;
  error?: string;
}

// --- Applicability Types ---

export interface ActivityTemplateApplicabilityRule {
  id: number;
  activityTemplateId: number;
  operator: ApplicabilityOperator;
  enabled: boolean;
  createdAt: string;
}

export interface ActivityTemplateApplicabilityClause {
  id: number;
  ruleId: number;
  subjectType: ApplicabilitySubject;
  comparator: ApplicabilityComparator;
  value: string;
  createdAt: string;
}

export interface ApplicabilityContext {
  supplierNmrRank: string | null;
  partPaRanks: string[];
}

// --- Propagation Types ---

export interface PropagationPolicy {
  skipComplete: boolean;
  skipLocked: boolean;
  skipOverridden: boolean;
  useBusinessDays: boolean;
}

export interface PropagationChangeItem {
  instanceId: number;
  supplierProjectId: number;
  supplierId: number;
  supplierName: string;
  projectScheduleItemId: number;
  itemName: string;
  currentDate: string | null;
  newDate: string | null;
}

export interface PropagationSkipItem {
  instanceId: number;
  supplierProjectId: number;
  supplierId: number;
  supplierName: string;
  projectScheduleItemId: number;
  itemName: string;
  currentDate: string | null;
  reason: string;
}

export interface PropagationPreview {
  projectId: number;
  willChange: PropagationChangeItem[];
  wontChange: PropagationSkipItem[];
}

export interface PropagationResult {
  updated: PropagationChangeItem[];
  skipped: PropagationSkipItem[];
  errors: Array<{ instanceId: number; error: string }>;
}

export interface SyncAndPropagateResult {
  templatesSynced: number;
  syncErrors: Array<{ projectActivityId: number; error: string }>;
  projectsPropagated: number;
  datesUpdated: number;
  datesSkipped: number;
  propagationErrors: Array<{ projectId: number; error: string }>;
}

// --- Settings ---

export interface AppSettings {
  nmrRanks: string[];
  paRanks: string[];
  milestoneCategories: string[];
  propagationSkipComplete: boolean;
  propagationSkipLocked: boolean;
  propagationSkipOverridden: boolean;
  dateFormat: string;
  useBusinessDays: boolean;
  autoPropagateTemplateChanges: boolean;
  autoPropagateToSuppliers: boolean;
}

// --- Template Schedule Items ---

export interface ActivityTemplateScheduleItem {
  id: number;
  activityTemplateId: number;
  kind: ScheduleItemKind;
  name: string;
  anchorType: AnchorType;
  anchorRefId: number | null;
  anchorMilestoneName?: string | null;
  offsetDays: number | null;
  fixedDate: string | null;
  sortOrder: number;
  createdAt: string;
}

// --- Template Versioning ---

export interface TemplateVersion {
  id: number;
  activityTemplateId: number;
  name: string;
  description: string | null;
  versionNumber: number;
  snapshot: string;
  createdAt: string;
}

export interface TemplateSnapshot {
  template: { name: string; description: string | null; category: string | null };
  scheduleItems: Array<{
    kind: ScheduleItemKind;
    name: string;
    anchorType: AnchorType;
    anchorRefIndex: number | null;
    anchorMilestoneName: string | null;
    offsetDays: number | null;
    fixedDate: string | null;
    sortOrder: number;
  }>;
}

// --- Template Sync Types ---

export interface TemplateSyncPreview {
  projectActivityId: number;
  templateId: number;
  templateName: string;
  currentVersion: number;
  latestVersion: number;
  changes: TemplateSyncChange[];
}

export interface TemplateSyncChange {
  type: 'add' | 'remove' | 'update';
  itemName: string;
  details: string;
}

// --- Reports Types ---

export interface DueSoonItem {
  instanceId: number;
  supplierName: string;
  projectName: string;
  activityName: string;
  itemName: string;
  plannedDate: string;
  status: ActivityStatus;
  daysUntilDue: number;
  supplierId: number;
  projectId: number;
}

export interface SupplierProgressRow {
  supplierId: number;
  supplierName: string;
  totalItems: number;
  completedItems: number;
  overdueItems: number;
  completionPercent: number;
}

export interface ProjectProgressRow {
  projectId: number;
  projectName: string;
  totalSuppliers: number;
  totalItems: number;
  completedItems: number;
  overdueItems: number;
  completionPercent: number;
}

// --- Parts & Location Codes ---

export interface SupplierLocationCode {
  id: number;
  supplierId: number;
  supplierNumber: string;
  locationCode: string;
  createdAt: string;
}

export interface Part {
  id: number;
  supplierProjectId: number;
  locationCodeId: number | null;
  partNumber: string;
  description: string | null;
  paRank: string | null;
  createdAt: string;
}

// --- Dashboard / Overdue Types ---

export interface OverdueItem {
  instanceId: number;
  supplierName: string;
  projectName: string;
  activityName: string;
  itemName: string;
  plannedDate: string;
  status: ActivityStatus;
  daysOverdue: number;
  supplierId: number;
  projectId: number;
}

export interface DashboardStats {
  overdue: number;
  dueSoon: number;
  inProgress: number;
  recentlyUpdated: number;
}

// --- Project Templates ---

export interface ProjectTemplate {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface ProjectTemplateMilestone {
  id: number;
  projectTemplateId: number;
  category: string | null;
  name: string;
  sortOrder: number;
}

export interface ProjectTemplateActivity {
  id: number;
  projectTemplateId: number;
  activityTemplateId: number;
  sortOrder: number;
}

export interface ProjectTemplateDetail extends ProjectTemplate {
  milestones: ProjectTemplateMilestone[];
  activities: (ProjectTemplateActivity & {
    templateName: string;
    templateCategory: string | null;
  })[];
}

// --- Template Batch Operations ---

export interface ProjectTemplateStatus {
  projectId: number;
  projectName: string;
  hasActivity: boolean;
  projectActivityId: number | null;
  templateVersion: number | null;
  isOutOfSync: boolean;
}

export interface BatchApplyResult {
  projectId: number;
  projectName: string;
  success: boolean;
  error?: string;
}

export interface TemplateOutOfSyncActivity {
  projectActivityId: number;
  projectId: number;
  projectName: string;
  templateVersion: number;
  latestVersion: number;
}

export interface BatchSyncResult {
  projectActivityId: number;
  projectId: number;
  projectName: string;
  success: boolean;
  fromVersion?: number;
  toVersion?: number;
  error?: string;
}

// --- Milestone Date Grid ---

export interface MilestoneDateGridRow {
  category: string;
  name: string;
}

export interface MilestoneDateGridCell {
  milestoneId: number;
  date: string | null;
}

export interface MilestoneDateGridData {
  projects: { id: number; name: string; version: string }[];
  rows: MilestoneDateGridRow[];
  /** key = `${projectId}::${category}::${name}` */
  cells: Record<string, MilestoneDateGridCell>;
}

// --- Supplier Milestone Date Grid ---

export interface SupplierMilestoneDateGrid {
  suppliers: { supplierProjectId: number; supplierId: number; supplierName: string }[];
  milestones: ProjectMilestone[];
  dates: Record<string, string | null>; // key = `${supplierProjectId}-${milestoneId}`
}

// --- Audit Log Types ---

export interface AuditEvent {
  id: number;
  entityType: string;
  entityId: number | null;
  action: string;
  details: Record<string, any> | null;
  createdAt: string;
}

export interface AuditListParams {
  entityType?: string;
  action?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AuditListResult {
  events: AuditEvent[];
  total: number;
}

// --- Search / Command Palette ---

export interface SearchResult {
  id: number;
  name: string;
  type: 'supplier' | 'project' | 'activity-template' | 'project-template' | 'part';
  subtitle?: string;
}

// ============================================================
// IPC Input Parameter Types (used by preload API surface)
// ============================================================

// --- Supplier Params ---

export interface SearchSuppliersParams {
  search?: string;
  nmrRank?: string | null;
}

export interface CreateSupplierParams {
  name: string;
  notes?: string | null;
  nmrRank?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export interface UpdateSupplierParams {
  name?: string;
  notes?: string | null;
  nmrRank?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

// --- Project Params ---

export interface CreateProjectParams {
  name: string;
  version?: string;
  defaultAnchorRule?: string | null;
}

export interface UpdateProjectParams {
  name?: string;
  version?: string;
  defaultAnchorRule?: string | null;
}

// --- Milestone Params ---

export interface CreateMilestoneParams {
  projectId: number;
  name: string;
  date?: string | null;
  category?: string | null;
  sortOrder?: number;
}

export interface UpdateMilestoneParams {
  name?: string;
  date?: string | null;
  category?: string | null;
  sortOrder?: number;
}

// --- Activity Template Params ---

export interface CreateActivityTemplateParams {
  name: string;
  description?: string | null;
  category?: string | null;
}

export interface UpdateActivityTemplateParams {
  name?: string;
  description?: string | null;
  category?: string | null;
}

// --- Template Schedule Item Params ---

export interface CreateTemplateScheduleItemParams {
  activityTemplateId: number;
  kind: ScheduleItemKind;
  name: string;
  anchorType: AnchorType;
  anchorRefId?: number | null;
  anchorMilestoneName?: string | null;
  offsetDays?: number | null;
  fixedDate?: string | null;
  sortOrder?: number;
}

export interface UpdateTemplateScheduleItemParams {
  kind?: ScheduleItemKind;
  name?: string;
  anchorType?: AnchorType;
  anchorRefId?: number | null;
  anchorMilestoneName?: string | null;
  offsetDays?: number | null;
  fixedDate?: string | null;
  sortOrder?: number;
}

// --- Applicability Rule Params ---

export interface CreateApplicabilityRuleParams {
  activityTemplateId: number;
  operator: ApplicabilityOperator;
  enabled?: boolean;
}

export interface UpdateApplicabilityRuleParams {
  operator?: ApplicabilityOperator;
  enabled?: boolean;
}

// --- Applicability Clause Params ---

export interface CreateApplicabilityClauseParams {
  ruleId: number;
  subjectType: ApplicabilitySubject;
  comparator: ApplicabilityComparator;
  value: string;
}

export interface UpdateApplicabilityClauseParams {
  subjectType?: ApplicabilitySubject;
  comparator?: ApplicabilityComparator;
  value?: string;
}

// --- Project Activity Params ---

export interface AddProjectActivityParams {
  projectId: number;
  activityTemplateId: number;
}

// --- Supplier Instance Params ---

export interface ApplyProjectParams {
  projectId: number;
  supplierId: number;
  activityIds?: number[];
}

export interface UpdateInstanceStatusParams {
  instanceId: number;
  status: ActivityStatus;
  completionDate?: string | null;
  notes?: string | null;
}

export interface BatchUpdateStatusParams {
  instanceIds: number[];
  status: ActivityStatus;
  completionDate?: string | null;
}

export interface UpdateInstanceNotesParams {
  instanceId: number;
  notes: string | null;
}

export interface ToggleApplicabilityParams {
  supplierId: number;
  activityId: number;
  projectId: number;
  include: boolean;
}

// --- Propagation Params ---

export interface ApplyPropagationParams {
  projectId: number;
  selectedSupplierIds?: number[] | null;
}

// --- Dashboard Params ---

export interface DashboardFilterParams {
  supplierId?: number;
  projectId?: number;
}

// --- Import/Export Params ---

export interface ExportParams {
  includeSuppliers?: boolean;
  includeProjects?: boolean;
  includeTemplates?: boolean;
  includeInstances?: boolean;
}

export interface ImportParams {
  data: {
    suppliers?: unknown[];
    projects?: unknown[];
    activityTemplates?: unknown[];
  };
  mode?: 'MERGE' | 'REPLACE';
}

// --- Settings Params ---

export interface UpdateSettingParams {
  key: string;
  value: string | boolean | string[];
}

// --- Parts & Location Codes Params ---

export interface CreatePartParams {
  supplierProjectId: number;
  locationCodeId?: number | null;
  partNumber: string;
  description?: string | null;
  paRank?: string | null;
}

export interface UpdatePartParams {
  locationCodeId?: number | null;
  partNumber?: string;
  description?: string | null;
  paRank?: string | null;
}

export interface CreateLocationCodeParams {
  supplierId: number;
  supplierNumber: string;
  locationCode: string;
}

export interface UpdateLocationCodeParams {
  supplierNumber?: string;
  locationCode?: string;
}

// --- Project Template Params ---

export interface CreateProjectTemplateParams {
  name: string;
  description?: string | null;
}

export interface UpdateProjectTemplateParams {
  name?: string;
  description?: string | null;
  milestones?: Array<{
    category?: string | null;
    name: string;
    sortOrder?: number;
  }>;
  activities?: Array<{
    activityTemplateId: number;
    sortOrder?: number;
  }>;
}

export interface ApplyProjectTemplateParams {
  projectTemplateId: number;
  projectId: number;
}

// --- Milestone Grid Params ---

export interface MilestoneGridUpdateParams {
  updates: Array<{ milestoneId: number; date: string | null }>;
}

// --- Supplier Milestone Grid Params ---

export interface SupplierMilestoneGridUpdateParams {
  updates: Array<{
    supplierProjectId: number;
    milestoneId: number;
    date: string | null;
  }>;
}

export interface SupplierMilestoneGridFillRowParams {
  projectId: number;
  milestoneId: number;
  date: string;
}
