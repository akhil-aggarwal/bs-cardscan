import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAllowedUser } from "@/lib/verifyToken";

export const runtime = "nodejs";

// Issues a short-lived upload token so the phone can upload the catalogue straight to Vercel Blob.
export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "File storage is not connected yet. In Vercel open Storage → create a Blob store → connect it to this project, then redeploy." }, { status: 500 });
  }
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        await requireAllowedUser(clientPayload);
        return {
          allowedContentTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Upload failed." }, { status: 400 });
  }
}
