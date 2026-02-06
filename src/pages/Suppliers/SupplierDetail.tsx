import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2 } from 'lucide-react';
import { useSupplier, useDeleteSupplier } from '@/hooks/use-suppliers';
import { useSupplierProjects } from '@/hooks/use-supplier-instances';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SupplierForm from './SupplierForm';

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const supplierId = parseInt(id || '0');

  const { data: supplier, isLoading } = useSupplier(supplierId);
  const { data: supplierProjects } = useSupplierProjects(supplierId);
  const deleteSupplier = useDeleteSupplier();

  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (!supplier) return <div className="text-destructive">Supplier not found</div>;

  const handleDelete = async () => {
    try {
      await deleteSupplier.mutateAsync(supplierId);
      success('Supplier deleted successfully');
      navigate('/suppliers');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete supplier');
    }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/suppliers')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{supplier.name}</h1>
          {supplier.nmrRank && (
            <p className="text-muted-foreground mt-1">NMR Rank: {supplier.nmrRank}</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Name:</span>
              <p className="font-medium">{supplier.contactName || '--'}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Email:</span>
              <p className="font-medium">{supplier.contactEmail || '--'}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Phone:</span>
              <p className="font-medium">{supplier.contactPhone || '--'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{supplier.notes || 'No notes available'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {!supplierProjects || supplierProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects assigned to this supplier yet.</p>
          ) : (
            <div className="space-y-2">
              {supplierProjects.map((sp) => (
                <div
                  key={sp.id}
                  className="flex items-center justify-between p-3 border rounded-md hover:bg-accent cursor-pointer"
                  onClick={() => navigate(`/supplier-projects/${sp.id}`)}
                >
                  <div>
                    <p className="font-medium">Project ID: {sp.projectId}</p>
                    <p className="text-sm text-muted-foreground">Version: {sp.projectVersion}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showEditForm && (
        <SupplierForm
          isOpen={showEditForm}
          onClose={() => setShowEditForm(false)}
          supplier={supplier}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg p-6 max-w-md">
            <h2 className="text-xl font-bold mb-4">Delete Supplier?</h2>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to delete "{supplier.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteSupplier.isPending}
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
