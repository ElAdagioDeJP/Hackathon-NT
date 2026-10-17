import { documentApi } from "@/app/services/files/runtime";

type Context = { params: Promise<{ recordId: string; documentId: string }> };

export async function GET(request: Request, context: Context) {
  const { recordId, documentId } = await context.params;
  return documentApi.download(request, recordId, documentId);
}

export async function DELETE(request: Request, context: Context) {
  const { recordId, documentId } = await context.params;
  return documentApi.remove(request, recordId, documentId);
}
