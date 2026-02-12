import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  FolderKanban,
  ListChecks,
  Grid3X3,
  Package,
  BarChart3,
  RefreshCw,
  Settings,
} from 'lucide-react';

const sections = [
  {
    icon: Users,
    title: 'Suppliers',
    content:
      'Create and manage supplier records with contact information and NMR rankings. Each supplier can be assigned to multiple projects. Navigate to Suppliers to add, edit, or delete suppliers.',
  },
  {
    icon: FolderKanban,
    title: 'Projects',
    content:
      'Projects represent quality tracking programs. Each project has milestones (key dates) and activities (sets of schedule items). Add milestones to define key dates, then add activities from the template library.',
  },
  {
    icon: ListChecks,
    title: 'Activity Templates',
    content:
      'Activity templates define reusable sets of schedule items (tasks and milestones). Create templates once and add them to multiple projects. Each template has schedule items with date anchoring (fixed date, relative to another item, or tied to a project milestone). Save named versions to snapshot and restore template configurations.',
  },
  {
    icon: Grid3X3,
    title: 'Tracking Grid',
    content:
      'The tracking grid shows all suppliers applied to a project. Select a project and optionally filter by activity to see each supplier\'s schedule item statuses. Update statuses, set date overrides, lock items, and add notes directly in the grid.',
  },
  {
    icon: Package,
    title: 'Parts & Location Codes',
    content:
      'Track parts associated with supplier-project combinations. Assign PA ranks to parts for applicability rule evaluation. Location codes map supplier numbers to facility identifiers.',
  },
  {
    icon: RefreshCw,
    title: 'Template Sync',
    content:
      'When a template is updated after being added to a project, the project\'s copy becomes out of sync. The sync status badge shows "Update Available" when changes are detected. Preview and apply template updates from the project detail page.',
  },
  {
    icon: BarChart3,
    title: 'Reports',
    content:
      'View overdue items, items due soon, supplier progress, and project progress from the Reports page. Click on the dashboard stat cards to jump directly to the relevant report tab.',
  },
  {
    icon: Settings,
    title: 'Settings',
    content:
      'Configure NMR and PA rank values, propagation policies (skip completed/locked/overridden items during date recalculations), and date calculation mode (calendar days vs. business days).',
  },
];

export default function HelpPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Help</h1>
        <p className="text-muted-foreground mt-1">
          Guide to using the Supplier Quality Tracking System
        </p>
      </div>

      <div className="space-y-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.title}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Icon className="w-5 h-5 text-primary" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {section.content}
                </p>
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Workflow Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="text-sm text-muted-foreground leading-relaxed space-y-2 list-decimal list-inside">
              <li>Create <strong>Activity Templates</strong> with schedule items</li>
              <li>Create a <strong>Project</strong> and add milestones</li>
              <li>Add activities from the template library to the project</li>
              <li>Create <strong>Suppliers</strong> with NMR ranks</li>
              <li>Apply the project to suppliers via the <strong>Tracking Grid</strong></li>
              <li>Track progress by updating statuses, dates, and notes on each item</li>
              <li>Use <strong>Reports</strong> to monitor overdue items and overall progress</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
