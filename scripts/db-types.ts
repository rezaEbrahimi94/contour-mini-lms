// Regenerates lib/database.types.ts from the migrated local database, or with
// --check fails when the committed file no longer matches the schema.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { format } from "prettier";
import { projectRoot, supabase } from "../tests/support/stack.ts";

const path = join(projectRoot, "lib", "database.types.ts");
const generated = supabase([
  "gen",
  "types",
  "typescript",
  "--schema",
  "public",
]);
const types = await format(generated, { parser: "typescript" });
if (process.argv.includes("--check")) {
  if ((await readFile(path, "utf8")) !== types)
    throw new Error("Database types changed. Run npm run db:types.");
} else {
  await writeFile(path, types);
}
