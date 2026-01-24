"use client";

import Link from "next/link";
import { Menu, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { SidebarNav } from "@/src/components/workspace/SidebarNav";
import { businessName } from "@/src/lib/demo/demoData";

export function TopBar() {
  return (
    <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0">
            <div className="border-b border-border/60 px-5 py-4">
              <p className="text-sm font-semibold">{businessName}</p>
              <p className="text-xs text-muted-foreground">
                One conclusion at a time.
              </p>
            </div>
            <SidebarNav variant="sheet" />
          </SheetContent>
        </Sheet>
        <Link href="/app" className="text-sm font-semibold tracking-tight">
          {businessName}
        </Link>
        <Badge variant="secondary" className="rounded-full text-xs">
          UI v0
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Button asChild className="hidden sm:inline-flex">
          <Link href="/app/analysis">Open latest artifact</Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Workspace menu">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Workspace</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Summary (soon)</DropdownMenuItem>
            <DropdownMenuItem>Request history</DropdownMenuItem>
            <DropdownMenuItem>Guidelines</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
