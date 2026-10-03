// Talking to Vandal through native messaging (PLAN 3N.7). The installer
// registers the host `com.vandal.desktop` (the installed vandal.exe), and
// `npm run ext:host-dev` registers `com.vandal.desktop.dev` (a dev build).

import { type VandalHost, getSettings } from "./settings";

export const HOSTS: Record<VandalHost, string> = {
  installed: "com.vandal.desktop",
  dev: "com.vandal.desktop.dev",
};

export interface VandalInfo {
  host: VandalHost;
  /** "Vandal" or "Vandal Dev". */
  name: string;
  version: string;
}

export interface VandalStatus {
  /** Each registered host that answered. */
  found: VandalInfo[];
  /** The one captures go to: the chosen one if found, else any found. */
  target: VandalInfo | null;
  /** Why there's no target although a host is registered: what it said
   *  (e.g. "Vandal Dev isn't running…"). Unset when none is registered. */
  problem?: string;
}

/** What to say when there's no target. */
export function unavailableText(status: VandalStatus): string {
  return status.problem ?? "Vandal isn't installed, so captures can't open in its editor.";
}

/** How long a status is reused: each check starts vandal.exe once per host. */
const STATUS_MS = 60_000;
/** Raw bytes per chunk: a multiple of 3, so each chunk's base64 has no padding,
 *  and far under Chrome's 64 MiB message cap once encoded. */
const CHUNK = 6 * 1024 * 1024;

type Hello = { info: VandalInfo } | { problem: string } | null;

/** A host's answer: its info, what it said when it refused, or null when it
 *  isn't registered (or didn't start). */
async function hello(host: VandalHost): Promise<Hello> {
  try {
    const reply = await chrome.runtime.sendNativeMessage(HOSTS[host], { type: "hello" });
    if (reply?.ok) return { info: { host, name: reply.name, version: reply.version } };
    return typeof reply?.error === "string" ? { problem: reply.error } : null;
  } catch {
    return null;
  }
}

/** Which Vandals answer, and which one captures go to. `fresh` skips the
 *  cached answer (Options, after installing Vandal). */
export async function vandalStatus(fresh = false): Promise<VandalStatus> {
  const cached = await chrome.storage.session.get("vandalStatus");
  type Entry = { at: number; found: VandalInfo[]; problem?: string };
  let entry = cached.vandalStatus as Entry | undefined;
  if (fresh || !entry || Date.now() - entry.at >= STATUS_MS) {
    const answers = await Promise.all([hello("installed"), hello("dev")]);
    entry = {
      at: Date.now(),
      found: answers.flatMap((a) => (a && "info" in a ? [a.info] : [])),
      problem: answers.flatMap((a) => (a && "problem" in a ? [a.problem] : []))[0],
    };
    await chrome.storage.session.set({ vandalStatus: entry });
  }
  const { found, problem } = entry;
  const { vandalHost } = await getSettings();
  const target = found.find((f) => f.host === vandalHost) ?? found[0] ?? null;
  return { found, target, problem: target ? undefined : problem };
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Send a capture to Vandal's editor. Resolves when Vandal has it; rejects
 *  with a reason to show otherwise. */
export async function openInVandal(target: VandalInfo, image: Blob, title: string): Promise<void> {
  const port = chrome.runtime.connectNative(HOSTS[target.host]);
  const reply = new Promise<void>((resolve, reject) => {
    port.onMessage.addListener((msg: { ok: boolean; error?: string }) => {
      port.disconnect();
      if (msg.ok) resolve();
      else reject(new Error(msg.error ?? `${target.name} refused the capture`));
    });
    port.onDisconnect.addListener(() => {
      const why = chrome.runtime.lastError?.message;
      reject(new Error(why ? `${target.name} isn't reachable: ${why}` : "the connection closed"));
    });
  });
  port.postMessage({ type: "begin", title });
  for (let at = 0; at < image.size; at += CHUNK) {
    port.postMessage({ type: "chunk", data: await toBase64(image.slice(at, at + CHUNK)) });
  }
  port.postMessage({ type: "end" });
  await reply;
}
