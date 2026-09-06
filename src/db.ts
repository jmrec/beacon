import { neon } from "@neondatabase/serverless";
import { env } from "./env";

let client: ReturnType<typeof neon>;

export function getClient() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in the environment");
  }

  if (!client) {
    client = neon(env.DATABASE_URL);
  }
  return client;
}
