import { useState } from 'react';
import { Package, Plus, Edit, Trash2, MapPin } from 'lucide-react';
import { useSuppliers } from '@/hooks/use-suppliers';
import { useProjects } from '@/hooks/use-projects';
import { useSupplierProjects } from '@/hooks/use-supplier-instances';
import { useLocationCodes, useDeleteLocationCode, useParts, useDeletePart } from '@/hooks/use-parts';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LocationCodeForm from './LocationCodeForm';
import PartForm from './PartForm';
import type { SupplierLocationCode, Part } from '@shared/types';

export default function PartsPage() {
  const { success, error: showError } = useToast();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();
  const { data: projects, isLoading: projectsLoading } = useProjects();

  // Location Codes section state
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | undefined>();
  const [showLocationCodeForm, setShowLocationCodeForm] = useState(false);
  const [editingLocationCode, setEditingLocationCode] = useState<SupplierLocationCode | undefined>();
  const [deletingLocationCodeId, setDeletingLocationCodeId] = useState<number | null>(null);

  // Parts section state
  const [partsSupplierId, setPartsSupplierId] = useState<number | undefined>();
  const [partsProjectId, setPartsProjectId] = useState<number | undefined>();
  const [showPartForm, setShowPartForm] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | undefined>();
  const [deletingPartId, setDeletingPartId] = useState<number | null>(null);

  // Queries
  const { data: locationCodes, isLoading: codesLoading } = useLocationCodes(selectedSupplierId);
  const deleteLocationCode = useDeleteLocationCode();

  const { data: supplierProjects } = useSupplierProjects(partsSupplierId);
  const selectedSupplierProject = supplierProjects?.find(
    (sp) => sp.projectId === partsProjectId
  );
  const { data: parts, isLoading: partsLoading } = useParts(selectedSupplierProject?.id);
  const deletePart = useDeletePart();

  if (suppliersLoading || projectsLoading) return <LoadingSpinner />;

  const handleDeleteLocationCode = async (id: number) => {
    try {
      await deleteLocationCode.mutateAsync({ id, supplierId: selectedSupplierId! });
      success('Location code deleted successfully');
      setDeletingLocationCodeId(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete location code');
    }
  };

  const handleDeletePart = async (id: number) => {
    try {
      await deletePart.mutateAsync({ id, supplierProjectId: selectedSupplierProject!.id });
      success('Part deleted successfully');
      setDeletingPartId(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete part');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Parts & Location Codes</h1>
        <p className="text-muted-foreground mt-1">
          Manage supplier location codes and parts for supplier-project assignments
        </p>
      </div>

      {/* ========================================== */}
      {/* Location Codes Section */}
      {/* ========================================== */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Location Codes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="supplierSelect">Supplier</Label>
            <select
              id="supplierSelect"
              value={selectedSupplierId || ''}
              onChange={(e) => setSelectedSupplierId(e.target.value ? parseInt(e.target.value) : undefined)}
              className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">-- Select a supplier --</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {!selectedSupplierId ? (
            <EmptyState
              icon={MapPin}
              message="Select a supplier"
              description="Choose a supplier above to view and manage their location codes"
            />
          ) : codesLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <Button onClick={() => { setEditingLocationCode(undefined); setShowLocationCodeForm(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Location Code
                </Button>
              </div>

              {!locationCodes || locationCodes.length === 0 ? (
                <EmptyState
                  icon={MapPin}
                  message="No location codes"
                  description="Add location codes for this supplier"
                  actionLabel="Add Location Code"
                  onAction={() => { setEditingLocationCode(undefined); setShowLocationCodeForm(true); }}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier Number</TableHead>
                      <TableHead>Location Code</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locationCodes.map((lc) => (
                      <TableRow key={lc.id}>
                        <TableCell className="font-medium">{lc.supplierNumber}</TableCell>
                        <TableCell>{lc.locationCode}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setEditingLocationCode(lc); setShowLocationCodeForm(true); }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingLocationCodeId(lc.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ========================================== */}
      {/* Parts Section */}
      {/* ========================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Parts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <Label htmlFor="partsSupplierSelect">Supplier</Label>
              <select
                id="partsSupplierSelect"
                value={partsSupplierId || ''}
                onChange={(e) => {
                  setPartsSupplierId(e.target.value ? parseInt(e.target.value) : undefined);
                  setPartsProjectId(undefined);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">-- Select a supplier --</option>
                {suppliers?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <Label htmlFor="partsProjectSelect">Project</Label>
              <select
                id="partsProjectSelect"
                value={partsProjectId || ''}
                onChange={(e) => setPartsProjectId(e.target.value ? parseInt(e.target.value) : undefined)}
                disabled={!partsSupplierId}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <option value="">-- Select a project --</option>
                {supplierProjects?.map((sp) => {
                  const project = projects?.find((p) => p.id === sp.projectId);
                  return (
                    <option key={sp.projectId} value={sp.projectId}>
                      {project?.name || `Project ${sp.projectId}`} (v{sp.projectVersion})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {!partsSupplierId || !partsProjectId ? (
            <EmptyState
              icon={Package}
              message="Select a supplier and project"
              description="Choose a supplier and project above to view and manage parts"
            />
          ) : !selectedSupplierProject ? (
            <EmptyState
              icon={Package}
              message="No supplier-project assignment found"
              description="This supplier has not been assigned to the selected project"
            />
          ) : partsLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <Button onClick={() => { setEditingPart(undefined); setShowPartForm(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Part
                </Button>
              </div>

              {!parts || parts.length === 0 ? (
                <EmptyState
                  icon={Package}
                  message="No parts"
                  description="Add parts for this supplier-project"
                  actionLabel="Add Part"
                  onAction={() => { setEditingPart(undefined); setShowPartForm(true); }}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>PA Rank</TableHead>
                      <TableHead>Location Code</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parts.map((part) => (
                      <TableRow key={part.id}>
                        <TableCell className="font-medium">{part.partNumber}</TableCell>
                        <TableCell>{part.description || '--'}</TableCell>
                        <TableCell>{part.paRank || '--'}</TableCell>
                        <TableCell>{part.locationCode || '--'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setEditingPart(part); setShowPartForm(true); }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingPartId(part.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ========================================== */}
      {/* Modals */}
      {/* ========================================== */}

      {showLocationCodeForm && selectedSupplierId && (
        <LocationCodeForm
          isOpen={showLocationCodeForm}
          onClose={() => { setShowLocationCodeForm(false); setEditingLocationCode(undefined); }}
          supplierId={selectedSupplierId}
          locationCode={editingLocationCode}
        />
      )}

      {showPartForm && selectedSupplierProject && partsSupplierId && (
        <PartForm
          isOpen={showPartForm}
          onClose={() => { setShowPartForm(false); setEditingPart(undefined); }}
          supplierProjectId={selectedSupplierProject.id}
          supplierId={partsSupplierId}
          part={editingPart}
        />
      )}

      {deletingLocationCodeId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg p-6 max-w-md">
            <h2 className="text-xl font-bold mb-4">Delete Location Code?</h2>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to delete this location code? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeletingLocationCodeId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDeleteLocationCode(deletingLocationCodeId)}
                disabled={deleteLocationCode.isPending}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {deletingPartId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg p-6 max-w-md">
            <h2 className="text-xl font-bold mb-4">Delete Part?</h2>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to delete this part? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeletingPartId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDeletePart(deletingPartId)}
                disabled={deletePart.isPending}
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
