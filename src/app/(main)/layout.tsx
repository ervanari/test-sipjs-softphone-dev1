'use client';

import LayoutWrapper from '@/components/LayoutWrapper';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LayoutWrapper>{children}</LayoutWrapper>;
}
