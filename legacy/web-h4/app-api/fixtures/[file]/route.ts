// Serves web/fixtures/* for ?replay=local so the fixture has one source on disk (no copy in public/).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const ALLOWED: Record<string, string> = {
  "scene.json": "application/json",
  "events.jsonl": "application/x-ndjson",
};

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const type = ALLOWED[file];
  if (!type) return NextResponse.json({ error: "unknown fixture" }, { status: 404 });
  const body = await readFile(path.join(process.cwd(), "fixtures", file), "utf8");
  return new NextResponse(body, { headers: { "content-type": type, "cache-control": "no-store" } });
}
