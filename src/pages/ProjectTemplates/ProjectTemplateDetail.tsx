import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Plus, X } from 'lucide-react';
import {
  useProjectTemplate,
  useUpdateProjectTemplate,
  useDeleteProjectTemplate,
} from '@/hooks/use-project-templates';
import { useActivityTemplates } from '@/hooks/use-activity-templates';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ProjectTemplateForm from './ProjectTemplateForm';

export default function ProjectTemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const templateId = parseInt(id || '0');

  const { data: template, isLoading } = useProjectTemplate(templateId);
  const { data: settings } = useSettings();
  const { data: activityTemplates } = useActivityTemplates();
  const updateTemplate = useUpdateProjectTemplate();
  const deleteTemplate = useDeleteProjectTemplate();

  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Add milestone inline form
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneCategory, setNewMilestoneCategory] = useState('');
  const [customCategoryMode, setCustomCategoryMode] = useState(false);

  // Add activity
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [selectedActivityTemplateId, setSelectedActivityTemplateId] = useState<number | null>(null);

  if (isLoading) return <LoadingSpinner />;
  if (!template) return <div className="text-destructive">Project template not found</div>;

  const categories = settings?.milestoneCategories || [];

  const handleDelete = async () => {
    try {
      await deleteTemplate.mutateAsync(templateId);
      success('Template deleted');
      navigate('/project-templates');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

  const handleAddMilestone = async () => {
    if (!newMilestoneName.trim()) {
      showError('Milestone name is required');
      return;
    }

    const currentMilestones = template.milestones.map((m) => ({
      category: m.category,
      name: m.name,
      sortOrder: m.sortOrder,
    }));

    const maxSort = currentMilestones.reduce((max, m) => Math.max(max, m.sortOrder), -1);

    try {
      await updateTemplate.mutateAsync({
        id: templateId,
        milestones: [
          ...currentMilestones,
          {
            category: newMilestoneCategory || null,
            name: newMilestoneName.trim(),
            sortOrder: maxSort + 1,
          },
        ],
      });
      setNewMilestoneName('');
      setNewMilestoneCategory('');
      setShowAddMilestone(false);
      success('Milestone added');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add milestone');
    }
  };

  const handleRemoveMilestone = async (index: number) => {
    const updatedMilestones = template.milestones
      .filter((_, i) => i !== index)
      .map((m, i) => ({
        category: m.category,
        name: m.name,
        sortOrder: i,
      }));

    try {
      await updateTemplate.mutateAsync({
        id: templateId,
        milestones: updatedMilestones,
      });
      success('Milestone removed');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove milestone');
    }
  };

  const handleAddActivity = async () => {
    if (!selectedActivityTemplateId) {
      showError('Select an activity template');
      return;
    }

    const currentActivities = template.activities.map((a) => ({
      activityTemplateId: a.activityTemplateId,
      sortOrder: a.sortOrder,
    }));

    // Check for duplicate
    if (currentActivities.some((a) => a.activityTemplateId === selectedActivityTemplateId)) {
      showError('This activity template is already attached');
      return;
    }

    const maxSort = currentActivities.reduce((max, a) => Math.max(max, a.sortOrder), -1);

    try {
      await updateTemplate.mutateAsync({
        id: templateId,
        activities: [
          ...currentActivities,
          {
            activityTemplateId: selectedActivityTemplateId,
            sortOrder: maxSort + 1,
          },
        ],
      });
      setSelectedActivityTemplateId(null);
      setShowAddActivity(false);
      success('Activity added');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add activity');
    }
  };

  const handleRemoveActivity = async (index: number) => {
    const updatedActivities = template.activities
      .filter((_, i) => i !== index)
      .map((a, i) => ({
        activityTemplateId: a.activityTemplateId,
        sortOrder: i,
      }));

    try {
      await updateTemplate.mutateAsync({
        id: templateId,
        activities: updatedActivities,
      });
      success('Activity removed');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove activity');
    }
  };

  // Group milestones by their actual category.
  // Settings categories define column order; extra categories get appended.
  const milestonesByCategory = new Map<string, typeof template.milestones>();
  for (const m of template.milestones) {
    const cat = m.category || 'Uncategorized';
    if (!milestonesByCategory.has(cat)) {
      milestonesByCategory.set(cat, []);
    }
    milestonesByCategory.get(cat)!.push(m);
  }

  const orderedMilestoneGroups: [string, typeof template.milestones][] = [];
  for (const cat of categories) {
    if (milestonesByCategory.has(cat)) {
      orderedMilestoneGroups.push([cat, milestonesByCategory.get(cat)!]);
    }
  }
  for (const [cat, items] of milestonesByCategory) {
    if (cat !== 'Uncategorized' && !categories.includes(cat)) {
      orderedMilestoneGroups.push([cat, items]);
    }
  }
  if (milestonesByCategory.has('Uncategorized')) {
    orderedMilestoneGroups.push(['Uncategorized', milestonesByCategory.get('Uncategorized')!]);
  }

  // Available activity templates not yet added
  const attachedIds = new Set(template.activities.map((a) => a.activityTemplateId));
  const availableActivities = activityTemplates?.filter((at) => !attachedIds.has(at.id)) || [];

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/project-templates')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{template.name}</h1>
          {template.description && (
            <p className="text-muted-foreground mt-1">{template.description}</p>
          )}
        </div>
        <Button variant="outline" onClick={() => setShowEditForm(true)}>
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </Button>
        <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </Button>
      </div>

      <div className="space-y-6">
        {/* Milestones Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Milestones ({template.milestones.length})</CardTitle>
            <Button size="sm" onClick={() => setShowAddMilestone(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Milestone
            </Button>
          </CardHeader>
          <CardContent>
            {template.milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No milestones defined yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {orderedMilestoneGroups.map(([category, milestones]) => (
                  <div key={category} className="border rounded-lg p-3">
                    <h4 className="font-medium text-sm mb-2">{category}</h4>
                    <div className="space-y-1">
                      {milestones.map((m) => {
                        const globalIndex = template.milestones.indexOf(m);
                        return (
                          <div
                            key={m.id || globalIndex}
                            className="flex items-center justify-between text-sm py-1"
                          >
                            <span>{m.name}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleRemoveMilestone(globalIndex)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showAddMilestone && (
              <div className="mt-4 border rounded-md p-3 space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      value={newMilestoneName}
                      onChange={(e) => setNewMilestoneName(e.target.value)}
                      placeholder="Milestone name"
                      autoFocus
                    />
                  </div>
                  <div className="w-48">
                    {customCategoryMode ? (
                      <div className="flex gap-1">
                        <Input
                          value={newMilestoneCategory}
                          onChange={(e) => setNewMilestoneCategory(e.target.value)}
                          placeholder="Custom category"
                          autoFocus
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            setCustomCategoryMode(false);
                            setNewMilestoneCategory('');
                          }}
                        >
                          Back
                        </Button>
                      </div>
                    ) : (
                      <select
                        value={newMilestoneCategory}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setCustomCategoryMode(true);
                            setNewMilestoneCategory('');
                          } else {
                            setNewMilestoneCategory(e.target.value);
                          }
                        }}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">No category</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value="__custom__">Custom...</option>
                      </select>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddMilestone} disabled={updateTemplate.isPending}>
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddMilestone(false);
                      setNewMilestoneName('');
                      setNewMilestoneCategory('');
                      setCustomCategoryMode(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activities Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Activities ({template.activities.length})</CardTitle>
            <Button size="sm" onClick={() => setShowAddActivity(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Activity
            </Button>
          </CardHeader>
          <CardContent>
            {template.activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activities attached yet.</p>
            ) : (
              <div className="space-y-2">
                {template.activities.map((activity, index) => (
                  <div
                    key={activity.id || index}
                    className="flex items-center justify-between border rounded-md p-3"
                  >
                    <div>
                      <span className="font-medium">{activity.templateName}</span>
                      {activity.templateCategory && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({activity.templateCategory})
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleRemoveActivity(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {showAddActivity && (
              <div className="mt-4 border rounded-md p-3 space-y-3">
                {availableActivities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All activity templates are already attached.</p>
                ) : (
                  <select
                    value={selectedActivityTemplateId || ''}
                    onChange={(e) => setSelectedActivityTemplateId(Number(e.target.value) || null)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select an activity template...</option>
                    {availableActivities.map((at) => (
                      <option key={at.id} value={at.id}>
                        {at.name}
                        {at.category ? ` (${at.category})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAddActivity}
                    disabled={!selectedActivityTemplateId || updateTemplate.isPending}
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddActivity(false);
                      setSelectedActivityTemplateId(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showEditForm && (
        <ProjectTemplateForm
          isOpen={showEditForm}
          onClose={() => setShowEditForm(false)}
          template={template}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg p-6 max-w-md">
            <h2 className="text-xl font-bold mb-4">Delete Template?</h2>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to delete "{template.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteTemplate.isPending}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
