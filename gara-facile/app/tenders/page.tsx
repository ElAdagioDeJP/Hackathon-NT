import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import type { SavedProfile } from "../business-profile/types";
import { PROFILE_COOKIE } from "../services/business/profiles";
import { getProfileService } from "../services/business/runtime";
import { TendersClient } from "./tenders-client";
import "./tenders.css";

export const metadata: Metadata = {
  title: "Tenders | Gara Facile",
  description:
    "Select a public tender, check eligibility against your business profile, and generate a draft bid.",
};

async function TendersWorkspace() {
  await connection();
  const token = (await cookies()).get(PROFILE_COOKIE)?.value;
  let recordId: number | null = null;
  let companyName: string | null = null;
  if (token) {
    try {
      const saved: SavedProfile | null = (await getProfileService()).get(token);
      if (saved) {
        recordId = saved.recordId;
        const name = saved.profile.name.trim();
        companyName = name ? name : null;
      }
    } catch {
      // Fall back to the demo company when the saved profile cannot load.
    }
  }
  return <TendersClient recordId={recordId} companyName={companyName} />;
}

export default function TendersPage() {
  return (
    <Suspense
      fallback={
        <main className="main-content" role="status">
          Loading tenders...
        </main>
      }
    >
      <TendersWorkspace />
    </Suspense>
  );
}
