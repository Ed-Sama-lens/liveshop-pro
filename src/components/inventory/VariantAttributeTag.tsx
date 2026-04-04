'use client';

import { Badge } from '@/components/ui/badge';

interface VariantAttributeTagProps {
  readonly label: string;
  readonly value: string;
}

export function VariantAttributeTag({ label, value }: VariantAttributeTagProps) {
  return (
    <Badge variant="secondary" className="text-xs">
      {label}: {value}
    </Badge>
  );
}
