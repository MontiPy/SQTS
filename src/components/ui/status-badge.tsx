import { cva, type VariantProps } from 'class-variance-authority';
import { CheckCircle2, Circle, Eye, AlertTriangle, Minus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityStatus } from '@shared/types';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      status: {
        'Not Started': 'bg-gray-100 text-gray-700',
        'In Progress': 'bg-blue-100 text-blue-700',
        'Under Review': 'bg-purple-100 text-purple-700',
        Blocked: 'bg-red-100 text-red-700',
        Complete: 'bg-green-100 text-green-700',
        'Not Required': 'bg-gray-100 text-gray-500',
      },
    },
  }
);

const statusIcons = {
  'Not Started': Minus,
  'In Progress': Circle,
  'Under Review': Eye,
  Blocked: AlertTriangle,
  Complete: CheckCircle2,
  'Not Required': X,
};

interface StatusBadgeProps extends VariantProps<typeof badgeVariants> {
  status: ActivityStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const Icon = statusIcons[status];
  return (
    <span className={cn(badgeVariants({ status }), className)}>
      <Icon size={14} />
      {status}
    </span>
  );
}
