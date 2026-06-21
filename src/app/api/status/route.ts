import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getStore().getDashboardStatus();
  return NextResponse.json(status);
}
