import { useState, useEffect } from 'react';
import { useSettings, useUpdateSetting } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Save, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import AuditLogSection from './AuditLogSection';

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSetting = useUpdateSetting();
  const { success, error: showError } = useToast();

  const [nmrRanks, setNmrRanks] = useState<string[]>([]);
  const [paRanks, setPaRanks] = useState<string[]>([]);
  const [milestoneCategories, setMilestoneCategories] = useState<string[]>([]);

  const [propagationSkipComplete, setPropagationSkipComplete] = useState(false);
  const [propagationSkipLocked, setPropagationSkipLocked] = useState(false);
  const [propagationSkipOverridden, setPropagationSkipOverridden] = useState(false);
  const [useBusinessDays, setUseBusinessDays] = useState(false);
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [showDevTools, setShowDevTools] = useState(false);
  const [crashTest, setCrashTest] = useState(false);

  useEffect(() => {
    if (settings) {
      setNmrRanks(settings.nmrRanks || []);
      setPaRanks(settings.paRanks || []);
      setMilestoneCategories(settings.milestoneCategories || []);
      setPropagationSkipComplete(settings.propagationSkipComplete || false);
      setPropagationSkipLocked(settings.propagationSkipLocked || false);
      setPropagationSkipOverridden(settings.propagationSkipOverridden || false);
      setUseBusinessDays(settings.useBusinessDays || false);
      setDateFormat(settings.dateFormat || 'YYYY-MM-DD');
    }
  }, [settings]);

  if (isLoading) return <LoadingSpinner />;

  const handleSave = async () => {
    try {
      await Promise.all([
        updateSetting.mutateAsync({ key: 'nmrRanks', value: nmrRanks }),
        updateSetting.mutateAsync({ key: 'paRanks', value: paRanks }),
        updateSetting.mutateAsync({ key: 'milestoneCategories', value: milestoneCategories }),
        updateSetting.mutateAsync({ key: 'propagationSkipComplete', value: propagationSkipComplete }),
        updateSetting.mutateAsync({ key: 'propagationSkipLocked', value: propagationSkipLocked }),
        updateSetting.mutateAsync({ key: 'propagationSkipOverridden', value: propagationSkipOverridden }),
        updateSetting.mutateAsync({ key: 'useBusinessDays', value: useBusinessDays }),
        updateSetting.mutateAsync({ key: 'dateFormat', value: dateFormat }),
      ]);
      success('Settings saved successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  const addNmrRank = () => {
    const newRank = prompt('Enter new NMR rank (e.g., A1, B1, C1):');
    if (newRank && newRank.trim()) {
      setNmrRanks([...nmrRanks, newRank.trim()]);
    }
  };

  const removeNmrRank = (index: number) => {
    setNmrRanks(nmrRanks.filter((_, i) => i !== index));
  };

  const addPaRank = () => {
    const newRank = prompt('Enter new PA rank:');
    if (newRank && newRank.trim()) {
      setPaRanks([...paRanks, newRank.trim()]);
    }
  };

  const removePaRank = (index: number) => {
    setPaRanks(paRanks.filter((_, i) => i !== index));
  };

  const addCategory = () => {
    setMilestoneCategories([...milestoneCategories, '']);
  };

  const removeCategory = (index: number) => {
    setMilestoneCategories(milestoneCategories.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure application preferences</p>
        </div>
        <Button onClick={handleSave} disabled={updateSetting.isPending}>
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>NMR Ranks</CardTitle>
            <CardDescription>Define supplier NMR rank values (higher ranks first)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {nmrRanks.map((rank, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input value={rank} onChange={(e) => {
                    const newRanks = [...nmrRanks];
                    newRanks[index] = e.target.value;
                    setNmrRanks(newRanks);
                  }} />
                  <Button variant="ghost" size="icon" onClick={() => removeNmrRank(index)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" onClick={addNmrRank}>
                <Plus className="w-4 h-4 mr-2" />
                Add NMR Rank
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PA Ranks</CardTitle>
            <CardDescription>Define part PA rank values (higher ranks first)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {paRanks.map((rank, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input value={rank} onChange={(e) => {
                    const newRanks = [...paRanks];
                    newRanks[index] = e.target.value;
                    setPaRanks(newRanks);
                  }} />
                  <Button variant="ghost" size="icon" onClick={() => removePaRank(index)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" onClick={addPaRank}>
                <Plus className="w-4 h-4 mr-2" />
                Add PA Rank
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Milestone Categories</CardTitle>
            <CardDescription>Define categories for grouping project milestones</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {milestoneCategories.map((cat, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={cat}
                    onChange={(e) => {
                      const updated = [...milestoneCategories];
                      updated[index] = e.target.value;
                      setMilestoneCategories(updated);
                    }}
                    placeholder="Category name"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeCategory(index)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" onClick={addCategory}>
                <Plus className="w-4 h-4 mr-2" />
                Add Category
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Propagation Policies</CardTitle>
            <CardDescription>Configure which items are protected during propagation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="skipComplete"
                checked={propagationSkipComplete}
                onChange={(e) => setPropagationSkipComplete(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="skipComplete">Skip completed items</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="skipLocked"
                checked={propagationSkipLocked}
                onChange={(e) => setPropagationSkipLocked(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="skipLocked">Skip locked items</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="skipOverridden"
                checked={propagationSkipOverridden}
                onChange={(e) => setPropagationSkipOverridden(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="skipOverridden">Skip items with overridden dates</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Date Calculation</CardTitle>
            <CardDescription>Configure how dates are calculated</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="useBusinessDays"
                checked={useBusinessDays}
                onChange={(e) => setUseBusinessDays(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="useBusinessDays">Use business days (skip weekends)</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Date Display Format</CardTitle>
            <CardDescription>Choose how dates are displayed throughout the application</CardDescription>
          </CardHeader>
          <CardContent>
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD (2025-01-31)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (01/31/2025)</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY (31/01/2025)</option>
              <option value="MMM DD, YYYY">MMM DD, YYYY (Jan 31, 2025)</option>
            </select>
          </CardContent>
        </Card>

        <AuditLogSection />

        {/* Developer Section — collapsible */}
        <div className="border-t border-border pt-4">
          <button
            onClick={() => setShowDevTools(!showDevTools)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDevTools ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Developer
          </button>

          {showDevTools && (
            <Card className="mt-3">
              <CardHeader>
                <CardTitle className="text-base">Developer Tools</CardTitle>
                <CardDescription>Diagnostic tools for testing and debugging</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {crashTest ? (() => { throw new Error('Test error — the Error Boundary caught this!'); })() : null}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Test Error Boundary</p>
                    <p className="text-xs text-muted-foreground">Triggers a crash to verify the error boundary fallback UI</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setCrashTest(true)}
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Crash App
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
