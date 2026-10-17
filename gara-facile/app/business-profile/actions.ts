"use server";

import { cookies } from "next/headers";
import {
  PROFILE_COOKIE,
  PROFILE_SESSION_SECONDS,
  ProfileError,
} from "../services/business/profiles";
import { getProfileService } from "../services/business/runtime";
import type { ProfileErrors, SavedProfile } from "./types";

export async function saveBusinessProfile(
  input: unknown,
  complete: boolean,
  approve = false,
): Promise<
  { saved: SavedProfile } | { error: string; fields?: ProfileErrors }
> {
  try {
    const jar = await cookies();
    const service = await getProfileService();
    const token = jar.get(PROFILE_COOKIE)?.value;
    const { saved, newToken } = service.save(
      service.get(token) ? token : undefined,
      input,
      complete === true,
      approve === true,
    );
    if (newToken)
      jar.set(PROFILE_COOKIE, newToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: PROFILE_SESSION_SECONDS,
      });
    return { saved };
  } catch (error) {
    if (error instanceof ProfileError)
      return { error: error.message, fields: error.fields };
    console.error("Could not save business profile", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "Your profile could not be saved. Please try again." };
  }
}
