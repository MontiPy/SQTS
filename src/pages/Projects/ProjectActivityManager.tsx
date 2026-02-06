import { useState } from 'react';
import { Plus, Trash2, Check, Library } from 'lucide-react';
import { useActivityTemplates } from '@/hooks/use-activity-templates';
import { useProjectActivities, useAddProjectActivity, useRemoveProjectActivity } from '@/hooks/use-project-activities';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';

interface ProjectActivityManagerProps {
  projectId: number;
}

export default function ProjectActivityManager({ projectId }: ProjectActivityManagerProps) {
  const { success, error: showError } = useToast();
  const { data: projectActivities, isLoading: loadingActivities } = useProjectActivities(projectId);
  const { data: allTemplates, isLoading: loadingTemplates } = useActivityTemplates();
  const addActivity = useAddProjectActivity();
  const removeActivity = useRemoveProjectActivity();

  const [showAddPanel, setShowAddPanel] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  const addedTemplateIds = new Set(projectActivities?.map(a => a.activityTemplateId) || []);

  const availableTemplates = allTemplates?.filter(t => !addedTemplateIds.has(t.id)) || [];

  const handleAdd = async (activityTemplateId: number) => {
    try {
      await addActivity.mutateAsync({ projectId, activityTemplateId });
      success('Activity added to project');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add activity');
    }
  };

  const handleRemove = async (projectActivityId: number) => {
    try {
      await removeActivity.mutateAsync({ projectActivityId, projectId });
      success('Activity removed from project');
      setConfirmRemoveId(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove activity');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Activities</CardTitle>
        <Button size="sm" onClick={() => setShowAddPanel(!showAddPanel)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Activity
        </Button>
      </CardHeader>
      <CardContent>
        {showAddPanel && (
          <div className="mb-4 border rounded-lg p-4 bg-muted/30">
            <h4 className="text-sm font-medium mb-3">Activity Template Library</h4>
            {loadingTemplates ? (
              <p className="text-sm text-muted-foreground">Loading templates...</p>
            ) : availableTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {allTemplates?.length === 0
                  ? 'No activity templates exist. Create templates first.'
                  : 'All available templates have been added to this project.'}
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableTemplates.map(template => (
                  <div
                    key={template.id}
                    className="flex items-center justify-between p-2 rounded border bg-background hover:bg-accent/50"
                  >
                    <div>
                      <span className="font-medium text-sm">{template.name}</span>
                      {template.category && (
                        <span className="ml-2 text-xs text-muted-foreground">({template.category})</span>
                      )}
                      {template.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdd(template.id)}
                      disabled={addActivity.isPending}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loadingActivities ? (
          <p className="text-sm text-muted-foreground">Loading activities...</p>
        ) : !projectActivities || projectActivities.length === 0 ? (
          <EmptyState
            icon={Library}
            message="No activities added to this project yet"
            actionLabel="Add Activity"
            onAction={() => setShowAddPanel(true)}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activity</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Schedule Items</TableHead>
                <TableHead className="text-center">Template Version</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectActivities.map(activity => (
                <TableRow key={activity.id}>
                  <TableCell className="font-medium">{activity.templateName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {activity.templateCategory || '--'}
                  </TableCell>
                  <TableCell className="text-center">{activity.scheduleItemCount}</TableCell>
                  <TableCell className="text-center">v{activity.templateVersion}</TableCell>
                  <TableCell>
                    {confirmRemoveId === activity.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemove(activity.id)}
                          disabled={removeActivity.isPending}
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmRemoveId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmRemoveId(activity.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
