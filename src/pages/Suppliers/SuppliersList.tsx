import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search } from 'lucide-react';
import { useSuppliers } from '@/hooks/use-suppliers';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import SupplierForm from './SupplierForm';

export default function SuppliersList() {
  const navigate = useNavigate();
  const { data: suppliers, isLoading, error } = useSuppliers();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div className="text-destructive">Error loading suppliers: {error.message}</div>;

  const filteredSuppliers = suppliers?.filter((supplier) =>
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Suppliers</h1>
          <p className="text-muted-foreground mt-1">Manage supplier information and contacts</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {!suppliers || suppliers.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={Users}
            message="No suppliers yet"
            description="Get started by adding your first supplier"
            actionLabel="Add Supplier"
            onAction={() => setShowCreateForm(true)}
          />
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                type="text"
                placeholder="Search suppliers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact Name</TableHead>
                  <TableHead>Contact Email</TableHead>
                  <TableHead>Contact Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((supplier) => (
                  <TableRow
                    key={supplier.id}
                    onClick={() => navigate(`/suppliers/${supplier.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>{supplier.contactName || '--'}</TableCell>
                    <TableCell>{supplier.contactEmail || '--'}</TableCell>
                    <TableCell>{supplier.contactPhone || '--'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {showCreateForm && (
        <SupplierForm
          isOpen={showCreateForm}
          onClose={() => setShowCreateForm(false)}
        />
      )}
    </div>
  );
}
