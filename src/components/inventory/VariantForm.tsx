'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Trash2, Plus } from 'lucide-react';
import { useState } from 'react';

export interface VariantFormData {
  readonly sku: string;
  readonly attributes: Record<string, string>;
  readonly price: string;
  readonly costPrice: string;
  readonly quantity: number;
  readonly lowStockAt: number | undefined;
}

interface VariantFormProps {
  readonly index: number;
  readonly value: VariantFormData;
  readonly onChange: (index: number, data: VariantFormData) => void;
  readonly onRemove: (index: number) => void;
  readonly canRemove: boolean;
}

export function VariantForm({ index, value, onChange, onRemove, canRemove }: VariantFormProps) {
  const t = useTranslations('inventory');
  const [newAttrKey, setNewAttrKey] = useState('');
  const [newAttrValue, setNewAttrValue] = useState('');

  function updateField<K extends keyof VariantFormData>(field: K, fieldValue: VariantFormData[K]) {
    onChange(index, { ...value, [field]: fieldValue });
  }

  function addAttribute() {
    const key = newAttrKey.trim();
    const val = newAttrValue.trim();
    if (!key || !val) return;

    const nextAttrs = { ...value.attributes, [key]: val };
    onChange(index, { ...value, attributes: nextAttrs });
    setNewAttrKey('');
    setNewAttrValue('');
  }

  function removeAttribute(key: string) {
    const { [key]: _, ...rest } = value.attributes;
    onChange(index, { ...value, attributes: rest });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">
          {t('variants')} #{index + 1}
        </h4>
        {canRemove && (
          <Button variant="ghost" size="icon-sm" onClick={() => onRemove(index)}>
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`sku-${index}`}>{t('sku')}</Label>
          <Input
            id={`sku-${index}`}
            value={value.sku}
            onChange={(e) => updateField('sku', e.target.value)}
            placeholder="SKU-001"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`price-${index}`}>{t('price')}</Label>
          <Input
            id={`price-${index}`}
            value={value.price}
            onChange={(e) => updateField('price', e.target.value)}
            placeholder="0.00"
            type="text"
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`costPrice-${index}`}>{t('costPrice')}</Label>
          <Input
            id={`costPrice-${index}`}
            value={value.costPrice}
            onChange={(e) => updateField('costPrice', e.target.value)}
            placeholder="0.00"
            type="text"
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`quantity-${index}`}>{t('quantity')}</Label>
          <Input
            id={`quantity-${index}`}
            value={String(value.quantity)}
            onChange={(e) => updateField('quantity', parseInt(e.target.value, 10) || 0)}
            type="number"
            min={0}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`lowStockAt-${index}`}>{t('lowStockAt')}</Label>
          <Input
            id={`lowStockAt-${index}`}
            value={value.lowStockAt !== undefined ? String(value.lowStockAt) : ''}
            onChange={(e) => {
              const v = e.target.value;
              updateField('lowStockAt', v ? parseInt(v, 10) || 0 : undefined);
            }}
            type="number"
            min={0}
          />
        </div>
      </div>

      {/* Dynamic Attributes */}
      <div className="space-y-2">
        <Label>{t('attributes')}</Label>
        {Object.entries(value.attributes).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(value.attributes).map(([key, val]) => (
              <div
                key={key}
                className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs"
              >
                <span className="font-medium">{key}:</span>
                <span>{val}</span>
                <button
                  type="button"
                  onClick={() => removeAttribute(key)}
                  className="ml-1 text-muted-foreground hover:text-destructive"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newAttrKey}
            onChange={(e) => setNewAttrKey(e.target.value)}
            placeholder="Key"
            className="w-24"
          />
          <Input
            value={newAttrValue}
            onChange={(e) => setNewAttrValue(e.target.value)}
            placeholder="Value"
            className="w-24"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAttribute();
              }
            }}
          />
          <Button variant="outline" size="sm" type="button" onClick={addAttribute}>
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
