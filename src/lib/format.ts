import { format } from 'date-fns';

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '--';
  try {
    const date = new Date(dateString + 'T00:00:00');
    return format(date, 'MMM d, yyyy');
  } catch {
    return dateString;
  }
}
