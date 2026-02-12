import { useState, useEffect } from 'react';
import { useCreateLocationCode, useUpdateLocationCode } from '@/hooks/use-parts';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SupplierLocationCode } from '@shared/types';

interface LocationCodeFormProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: number;
  locationCode?: SupplierLocationCode;
}

export default function LocationCodeForm({ isOpen, onClose, supplierId, locationCode }: LocationCodeFormProps) {
  const { success, error: showError } = useToast();
  const createLocationCode = useCreateLocationCode();
  const updateLocationCode = useUpdateLocationCode();

  const [formData, setFormData] = useState({
    supplierNumber: locationCode?.supplierNumber || '',
    locationCode: locationCode?.locationCode || '',
  });

  useEffect(() => {
    if (locationCode) {
      setFormData({
        supplierNumber: locationCode.supplierNumber,
        locationCode: locationCode.locationCode,
      });
    }
  }, [locationCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.supplierNumber.trim()) {
      showError('Supplier number is required');
      return;
    }
    if (!formData.locationCode.trim()) {
      showError('Location code is required');
      return;
    }

    try {
      if (locationCode) {
        await updateLocationCode.mutateAsync({
          id: locationCode.id,
          supplierId,
          ...formData,
        });
        success('Location code updated successfully');
      } else {
        await createLocationCode.mutateAsync({
          supplierId,
          ...formData,
        });
        success('Location code created successfully');
      }
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save location code');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">
            {locationCode ? 'Edit Location Code' : 'Add Location Code'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="supplierNumber">
                Supplier Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="supplierNumber"
                value={formData.supplierNumber}
                onChange={(e) => setFormData({ ...formData, supplierNumber: e.target.value })}
                placeholder="e.g. SUP-001"
                required
              />
            </div>

            <div>
              <Label htmlFor="locationCode">
                Location Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="locationCode"
                value={formData.locationCode}
                onChange={(e) => setFormData({ ...formData, locationCode: e.target.value })}
                placeholder="e.g. LOC-A1"
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createLocationCode.isPending || updateLocationCode.isPending}
              >
                {locationCode ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
