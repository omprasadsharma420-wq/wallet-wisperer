import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "web-demo");
const output = join(root, "dist");

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lzbtttgggoxumbcjqqsu.supabase.co";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_v5pAWpqrnyLyEMlNeaZPAg_4xah6LqS";

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await writeFile(
  join(output, "config.js"),
  `window.WALLET_WHISPERER_CONFIG = ${JSON.stringify({ supabaseUrl, supabaseAnonKey }, null, 2)};\n`,
);

console.log("Wallet Whisperer web build ready in dist/");
