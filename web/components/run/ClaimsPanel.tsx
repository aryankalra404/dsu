"use client";
import { Plus, Trash2 } from "lucide-react";
import type { Claim, ClaimType } from "@/lib/contracts";
import { CLAIM_TYPES } from "@/lib/contracts";
import { CLAIM_TYPE_LABEL } from "@/lib/design";
import { Badge, Button, cx, inputClass } from "@/components/ui";
import { ClaimTypeBadge, VerdictBadge } from "@/components/run/bits";

const GROUPS: { title: string; sources: string[] }[] = [
  { title: "Confirmed intent", sources: ["llm", "rules", "human"] },
  { title: "What the agent said", sources: ["agent"] },
  { title: "Auto", sources: ["auto", "ast"] },
];

export function ClaimsList({ claims, selectedId, onSelect }: {
  claims: Claim[];
  selectedId: string | null;
  onSelect: (c: Claim) => void;
}) {
  return (
    <div className="space-y-4 px-3 pb-3">
      {GROUPS.map((g) => {
        const items = claims.filter((c) => g.sources.includes(c.source));
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-ink">{g.title}</span>
              <span className="font-mono text-[11px] text-faint">{items.length}</span>
            </div>
            <div className="space-y-1.5">
              {items.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className={cx(
                    "w-full rounded-xl border px-3 py-2.5 text-left transition",
                    selectedId === c.id ? "border-accent bg-accent-soft/50" : "border-line bg-surface hover:border-line-strong",
                    ["FAKE", "DEAD", "DRIFT", "VULN"].includes(c.verdict?.verdict ?? "") && selectedId !== c.id && "border-l-[3px] border-l-danger",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <ClaimTypeBadge type={c.type} />
                    <VerdictBadge verdict={c.verdict?.verdict} />
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-ink">{c.text}</p>
                  {c.target && <p className="mt-1 truncate font-mono text-[11px] text-muted">→ {c.target}</p>}
                  {c.verdict && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">{c.verdict.rule}</p>}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TARGET_HINT: Partial<Record<ClaimType, string>> = {
  fetches_external: "host, e.g. api.stripe.com (empty = any)",
  declares_capability: "function name, or “tests”",
  reasons_on_input: "",
};

export function ClaimsEditor({ claims, onChange }: { claims: Claim[]; onChange: (c: Claim[]) => void }) {
  const update = (i: number, patch: Partial<Claim>) => onChange(claims.map((c, j) => (j === i ? { ...c, ...patch, source: c.source === "auto" ? "auto" : "human" } : c)));
  const add = () => {
    const nums = claims.map((c) => Number(c.id.slice(1))).filter((n) => !Number.isNaN(n));
    onChange([
      ...claims,
      { id: `c${Math.max(0, ...nums) + 1}`, type: "fetches_external", text: "", target: null, axis: null, source: "human", confirmed: false },
    ]);
  };
  return (
    <div className="space-y-2 px-3 pb-3">
      <p className="px-1 text-xs leading-relaxed text-muted">
        These become the acceptance checks. Edit anything; each claim type has exactly one deterministic rule.
      </p>
      {claims.map((c, i) => (
        <div key={c.id} className="rounded-xl border border-line bg-surface p-2.5">
          <div className="flex items-center gap-1.5">
            <select
              className="h-7 rounded-md border border-line bg-sunken px-1.5 text-xs font-medium outline-none focus:border-accent"
              value={c.type}
              disabled={c.source === "auto"}
              onChange={(e) => update(i, { type: e.target.value as ClaimType })}
            >
              {CLAIM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CLAIM_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <Badge tone="muted">{c.source}</Badge>
            <button
              className="ml-auto grid size-7 place-items-center rounded-md text-faint hover:bg-danger-soft hover:text-danger"
              title="Remove claim"
              onClick={() => onChange(claims.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <textarea
            className={cx(inputClass, "mt-2 min-h-[52px] resize-y py-1.5 text-[13px] leading-snug")}
            value={c.text}
            placeholder="What must be true…"
            onChange={(e) => update(i, { text: e.target.value })}
          />
          {c.type in TARGET_HINT && (
            <input
              className={cx(inputClass, "mt-1.5 py-1.5 font-mono text-xs")}
              placeholder={c.type === "reasons_on_input" ? "axis, e.g. income" : TARGET_HINT[c.type]}
              value={(c.type === "reasons_on_input" ? c.axis : c.target) ?? ""}
              onChange={(e) =>
                update(i, c.type === "reasons_on_input" ? { axis: e.target.value || null } : { target: e.target.value || null })
              }
            />
          )}
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={add} className="w-full border border-dashed border-line">
        <Plus className="size-3.5" /> Add claim
      </Button>
    </div>
  );
}
