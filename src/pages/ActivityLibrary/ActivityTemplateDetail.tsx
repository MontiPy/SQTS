import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Plus, Save, History, Send, RefreshCw } from 'lucide-react';
import {
  useActivityTemplate,
  useDeleteActivityTemplate,
  useTemplateScheduleItems,
  useCreateTemplateScheduleItem,
  useUpdateTemplateScheduleItem,
  useDeleteTemplateScheduleItem,
} from '@/hooks/use-activity-templates';
import { useTemplateVersions } from '@/hooks/use-template-versions';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ActivityTemplateForm from './ActivityTemplateForm';
import SaveVersionDialog from './SaveVersionDialog';
import VersionHistoryPanel from './VersionHistoryPanel';
import ApplyToProjectsDialog from './ApplyToProjectsDialog';
import SyncAllProjectsDialog from './SyncAllProjectsDialog';
import type { ActivityTemplateScheduleItem, AnchorType, ScheduleItemKind } from '@shared/types';

export default function ActivityTemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const templateId = parseInt(id || '0');

  const { data: template, isLoading } = useActivityTemplate(templateId);
  const { data: scheduleItems } = useTemplateScheduleItems(templateId);
  const { data: versions } = useTemplateVersions(templateId);
  const latestVersion = versions?.[0];
  const deleteTemplate = useDeleteActivityTemplate();
  const createItem = useCreateTemplateScheduleItem();
  const updateItem = useUpdateTemplateScheduleItem();
  const deleteItem = useDeleteTemplateScheduleItem();

  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSaveVersion, setShowSaveVersion] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showApplyToProjects, setShowApplyToProjects] = useState(false);
  const [showSyncAllProjects, setShowSyncAllProjects] = useState(false);
  const [newItem, setNewItem] = useState<Partial<ActivityTemplateScheduleItem> | null>(null);
  const [newItemKey, setNewItemKey] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemData, setEditingItemData] = useState<Partial<ActivityTemplateScheduleItem> | null>(null);
  const [newItemUseTemplateMilestone, setNewItemUseTemplateMilestone] = useState(true);
  const [editingItemUseTemplateMilestone, setEditingItemUseTemplateMilestone] = useState(true);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus the name input when newItem is created
  useEffect(() => {
    if (newItem && nameInputRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(async () => {
        // Force blur first to reset focus state
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        nameInputRef.current?.focus();
        // Electron workaround: Refocus the BrowserWindow to fix keyboard event routing
        await window.sqts.window.refocus();
      }, 10);
    }
  }, [newItemKey]);

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
    setNewItemKey(Date.now());
    setNewItemUseTemplateMilestone(true);
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
        anchorMilestoneName: newItem.anchorMilestoneName || null,
        offsetDays: newItem.offsetDays || null,
        fixedDate: newItem.fixedDate || null,
        sortOrder: newItem.sortOrder || 0,
      });
      success('Schedule item created successfully');
      setNewItem(null);
      setNewItemUseTemplateMilestone(true);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create schedule item');
    }
  };

  const handleStartEdit = (item: ActivityTemplateScheduleItem) => {
    setEditingItemId(item.id);
    setEditingItemData({ ...item });
    // Check if the milestone name matches a template milestone
    if (item.anchorType === 'PROJECT_MILESTONE' && item.anchorMilestoneName) {
      const hasMatch = scheduleItems?.some(si =>
        si.kind === 'MILESTONE' && si.name === item.anchorMilestoneName
      );
      setEditingItemUseTemplateMilestone(hasMatch || false);
    } else {
      setEditingItemUseTemplateMilestone(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItemData || !editingItemData.name?.trim()) {
      showError('Item name is required');
      return;
    }

    try {
      await updateItem.mutateAsync({
        id: editingItemId!,
        templateId,
        kind: editingItemData.kind as ScheduleItemKind,
        name: editingItemData.name,
        anchorType: editingItemData.anchorType as AnchorType,
        anchorRefId: editingItemData.anchorRefId || null,
        anchorMilestoneName: editingItemData.anchorMilestoneName || null,
        offsetDays: editingItemData.offsetDays || null,
        fixedDate: editingItemData.fixedDate || null,
        sortOrder: editingItemData.sortOrder || 0,
      });
      success('Schedule item updated successfully');
      setEditingItemId(null);
      setEditingItemData(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update schedule item');
    }
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingItemData(null);
    setEditingItemUseTemplateMilestone(true);
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
            {template.category || 'Uncategorized'}
            {latestVersion && <> &middot; {latestVersion.name}</>}
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowApplyToProjects(true)}>
          <Send className="w-4 h-4 mr-2" />
          Apply to Projects
        </Button>
        <Button variant="outline" onClick={() => setShowSyncAllProjects(true)}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Sync All Projects
        </Button>
        <Button variant="outline" onClick={() => setShowSaveVersion(true)}>
          <Save className="w-4 h-4 mr-2" />
          Save Version
        </Button>
        <Button variant="outline" onClick={() => setShowVersionHistory(true)}>
          <History className="w-4 h-4 mr-2" />
          Version History
        </Button>
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
          {(!scheduleItems || scheduleItems.length === 0) && !newItem ? (
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
                    <TableHead>Anchor Details</TableHead>
                    <TableHead>Offset Days</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduleItems?.map((item) => {
                    const isEditing = editingItemId === item.id;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              value={editingItemData?.sortOrder || ''}
                              onChange={(e) => setEditingItemData({ ...editingItemData, sortOrder: parseInt(e.target.value) })}
                              className="w-20"
                            />
                          ) : (
                            item.sortOrder
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <select
                              value={editingItemData?.kind || 'TASK'}
                              onChange={(e) => setEditingItemData({ ...editingItemData, kind: e.target.value as ScheduleItemKind })}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                            >
                              <option value="TASK">TASK</option>
                              <option value="MILESTONE">MILESTONE</option>
                            </select>
                          ) : (
                            <span className={`text-xs px-2 py-1 rounded ${
                              item.kind === 'MILESTONE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {item.kind}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {isEditing ? (
                            <Input
                              value={editingItemData?.name || ''}
                              onChange={(e) => setEditingItemData({ ...editingItemData, name: e.target.value })}
                              placeholder="Item name"
                            />
                          ) : (
                            item.name
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {isEditing ? (
                            <select
                              value={editingItemData?.anchorType || 'FIXED_DATE'}
                              onChange={(e) => setEditingItemData({ ...editingItemData, anchorType: e.target.value as AnchorType })}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                            >
                              <option value="FIXED_DATE">FIXED_DATE</option>
                              <option value="SCHEDULE_ITEM">SCHEDULE_ITEM</option>
                              <option value="COMPLETION">COMPLETION</option>
                              <option value="PROJECT_MILESTONE">PROJECT_MILESTONE</option>
                            </select>
                          ) : (
                            item.anchorType
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {isEditing ? (
                            <>
                              {editingItemData?.anchorType === 'SCHEDULE_ITEM' && (
                                <select
                                  value={editingItemData?.anchorRefId || ''}
                                  onChange={(e) => setEditingItemData({ ...editingItemData, anchorRefId: e.target.value ? parseInt(e.target.value) : null })}
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                                >
                                  <option value="">--</option>
                                  {scheduleItems
                                    ?.filter(si => si.id !== editingItemId)
                                    .map(si => (
                                      <option key={si.id} value={si.id}>
                                        {si.name} ({si.kind})
                                      </option>
                                    ))}
                                </select>
                              )}
                              {editingItemData?.anchorType === 'PROJECT_MILESTONE' && (
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={editingItemUseTemplateMilestone}
                                      onChange={(e) => {
                                        setEditingItemUseTemplateMilestone(e.target.checked);
                                        if (!e.target.checked) {
                                          setEditingItemData({ ...editingItemData, anchorMilestoneName: '' });
                                        }
                                      }}
                                      className="rounded"
                                    />
                                    Match to milestone in this template
                                  </label>
                                  {editingItemUseTemplateMilestone ? (
                                    <select
                                      value={editingItemData?.anchorMilestoneName || ''}
                                      onChange={(e) => setEditingItemData({ ...editingItemData, anchorMilestoneName: e.target.value })}
                                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                                    >
                                      <option value="">--</option>
                                      {scheduleItems
                                        ?.filter(si => si.kind === 'MILESTONE' && si.id !== editingItemId)
                                        .map(si => (
                                          <option key={si.id} value={si.name}>
                                            {si.name}
                                          </option>
                                        ))}
                                    </select>
                                  ) : (
                                    <Input
                                      value={editingItemData?.anchorMilestoneName || ''}
                                      onChange={(e) => setEditingItemData({ ...editingItemData, anchorMilestoneName: e.target.value })}
                                      placeholder="Enter milestone name"
                                    />
                                  )}
                                </div>
                              )}
                              {editingItemData?.anchorType === 'FIXED_DATE' && (
                                <Input
                                  type="date"
                                  value={editingItemData?.fixedDate || ''}
                                  onChange={(e) => setEditingItemData({ ...editingItemData, fixedDate: e.target.value })}
                                />
                              )}
                              {editingItemData?.anchorType === 'COMPLETION' && (
                                <span className="text-muted-foreground">--</span>
                              )}
                            </>
                          ) : (
                            <>
                              {item.anchorType === 'SCHEDULE_ITEM' && (scheduleItems?.find(si => si.id === item.anchorRefId)?.name || '--')}
                              {item.anchorType === 'PROJECT_MILESTONE' && (item.anchorMilestoneName || '--')}
                              {item.anchorType === 'FIXED_DATE' && (item.fixedDate || '--')}
                              {item.anchorType === 'COMPLETION' && '--'}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {isEditing ? (
                            <Input
                              type="number"
                              value={editingItemData?.offsetDays || ''}
                              onChange={(e) => setEditingItemData({ ...editingItemData, offsetDays: parseInt(e.target.value) })}
                              placeholder="0"
                              className="w-20"
                            />
                          ) : (
                            item.offsetDays || '--'
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {isEditing ? (
                              <>
                                <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                                <Button variant="outline" size="sm" onClick={handleCancelEdit}>Cancel</Button>
                              </>
                            ) : (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => handleStartEdit(item)}>
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteItem(item.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {newItem && (
                    <TableRow key={newItemKey || 'new-item'}>
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
                          key={`name-input-${newItemKey}`}
                          ref={nameInputRef}
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
                        {newItem.anchorType === 'SCHEDULE_ITEM' && (
                          <select
                            value={newItem.anchorRefId || ''}
                            onChange={(e) => setNewItem({ ...newItem, anchorRefId: e.target.value ? parseInt(e.target.value) : null })}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                          >
                            <option value="">--</option>
                            {scheduleItems?.map(si => (
                              <option key={si.id} value={si.id}>
                                {si.name} ({si.kind})
                              </option>
                            ))}
                          </select>
                        )}
                        {newItem.anchorType === 'PROJECT_MILESTONE' && (
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={newItemUseTemplateMilestone}
                                onChange={(e) => {
                                  setNewItemUseTemplateMilestone(e.target.checked);
                                  if (!e.target.checked) {
                                    setNewItem({ ...newItem, anchorMilestoneName: '' });
                                  }
                                }}
                                className="rounded"
                              />
                              Match to milestone in this template
                            </label>
                            {newItemUseTemplateMilestone ? (
                              <select
                                value={newItem.anchorMilestoneName || ''}
                                onChange={(e) => setNewItem({ ...newItem, anchorMilestoneName: e.target.value })}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                              >
                                <option value="">--</option>
                                {scheduleItems
                                  ?.filter(si => si.kind === 'MILESTONE')
                                  .map(si => (
                                    <option key={si.id} value={si.name}>
                                      {si.name}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <Input
                                value={newItem.anchorMilestoneName || ''}
                                onChange={(e) => setNewItem({ ...newItem, anchorMilestoneName: e.target.value })}
                                placeholder="Enter milestone name"
                              />
                            )}
                          </div>
                        )}
                        {newItem.anchorType === 'FIXED_DATE' && (
                          <Input
                            type="date"
                            value={newItem.fixedDate || ''}
                            onChange={(e) => setNewItem({ ...newItem, fixedDate: e.target.value })}
                          />
                        )}
                        {newItem.anchorType === 'COMPLETION' && (
                          <span className="text-muted-foreground text-sm">--</span>
                        )}
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
          {!newItem && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
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

      <SaveVersionDialog
        templateId={templateId}
        isOpen={showSaveVersion}
        onClose={() => setShowSaveVersion(false)}
      />

      <VersionHistoryPanel
        templateId={templateId}
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
      />

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

      <ApplyToProjectsDialog
        templateId={templateId}
        templateName={template.name}
        isOpen={showApplyToProjects}
        onClose={() => setShowApplyToProjects(false)}
      />

      <SyncAllProjectsDialog
        templateId={templateId}
        templateName={template.name}
        templateVersion={template.version}
        isOpen={showSyncAllProjects}
        onClose={() => setShowSyncAllProjects(false)}
      />
    </div>
  );
}
