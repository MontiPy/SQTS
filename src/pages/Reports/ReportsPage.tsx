import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function ReportsPage() {
  // TODO: Implement real reporting once backend is connected
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Reports</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Overdue Items</CardTitle>
            <CardDescription>Items past their due date</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No overdue items</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Due This Week</CardTitle>
            <CardDescription>Items due in the next 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No items due this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supplier Progress</CardTitle>
            <CardDescription>Completion rates by supplier</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No data available</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Progress</CardTitle>
            <CardDescription>Completion rates by project</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No data available</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-500" />
            <CardTitle>Note</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Full reporting functionality will be available once the IPC handler layer is connected.
            Reports will include filterable lists, CSV export, and detailed progress tracking.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
