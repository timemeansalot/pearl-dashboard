import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { agentReportSchema, isAllowedMachine, verifyBearerToken } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!verifyBearerToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const result = agentReportSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "invalid_report", details: result.error.flatten() },
      { status: 400 },
    );
  }

  if (!isAllowedMachine(result.data.machine)) {
    return NextResponse.json({ error: "unknown_machine" }, { status: 403 });
  }

  await getStore().saveAgentReport(result.data);

  return NextResponse.json({
    ok: true,
    machine: result.data.machine,
    gpu_count: result.data.gpus.length,
  });
}
