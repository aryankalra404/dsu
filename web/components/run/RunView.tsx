"use client";
// /runs/[id] (MVP.md §9): left claims + drift · centre code city + timeline · right Gate / Evidence / Patch.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Claim } from "@/lib/contracts";
import { useRun } from "@/lib/store";
import { useRunConnection } from "@/lib/useRun";
import { Badge, Card, Empty, SectionTitle, Spinner, Tabs } from "@/components/ui";
import { DriftMeter, RunHeader } from "@/components/run/Header";
import { ClaimsEditor, ClaimsList } from "@/components/run/ClaimsPanel";
import { Timeline } from "@/components/run/Timeline";
import { type Draft, GatePanel, useGateActions, useGateKeys } from "@/components/run/GatePanel";
import { EvidencePanel } from "@/components/run/EvidencePanel";
import { PatchPanel } from "@/components/run/PatchPanel";

const City = dynamic(() => import("@/components/city/City").then((m) => m.City), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <Spinner label="Building the city…" />
    </div>
  ),
});

type Tab = "gate" | "evidence" | "patch";

export function RunView({ runId }: { runId: string }) {
  useRunConnection(runId);
  const status = useRun((s) => s.status);
  const loadError = useRun((s) => s.loadError);
  const scene = useRun((s) => s.scene);
  const patches = useRun((s) => s.patches);
  const [tab, setTab] = useState<Tab>("gate");
  const [claimId, setClaimId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const which = scene?.gate.which ?? null;
  // HITL #1: seed an editable draft when the intent gate opens; drop it when it closes.
  useEffect(() => {
    if (which === "intent" && scene) {
      setDraft((d) => d ?? { claims: scene.claims, scope: scene.scope, probe: scene.probe_entry ?? "", happy: scene.happy_input ?? "" });
    } else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [which]);
  // a gate opening pulls the right panel to the Gate tab
  useEffect(() => {
    if (which) setTab("gate");
  }, [which]);

  const actions = useGateActions(scene, draft);
  useGateKeys(scene, actions);

  const claim = useMemo(() => scene?.claims.find((c) => c.id === claimId) ?? null, [scene?.claims, claimId]);

  if (status === "error")
    return (
      <div className="mx-auto max-w-lg py-24">
        <Card>
          <Empty title="This run can't be loaded">
            <p>{loadError}</p>
            <Link href="/runs/new" className="mt-3 inline-block text-accent underline">
              Start a new run
            </Link>
          </Empty>
        </Card>
      </div>
    );
  if (!scene)
    return (
      <div className="grid h-[70vh] place-items-center">
        <Spinner label="Loading run…" />
      </div>
    );

  const editing = which === "intent" && draft !== null;
  const onClaim = (c: Claim) => {
    setClaimId(c.id === claimId ? null : c.id);
    setTab("evidence");
  };

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <RunHeader scene={scene} />
      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_400px] gap-3 p-3">
        {/* left: claims + drift */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <SectionTitle right={<span className="font-mono text-[11px] text-faint">{(editing ? draft!.claims : scene.claims).length}</span>}>
            {editing ? "Claims — edit before starting" : "Claims"}
          </SectionTitle>
          <div className="soc-scroll min-h-0 flex-1 overflow-y-auto">
            {editing ? (
              <ClaimsEditor claims={draft!.claims} onChange={(claims) => setDraft({ ...draft!, claims })} />
            ) : scene.claims.length ? (
              <ClaimsList claims={scene.claims} selectedId={claimId} onSelect={onClaim} />
            ) : (
              <div className="p-4">
                <Spinner label="Extracting claims…" />
              </div>
            )}
          </div>
          <div className="border-t border-line pt-3">
            <DriftMeter drift={scene.drift} />
          </div>
        </Card>

        {/* centre: the city */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 p-2 pb-0">
            <City previewScope={editing ? draft!.scope : null} />
          </div>
          <Timeline />
        </Card>

        {/* right: gate / evidence / patch */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="p-3 pb-0">
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "gate", label: "Gate", badge: which ? <span className="size-1.5 rounded-full bg-danger" /> : null },
                { id: "evidence", label: "Evidence" },
                { id: "patch", label: "Patch", badge: patches.length ? <Badge tone="accent">{patches.length}</Badge> : null },
              ]}
            />
          </div>
          <div className="soc-scroll min-h-0 flex-1 overflow-y-auto">
            {tab === "gate" && <GatePanel scene={scene} draft={draft} setDraft={setDraft} actions={actions} />}
            {tab === "evidence" && <EvidencePanel scene={scene} claim={claim} />}
            {tab === "patch" && <PatchPanel scene={scene} />}
          </div>
        </Card>
      </div>
    </div>
  );
}
