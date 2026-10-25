import React from "react";

import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen flex-col bg-background text-foreground">
    {/* First stop for a keyboard user, so the nav can be skipped. */}
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100]
                 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2
                 focus:text-sm focus:text-primary-foreground"
    >
      Skip to content
    </a>

    <SiteHeader />
    <main id="main" className="flex flex-1 flex-col">
      {children}
    </main>
    <SiteFooter />
  </div>
);

export default AppLayout;
