import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Plus, RefreshCw, Users } from 'lucide-react';
import { useProject, useDeleteProject, useMilestones } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import ProjectForm from './ProjectForm';
import MilestoneEditor from './MilestoneEditor';
import ProjectActivityManager from './ProjectActivityManager';
import ApplyToSupplierDialog from './ApplyToSupplierDialog';
import PropagationPreview from '@/components/PropagationPreview';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const projectId = parseInt(id || '0');

  const { data: project, isLoading } = useProject(projectId);
  const { data: milestones } = useMilestones(projectId);
  const deleteProject = useDeleteProject();

  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMilestoneEditor, setShowMilestoneEditor] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showPropagation, setShowPropagation] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (!project) return <div className="text-destructive">Project not found</div>;

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

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Milestones</CardTitle>
            <Button size="sm" onClick={() => setShowMilestoneEditor(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Milestone
            </Button>
          </CardHeader>
          <CardContent>
            {!milestones || milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No milestones defined yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {milestones.map((milestone) => (
                    <TableRow key={milestone.id}>
                      <TableCell className="font-medium">{milestone.name}</TableCell>
                      <TableCell>{formatDate(milestone.date)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <ProjectActivityManager projectId={projectId} />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Suppliers</CardTitle>
            <Button size="sm" onClick={() => setShowApplyDialog(true)}>
              <Users className="w-4 h-4 mr-2" />
              Apply to Supplier
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No suppliers assigned to this project yet.</p>
          </CardContent>
        </Card>
      </div>

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
          onClose={() => setShowMilestoneEditor(false)}
          projectId={projectId}
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
