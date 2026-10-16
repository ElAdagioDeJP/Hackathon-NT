import { FileApiError } from "../files/errors";
import { PROFILE_COOKIE, type ProfileService } from "./profiles";
import { getProfileService } from "./runtime";

export function createProfileRequestAuthorizer(
  getService: () => ProfileService | Promise<ProfileService>,
) {
  return async function authorizeProfileRequest(
    request: Request,
    recordId: number,
  ) {
    const cookie = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${PROFILE_COOKIE}=`));
    const token = cookie?.slice(PROFILE_COOKIE.length + 1);
    if (!token)
      throw new FileApiError(
        401,
        "UNAUTHORIZED",
        "Your business session is required.",
      );
    const origin = request.headers.get("origin");
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    let sameOrigin = false;
    try {
      const source = new URL(origin ?? "");
      const protocol =
        request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1);
      sameOrigin = source.host === host && source.protocol === `${protocol}:`;
    } catch {
      /* Missing or malformed origins cannot authorize a mutation. */
    }
    if (["POST", "DELETE"].includes(request.method) && !sameOrigin)
      throw new FileApiError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "The request must come from this application.",
      );
    const service = await getService();
    if (!service.owns(token, recordId))
      throw new FileApiError(
        404,
        "PROFILE_NOT_FOUND",
        "The business profile was not found.",
      );
  };
}

export const authorizeProfileRequest =
  createProfileRequestAuthorizer(getProfileService);
