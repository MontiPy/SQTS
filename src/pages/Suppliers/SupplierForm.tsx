import { useState, useEffect } from 'react';
import { useCreateSupplier, useUpdateSupplier } from '@/hooks/use-suppliers';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Supplier } from '@shared/types';

interface SupplierFormProps {
  isOpen: boolean;
  onClose: () => void;
  supplier?: Supplier;
}

export default function SupplierForm({ isOpen, onClose, supplier }: SupplierFormProps) {
  const { success, error: showError } = useToast();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();

  const [formData, setFormData] = useState({
    name: supplier?.name || '',
    notes: supplier?.notes || '',
    contactName: supplier?.contactName || '',
    contactEmail: supplier?.contactEmail || '',
    contactPhone: supplier?.contactPhone || '',
  });

  useEffect(() => {
    if (supplier) {
      setFormData({
        name: supplier.name,
        notes: supplier.notes || '',
        contactName: supplier.contactName || '',
        contactEmail: supplier.contactEmail || '',
        contactPhone: supplier.contactPhone || '',
      });
    }
  }, [supplier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showError('Supplier name is required');
      return;
    }

    try {
      if (supplier) {
        await updateSupplier.mutateAsync({ id: supplier.id, ...formData });
        success('Supplier updated successfully');
      } else {
        await createSupplier.mutateAsync(formData);
        success('Supplier created successfully');
      }
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save supplier');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">
            {supplier ? 'Edit Supplier' : 'Add Supplier'}
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
                placeholder="Supplier name"
                required
              />
            </div>

            <div>
              <Label htmlFor="contactName">Contact Name</Label>
              <Input
                id="contactName"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                placeholder="Contact person name"
              />
            </div>

            <div>
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                placeholder="contact@supplier.com"
              />
            </div>

            <div>
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input
                id="contactPhone"
                type="tel"
                value={formData.contactPhone}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSupplier.isPending || updateSupplier.isPending}>
                {supplier ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
