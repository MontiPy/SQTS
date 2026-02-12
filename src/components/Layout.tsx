import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Breadcrumb from './Breadcrumb';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Breadcrumb />
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="container mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
