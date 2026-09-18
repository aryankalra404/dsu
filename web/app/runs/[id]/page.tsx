import { Suspense } from "react";
import { RunView } from "@/components/run/RunView";

// /runs/[id] — three columns (DESIGN.md → Layout parity): left claims · centre city · right Evidence/Patch/Gate.
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <RunView runId={id} />
    </Suspense>
  );
}
