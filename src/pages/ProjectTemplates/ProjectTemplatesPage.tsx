import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileStack, Plus, Search } from 'lucide-react';
import { useProjectTemplates } from '@/hooks/use-project-templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ProjectTemplateForm from './ProjectTemplateForm';

export default function ProjectTemplatesPage() {
  const navigate = useNavigate();
  const { data: templates, isLoading, error } = useProjectTemplates();

  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div className="text-destructive">Error loading templates: {error.message}</div>;

  const filteredTemplates = templates?.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Project Templates</h1>
          <p className="text-muted-foreground mt-1">Reusable project blueprints with milestones and activities</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Template
        </Button>
      </div>

      {!templates || templates.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={FileStack}
            message="No project templates yet"
            description="Create reusable project blueprints with milestones and activities"
            actionLabel="Create Template"
            onAction={() => setShowCreateForm(true)}
          />
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                type="text"
                placeholder="Search templates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Milestones</TableHead>
                  <TableHead>Activities</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow
                    key={template.id}
                    onClick={() => navigate(`/project-templates/${template.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell className="text-muted-foreground">{template.description || '--'}</TableCell>
                    <TableCell>{template.milestoneCount}</TableCell>
                    <TableCell>{template.activityCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {showCreateForm && (
        <ProjectTemplateForm
          isOpen={showCreateForm}
          onClose={() => setShowCreateForm(false)}
          onCreated={(t) => navigate(`/project-templates/${t.id}`)}
        />
      )}
    </div>
  );
}
