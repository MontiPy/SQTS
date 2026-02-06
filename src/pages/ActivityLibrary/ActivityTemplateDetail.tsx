import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Plus } from 'lucide-react';
import {
  useActivityTemplate,
  useDeleteActivityTemplate,
  useTemplateScheduleItems,
  useCreateTemplateScheduleItem,
  useUpdateTemplateScheduleItem,
  useDeleteTemplateScheduleItem,
} from '@/hooks/use-activity-templates';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ActivityTemplateForm from './ActivityTemplateForm';
import type { ActivityTemplateScheduleItem, AnchorType, ScheduleItemKind } from '@shared/types';

export default function ActivityTemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const templateId = parseInt(id || '0');

  const { data: template, isLoading } = useActivityTemplate(templateId);
  const { data: scheduleItems } = useTemplateScheduleItems(templateId);
  const deleteTemplate = useDeleteActivityTemplate();
  const createItem = useCreateTemplateScheduleItem();
  const updateItem = useUpdateTemplateScheduleItem();
  const deleteItem = useDeleteTemplateScheduleItem();

  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newItem, setNewItem] = useState<Partial<ActivityTemplateScheduleItem> | null>(null);

  if (isLoading) return <LoadingSpinner />;
  if (!template) return <div className="text-destructive">Template not found</div>;

  const handleDelete = async () => {
    try {
      await deleteTemplate.mutateAsync(templateId);
      success('Template deleted successfully');
      navigate('/activity-templates');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

  const handleAddItem = () => {
    const maxSort = scheduleItems?.reduce((max, item) => Math.max(max, item.sortOrder), 0) || 0;
    setNewItem({
      kind: 'TASK',
      name: '',
      anchorType: 'FIXED_DATE',
      sortOrder: maxSort + 1,
    });
  };

  const handleSaveNewItem = async () => {
    if (!newItem || !newItem.name?.trim()) {
      showError('Item name is required');
      return;
    }

    try {
      await createItem.mutateAsync({
        activityTemplateId: templateId,
        kind: newItem.kind as ScheduleItemKind,
        name: newItem.name,
        anchorType: newItem.anchorType as AnchorType,
        anchorRefId: newItem.anchorRefId || null,
        offsetDays: newItem.offsetDays || null,
        fixedDate: newItem.fixedDate || null,
        sortOrder: newItem.sortOrder || 0,
      });
      success('Schedule item created successfully');
      setNewItem(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create schedule item');
    }
  };

  const handleUpdateItem = async (item: ActivityTemplateScheduleItem) => {
    try {
      await updateItem.mutateAsync(item);
      success('Schedule item updated successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update schedule item');
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm('Delete this schedule item?')) return;
    try {
      await deleteItem.mutateAsync({ id: itemId, templateId });
      success('Schedule item deleted successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete schedule item');
    }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/activity-templates')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{template.name}</h1>
          <p className="text-muted-foreground mt-1">
            Version {template.version} • {template.category || 'Uncategorized'}
          </p>
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

      {template.description && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <p className="text-sm">{template.description}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Schedule Items</CardTitle>
          <Button size="sm" onClick={handleAddItem}>
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </CardHeader>
        <CardContent>
          {!scheduleItems || scheduleItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schedule items defined yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Anchor Type</TableHead>
                    <TableHead>Offset Days</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduleItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.sortOrder}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded ${
                          item.kind === 'MILESTONE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {item.kind}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-sm">{item.anchorType}</TableCell>
                      <TableCell className="text-sm">{item.offsetDays || '--'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleUpdateItem(item)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteItem(item.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {newItem && (
                    <TableRow>
                      <TableCell>
                        <Input
                          type="number"
                          value={newItem.sortOrder || ''}
                          onChange={(e) => setNewItem({ ...newItem, sortOrder: parseInt(e.target.value) })}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={newItem.kind || 'TASK'}
                          onChange={(e) => setNewItem({ ...newItem, kind: e.target.value as ScheduleItemKind })}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        >
                          <option value="TASK">TASK</option>
                          <option value="MILESTONE">MILESTONE</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={newItem.name || ''}
                          onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                          placeholder="Item name"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={newItem.anchorType || 'FIXED_DATE'}
                          onChange={(e) => setNewItem({ ...newItem, anchorType: e.target.value as AnchorType })}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        >
                          <option value="FIXED_DATE">FIXED_DATE</option>
                          <option value="SCHEDULE_ITEM">SCHEDULE_ITEM</option>
                          <option value="COMPLETION">COMPLETION</option>
                          <option value="PROJECT_MILESTONE">PROJECT_MILESTONE</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={newItem.offsetDays || ''}
                          onChange={(e) => setNewItem({ ...newItem, offsetDays: parseInt(e.target.value) })}
                          placeholder="0"
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveNewItem}>Save</Button>
                          <Button variant="outline" size="sm" onClick={() => setNewItem(null)}>Cancel</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showEditForm && (
        <ActivityTemplateForm
          isOpen={showEditForm}
          onClose={() => setShowEditForm(false)}
          template={template}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg p-6 max-w-md">
            <h2 className="text-xl font-bold mb-4">Delete Template?</h2>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to delete "{template.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteTemplate.isPending}
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
