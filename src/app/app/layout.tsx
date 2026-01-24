import { SidebarNav } from "@/src/components/workspace/SidebarNav";
import { TopBar } from "@/src/components/workspace/TopBar";
import { Separator } from "@/components/ui/separator";
import { businessName } from "@/src/lib/demo/demoData";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_rgba(15,23,42,0.08),_transparent_60%)]">
      <div className="mx-auto flex min-h-screen max-w-6xl">
        <aside className="hidden w-64 flex-col border-r border-border/60 bg-muted/40 lg:flex">
          <div className="px-5 py-6">
            <p className="text-sm font-semibold">{businessName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Finite artifacts and one clear next step.
            </p>
          </div>
          <Separator />
          <div className="flex-1 py-3">
            <SidebarNav />
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <TopBar />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
          <footer className="border-t border-border/60 px-6 py-4 text-xs text-muted-foreground">
            Finite artifacts: a conclusion + a boundary.
          </footer>
        </div>
      </div>
    </div>
  );
}
