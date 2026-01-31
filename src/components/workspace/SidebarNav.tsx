"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home, Inbox, UploadCloud, Video } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Home", href: "/app", icon: Home },
  { title: "Connect", href: "/app/connect", icon: Inbox },
  { title: "Upload exports", href: "/app/upload", icon: UploadCloud },
  { title: "Runs", href: "/app/runs", icon: FileText },
  { title: "Remote Assist", href: "/app/remote-assist", icon: Video },
];

type SidebarNavProps = {
  variant?: "sidebar" | "sheet";
};

export function SidebarNav({ variant = "sidebar" }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <ScrollArea className="h-full px-3">
      <div className="space-y-1 pb-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.title}</span>
            </Link>
          );

          if (variant === "sheet") {
            return (
              <SheetClose key={item.href} asChild>
                {link}
              </SheetClose>
            );
          }

          return link;
        })}
      </div>
    </ScrollArea>
  );
}
