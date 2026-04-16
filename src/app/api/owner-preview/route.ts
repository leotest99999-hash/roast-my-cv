import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logApiError } from "@/lib/api-errors";
import { ownerPreviewCookieName } from "@/lib/owner-preview";

export const runtime = "nodejs";

function buildOwnerPreviewResponse(enabled: boolean) {
  return NextResponse.json({ enabled });
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const enabled =
      cookieStore.get(ownerPreviewCookieName)?.value === "enabled";

    return buildOwnerPreviewResponse(enabled);
  } catch (error) {
    logApiError("owner-preview:get", error);
    return buildOwnerPreviewResponse(false);
  }
}

export async function POST(request: Request) {
  try {
    const ownerPreviewToken = process.env.OWNER_PREVIEW_TOKEN;

    if (!ownerPreviewToken) {
      return NextResponse.json(
        { error: "Owner preview is not configured." },
        { status: 404 },
      );
    }

    const body = (await request.json()) as {
      token?: string;
    };

    if (!body.token || body.token !== ownerPreviewToken) {
      return NextResponse.json(
        { error: "That access code was not accepted." },
        { status: 401 },
      );
    }

    const response = buildOwnerPreviewResponse(true);
    response.cookies.set({
      name: ownerPreviewCookieName,
      value: "enabled",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    logApiError("owner-preview:post", error);
    return NextResponse.json(
      { error: "We couldn't update owner preview right now." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const response = buildOwnerPreviewResponse(false);
    response.cookies.set({
      name: ownerPreviewCookieName,
      value: "",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    logApiError("owner-preview:delete", error);
    return NextResponse.json(
      { error: "We couldn't disable owner preview right now." },
      { status: 500 },
    );
  }
}
