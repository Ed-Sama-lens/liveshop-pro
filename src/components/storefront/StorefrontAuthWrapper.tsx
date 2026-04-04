'use client';

import { StorefrontAuthProvider } from './StorefrontAuth';

interface StorefrontAuthWrapperProps {
  readonly shopId: string;
  readonly facebookAppId: string;
  readonly children: React.ReactNode;
}

export function StorefrontAuthWrapper({ shopId, facebookAppId, children }: StorefrontAuthWrapperProps) {
  return (
    <StorefrontAuthProvider shopId={shopId} facebookAppId={facebookAppId}>
      {children}
    </StorefrontAuthProvider>
  );
}
