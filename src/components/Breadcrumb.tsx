import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useSupplier } from '@/hooks/use-suppliers';
import { useProject } from '@/hooks/use-projects';
import { useActivityTemplate } from '@/hooks/use-activity-templates';

// Static segment labels
const segmentLabels: Record<string, string> = {
  suppliers: 'Suppliers',
  projects: 'Projects',
  'activity-templates': 'Activity Templates',
  tracking: 'Tracking',
  'supplier-projects': 'Tracking',
  parts: 'Parts',
  reports: 'Reports',
  'import-export': 'Import / Export',
  settings: 'Settings',
  help: 'Help',
};

// --- Dynamic segment sub-components ---

function SupplierName({ id }: { id: number }) {
  const { data, isLoading } = useSupplier(id);
  if (isLoading) return <span className="text-muted-foreground">Loading...</span>;
  return <>{data?.name || `Supplier ${id}`}</>;
}

function ProjectName({ id }: { id: number }) {
  const { data, isLoading } = useProject(id);
  if (isLoading) return <span className="text-muted-foreground">Loading...</span>;
  return <>{data?.name || `Project ${id}`}</>;
}

function ActivityTemplateName({ id }: { id: number }) {
  const { data, isLoading } = useActivityTemplate(id);
  if (isLoading) return <span className="text-muted-foreground">Loading...</span>;
  return <>{data?.name || `Template ${id}`}</>;
}

function SupplierProjectName({ supplierId, projectId }: { supplierId: number; projectId: number }) {
  const { data: supplier, isLoading: supplierLoading } = useSupplier(supplierId);
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  if (supplierLoading || projectLoading) {
    return <span className="text-muted-foreground">Loading...</span>;
  }
  const supplierName = supplier?.name || `Supplier ${supplierId}`;
  const projectName = project?.name || `Project ${projectId}`;
  return <>{supplierName} &mdash; {projectName}</>;
}

// --- Separator ---

function Separator() {
  return <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
}

// --- Dynamic segment resolver ---

function DynamicSegment({ parentSegment, id }: { parentSegment: string; id: number }) {
  switch (parentSegment) {
    case 'suppliers':
      return <SupplierName id={id} />;
    case 'projects':
      return <ProjectName id={id} />;
    case 'activity-templates':
      return <ActivityTemplateName id={id} />;
    default:
      return <>{id}</>;
  }
}

// --- Main Breadcrumb component ---

export default function Breadcrumb() {
  const location = useLocation();
  const pathname = location.pathname;

  // Don't show breadcrumbs on Dashboard
  if (pathname === '/') {
    return null;
  }

  const segments = pathname.split('/').filter(Boolean);

  // Special case: /supplier-projects/:supplierId/:projectId
  if (segments[0] === 'supplier-projects' && segments.length >= 3) {
    const supplierId = parseInt(segments[1], 10);
    const projectId = parseInt(segments[2], 10);

    return (
      <nav className="flex items-center gap-1 px-6 py-2 border-b border-border bg-background">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          <Home className="w-4 h-4" />
        </Link>
        <Separator />
        <Link to="/tracking" className="text-sm text-muted-foreground hover:text-foreground">
          Tracking
        </Link>
        <Separator />
        <span className="text-sm text-foreground font-medium">
          <SupplierProjectName supplierId={supplierId} projectId={projectId} />
        </span>
      </nav>
    );
  }

  // Build breadcrumb items from path segments
  const items: { label: string | null; path: string; isDynamic: boolean; parentSegment?: string; id?: number }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const path = '/' + segments.slice(0, i + 1).join('/');
    const numericId = parseInt(segment, 10);

    if (!isNaN(numericId) && i > 0) {
      // Dynamic segment (an ID)
      items.push({
        label: null,
        path,
        isDynamic: true,
        parentSegment: segments[i - 1],
        id: numericId,
      });
    } else {
      // Static segment
      const label = segmentLabels[segment] || segment;
      items.push({
        label,
        path,
        isDynamic: false,
      });
    }
  }

  return (
    <nav className="flex items-center gap-1 px-6 py-2 border-b border-border bg-background">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        <Home className="w-4 h-4" />
      </Link>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={item.path} className="flex items-center gap-1">
            <Separator />
            {isLast ? (
              <span className="text-sm text-foreground font-medium">
                {item.isDynamic && item.parentSegment && item.id != null ? (
                  <DynamicSegment parentSegment={item.parentSegment} id={item.id} />
                ) : (
                  item.label
                )}
              </span>
            ) : (
              <Link to={item.path} className="text-sm text-muted-foreground hover:text-foreground">
                {item.isDynamic && item.parentSegment && item.id != null ? (
                  <DynamicSegment parentSegment={item.parentSegment} id={item.id} />
                ) : (
                  item.label
                )}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
