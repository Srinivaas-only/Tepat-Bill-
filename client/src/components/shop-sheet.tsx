import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface Shop { name: string; address: string; tin: string; brn: string; msic: string }
const FIELDS: { k: keyof Shop; label: 'shop.name' | 'shop.address' | 'shop.tin' | 'shop.brn' | 'shop.msic'; ph: string }[] = [
  { k: 'name', label: 'shop.name', ph: 'Kedai Runcit Maju' }, { k: 'address', label: 'shop.address', ph: 'No. 12, Jalan Bendahara, 30200 Ipoh' },
  { k: 'tin', label: 'shop.tin', ph: 'IG12345678901' }, { k: 'brn', label: 'shop.brn', ph: '202601000123' }, { k: 'msic', label: 'shop.msic', ph: '47111' },
];

/** The company details that appear as the BUYER on a self-billed e-invoice. */
export function ShopSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['shop'], enabled: open, queryFn: () => api.get<Shop>('/shop') });
  const [v, setV] = useState<Shop>({ name: '', address: '', tin: '', brn: '', msic: '' });
  useEffect(() => { if (q.data) setV(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.patch('/shop', v),
    onSuccess: () => { toast.success(t('shop.saved')); void qc.invalidateQueries({ queryKey: ['shop'] }); void qc.invalidateQueries({ queryKey: ['einvoice'] }); onOpenChange(false); },
    onError: () => toast.error(t('common.error')),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t('shop.title')}>
        <div className="space-y-3">
          {FIELDS.map(f => (
            <div key={f.k}><label htmlFor={`shop-${f.k}`} className="mb-1 block text-sm font-medium text-ink-2">{t(f.label)}</label>
              <input id={`shop-${f.k}`} value={v[f.k]} placeholder={f.ph} onChange={e => setV({ ...v, [f.k]: e.target.value })} className="w-full rounded-btn border border-line bg-surface p-3 text-base focus-visible:border-brand" /></div>
          ))}
          <Button block disabled={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
