import Link from "next/link";
import { Button } from "@/components/ui/button";

// H4 placeholder. §9 landing (pitch line, bounded claim, "Supervise a run", recent runs) is H28.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col items-start justify-center gap-6 px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Spatial SOC</h1>
      <p className="max-w-xl text-muted-foreground">
        Live supervision of coding agents. Proves when an agent drifted, faked a capability, or claimed
        something it didn&apos;t do. It does not prove the code is correct.
      </p>
      <Button asChild>
        <Link href="/runs/demo">Open the demo run</Link>
      </Button>
    </main>
  );
}
