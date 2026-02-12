import { useState, useEffect } from 'react';
import { useCreateProjectTemplate, useUpdateProjectTemplate } from '@/hooks/use-project-templates';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProjectTemplate } from '@shared/types';

interface ProjectTemplateFormProps {
  isOpen: boolean;
  onClose: () => void;
  template?: ProjectTemplate;
  onCreated?: (template: ProjectTemplate) => void;
}

export default function ProjectTemplateForm({ isOpen, onClose, template, onCreated }: ProjectTemplateFormProps) {
  const { success, error: showError } = useToast();
  const createTemplate = useCreateProjectTemplate();
  const updateTemplate = useUpdateProjectTemplate();

  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');

  useEffect(() => {
    setName(template?.name || '');
    setDescription(template?.description || '');
  }, [template]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showError('Template name is required');
      return;
    }

    try {
      if (template) {
        await updateTemplate.mutateAsync({
          id: template.id,
          name: name.trim(),
          description: description.trim() || null,
        });
        success('Template updated');
      } else {
        const created = await createTemplate.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
        });
        success('Template created');
        onCreated?.(created);
      }
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">
            {template ? 'Edit Template' : 'Create Project Template'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="templateName">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="templateName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard Automotive"
                required
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor="templateDesc">Description</Label>
              <Input
                id="templateDesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTemplate.isPending || updateTemplate.isPending}
              >
                {template ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
