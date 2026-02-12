import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, Plus, Search, Copy } from 'lucide-react';
import { useActivityTemplates, useDuplicateActivityTemplate } from '@/hooks/use-activity-templates';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ActivityTemplateForm from './ActivityTemplateForm';

export default function ActivityLibraryPage() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { data: templates, isLoading, error } = useActivityTemplates();
  const duplicateTemplate = useDuplicateActivityTemplate();

  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div className="text-destructive">Error loading templates: {error.message}</div>;

  const filteredTemplates = templates?.filter((template) =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.category?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleDuplicate = async (template: NonNullable<typeof templates>[0], e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = prompt(`Duplicate "${template.name}" as:`, `${template.name} (Copy)`);
    if (newName) {
      try {
        await duplicateTemplate.mutateAsync({ id: template.id, newName });
        success('Template duplicated successfully');
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to duplicate template');
      }
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Activity Templates</h1>
          <p className="text-muted-foreground mt-1">Reusable activity templates for projects</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Template
        </Button>
      </div>

      {!templates || templates.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={ListChecks}
            message="No activity templates yet"
            description="Create reusable activity templates for your projects"
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
                  <TableHead>Category</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow
                    key={template.id}
                    onClick={() => navigate(`/activity-templates/${template.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>{template.category || '--'}</TableCell>
                    <TableCell>{template.latestVersionName || '--'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleDuplicate(template, e)}
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Duplicate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {showCreateForm && (
        <ActivityTemplateForm
          isOpen={showCreateForm}
          onClose={() => setShowCreateForm(false)}
        />
      )}
    </div>
  );
}
