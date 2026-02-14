# SQTS Scheduling and Anchor Types

## Overview

The SQTS (Supplier Quality Tracking System) uses a sophisticated scheduling system that allows activity templates to adapt to different projects and dynamically calculate due dates based on various anchor points.

This document explains how schedule items work, the different anchor types available, and how they create flexible, cascading workflows.

---

## Architecture

### Three-Level Hierarchy

```
PROJECT LEVEL
├── Project Milestones (PA2, PA3, SOP, Launch, etc.)
│   └── Set at project level with specific dates
│
TEMPLATE LEVEL
├── Activity Templates (Part Approval, Tool Readiness, etc.)
│   └── Schedule Items
│       ├── MILESTONEs (can anchor to PROJECT_MILESTONE or other anchors)
│       └── TASKs (can anchor to various anchor types)
│
INSTANCE LEVEL
└── Supplier Instances (when template is applied to project + supplier)
    └── Calculated due dates based on anchor resolution
```

### How It Works

1. **Design Time**: Create activity templates with schedule items and define anchor relationships
2. **Project Setup**: Define project milestones with target dates
3. **Application Time**: Apply template to project + supplier
4. **Runtime**: System calculates actual due dates by resolving anchors
5. **Completion Time**: COMPLETION-anchored tasks activate when activity is marked complete

---

## Anchor Types

Schedule items can be anchored to different reference points. The anchor type determines how the due date is calculated.

### 1. FIXED_DATE

**Definition**: Anchored to a specific calendar date.

**Use Case**: Tasks that must happen on a specific date regardless of project variables.

**Fields**:
- `fixedDate`: ISO date string (e.g., "2026-03-15")
- `offsetDays`: Not used (ignored)

**Example**:
```
TASK "Submit Initial Samples"
  Anchor Type: FIXED_DATE
  Fixed Date: 2026-03-15
  → Due Date: March 15, 2026
```

**When to Use**:
- Regulatory deadlines with fixed dates
- Industry events or trade shows
- Contractually specified dates
- External audit dates

---

### 2. SCHEDULE_ITEM

**Definition**: Anchored to another schedule item within the same template (template-internal relationship).

**Use Case**: Create dependencies between tasks and milestones within a template.

**Fields**:
- `anchorRefId`: ID of the schedule item to anchor to
- `offsetDays`: Days before (-) or after (+) the referenced item

**Example**:
```
MILESTONE "Sample Approval" (Schedule Item #1)
  Anchor Type: PROJECT_MILESTONE
  Milestone Name: "PA 2"

TASK "Submit Samples" (Schedule Item #2)
  Anchor Type: SCHEDULE_ITEM
  Anchor Ref: "Sample Approval" (#1)
  Offset Days: -7
  → Due Date: 7 days BEFORE Sample Approval milestone
```

**When to Use**:
- Building task sequences within a template
- Creating dependencies (Task A must happen before Task B)
- Organizing work around template milestones
- Maintaining relative timing between related tasks

**UI Behavior**:
- Dropdown shows all schedule items in the template (filtered to exclude self)
- Shows item name and type: "Sample Approval (MILESTONE)"

---

### 3. PROJECT_MILESTONE

**Definition**: Anchored to a milestone defined at the project level (cross-boundary relationship).

**Use Case**: Sync template items to project milestone dates by name matching.

**Fields**:
- `anchorMilestoneName`: Name of project milestone to match (e.g., "PA 2", "SOP")
- `offsetDays`: Days before (-) or after (+) the project milestone

**Example**:
```
PROJECT LEVEL:
  Milestone "PA 2" → June 1, 2026
  Milestone "PA 3" → September 1, 2026

TEMPLATE LEVEL:
  MILESTONE "PA 2"
    Anchor Type: PROJECT_MILESTONE
    Milestone Name: "PA 2"
    → Syncs to project's PA 2 date (June 1)

  TASK "Submit PPAP"
    Anchor Type: PROJECT_MILESTONE
    Milestone Name: "PA 3"
    Offset Days: -14
    → Due Date: 14 days before project's PA 3 (August 18)
```

