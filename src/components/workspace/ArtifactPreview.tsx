import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export type ArtifactPreviewProps = {
  title: string;
  date: string;
  decision: string;
  why: string;
  boundary: string;
};

export function ArtifactPreview({
  title,
  date,
  decision,
  why,
  boundary,
}: ArtifactPreviewProps) {
  return (
    <Card className="rounded-2xl border border-border/60 bg-background/90">
      <CardHeader className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Latest conclusion
        </p>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Decision
          </p>
          <p className="text-sm text-foreground">{decision}</p>
        </div>
        <Separator />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Boundary
          </p>
          <p>{boundary}</p>
        </div>
        <Separator />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Why
          </p>
          <p>{why}</p>
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <p className="text-xs text-muted-foreground">
          Finite artifacts only.
        </p>
        <Button asChild size="sm">
          <Link href="/app/analysis">Open</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
