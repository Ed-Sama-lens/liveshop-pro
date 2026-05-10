import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Reusable panel card for the /sale workspace skeleton (Commit 2L-b).
 *
 * Pure presentational. No state, no fetch, no mutation. Used to keep
 * SaleWorkspaceShell composition consistent across all sub-panels and
 * to make the "demo only" / "ยังไม่เปิดใช้งาน" framing visible at a
 * glance in every section.
 */
export interface SalePanelCardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon: LucideIcon;
  /**
   * Top-right corner pill. Use to mark each panel's wiring state:
   * - 'demo'        — shows static sample UI only
   * - 'placeholder' — empty shell with disabled controls
   * - 'coming-soon' — future feature not in this milestone
   */
  readonly variant?: 'demo' | 'placeholder' | 'coming-soon';
  readonly children: ReactNode;
}

const VARIANT_LABEL: Record<NonNullable<SalePanelCardProps['variant']>, string> = {
  demo: 'demo only',
  placeholder: 'placeholder',
  'coming-soon': 'coming soon',
};

export function SalePanelCard({
  title,
  subtitle,
  icon: Icon,
  variant = 'placeholder',
  children,
}: SalePanelCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide">
          {VARIANT_LABEL[variant]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
