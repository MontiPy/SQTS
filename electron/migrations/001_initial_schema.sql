-- SQTS Initial Schema Migration

-- Suppliers
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  notes TEXT,
  nmr_rank TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_suppliers_nmr_rank ON suppliers(nmr_rank);

-- Activity Templates
CREATE TABLE activity_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_activity_templates_category ON activity_templates(category);

-- Activity Template Schedule Items
CREATE TABLE activity_template_schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_template_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('MILESTONE', 'TASK')),
  name TEXT NOT NULL,
  anchor_type TEXT NOT NULL CHECK(anchor_type IN ('FIXED_DATE', 'SCHEDULE_ITEM', 'COMPLETION', 'PROJECT_MILESTONE')),
  anchor_ref_id INTEGER,
  offset_days INTEGER,
  fixed_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (anchor_ref_id) REFERENCES activity_template_schedule_items(id) ON DELETE SET NULL
);

CREATE INDEX idx_template_schedule_items_template ON activity_template_schedule_items(activity_template_id);
CREATE INDEX idx_template_schedule_items_anchor ON activity_template_schedule_items(anchor_ref_id);

-- Activity Template Applicability Rules
CREATE TABLE activity_template_applicability_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_template_id INTEGER NOT NULL,
  operator TEXT NOT NULL CHECK(operator IN ('ALL', 'ANY')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id) ON DELETE CASCADE
);

CREATE INDEX idx_applicability_rules_template ON activity_template_applicability_rules(activity_template_id);

-- Activity Template Applicability Clauses
CREATE TABLE activity_template_applicability_clauses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('SUPPLIER_NMR', 'PART_PA')),
  comparator TEXT NOT NULL CHECK(comparator IN ('IN', 'NOT_IN', 'EQ', 'NEQ', 'GTE', 'LTE')),
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (rule_id) REFERENCES activity_template_applicability_rules(id) ON DELETE CASCADE
);

CREATE INDEX idx_applicability_clauses_rule ON activity_template_applicability_clauses(rule_id);

-- Projects
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL DEFAULT 'v1.0',
  default_anchor_rule TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- Project Milestones
CREATE TABLE project_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_project_milestones_project ON project_milestones(project_id);

-- Project Activities
CREATE TABLE project_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  activity_template_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  template_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id) ON DELETE CASCADE
);

CREATE INDEX idx_project_activities_project ON project_activities(project_id);
CREATE INDEX idx_project_activities_template ON project_activities(activity_template_id);

-- Project Schedule Items
CREATE TABLE project_schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_activity_id INTEGER NOT NULL,
  template_item_id INTEGER,
  kind TEXT NOT NULL CHECK(kind IN ('MILESTONE', 'TASK')),
  name TEXT NOT NULL,
  anchor_type TEXT NOT NULL CHECK(anchor_type IN ('FIXED_DATE', 'SCHEDULE_ITEM', 'COMPLETION', 'PROJECT_MILESTONE')),
  anchor_ref_id INTEGER,
  offset_days INTEGER,
  fixed_date TEXT,
  override_date TEXT,
  override_enabled INTEGER NOT NULL DEFAULT 0,
  project_milestone_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_activity_id) REFERENCES project_activities(id) ON DELETE CASCADE,
  FOREIGN KEY (template_item_id) REFERENCES activity_template_schedule_items(id) ON DELETE SET NULL,
  FOREIGN KEY (anchor_ref_id) REFERENCES project_schedule_items(id) ON DELETE SET NULL,
  FOREIGN KEY (project_milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL
);

CREATE INDEX idx_project_schedule_items_activity ON project_schedule_items(project_activity_id);
CREATE INDEX idx_project_schedule_items_anchor ON project_schedule_items(anchor_ref_id);
CREATE INDEX idx_project_schedule_items_milestone ON project_schedule_items(project_milestone_id);

-- Supplier Projects
CREATE TABLE supplier_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  project_version TEXT NOT NULL,
  supplier_project_nmr_rank TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(supplier_id, project_id)
);

CREATE INDEX idx_supplier_projects_supplier ON supplier_projects(supplier_id);
CREATE INDEX idx_supplier_projects_project ON supplier_projects(project_id);

-- Supplier Activity Instances
CREATE TABLE supplier_activity_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_project_id INTEGER NOT NULL,
  project_activity_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Not Started' CHECK(status IN ('Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete', 'Not Required')),
  scope_override TEXT CHECK(scope_override IN ('REQUIRED', 'NOT_REQUIRED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_project_id) REFERENCES supplier_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (project_activity_id) REFERENCES project_activities(id) ON DELETE CASCADE
);

CREATE INDEX idx_supplier_activity_instances_supplier_project ON supplier_activity_instances(supplier_project_id);
CREATE INDEX idx_supplier_activity_instances_project_activity ON supplier_activity_instances(project_activity_id);

-- Supplier Schedule Item Instances
CREATE TABLE supplier_schedule_item_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_activity_instance_id INTEGER NOT NULL,
  project_schedule_item_id INTEGER NOT NULL,
  planned_date TEXT,
  actual_date TEXT,
  status TEXT NOT NULL DEFAULT 'Not Started' CHECK(status IN ('Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete', 'Not Required')),
  planned_date_override INTEGER NOT NULL DEFAULT 0,
  scope_override TEXT CHECK(scope_override IN ('REQUIRED', 'NOT_REQUIRED')),
  locked INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_activity_instance_id) REFERENCES supplier_activity_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (project_schedule_item_id) REFERENCES project_schedule_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_supplier_schedule_item_instances_activity ON supplier_schedule_item_instances(supplier_activity_instance_id);
CREATE INDEX idx_supplier_schedule_item_instances_project_item ON supplier_schedule_item_instances(project_schedule_item_id);
CREATE INDEX idx_supplier_schedule_item_instances_status ON supplier_schedule_item_instances(status);
CREATE INDEX idx_supplier_schedule_item_instances_planned_date ON supplier_schedule_item_instances(planned_date);

-- Supplier Activity Attachments
CREATE TABLE supplier_activity_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_activity_instance_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_activity_instance_id) REFERENCES supplier_activity_instances(id) ON DELETE CASCADE
);

CREATE INDEX idx_supplier_activity_attachments_instance ON supplier_activity_attachments(supplier_activity_instance_id);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('nmr_ranks', '["A1","A2","B1","B2","C1"]'),
  ('pa_ranks', '["Critical","High","Medium","Low"]'),
  ('propagation_skip_complete', 'true'),
  ('propagation_skip_locked', 'true'),
  ('propagation_skip_overridden', 'true'),
  ('date_format', 'yyyy-MM-dd'),
  ('use_business_days', 'false'),
  ('auto_propagate_template_changes', 'false'),
  ('auto_propagate_to_suppliers', 'false');

-- Audit Events
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  user_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_audit_events_created ON audit_events(created_at);
