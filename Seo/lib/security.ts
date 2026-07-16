import { lookup } from "node:dns/promises";
import net from "node:net";

const unsafeHosts = new Set(["localhost", "localhost.localdomain", "metadata.google.internal", "metadata.azure.internal"]);
export function normalizeUrl(input: string) {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  const url = new URL(candidate);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http and https URLs can be audited.");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed.");
  url.hash = "";
  return url;
}
export function isPrivateIp(ip: string) {
  if (net.isIP(ip) === 4) { const [a,b] = ip.split(".").map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224; }
  const n = ip.toLowerCase(); return n === "::1" || n === "::" || n.startsWith("fc") || n.startsWith("fd") || n.startsWith("fe80:");
}
export async function assertPublicUrl(url: URL) {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (unsafeHosts.has(host) || host.endsWith(".localhost")) throw new Error("This host is not safe to audit.");
  if (net.isIP(host) && isPrivateIp(host)) throw new Error("Private and loopback IP addresses are not allowed.");
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) throw new Error("This hostname resolves to a private or unsafe network address.");
}
