import { useState, useEffect } from 'react';
import { useCreateMilestone, useUpdateMilestone, useDeleteMilestone, useMilestones } from '@/hooks/use-projects';
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
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const deleteMilestone = useDeleteMilestone();

  const [formData, setFormData] = useState({
    name: milestone?.name || '',
    date: milestone?.date || '',
  });

  useEffect(() => {
    setFormData({
      name: milestone?.name || '',
      date: milestone?.date || '',
    });
  }, [milestone]);

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
        });
        success('Milestone updated successfully');
        // Wait a tick for cache invalidation to propagate
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        const maxSort = milestones?.reduce((max, m) => Math.max(max, m.sortOrder), 0) || 0;
        await createMilestone.mutateAsync({
          projectId,
          name: formData.name,
          date: formData.date || null,
          sortOrder: maxSort + 1,
        });
        success('Milestone created successfully');
        // Wait a tick for cache invalidation to propagate
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
