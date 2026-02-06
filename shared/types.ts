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
}

// --- Project Structure ---

export interface ProjectMilestone {
  id: number;
  projectId: number;
  name: string;
  date: string | null;
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

// --- Settings ---

export interface AppSettings {
  nmrRanks: string[];
  paRanks: string[];
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
  offsetDays: number | null;
  fixedDate: string | null;
  sortOrder: number;
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