**When to Use**:
- Syncing template milestones to project milestones
- Tasks tied to project phases (PA1, PA2, PA3, etc.)
- Industry-standard milestone names (SOP, Launch, PPAP)
- Templates that adapt to different project timelines

**UI Behavior**:
- Checkbox: "Match to milestone in this template" (defaults to ✓)
  - **Checked**: Dropdown of MILESTONE schedule items from template (stores the milestone's name)
  - **Unchecked**: Text input for manual milestone name entry
- On edit: Checkbox auto-detects if milestone name matches a template milestone

**Cascading Effect**:
```
Project Milestone "PA 2" (June 1)
  ↓ (anchored via PROJECT_MILESTONE)
Template MILESTONE "PA 2" (June 1)
  ↓ (anchored via SCHEDULE_ITEM)
Template TASKs (calculated relative to June 1)
```

---

### 4. COMPLETION

**Definition**: Anchored relative to when the supplier marks the activity instance as complete (dynamic anchor).

**Use Case**: Follow-up tasks that only make sense AFTER the main work is finished.

**Fields**:
- `offsetDays`: Days after (+) completion
- No reference needed (anchors to activity completion date)

**Example**:
```
TEMPLATE: Part Approval

Rows 1-8: Main execution work
  MILESTONE "PA 2" → PROJECT_MILESTONE
  TASK "PAC-V Issued" → SCHEDULE_ITEM "PA 2"
  TASK "PAC-V Initial" → SCHEDULE_ITEM "PA 2"
  TASK "PFMEA" → SCHEDULE_ITEM "PA 2"
  MILESTONE "PA 3" → PROJECT_MILESTONE
  TASK "Inspection Fixture Certification" → SCHEDULE_ITEM "PA 3"

Row 9: Follow-up task
  TASK "Part Approval"
    Anchor Type: COMPLETION
    Offset Days: 0
    → Due Date: Same day supplier marks activity complete

WORKFLOW:
1. Supplier executes rows 1-8 (due dates based on PA 2, PA 3)
2. Supplier marks activity "Complete" on Sept 5, 2026
3. COMPLETION date = Sept 5, 2026
4. "Part Approval" task activates → Due Sept 5, 2026
5. Quality team performs final approval/sign-off
```

**When to Use**:
- Final approvals or sign-offs after supplier work
- Post-completion audits (e.g., "+30 days after completion")
- Follow-up reviews (e.g., "30-day production review")
- Documentation archival (e.g., "+90 days after completion")
- Maintenance schedules (e.g., "6-month tool audit")
- Corrective action deadlines after audit completion

**Behavior During Activity Lifecycle**:
- **Before Completion**: COMPLETION-anchored tasks have no date (TBD status)
- **At Completion**: System calculates dates when activity is marked complete
- **After Completion**: Tasks show concrete due dates and can be tracked

**Why This Matters**:
- Tasks don't show as overdue during active work
- Creates clear handoff points (execution → approval)
- Adapts to actual completion date (may finish early or late)
- Enables post-completion tracking and follow-through

---

## Real-World Template Example

### Part Approval Template (Version 27)

| Order | Type | Name | Anchor Type | Anchor Details | Offset | Meaning |
|-------|------|------|-------------|----------------|--------|---------|
| 1 | MILESTONE | PA 2 | PROJECT_MILESTONE | -- | -- | Syncs to project's PA 2 date |
| 2 | TASK | PAC-V Issued | SCHEDULE_ITEM | PA 2 | -- | Due at PA 2 milestone |
| 3 | TASK | PAC-V Initial | SCHEDULE_ITEM | PA 2 | -- | Due at PA 2 milestone |
| 4 | TASK | PFMEA | SCHEDULE_ITEM | PA 2 | -- | Due at PA 2 milestone |
| 5 | TASK | Part Accuracy/IDS | SCHEDULE_ITEM | PA 2 | -- | Due at PA 2 milestone |
| 6 | TASK | Inspection Fixture Concept | SCHEDULE_ITEM | PA 2 | -- | Due at PA 2 milestone |
| 7 | MILESTONE | PA 3 | PROJECT_MILESTONE | -- | -- | Syncs to project's PA 3 date |
| 8 | TASK | Inspection Fixture Certification | SCHEDULE_ITEM | PA 3 | -- | Due at PA 3 milestone |
| 9 | TASK | Part Approval | COMPLETION | -- | 0 | Due when activity marked complete |

**Timeline Scenario**:

```
PROJECT SETUP:
  Project Milestone "PA 2" = June 1, 2026
  Project Milestone "PA 3" = September 1, 2026

TEMPLATE APPLICATION (Applied to Supplier A + Project X):
  Row 1: PA 2 milestone → June 1, 2026
  Rows 2-6: All tasks → June 1, 2026 (at PA 2)
  Row 7: PA 3 milestone → September 1, 2026
  Row 8: Certification → September 1, 2026 (at PA 3)
  Row 9: Part Approval → TBD (waiting for completion)

SUPPLIER EXECUTION:
  Supplier works through rows 1-8 during June-September
  Supplier completes all work and marks activity "Complete" on Sept 5, 2026

POST-COMPLETION:
  Row 9: Part Approval → Sept 5, 2026 (COMPLETION + 0 days)
  Quality team performs final approval/sign-off
```

---

## Design Patterns

### Pattern 1: Milestone-Centric Organization

Group tasks under template milestones that sync to project milestones.

```
MILESTONE "PA 2" → PROJECT_MILESTONE "PA 2"
  ├── TASK "Design FMEA" → SCHEDULE_ITEM "PA 2" (-30 days)
  ├── TASK "Process FMEA" → SCHEDULE_ITEM "PA 2" (-20 days)
  ├── TASK "Control Plan" → SCHEDULE_ITEM "PA 2" (-10 days)
  └── TASK "Submit PPAP" → SCHEDULE_ITEM "PA 2" (0 days)

MILESTONE "PA 3" → PROJECT_MILESTONE "PA 3"
  ├── TASK "Production Trial" → SCHEDULE_ITEM "PA 3" (-7 days)
  └── TASK "Capability Study" → SCHEDULE_ITEM "PA 3" (0 days)
```

**Advantages**:
- Easy to visualize timeline
- Tasks stay organized by phase
- Template adapts to different project milestone dates
- Clear hierarchical structure

---

### Pattern 2: Sequential Task Chain

Create dependencies where each task builds on the previous.

```
TASK "Design Review" → FIXED_DATE (March 1)
TASK "Material Procurement" → SCHEDULE_ITEM "Design Review" (+3 days)
TASK "Fabrication" → SCHEDULE_ITEM "Material Procurement" (+5 days)
TASK "Inspection" → SCHEDULE_ITEM "Fabrication" (+2 days)
TASK "Approval" → SCHEDULE_ITEM "Inspection" (+1 day)
```

**Advantages**:
- Clear dependency chain
- Automatically adjusts if early tasks slip
- Maintains relative timing

---

### Pattern 3: Follow-Up Workflow

Main work anchored to milestones, follow-ups anchored to completion.

```
MAIN WORK:
  MILESTONE "Tool Approval" → PROJECT_MILESTONE "PA 2"
  TASK "Design" → SCHEDULE_ITEM "Tool Approval" (-45 days)
  TASK "Fabrication" → SCHEDULE_ITEM "Tool Approval" (-15 days)
  TASK "First Article" → SCHEDULE_ITEM "Tool Approval" (0 days)

FOLLOW-UP WORK:
  TASK "30-Day Production Review" → COMPLETION (+30 days)
  TASK "6-Month Tool Audit" → COMPLETION (+180 days)
  TASK "Annual Maintenance" → COMPLETION (+365 days)
```

**Advantages**:
- Clear separation between scheduled and follow-up work
- Follow-ups adapt to actual completion date
- Enables long-term tracking

---

## Best Practices

### 1. Choose the Right Anchor Type

| Scenario | Best Anchor Type | Reason |
|----------|------------------|--------|
| Industry deadline | FIXED_DATE | Non-negotiable date |
| Task depends on another task | SCHEDULE_ITEM | Template-internal dependency |
| Task tied to project phase | PROJECT_MILESTONE | Adapts to project timeline |
| Follow-up after completion | COMPLETION | Only relevant post-completion |

### 2. Milestone Organization

- **Template milestones** should anchor to **PROJECT_MILESTONE** when possible
- **Tasks** should anchor to **template milestones** via **SCHEDULE_ITEM**
- This creates a two-level cascade: Project → Template Milestone → Tasks

### 3. Offset Days Guidelines

- **Negative offsets** (-7, -14, -30): Tasks that happen BEFORE the anchor
- **Zero offset** (0): Tasks that happen AT the anchor
- **Positive offsets** (+7, +14, +30): Tasks that happen AFTER the anchor

### 4. COMPLETION Anchor Guidelines

- Use offset 0 for immediate follow-ups
- Use positive offsets for scheduled follow-ups (+30, +90, +180 days)
- Never use negative offsets (can't happen before completion)
- Group all COMPLETION-anchored tasks at the end of the template

### 5. Template Reusability

- Use **PROJECT_MILESTONE** anchors for templates that apply to multiple projects
- Use standard milestone names (PA1, PA2, PA3, SOP, Launch) for consistency
- Avoid **FIXED_DATE** unless truly necessary (reduces reusability)

### 6. Sort Order

- Organize schedule items in chronological order (lowest order executes first)
- Keep related tasks grouped together
- Place COMPLETION-anchored tasks last (highest order numbers)

---

## Applicability Rules (Future Feature)

Activity templates can define applicability rules that determine which suppliers they apply to.

**Example Rules**:
- "Apply only to Tier 1 suppliers"
- "Apply if supplier country = USA AND supplier type = Tooling"
- "Apply if supplier risk level = High"

**Integration with Scheduling**:
- When a template is applied to a project, only applicable suppliers get instances
- Each supplier instance gets its own calculated schedule based on anchor resolution
- Allows targeting specific templates to specific supplier categories

---

## Technical Implementation Notes

### Database Fields

**ActivityTemplateScheduleItem Table**:
- `kind`: 'TASK' | 'MILESTONE'
- `anchorType`: 'FIXED_DATE' | 'SCHEDULE_ITEM' | 'COMPLETION' | 'PROJECT_MILESTONE'
- `anchorRefId`: Integer (for SCHEDULE_ITEM)
- `anchorMilestoneName`: String (for PROJECT_MILESTONE)
- `fixedDate`: ISO date string (for FIXED_DATE)
- `offsetDays`: Integer (for relative calculations)
- `sortOrder`: Integer (display order)

### Anchor Resolution Algorithm

When applying a template to a project + supplier:

1. **Resolve PROJECT_MILESTONE anchors**:
   - Match `anchorMilestoneName` to project milestones
   - Set milestone date = project milestone date

2. **Resolve SCHEDULE_ITEM anchors**:
   - Look up referenced schedule item by `anchorRefId`
   - Calculate: referenced item date + offsetDays

3. **Resolve FIXED_DATE anchors**:
   - Use `fixedDate` directly

4. **Skip COMPLETION anchors**:
   - Leave as TBD until activity is marked complete
   - Calculate when status changes to 'COMPLETED'

### Propagation

When project milestones are updated, the system can propagate changes:
- Recalculate all template milestones anchored to PROJECT_MILESTONE
- Recalculate all tasks anchored to those template milestones
- Update supplier instance due dates
- Track date changes and notify users

---

## Glossary

**Activity Template**: Reusable workflow definition with schedule items, applied to projects

**Schedule Item**: A task or milestone within an activity template

**Anchor Type**: The reference point that determines when a schedule item is due

**Anchor Details**: The specific reference (date, item, milestone name) for the anchor

**Offset Days**: Number of days before (-) or after (+) the anchor point

**Project Milestone**: A date-based milestone defined at the project level (PA1, PA2, SOP, etc.)

**Template Milestone**: A milestone schedule item within a template (kind='MILESTONE')

**Supplier Instance**: An instantiation of an activity template for a specific supplier + project

**COMPLETION Date**: The date when a supplier marks an activity instance as complete

**Cascading**: When changes to one item (e.g., project milestone) automatically update dependent items

---

## Related Documentation

- `SQTS-SPEC.md`: Full system specification
- `APPROACH.md`: Implementation approach and architecture
- `MEMORY.md`: Project learnings and patterns

---

**Last Updated**: 2026-02-10
**Version**: 1.0
