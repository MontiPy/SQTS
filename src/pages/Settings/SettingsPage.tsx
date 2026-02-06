import { useState, useEffect } from 'react';
import { useSettings, useUpdateSetting } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Save } from 'lucide-react';

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSetting = useUpdateSetting();
  const { success, error: showError } = useToast();

  const [nmrRanks, setNmrRanks] = useState<string[]>([]);
  const [paRanks, setPaRanks] = useState<string[]>([]);
  const [propagationSkipComplete, setPropagationSkipComplete] = useState(false);
  const [propagationSkipLocked, setPropagationSkipLocked] = useState(false);
  const [propagationSkipOverridden, setPropagationSkipOverridden] = useState(false);
  const [useBusinessDays, setUseBusinessDays] = useState(false);

  useEffect(() => {
    if (settings) {
      setNmrRanks(settings.nmrRanks || []);
      setPaRanks(settings.paRanks || []);
      setPropagationSkipComplete(settings.propagationSkipComplete || false);
      setPropagationSkipLocked(settings.propagationSkipLocked || false);
      setPropagationSkipOverridden(settings.propagationSkipOverridden || false);
      setUseBusinessDays(settings.useBusinessDays || false);
    }
  }, [settings]);

  if (isLoading) return <LoadingSpinner />;

  const handleSave = async () => {
    try {
      await Promise.all([
        updateSetting.mutateAsync({ key: 'nmrRanks', value: nmrRanks }),
        updateSetting.mutateAsync({ key: 'paRanks', value: paRanks }),
        updateSetting.mutateAsync({ key: 'propagationSkipComplete', value: propagationSkipComplete }),
        updateSetting.mutateAsync({ key: 'propagationSkipLocked', value: propagationSkipLocked }),
        updateSetting.mutateAsync({ key: 'propagationSkipOverridden', value: propagationSkipOverridden }),
        updateSetting.mutateAsync({ key: 'useBusinessDays', value: useBusinessDays }),
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
          <CardContent>
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
      </div>
    </div>
  );
}
