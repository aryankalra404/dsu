// /runs/[id] — three columns (DESIGN.md → Layout parity): left claims · centre city · right Evidence/Patch/Gate.
// Filled in by web-H4 items 3–4; this is the 1280 px-safe frame.
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto grid h-screen w-full max-w-[1280px] grid-cols-[280px_1fr_320px] grid-rows-[48px_1fr] gap-px bg-border">
      <header className="col-span-3 flex items-center gap-3 bg-background px-4 text-sm">
        <span className="font-semibold">Spatial SOC</span>
        <span className="font-mono text-muted-foreground">run {id}</span>
      </header>
      <aside className="bg-background p-3 text-sm text-muted-foreground">Claims</aside>
      <section className="bg-soc-bg" />
      <aside className="bg-background p-3 text-sm text-muted-foreground">Evidence · Patch · Gate</aside>
    </main>
  );
}
