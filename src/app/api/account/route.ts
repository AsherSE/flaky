import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { deleteAccount, sessionKey } from "@/lib/account";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/account — permanently delete the signed-in user's account.
 *
 * Required by App Store Review Guideline 5.1.1(v): an app that lets you create
 * an account must let you delete it from inside the app, not by emailing us.
 */
export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const phone = await redis.get<string>(sessionKey(token));
  if (!phone) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  try {
    await deleteAccount(phone);
  } catch (e) {
    console.error("Account deletion failed:", e);
    return NextResponse.json(
      { error: "Couldn't delete your account. Try again." },
      { status: 500 }
    );
  }

  // Belt and braces: the presented token may predate the session index.
  await redis.del(sessionKey(token)).catch(() => {});

  return NextResponse.json({ deleted: true });
}
