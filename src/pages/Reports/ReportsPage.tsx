import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import OverdueList from '@/components/OverdueList';

const TABS = [
  { id: 'overdue', label: 'Overdue Items' },
  { id: 'due-soon', label: 'Due This Week' },
  { id: 'supplier-progress', label: 'Supplier Progress' },
  { id: 'project-progress', label: 'Project Progress' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'overdue'
  );

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam as TabId);
    }
  }, [tabParam]);

  function handleTabChange(tabId: TabId) {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Reports</h1>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overdue' && <OverdueList />}

      {activeTab === 'due-soon' && (
        <Card>
          <CardHeader>
            <CardTitle>Due This Week</CardTitle>
            <CardDescription>Items due in the next 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon</p>
          </CardContent>
        </Card>
      )}

      {activeTab === 'supplier-progress' && (
        <Card>
          <CardHeader>
            <CardTitle>Supplier Progress</CardTitle>
            <CardDescription>Completion rates by supplier</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon</p>
          </CardContent>
        </Card>
      )}

      {activeTab === 'project-progress' && (
        <Card>
          <CardHeader>
            <CardTitle>Project Progress</CardTitle>
            <CardDescription>Completion rates by project</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
