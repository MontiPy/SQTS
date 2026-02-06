import { useState, useEffect } from 'react';
import { useCreateProject, useUpdateProject } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Project } from '@shared/types';

interface ProjectFormProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project;
}

export default function ProjectForm({ isOpen, onClose, project }: ProjectFormProps) {
  const { success, error: showError } = useToast();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  const [formData, setFormData] = useState({
    name: project?.name || '',
    version: project?.version || '',
    defaultAnchorRule: project?.defaultAnchorRule || '',
  });

  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name,
        version: project.version,
        defaultAnchorRule: project.defaultAnchorRule || '',
      });
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showError('Project name is required');
      return;
    }

    if (!formData.version.trim()) {
      showError('Version is required');
      return;
    }

    try {
      if (project) {
        await updateProject.mutateAsync({ id: project.id, ...formData });
        success('Project updated successfully');
      } else {
        await createProject.mutateAsync(formData);
        success('Project created successfully');
      }
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save project');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">
            {project ? 'Edit Project' : 'Create Project'}
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
                placeholder="MY2027 Program"
                required
              />
            </div>

            <div>
              <Label htmlFor="version">
                Version <span className="text-destructive">*</span>
              </Label>
              <Input
                id="version"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="v1.0"
                required
              />
            </div>

            <div>
              <Label htmlFor="defaultAnchorRule">Default Anchor Rule</Label>
              <Input
                id="defaultAnchorRule"
                value={formData.defaultAnchorRule}
                onChange={(e) => setFormData({ ...formData, defaultAnchorRule: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createProject.isPending || updateProject.isPending}>
                {project ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
