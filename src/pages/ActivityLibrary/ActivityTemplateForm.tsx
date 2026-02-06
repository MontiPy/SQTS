import { useState, useEffect } from 'react';
import { useCreateActivityTemplate, useUpdateActivityTemplate } from '@/hooks/use-activity-templates';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ActivityTemplate } from '@shared/types';

interface ActivityTemplateFormProps {
  isOpen: boolean;
  onClose: () => void;
  template?: ActivityTemplate;
}

export default function ActivityTemplateForm({ isOpen, onClose, template }: ActivityTemplateFormProps) {
  const { success, error: showError } = useToast();
  const createTemplate = useCreateActivityTemplate();
  const updateTemplate = useUpdateActivityTemplate();

  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    category: template?.category || '',
  });

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description || '',
        category: template.category || '',
      });
    }
  }, [template]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showError('Template name is required');
      return;
    }

    try {
      if (template) {
        await updateTemplate.mutateAsync({ id: template.id, ...formData });
        success('Template updated successfully');
      } else {
        await createTemplate.mutateAsync(formData);
        success('Template created successfully');
      }
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">
            {template ? 'Edit Template' : 'Create Template'}
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
                placeholder="PPAP Submission, Tool Readiness, etc."
                required
              />
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Quality, Tooling, Process, etc."
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe this activity template..."
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTemplate.isPending || updateTemplate.isPending}>
                {template ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
