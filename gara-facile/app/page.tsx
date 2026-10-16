import BusinessForm from "./business-profile/business-form";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { PROFILE_COOKIE } from "./services/business/profiles";
import { getProfileService } from "./services/business/runtime";
import { getDocumentService } from "./services/files/runtime";
import type { ProfileDocument, SavedProfile } from "./business-profile/types";

async function ProfileWorkspace() {
  const token = (await cookies()).get(PROFILE_COOKIE)?.value;
  if (!token) return <BusinessForm />;
  let saved: SavedProfile | null = null;
  let documents: ProfileDocument[] = [];
  let error = "";
  try {
    saved = (await getProfileService()).get(token);
    documents = saved ? (await getDocumentService()).list(saved.recordId) : [];
  } catch {
    error =
      "Your saved profile could not be loaded. Please reload before making changes.";
  }
  return (
    <BusinessForm
      initialSaved={saved}
      initialDocuments={documents}
      initialError={error}
    />
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="main-content" role="status">
          Loading your business profile...
        </main>
      }
    >
      <ProfileWorkspace />
    </Suspense>
  );
}
