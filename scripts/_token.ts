import { closeDb } from "../src/lib/db";
import { authenticate } from "../src/lib/auth/service";

async function main() {
  const email = process.argv[2] ?? "demo.admin@organix.local";
  const result = await authenticate({
    email,
    password: process.env.ORGANIX_SEED_PASSWORD ?? "Demo-Organix-2026!",
    ip: "127.0.0.1",
    userAgent: "smoke-test",
  });
  if (!result.ok) {
    console.error(JSON.stringify(result));
    process.exitCode = 1;
    await closeDb();
    return;
  }
  console.log(result.data.token);
  await closeDb();
}
main();
