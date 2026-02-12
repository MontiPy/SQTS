import { useState, useEffect } from 'react';
import { useCreateMilestone, useUpdateMilestone, useDeleteMilestone, useMilestones } from '@/hooks/use-projects';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2 } from 'lucide-react';
import type { ProjectMilestone } from '@shared/types';

interface MilestoneEditorProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  milestone?: ProjectMilestone;
}

export default function MilestoneEditor({ isOpen, onClose, projectId, milestone }: MilestoneEditorProps) {
  const { success, error: showError } = useToast();
  const { data: milestones } = useMilestones(projectId);
  const { data: settings } = useSettings();
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const deleteMilestone = useDeleteMilestone();

  const categories = settings?.milestoneCategories || [];

  const [formData, setFormData] = useState({
    name: milestone?.name || '',
    date: milestone?.date || '',
    category: milestone?.category || '',
  });

  // Track whether the user is typing a custom category
  const [customCategoryMode, setCustomCategoryMode] = useState(
    () => !!(milestone?.category && !categories.includes(milestone.category))
  );

  useEffect(() => {
    setFormData({
      name: milestone?.name || '',
      date: milestone?.date || '',
      category: milestone?.category || '',
    });
    setCustomCategoryMode(!!(milestone?.category && !categories.includes(milestone.category)));
  }, [milestone, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showError('Milestone name is required');
      return;
    }

    try {
      if (milestone) {
        await updateMilestone.mutateAsync({
          id: milestone.id,
          name: formData.name,
          date: formData.date || null,
          category: formData.category.trim() || null,
        });
        success('Milestone updated successfully');
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        const maxSort = milestones?.reduce((max, m) => Math.max(max, m.sortOrder), 0) || 0;
        await createMilestone.mutateAsync({
          projectId,
          name: formData.name,
          date: formData.date || null,
          category: formData.category.trim() || null,
          sortOrder: maxSort + 1,
        });
        success('Milestone created successfully');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save milestone');
    }
  };

  const handleDelete = async () => {
    if (!milestone) return;
    try {
      await deleteMilestone.mutateAsync({ id: milestone.id, projectId });
      success('Milestone deleted successfully');
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete milestone');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">
            {milestone ? 'Edit Milestone' : 'Add Milestone'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="PA3, SOP, etc."
                required
              />
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              {customCategoryMode ? (
                <div className="flex gap-2">
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Custom category name"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setCustomCategoryMode(false);
                      setFormData({ ...formData, category: '' });
                    }}
                  >
                    Back
                  </Button>
                </div>
              ) : (
                <select
                  id="category"
                  value={formData.category}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setCustomCategoryMode(true);
                      setFormData({ ...formData, category: '' });
                    } else {
                      setFormData({ ...formData, category: e.target.value });
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

            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            <div className="flex justify-between pt-4">
              {milestone && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteMilestone.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              )}
              <div className="flex gap-3 ml-auto">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMilestone.isPending || updateMilestone.isPending}>
                  {milestone ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
