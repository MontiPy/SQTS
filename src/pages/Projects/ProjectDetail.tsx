import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Plus, RefreshCw, Users, FileStack } from 'lucide-react';
import { useProject, useDeleteProject, useMilestones } from '@/hooks/use-projects';
import { useProjectSuppliers } from '@/hooks/use-supplier-instances';
import { useSettings } from '@/hooks/use-settings';
import type { ProjectMilestone } from '@shared/types';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import ProjectForm from './ProjectForm';
import MilestoneEditor from './MilestoneEditor';
import ProjectActivityManager from './ProjectActivityManager';
import ApplyToSupplierDialog from './ApplyToSupplierDialog';
import PropagationPreview from '@/components/PropagationPreview';
import ApplyProjectTemplateDialog from './ApplyProjectTemplateDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import SupplierMilestoneDateGrid from './SupplierMilestoneDateGrid';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const projectId = parseInt(id || '0');

  const { data: project, isLoading } = useProject(projectId);
  const { data: milestones } = useMilestones(projectId);
  const { data: projectSuppliers } = useProjectSuppliers(projectId);
  const { data: settings } = useSettings();
  const deleteProject = useDeleteProject();

  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMilestoneEditor, setShowMilestoneEditor] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | undefined>();
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showPropagation, setShowPropagation] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (!project) return <div className="text-destructive">Project not found</div>;

  const settingsCategories = settings?.milestoneCategories || [];

  // Group milestones by their actual category value.
  // Settings categories define the column order; any extra categories
  // that exist on milestones get appended after.
  const milestonesByCategory = new Map<string, ProjectMilestone[]>();

  for (const m of milestones || []) {
    const cat = m.category || 'Uncategorized';
    if (!milestonesByCategory.has(cat)) {
      milestonesByCategory.set(cat, []);
    }
    milestonesByCategory.get(cat)!.push(m);
  }

  // Build ordered list: settings categories first, then any extras, then Uncategorized last
  const orderedCategories: [string, ProjectMilestone[]][] = [];
  for (const cat of settingsCategories) {
    if (milestonesByCategory.has(cat)) {
      orderedCategories.push([cat, milestonesByCategory.get(cat)!]);
    }
  }
  for (const [cat, items] of milestonesByCategory) {
    if (cat !== 'Uncategorized' && !settingsCategories.includes(cat)) {
      orderedCategories.push([cat, items]);
    }
  }
  if (milestonesByCategory.has('Uncategorized')) {
    orderedCategories.push(['Uncategorized', milestonesByCategory.get('Uncategorized')!]);
  }

  const handleDelete = async () => {
    try {
      await deleteProject.mutateAsync(projectId);
      success('Project deleted successfully');
      navigate('/projects');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground mt-1">Version: {project.version}</p>
        </div>
        <Button variant="outline" onClick={() => setShowEditForm(true)}>
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </Button>
        <Button variant="outline" onClick={() => setShowPropagation(true)}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Propagate Changes
        </Button>
        <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="milestone-dates">Milestone Dates</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">
            {/* Milestones Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Milestones</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowTemplateDialog(true)}>
                    <FileStack className="w-4 h-4 mr-2" />
                    Apply Template
                  </Button>
                  <Button size="sm" onClick={() => {
                    setEditingMilestone(undefined);
                    setShowMilestoneEditor(true);
                  }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Milestone
                  </Button>
                </div>
              </div>

              {!milestones || milestones.length === 0 ? (
                <Card>
                  <CardContent className="py-6">
                    <p className="text-sm text-muted-foreground">No milestones defined yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {orderedCategories.map(([category, categoryMilestones]) => (
                    <Card key={category}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{category}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {categoryMilestones.map((milestone) => (
                            <div
                              key={milestone.id}
                              className="flex items-center justify-between py-1"
                            >
                              <div>
                                <span className="text-sm font-medium">{milestone.name}</span>
                                {milestone.date && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    {formatDate(milestone.date)}
                                  </span>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7"
                                onClick={() => {
                                  setEditingMilestone(milestone);
                                  setShowMilestoneEditor(true);
                                }}
                              >
                                Edit
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <ProjectActivityManager projectId={projectId} />

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Suppliers ({projectSuppliers?.length ?? 0})</CardTitle>
                <Button size="sm" onClick={() => setShowApplyDialog(true)}>
                  <Users className="w-4 h-4 mr-2" />
                  Apply to Supplier
                </Button>
              </CardHeader>
              <CardContent>
                {!projectSuppliers || projectSuppliers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No suppliers assigned to this project yet.</p>
                ) : (
                  <div className="space-y-2">
                    {projectSuppliers.map((sp) => (
                      <div
                        key={sp.id}
                        className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/suppliers/${sp.supplierId}`)}
                      >
                        <div>
                          <span className="text-sm font-medium">{sp.supplierName}</span>
                          {sp.nmrRank && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 bg-muted rounded">{sp.nmrRank}</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(sp.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="milestone-dates">
          <SupplierMilestoneDateGrid projectId={projectId} />
        </TabsContent>
      </Tabs>

      {showEditForm && (
        <ProjectForm
          isOpen={showEditForm}
          onClose={() => setShowEditForm(false)}
          project={project}
        />
      )}

      {showMilestoneEditor && (
        <MilestoneEditor
          isOpen={showMilestoneEditor}
          onClose={() => {
            setShowMilestoneEditor(false);
            setEditingMilestone(undefined);
          }}
          projectId={projectId}
          milestone={editingMilestone}
        />
      )}

      {showApplyDialog && (
        <ApplyToSupplierDialog
          isOpen={showApplyDialog}
          onClose={() => setShowApplyDialog(false)}
          projectId={projectId}
          projectName={project.name}
        />
      )}

      {showPropagation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto p-4">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-background z-10">
              <h2 className="text-2xl font-bold">Propagate Schedule Changes</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Preview and apply schedule changes to supplier instances
              </p>
            </div>
            <div className="p-6">
              <PropagationPreview
                projectId={projectId}
                onClose={() => setShowPropagation(false)}
                onApplied={() => {
                  setShowPropagation(false);
                  success('Propagation applied successfully');
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showTemplateDialog && (
        <ApplyProjectTemplateDialog
          projectId={projectId}
          isOpen={showTemplateDialog}
          onClose={() => setShowTemplateDialog(false)}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg p-6 max-w-md">
            <h2 className="text-xl font-bold mb-4">Delete Project?</h2>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to delete "{project.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteProject.isPending}
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
