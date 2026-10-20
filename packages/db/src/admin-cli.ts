// Admin account commands (openspec change admin-sync-worker, capability
// admin-access "Admin Account Commands"). Accounts are created here only — the
// web has no account management.
//
//   pnpm admin:create <username>         create an admin (fails, unchanged, if the name exists)
//   pnpm admin:set-password <username>   replace the password; signs out every session of it
//   pnpm admin:disable <username>        disable the account; signs out every session of it
//
// The password comes from the ADMIN_PASSWORD environment variable when it is set
// and non-empty, otherwise from a hidden prompt (asked twice) on a terminal. It
// is NEVER accepted as a command-line argument (it would show up in `ps` and in
// shell history), never printed and never logged. Minimum 12 characters.
//
// The database is DATABASE_URL (shell first, then the repo-root .env through
// `tsx --env-file-if-exists`); the command prints the database name and host it
// writes to (never the URL, which holds a password).

import { hashAdminPassword } from "./admin-auth.js";
import { prisma, Prisma } from "./client.js";
import { adminPassword, adminUsername } from "@eflab/shared";

const USAGE = `usage: admin-cli.ts <create|set-password|disable> <username>
  The password is read from ADMIN_PASSWORD or a hidden prompt — never from an argument.`;

class CliError extends Error {}

function databaseLabel(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new CliError("DATABASE_URL is not set (shell or repo-root .env)");
  try {
    const u = new URL(raw);
    return `${u.pathname.replace(/^\//, "") || "(default)"} @ ${u.hostname}:${u.port || "5432"}`;
  } catch {
    throw new CliError("DATABASE_URL is not a valid URL");
  }
}

/** Read one line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return Promise.reject(new CliError("no terminal for the password prompt: set ADMIN_PASSWORD in the environment instead"));
  }
  return new Promise((resolve, reject) => {
    let value = "";
    process.stderr.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = (err: Error | null) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stderr.write("\n");
      if (err) reject(err); else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(null);
        if (ch === "\u0003" || ch === "\u0004") return done(new CliError("aborted"));
        if (ch === "\u007f" || ch === "\b") { value = [...value].slice(0, -1).join(""); continue; }
        if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readNewPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  let password: string;
  if (fromEnv !== undefined && fromEnv !== "") {
    password = fromEnv;
  } else {
    password = await promptHidden("New admin password (hidden): ");
    const again = await promptHidden("Repeat the password: ");
    if (again !== password) throw new CliError("the two passwords differ — nothing stored");
  }
  const check = adminPassword.safeParse(password);
  if (!check.success) throw new CliError(`${check.error.issues[0]?.message ?? "invalid password"} — nothing stored`);
  return password;
}

async function main(): Promise<void> {
  const [command, name, ...extra] = process.argv.slice(2);
  if (!command || !name) throw new CliError(USAGE);
  if (extra.length > 0) {
    throw new CliError(`unexpected extra argument(s) — the password is never accepted on the command line\n${USAGE}`);
  }
  const parsedName = adminUsername.safeParse(name);
  if (!parsedName.success) throw new CliError(parsedName.error.issues[0]?.message ?? "invalid user name");
  const username = parsedName.data;
  const db = databaseLabel();

  switch (command) {
    case "create": {
      const existing = await prisma.admin.findUnique({ where: { username }, select: { id: true } });
      if (existing) throw new CliError(`admin "${username}" already exists — unchanged (database ${db})`);
      const passwordHash = await hashAdminPassword(await readNewPassword());
      try {
        const row = await prisma.admin.create({ data: { username, passwordHash }, select: { id: true } });
        console.log(`admin "${username}" created (id ${row.id}) in database ${db}`);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new CliError(`admin "${username}" already exists — unchanged (database ${db})`);
        }
        throw err;
      }
      return;
    }
    case "set-password": {
      const existing = await prisma.admin.findUnique({ where: { username }, select: { id: true } });
      if (!existing) throw new CliError(`no admin "${username}" in database ${db}`);
      const passwordHash = await hashAdminPassword(await readNewPassword());
      const [, revoked] = await prisma.$transaction([
        prisma.admin.update({
          where: { id: existing.id },
          data: { passwordHash, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null },
        }),
        prisma.adminSession.deleteMany({ where: { adminId: existing.id } }),
      ]);
      console.log(`password of admin "${username}" changed in database ${db}; ${revoked.count} session(s) signed out`);
      return;
    }
    case "disable": {
      const existing = await prisma.admin.findUnique({ where: { username }, select: { id: true, disabledAt: true } });
      if (!existing) throw new CliError(`no admin "${username}" in database ${db}`);
      const [, revoked] = await prisma.$transaction([
        prisma.admin.update({ where: { id: existing.id }, data: { disabledAt: existing.disabledAt ?? new Date() } }),
        prisma.adminSession.deleteMany({ where: { adminId: existing.id } }),
      ]);
      console.log(`admin "${username}" ${existing.disabledAt ? "was already disabled" : "disabled"} in database ${db}; ${revoked.count} session(s) signed out`);
      return;
    }
    default:
      throw new CliError(`unknown command "${command}"\n${USAGE}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    // Expected failures print their message only; anything else prints the error
    // without the environment (no password can reach an error: it is never part
    // of a query, only its hash is).
    console.error(err instanceof CliError ? `admin: ${err.message}` : err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
