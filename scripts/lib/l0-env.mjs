import fs from "fs";
import path from "path";

export function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

export function requireEnv(name) {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing env: ${name} (set in .env.local)`);
  return v;
}
