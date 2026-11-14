#!/usr/bin/env node
// Usage (on the machine that holds the data): reset-pin <database path> <new 6-8 digit PIN>
import { AuthStore } from "../auth-store.js";

const [database, pin] = process.argv.slice(2);
if (!database || !/^\d{6,8}$/.test(pin ?? "")) {
  console.error("Usage: reset-pin <database path> <new PIN, 6-8 digits>");
  process.exit(2);
}
const auth = new AuthStore(database);
const name = auth.ownerName();
if (!(await auth.resetOwnerPin(pin))) {
  console.error("No owner in that database. Open the app and use the setup code instead.");
  process.exit(1);
}
auth.close();
console.log(`New PIN set for the owner${name ? ` "${name}"` : ""}. Everyone is logged out. Log in with the new PIN.`);
