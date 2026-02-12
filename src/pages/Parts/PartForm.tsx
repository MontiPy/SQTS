import { useState, useEffect } from 'react';
import { useCreatePart, useUpdatePart, useLocationCodes } from '@/hooks/use-parts';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Part } from '@shared/types';

interface PartFormProps {
  isOpen: boolean;
  onClose: () => void;
  supplierProjectId: number;
  supplierId: number;
  part?: Part;
}

export default function PartForm({ isOpen, onClose, supplierProjectId, supplierId, part }: PartFormProps) {
  const { success, error: showError } = useToast();
  const createPart = useCreatePart();
  const updatePart = useUpdatePart();
  const { data: settings } = useSettings();
  const { data: locationCodes } = useLocationCodes(supplierId);

  const [formData, setFormData] = useState({
    partNumber: part?.partNumber || '',
    description: part?.description || '',
    paRank: part?.paRank || '',
    locationCodeId: part?.locationCodeId?.toString() || '',
  });

  useEffect(() => {
    if (part) {
      setFormData({
        partNumber: part.partNumber,
        description: part.description || '',
        paRank: part.paRank || '',
        locationCodeId: part.locationCodeId?.toString() || '',
      });
    }
  }, [part]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.partNumber.trim()) {
      showError('Part number is required');
      return;
    }

    try {
      const payload = {
        partNumber: formData.partNumber,
        description: formData.description || null,
        paRank: formData.paRank || null,
        locationCodeId: formData.locationCodeId ? parseInt(formData.locationCodeId) : null,
      };

      if (part) {
        await updatePart.mutateAsync({
          id: part.id,
          supplierProjectId,
          ...payload,
        });
        success('Part updated successfully');
      } else {
        await createPart.mutateAsync({
          supplierProjectId,
          ...payload,
        });
        success('Part created successfully');
      }
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save part');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">
            {part ? 'Edit Part' : 'Add Part'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="partNumber">
                Part Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="partNumber"
                value={formData.partNumber}
                onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })}
                placeholder="e.g. PN-12345"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Part description..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="paRank">PA Rank</Label>
              <select
                id="paRank"
                value={formData.paRank}
                onChange={(e) => setFormData({ ...formData, paRank: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">-- None --</option>
                {settings?.paRanks?.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="locationCodeId">Location Code</Label>
              <select
                id="locationCodeId"
                value={formData.locationCodeId}
                onChange={(e) => setFormData({ ...formData, locationCodeId: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">-- None --</option>
                {locationCodes?.map((lc) => (
                  <option key={lc.id} value={lc.id}>
                    {lc.locationCode} ({lc.supplierNumber})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createPart.isPending || updatePart.isPending}
              >
                {part ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
