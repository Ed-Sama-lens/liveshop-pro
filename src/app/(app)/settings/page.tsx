'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, Users, Plus, Trash2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import type { ShopRow, ShopMemberRow } from '@/server/repositories/shop.repository';

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  MANAGER: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  CHAT_SUPPORT: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  WAREHOUSE: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

const ROLE_I18N: Record<string, string> = {
  OWNER: 'owner',
  MANAGER: 'manager',
  CHAT_SUPPORT: 'chatSupport',
  WAREHOUSE: 'warehouse',
};

export default function SettingsPage() {
  const t = useTranslations('settings');

  // ─── Shop State ─────────────────────────────────────────────────────────
  const [shop, setShop] = useState<ShopRow | null>(null);
  const [isLoadingShop, setIsLoadingShop] = useState(true);
  const [shopForm, setShopForm] = useState({ name: '', facebookPageId: '', defaultCurrency: 'THB', isActive: true });
  const [isSaving, setIsSaving] = useState(false);

  // ─── Team State ─────────────────────────────────────────────────────────
  const [members, setMembers] = useState<readonly ShopMemberRow[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('CHAT_SUPPORT');
  const [isInviting, setIsInviting] = useState(false);

  // ─── Fetch Shop ─────────────────────────────────────────────────────────
  const fetchShop = useCallback(async () => {
    setIsLoadingShop(true);
    try {
      const res = await fetch('/api/settings/shop');
      const body = await res.json();
      if (body.success && body.data) {
        setShop(body.data);
        setShopForm({
          name: body.data.name,
          facebookPageId: body.data.facebookPageId ?? '',
          defaultCurrency: body.data.defaultCurrency ?? 'THB',
          isActive: body.data.isActive,
        });
      }
    } catch {
      toast.error('Failed to load shop settings');
    } finally {
      setIsLoadingShop(false);
    }
  }, []);

  // ─── Fetch Team ─────────────────────────────────────────────────────────
  const fetchTeam = useCallback(async () => {
    setIsLoadingTeam(true);
    try {
      const res = await fetch('/api/settings/team');
      const body = await res.json();
      if (body.success) {
        setMembers(body.data ?? []);
      }
    } catch {
      toast.error('Failed to load team');
    } finally {
      setIsLoadingTeam(false);
    }
  }, []);

  useEffect(() => {
    fetchShop();
    fetchTeam();
  }, [fetchShop, fetchTeam]);

  // ─── Save Shop ──────────────────────────────────────────────────────────
  async function handleSaveShop() {
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings/shop', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: shopForm.name,
          facebookPageId: shopForm.facebookPageId || null,
          defaultCurrency: shopForm.defaultCurrency,
          isActive: shopForm.isActive,
        }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('settingsUpdated'));
        fetchShop();
      } else {
        toast.error(body.error ?? 'Failed to save');
      }
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }

  // ─── Invite Member ──────────────────────────────────────────────────────
  async function handleInvite() {
    if (!inviteEmail) return;
    setIsInviting(true);
    try {
      const res = await fetch('/api/settings/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('invited'));
        setInviteDialogOpen(false);
        setInviteEmail('');
        setInviteRole('CHAT_SUPPORT');
        fetchTeam();
      } else {
        toast.error(body.error ?? 'Failed to invite');
      }
    } catch {
      toast.error('Failed to invite member');
    } finally {
      setIsInviting(false);
    }
  }

  // ─── Update Role ────────────────────────────────────────────────────────
  async function handleUpdateRole(memberId: string, role: string) {
    try {
      const res = await fetch(`/api/settings/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('roleUpdated'));
        fetchTeam();
      } else {
        toast.error(body.error ?? 'Failed to update role');
      }
    } catch {
      toast.error('Failed to update role');
    }
  }

  // ─── Remove Member ──────────────────────────────────────────────────────
  async function handleRemoveMember(memberId: string) {
    if (!confirm(t('confirmRemove'))) return;
    try {
      const res = await fetch(`/api/settings/team/${memberId}`, { method: 'DELETE' });
      const body = await res.json();
      if (body.success) {
        toast.success(t('memberRemoved'));
        fetchTeam();
      } else {
        toast.error(body.error ?? 'Failed to remove');
      }
    } catch {
      toast.error('Failed to remove member');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <Settings className="size-6" />
        {t('title')}
      </h1>

      {/* Shop Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('shopSettings')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingShop ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 max-w-lg">
              <div className="space-y-2">
                <Label>{t('shopName')}</Label>
                <Input
                  value={shopForm.name}
                  onChange={(e) => setShopForm({ ...shopForm, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('facebookPageId')}</Label>
                <Input
                  value={shopForm.facebookPageId}
                  onChange={(e) =>
                    setShopForm({ ...shopForm, facebookPageId: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label>{t('defaultCurrency')}</Label>
                <Select
                  value={shopForm.defaultCurrency}
                  onValueChange={(v) => v && setShopForm({ ...shopForm, defaultCurrency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="THB">฿ THB — Thai Baht</SelectItem>
                    <SelectItem value="MYR">RM MYR — Malaysian Ringgit</SelectItem>
                    <SelectItem value="SGD">S$ SGD — Singapore Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={shopForm.isActive}
                  onCheckedChange={(checked) =>
                    setShopForm({ ...shopForm, isActive: checked })
                  }
                />
                <Label>{t('shopActive')}</Label>
              </div>

              <Button onClick={handleSaveShop} disabled={isSaving}>
                {isSaving ? '...' : t('saveSettings')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            {t('teamMembers')}
          </CardTitle>
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-2 size-4" />
              {t('inviteMember')}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('inviteMember')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t('email')}</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('role')}</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v ?? 'CHAT_SUPPORT')}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectRole')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANAGER">{t('manager')}</SelectItem>
                      <SelectItem value="CHAT_SUPPORT">{t('chatSupport')}</SelectItem>
                      <SelectItem value="WAREHOUSE">{t('warehouse')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button onClick={handleInvite} disabled={!inviteEmail || isInviting}>
                  {isInviting ? '...' : t('inviteMember')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoadingTeam ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t('noMembers')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>{t('email')}</TableHead>
                  <TableHead>{t('role')}</TableHead>
                  <TableHead>{t('joinedAt')}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      {member.user.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.user.email ?? '—'}
                    </TableCell>
                    <TableCell>
                      {member.role === 'OWNER' ? (
                        <Badge className={ROLE_COLORS[member.role]}>
                          <Shield className="mr-1 size-3" />
                          {t(ROLE_I18N[member.role] ?? 'owner')}
                        </Badge>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(v) => {
                            if (v) handleUpdateRole(member.id, v);
                          }}
                        >
                          <SelectTrigger className="w-36 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MANAGER">{t('manager')}</SelectItem>
                            <SelectItem value="CHAT_SUPPORT">{t('chatSupport')}</SelectItem>
                            <SelectItem value="WAREHOUSE">{t('warehouse')}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {member.joinedAt
                        ? new Date(member.joinedAt).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {member.role !== 'OWNER' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
