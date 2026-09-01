import { resolve } from "node:path";
import { config } from "dotenv";

// Every service loads one root .env (repo convention). Populate process.env
// before @stall/config's `loadEnv()` runs at import time.
config({ path: resolve(__dirname, "../../../.env") });
