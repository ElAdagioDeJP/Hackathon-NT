import { documentApi } from "@/app/services/files/runtime";

type Context = { params: Promise<{ recordId: string }> };

export async function GET(request: Request, context: Context) {
  const { recordId } = await context.params;
  return documentApi.list(request, recordId);
}

export async function POST(request: Request, context: Context) {
  const { recordId } = await context.params;
  return documentApi.upload(request, recordId);
}
