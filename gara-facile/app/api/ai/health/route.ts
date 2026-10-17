import { health } from "@/app/services/ai/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [extract, draft] = await Promise.all([health("extract"), health("draft")]);
  return Response.json({
    extract,
    draft,
    gpu: process.env.AMD_GPU_LABEL ?? null,
  });
}
