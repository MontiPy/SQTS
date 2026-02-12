import { useState, useRef } from 'react';
import { Download, Upload, Trash2, Save, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ImportExportPage() {
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backing, setBacking] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');

  const [importResult, setImportResult] = useState<{
    imported: number;
    errors: string[];
  } | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await window.sqts.importExport.export({
        includeSuppliers: true,
        includeProjects: true,
        includeTemplates: true,
        includeInstances: true,
      });
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Export failed');
      }

      // Download as JSON file
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sqts-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      success('Database exported successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const response = await window.sqts.importExport.import({
        data: {
          suppliers: data.suppliers,
          projects: data.projects,
          activityTemplates: data.activityTemplates,
        },
        mode: 'MERGE',
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Import failed');
      }

      setImportResult(response.data as any);
      success(`Imported ${(response.data as any).imported} records`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBackup = async () => {
    setBacking(true);
    try {
      const response = await window.sqts.importExport.backup();
      if (!response.success) {
        throw new Error(response.error || 'Backup failed');
      }
      success('Backup created successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBacking(false);
    }
  };

  const handleWipe = async () => {
    if (wipeConfirmText !== 'DELETE ALL DATA') return;

    setWiping(true);
    try {
      const response = await window.sqts.importExport.wipe();
      if (!response.success) {
        throw new Error(response.error || 'Wipe failed');
      }
      success('Database wiped successfully');
      setShowWipeConfirm(false);
      setWipeConfirmText('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Wipe failed');
    } finally {
      setWiping(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Import / Export</h1>
        <p className="text-muted-foreground mt-1">
          Export your data for backup, import data from a file, or manage your database
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Export Data
            </CardTitle>
            <CardDescription>
              Export all suppliers, projects, templates, instances, and settings as a JSON file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExport} disabled={exporting}>
              <Download className="w-4 h-4 mr-2" />
              {exporting ? 'Exporting...' : 'Export Database'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Import Data
            </CardTitle>
            <CardDescription>
              Import suppliers, projects, and templates from a JSON file. Existing records are updated by name match.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleImportClick} disabled={importing}>
              <Upload className="w-4 h-4 mr-2" />
              {importing ? 'Importing...' : 'Choose File to Import'}
            </Button>
            {importResult && (
              <div className="text-sm space-y-1">
                <p className="text-green-600 font-medium">
                  Imported {importResult.imported} records
                </p>
                {importResult.errors.length > 0 && (
                  <div className="text-destructive">
                    <p className="font-medium">{importResult.errors.length} errors:</p>
                    <ul className="list-disc list-inside">
                      {importResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Save className="w-5 h-5" />
              Backup
            </CardTitle>
            <CardDescription>
              Create an in-memory backup of the current database state. Backups are also created automatically before imports and wipes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={handleBackup} disabled={backing}>
              <Save className="w-4 h-4 mr-2" />
              {backing ? 'Creating Backup...' : 'Create Backup'}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Wipe Database
            </CardTitle>
            <CardDescription>
              Permanently delete all data. A backup is created automatically before wiping.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showWipeConfirm ? (
              <Button
                variant="destructive"
                onClick={() => setShowWipeConfirm(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Wipe All Data
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md">
                  <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-sm">
                    This will permanently delete all suppliers, projects, templates, and tracking data.
                    Type <span className="font-mono font-bold">DELETE ALL DATA</span> to confirm.
                  </p>
                </div>
                <input
                  type="text"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  placeholder="Type DELETE ALL DATA"
                  value={wipeConfirmText}
                  onChange={(e) => setWipeConfirmText(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleWipe}
                    disabled={wipeConfirmText !== 'DELETE ALL DATA' || wiping}
                  >
                    {wiping ? 'Wiping...' : 'Confirm Wipe'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowWipeConfirm(false);
                      setWipeConfirmText('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
