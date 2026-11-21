import { Mic } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar, NAV } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

export function Layout() {
  const { pathname } = useLocation();
  const section = NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
  const callId = pathname.startsWith("/calls/") ? decodeURIComponent(pathname.split("/")[2]) : null;
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">Partner</BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                {callId ? <BreadcrumbLink href="/app/calls">Calls</BreadcrumbLink> : <BreadcrumbPage>{section?.label ?? "Overview"}</BreadcrumbPage>}
              </BreadcrumbItem>
              {callId && (<><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage className="font-mono">{callId}</BreadcrumbPage></BreadcrumbItem></>)}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:inline-flex">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> live · refreshes every 3 s
            </span>
            <Button asChild size="sm">
              <a href="/demo"><Mic className="size-4" /> Try it live</a>
            </Button>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
