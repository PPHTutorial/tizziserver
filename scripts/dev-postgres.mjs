#!/usr/bin/env node
/**
 * Local Postgres for development WITHOUT Docker.
 * Spins a self-contained cluster in ./.pgdata (trust auth, no password) and a
 * `grandprice` database. Use when Docker Desktop is unavailable.
 *
 *   node scripts/dev-postgres.mjs start   # initdb (first run) + start on :5432 + createdb
 *   node scripts/dev-postgres.mjs stop
 *   node scripts/dev-postgres.mjs status
 *
 * Requires a Postgres install providing initdb/pg_ctl/createdb/pg_isready
 * (Windows: "C:\\Program Files\\PostgreSQL\\<v>\\bin"; else they must be on PATH).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DATADIR = resolve(ROOT, ".pgdata");
const PORT = process.env.PGPORT || "5432";
const DB = "grandprice";

function pgBin() {
  if (process.platform === "win32") {
    const base = "C:\\Program Files\\PostgreSQL";
    if (existsSync(base)) {
      const versions = readdirSync(base).filter((d) => /^\d+$/.test(d)).sort((a, b) => b - a);
      for (const v of versions) {
        const bin = `${base}\\${v}\\bin`;
        if (existsSync(`${bin}\\pg_ctl.exe`)) return bin;
      }
    }
    return null; // hope they're on PATH
  }
  return null;
}

const BIN = pgBin();
const exe = (name) => (BIN ? `${BIN}${process.platform === "win32" ? "\\" : "/"}${name}` : name);
const run = (name, args, opts = {}) =>
  execFileSync(exe(name), args, { stdio: "inherit", ...opts });
const quiet = (name, args) => {
  try {
    return execFileSync(exe(name), args, { stdio: "pipe" }).toString();
  } catch (e) {
    return e.stdout?.toString() ?? "";
  }
};

const cmd = process.argv[2] ?? "start";

if (cmd === "start") {
  if (!existsSync(resolve(DATADIR, "PG_VERSION"))) {
    console.log(`initdb -> ${DATADIR}`);
    run("initdb", ["-D", DATADIR, "-U", "postgres", "-A", "trust", "--encoding=UTF8"]);
  }
  const ready = quiet("pg_isready", ["-p", PORT]).includes("accepting connections");
  if (!ready) {
    console.log(`starting postgres on :${PORT}`);
    run("pg_ctl", ["-D", DATADIR, "-o", `-p ${PORT}`, "-l", resolve(DATADIR, "server.log"), "start"]);
  } else {
    console.log(`postgres already accepting connections on :${PORT}`);
  }
  const dbs = quiet("psql", ["-U", "postgres", "-p", PORT, "-lqt"]);
  if (!dbs.split("\n").some((l) => l.trim().startsWith(DB + " ") || l.trim().startsWith(DB + "|"))) {
    console.log(`createdb ${DB}`);
    try {
      run("createdb", ["-U", "postgres", "-p", PORT, DB]);
    } catch {
      console.log(`(db ${DB} may already exist)`);
    }
  }
  console.log(`\nready: postgresql://postgres@localhost:${PORT}/${DB}`);
} else if (cmd === "stop") {
  run("pg_ctl", ["-D", DATADIR, "stop", "-m", "fast"]);
} else if (cmd === "status") {
  console.log(quiet("pg_ctl", ["-D", DATADIR, "status"]));
} else {
  console.error(`unknown command: ${cmd} (use start|stop|status)`);
  process.exit(1);
}
