import { authorizeProfileRequest } from "@/app/services/business/session";
import { FileApiError } from "@/app/services/files/errors";
import { getDocumentService } from "@/app/services/files/runtime";
import { EvolusApiError } from "@/app/services/match/evolus";
import { companyFactsText, syncLibrary, type LibraryFile } from "@/app/services/ai/library";
import { getCompanyFacts } from "@/app/services/ai/profileFacts";

// POST { businessRecordId? } → uploads the company sheet (and the profile's documents) to Evolus.
// Without businessRecordId it syncs only the demo company sheet.
export async function POST(request: Request) {
  try {
    const { businessRecordId } = (await request.json().catch(() => ({}))) as {
      businessRecordId?: unknown;
    };
    if (
      businessRecordId !== undefined &&
      !(Number.isSafeInteger(businessRecordId) && (businessRecordId as number) > 0)
    )
      throw new FileApiError(400, "INVALID_ID", "businessRecordId must be a positive integer.");
    const id = businessRecordId as number | undefined;
    if (id) await authorizeProfileRequest(request, id);

    const facts = await getCompanyFacts(id);
    const files: LibraryFile[] = [
      {
        name: `scheda-azienda-${id ?? "demo"}.txt`,
        bytes: new TextEncoder().encode(companyFactsText(facts)),
        mimeType: "text/plain",
      },
    ];
    if (id) {
      const service = await getDocumentService();
      for (const doc of service.list(id)) {
        const stored = await service.download(id, doc.id);
        files.push({
          name: doc.originalName,
          bytes: new Uint8Array(await new Response(stored.body).arrayBuffer()),
          mimeType: doc.mimeType,
        });
      }
    }

    // Demo tenders and company data are Italian; language is always explicit.
    return Response.json(await syncLibrary(files, "it"));
  } catch (error) {
    if (error instanceof FileApiError)
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    if (error instanceof EvolusApiError)
      return Response.json(
        { error: { code: "EVOLUS_ERROR", message: error.message, evolusStatus: error.status ?? null } },
        { status: 502 },
      );
    console.error("Library sync failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: { code: "LIBRARY_SYNC_FAILED", message: "Library sync failed." } }, { status: 500 });
  }
}
