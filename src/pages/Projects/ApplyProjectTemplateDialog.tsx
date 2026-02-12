import { useState } from 'react';
import { useProjectTemplates, useProjectTemplate, useApplyProjectTemplate } from '@/hooks/use-project-templates';
import { useMilestones } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Check, FileStack } from 'lucide-react';

interface ApplyProjectTemplateDialogProps {
  projectId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function ApplyProjectTemplateDialog({
  projectId,
  isOpen,
  onClose,
}: ApplyProjectTemplateDialogProps) {
  const { data: templates, isLoading } = useProjectTemplates();
  const { data: milestones } = useMilestones(projectId);
  const applyTemplate = useApplyProjectTemplate();
  const { success, error: showError } = useToast();

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [result, setResult] = useState<{
    milestonesAdded: number;
    milestonesSkipped: number;
    activitiesAdded: number;
    activitiesSkipped: number;
  } | null>(null);

  if (!isOpen) return null;

  const existingMilestoneNames = new Set((milestones || []).map((m) => m.name.toLowerCase()));

  const handleApply = async () => {
    if (!selectedTemplateId) return;

    try {
      const res = await applyTemplate.mutateAsync({
        projectTemplateId: selectedTemplateId,
        projectId,
      });
      setResult(res);
      if (res.milestonesAdded > 0 || res.activitiesAdded > 0) {
        success(`Added ${res.milestonesAdded} milestones and ${res.activitiesAdded} activities`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to apply template');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold mb-4">Apply Project Template</h2>

        {isLoading ? (
          <LoadingSpinner />
        ) : !templates || templates.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-4">
            No project templates available. Create templates in the Project Templates section first.
          </p>
        ) : (
          <>
            <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
              {templates.map((template) => (
                <TemplatePreviewCard
                  key={template.id}
                  templateId={template.id}
                  name={template.name}
                  description={template.description}
                  milestoneCount={template.milestoneCount}
                  activityCount={template.activityCount}
                  isSelected={selectedTemplateId === template.id}
                  existingMilestoneNames={existingMilestoneNames}
                  onSelect={() => {
                    setSelectedTemplateId(template.id);
                    setResult(null);
                  }}
                />
              ))}
            </div>

            {result && (
              <div className="mb-4 p-3 rounded-md bg-muted text-sm">
                <Check className="w-4 h-4 inline mr-1" />
                {result.milestonesAdded} milestone{result.milestonesAdded !== 1 ? 's' : ''} added
                {result.milestonesSkipped > 0 && ` (${result.milestonesSkipped} already existed)`},
                {' '}{result.activitiesAdded} activit{result.activitiesAdded !== 1 ? 'ies' : 'y'} added
                {result.activitiesSkipped > 0 && ` (${result.activitiesSkipped} already existed)`}
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {templates && templates.length > 0 && !result && (
            <Button
              onClick={handleApply}
              disabled={!selectedTemplateId || applyTemplate.isPending}
            >
              {applyTemplate.isPending ? (
                'Applying...'
              ) : (
                <>
                  <FileStack className="w-4 h-4 mr-2" />
                  Apply
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplatePreviewCard({
  templateId,
  name,
  description,
  milestoneCount,
  activityCount,
  isSelected,
  existingMilestoneNames,
  onSelect,
}: {
  templateId: number;
  name: string;
  description: string | null;
  milestoneCount: number;
  activityCount: number;
  isSelected: boolean;
  existingMilestoneNames: Set<string>;
  onSelect: () => void;
}) {
  const { data: detail } = useProjectTemplate(isSelected ? templateId : 0);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-md border transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">
          {milestoneCount} milestone{milestoneCount !== 1 ? 's' : ''}, {activityCount} activit{activityCount !== 1 ? 'ies' : 'y'}
        </span>
      </div>
      {description && (
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      )}
      {isSelected && detail && (
        <div className="mt-2 space-y-1">
          {detail.milestones.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Milestones: </span>
              {detail.milestones.map((m, i) => {
                const exists = existingMilestoneNames.has(m.name.toLowerCase());
                return (
                  <span key={i} className={exists ? 'line-through opacity-50' : ''}>
                    {i > 0 ? ', ' : ''}
                    {m.name}
                    {m.category ? ` [${m.category}]` : ''}
                    {exists ? ' (exists)' : ''}
                  </span>
                );
              })}
            </div>
          )}
          {detail.activities.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Activities: </span>
              {detail.activities.map((a, i) => (
                <span key={i}>
                  {i > 0 ? ', ' : ''}
                  {a.templateName}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </button>
  );
}
