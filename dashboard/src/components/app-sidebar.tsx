import { AudioLines, ClipboardList, Database, Inbox, LayoutDashboard, Mic, Phone, PhoneCall, Wrench } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { setDemo, useDemo } from "@/lib/data";
import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/calls", label: "Calls", icon: Phone },
  { to: "/followups", label: "Follow-ups", icon: ClipboardList },
  { to: "/tools", label: "Tool calls", icon: Wrench },
] as const;

// outside the SPA: the live pages served by the backend
const LIVE = [
  { href: "/demo", label: "Try it live", icon: Mic },
  { href: "/call", label: "New two-phone call", icon: PhoneCall },
  { href: "/platform", label: "Platform inbox", icon: Inbox },
] as const;

export function AppSidebar() {
  const { pathname } = useLocation();
  const demo = useDemo();
  const active = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="bg-foreground text-background flex aspect-square size-8 items-center justify-center rounded-lg">
                  <AudioLines className="size-4" />
                </div>
                <div className="flex flex-1 items-center gap-2 text-left leading-tight">
                  <span className="truncate text-[18px] font-semibold tracking-[-0.02em]">convox</span>
                  <span className="tag">on agora</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="eyebrow">Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => (
                <SidebarMenuItem key={n.to}>
                  <SidebarMenuButton asChild isActive={active(n.to)} tooltip={n.label}>
                    <Link to={n.to}>
                      <n.icon />
                      <span>{n.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="eyebrow">Live</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {LIVE.map((n) => (
                <SidebarMenuItem key={n.href}>
                  <SidebarMenuButton asChild tooltip={n.label}>
                    <a href={n.href}>
                      <n.icon />
                      <span>{n.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Demo data">
              <label className="cursor-pointer">
                <Database />
                <span className="flex flex-1 items-center justify-between gap-2">
                  Demo data
                  <Switch checked={demo} onCheckedChange={setDemo} aria-label="Demo data" className="scale-75" />
                </span>
              </label>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="text-muted-foreground px-2 text-[11px] leading-snug group-data-[collapsible=icon]:hidden">
          Agora Conversational AI · Sarvam ASR + Mayura · Murf Falcon · Claude tool calling
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
