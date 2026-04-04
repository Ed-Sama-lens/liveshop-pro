'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, User } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface StorefrontCustomer {
  readonly customerId: string;
  readonly customerName: string;
  readonly facebookId: string;
}

interface StorefrontAuthContextValue {
  readonly customer: StorefrontCustomer | null;
  readonly isLoading: boolean;
  readonly login: () => void;
  readonly logout: () => void;
  readonly getCustomerId: () => string;
}

// ─── Context ──────────────────────────────────────────────────────────────

const StorefrontAuthContext = createContext<StorefrontAuthContextValue | null>(null);

export function useStorefrontAuth(): StorefrontAuthContextValue {
  const ctx = useContext(StorefrontAuthContext);
  if (!ctx) throw new Error('useStorefrontAuth must be used within StorefrontAuthProvider');
  return ctx;
}

// ─── LocalStorage helpers ─────────────────────────────────────────────────

const STORAGE_KEY = 'liveshop_customer';
const ANON_KEY = 'liveshop_customer_id';

function loadCustomer(): StorefrontCustomer | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StorefrontCustomer;
  } catch {
    return null;
  }
}

function saveCustomer(customer: StorefrontCustomer): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customer));
  // Also set the legacy key so existing cart/order APIs work
  localStorage.setItem(ANON_KEY, customer.customerId);
}

function clearCustomer(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ANON_KEY);
}

function getAnonCustomerId(): string {
  if (typeof window === 'undefined') return '';
  const existing = localStorage.getItem(ANON_KEY);
  if (existing) return existing;
  const id = `anon_${crypto.randomUUID()}`;
  localStorage.setItem(ANON_KEY, id);
  return id;
}

// ─── Provider ─────────────────────────────────────────────────────────────

interface StorefrontAuthProviderProps {
  readonly shopId: string;
  readonly facebookAppId: string;
  readonly children: React.ReactNode;
}

export function StorefrontAuthProvider({ shopId, facebookAppId, children }: StorefrontAuthProviderProps) {
  const [customer, setCustomer] = useState<StorefrontCustomer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load saved customer on mount
  useEffect(() => {
    setCustomer(loadCustomer());
    setIsLoading(false);
  }, []);

  // Load Facebook SDK
  useEffect(() => {
    if (typeof window === 'undefined' || !facebookAppId) return;
    if (document.getElementById('facebook-jssdk')) return;

    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({
        appId: facebookAppId,
        cookie: true,
        xfbml: false,
        version: 'v21.0',
      });
    };

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, [facebookAppId]);

  const login = useCallback(() => {
    const FB = (window as any).FB;
    if (!FB) return;

    FB.login(
      (response: any) => {
        if (response.authResponse?.accessToken) {
          exchangeToken(shopId, response.authResponse.accessToken, setCustomer);
        }
      },
      { scope: 'email,public_profile' }
    );
  }, [shopId]);

  const logout = useCallback(() => {
    clearCustomer();
    setCustomer(null);
  }, []);

  const getCustomerId = useCallback((): string => {
    if (customer) return customer.customerId;
    return getAnonCustomerId();
  }, [customer]);

  return (
    <StorefrontAuthContext.Provider value={{ customer, isLoading, login, logout, getCustomerId }}>
      {children}
    </StorefrontAuthContext.Provider>
  );
}

async function exchangeToken(
  shopId: string,
  accessToken: string,
  setCustomer: (c: StorefrontCustomer) => void
): Promise<void> {
  try {
    const res = await fetch(`/api/storefront/${shopId}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    });
    const body = await res.json();
    if (body.success && body.data) {
      const cust: StorefrontCustomer = {
        customerId: body.data.customerId,
        customerName: body.data.customerName,
        facebookId: body.data.facebookId,
      };
      saveCustomer(cust);
      setCustomer(cust);
    }
  } catch {
    // silently fail — user stays anonymous
  }
}

// ─── Login/Logout Button Component ───────────────────────────────────────

export function StorefrontLoginButton() {
  const { customer, isLoading, login, logout } = useStorefrontAuth();

  if (isLoading) return null;

  if (customer) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm flex items-center gap-1">
          <User className="size-4" />
          {customer.customerName}
        </span>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={login}
      variant="outline"
      size="sm"
      className="bg-[#1877F2] hover:bg-[#166FE5] text-white border-0"
    >
      <LogIn className="mr-1 size-4" />
      Login
    </Button>
  );
}
