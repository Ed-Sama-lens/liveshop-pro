'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

interface Category {
  readonly id: string;
  readonly name: string;
}

interface ProductFiltersProps {
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly categoryId: string;
  readonly onCategoryChange: (value: string) => void;
  readonly status: string;
  readonly onStatusChange: (value: string) => void;
  readonly categories: readonly Category[];
}

export function ProductFilters({
  search,
  onSearchChange,
  categoryId,
  onCategoryChange,
  status,
  onStatusChange,
  categories,
}: ProductFiltersProps) {
  const t = useTranslations('inventory');

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('search')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8"
        />
      </div>
      <div className="flex gap-2">
        <Select value={categoryId} onValueChange={(v) => onCategoryChange(v ?? '')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('selectCategory')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('allCategories')}</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => onStatusChange(v ?? '')}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder={t('active')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('allCategories')}</SelectItem>
            <SelectItem value="true">{t('active')}</SelectItem>
            <SelectItem value="false">{t('inactive')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
