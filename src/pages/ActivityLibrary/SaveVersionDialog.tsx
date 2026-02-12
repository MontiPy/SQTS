import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSaveTemplateVersion } from '@/hooks/use-template-versions';
import { useToast } from '@/hooks/use-toast';

interface SaveVersionDialogProps {
  templateId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function SaveVersionDialog({ templateId, isOpen, onClose }: SaveVersionDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const saveVersion = useSaveTemplateVersion();
  const { success, error: showError } = useToast();

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      showError('Version name is required');
      return;
    }

    try {
      await saveVersion.mutateAsync({
        activityTemplateId: templateId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      success('Version saved successfully');
      setName('');
      setDescription('');
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save version');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Save Named Version</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Save a snapshot of the current template state that you can restore later.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="version-name">Name *</Label>
            <Input
              id="version-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. v1 - Initial setup"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="version-description">Description</Label>
            <Textarea
              id="version-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this version"
              rows={3}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveVersion.isPending || !name.trim()}>
            {saveVersion.isPending ? 'Saving...' : 'Save Version'}
          </Button>
        </div>
      </div>
    </div>
  );
}
