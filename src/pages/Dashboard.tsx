import { useNavigate } from 'react-router-dom';
import { AlertCircle, Clock, Circle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDashboardStats, useOverdueItems } from '@/hooks/use-dashboard';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: stats } = useDashboardStats();
  const { data: overdueItems } = useOverdueItems();

  const overdue = stats?.overdue ?? 0;
  const dueSoon = stats?.dueSoon ?? 0;
  const inProgress = stats?.inProgress ?? 0;
  const recentlyUpdated = stats?.recentlyUpdated ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of supplier quality tracking</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => navigate('/reports?tab=overdue')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Items</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overdue}</div>
            <p className="text-xs text-muted-foreground">Past due date</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => navigate('/reports?tab=due-soon')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dueSoon}</div>
            <p className="text-xs text-muted-foreground">Next 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Circle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgress}</div>
            <p className="text-xs text-muted-foreground">Active items</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recently Updated</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentlyUpdated}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/suppliers')}>
              Manage Suppliers
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/projects')}>
              Manage Projects
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/activity-templates')}>
              Activity Templates
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/reports')}>
              View Reports
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overdue Items</CardTitle>
          </CardHeader>
          <CardContent>
            {!overdueItems || overdueItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overdue items</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {overdueItems.slice(0, 8).map((item) => (
                  <div
                    key={item.instanceId}
                    className="flex items-center justify-between p-2 rounded border hover:bg-accent/50 cursor-pointer text-sm"
                    onClick={() => navigate(`/supplier-projects/${item.supplierId}/${item.projectId}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{item.supplierName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.projectName} &middot; {item.itemName}
                      </p>
                    </div>
                    <span className="text-xs text-destructive font-medium whitespace-nowrap ml-2">
                      {item.daysOverdue}d overdue
                    </span>
                  </div>
                ))}
                {overdueItems.length > 8 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => navigate('/reports?tab=overdue')}
                  >
                    View all {overdueItems.length} overdue items
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
