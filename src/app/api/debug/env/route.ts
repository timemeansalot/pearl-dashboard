import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const names = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "PGHOST",
  "PGPASSWORD",
  "TITAN_AGENT_TOKEN",
  "PEARL_ADDRESS",
  "ALLOWED_MACHINES",
];

export async function GET() {
  const present = Object.fromEntries(
    names.map((name) => [name, Boolean(process.env[name])]),
  );

  const databaseLikeNames = Object.keys(process.env)
    .filter((name) => /DATABASE|POSTGRES|PGHOST|PGPASSWORD|NEON/i.test(name))
    .sort();

  return NextResponse.json({
    node_env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV,
    present,
    database_like_env_names: databaseLikeNames,
  });
}
