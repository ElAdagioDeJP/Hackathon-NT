import { connection } from "next/server";
import {
  evolusErrorResponse,
  getTenderWorkflowExecution,
} from "@/app/services/ai/evolusBlocks";

type Context = { params: Promise<{ executionId: string }> };

export async function GET(_request: Request, context: Context) {
  // Live status from Evolus: never prerender or cache.
  await connection();
  const { executionId } = await context.params;
  if (!/^[\w-]{1,100}$/.test(executionId))
    return Response.json({ error: "Invalid executionId." }, { status: 400 });
  try {
    return Response.json(await getTenderWorkflowExecution(executionId));
  } catch (error) {
    return evolusErrorResponse(error);
  }
}
