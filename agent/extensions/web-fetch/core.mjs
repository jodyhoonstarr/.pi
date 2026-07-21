import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

const MAX_REDIRECTS = 10;
const STATUS_MARKER = "\n__PI_FETCH_WEB_STATUS__";
const REDIRECT_MARKER = "\n__PI_FETCH_WEB_REDIRECT__";

function normalizeHostname(hostname) {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isBlockedIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 192 && second === 2) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0)
  );
}

function isBlockedIpv6(address) {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;

  // IPv4-mapped IPv6 addresses can otherwise bypass the IPv4 checks.
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4[1]);

  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("100:") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("ff")
  );
}

function isBlockedAddress(address) {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

function assertSupportedUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not supported");
  }

  return url;
}

async function resolvePublicAddresses(url, allowPrivateNetwork) {
  const hostname = normalizeHostname(url.hostname);
  if (!hostname) throw new Error("URL must include a hostname");

  if (!allowPrivateNetwork && (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local"))) {
    throw new Error(`Private-network host blocked: ${hostname}`);
  }

  const addresses = isIP(hostname)
    ? [hostname]
    : [...new Set((await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address))];

  if (addresses.length === 0) throw new Error(`No IP addresses found for ${hostname}`);

  if (!allowPrivateNetwork) {
    const blockedAddress = addresses.find(isBlockedAddress);
    if (blockedAddress) {
      throw new Error(`Private or reserved address blocked: ${hostname} resolves to ${blockedAddress}`);
    }
  }

  return { hostname, addresses };
}

function parseCurlResponse(stdout) {
  const statusIndex = stdout.lastIndexOf(STATUS_MARKER);
  if (statusIndex === -1) throw new Error("curl did not return an HTTP status");

  const body = stdout.slice(0, statusIndex);
  const metadata = stdout.slice(statusIndex + STATUS_MARKER.length);
  const redirectIndex = metadata.indexOf(REDIRECT_MARKER);
  if (redirectIndex === -1) throw new Error("curl did not return redirect metadata");

  const status = Number(metadata.slice(0, redirectIndex).trim());
  const redirectUrl = metadata.slice(redirectIndex + REDIRECT_MARKER.length).trim();
  if (!Number.isInteger(status)) throw new Error("curl returned an invalid HTTP status");

  return { body, status, redirectUrl };
}

function curlResolveValue(hostname, port, addresses) {
  const resolvedAddresses = addresses.map((address) => (isIP(address) === 6 ? `[${address}]` : address));
  return `${hostname}:${port}:${resolvedAddresses.join(",")}`;
}

async function fetchPublicHtml(exec, initialUrl, timeoutMs, signal, allowPrivateNetwork) {
  let currentUrl = assertSupportedUrl(initialUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const { hostname, addresses } = await resolvePublicAddresses(currentUrl, allowPrivateNetwork);
    const port = Number(currentUrl.port || (currentUrl.protocol === "https:" ? 443 : 80));
    const result = await exec(
      "curl",
      [
        "--silent",
        "--show-error",
        "--max-time",
        String(Math.max(1, Math.ceil(timeoutMs / 1000))),
        "--proto",
        "=http,https",
        "--resolve",
        curlResolveValue(hostname, port, addresses),
        "-A",
        "Mozilla/5.0 (pi web fetch)",
        "--write-out",
        `${STATUS_MARKER}%{http_code}${REDIRECT_MARKER}%{redirect_url}`,
        currentUrl.href,
      ],
      { signal, timeout: timeoutMs },
    );

    if (result.code !== 0) {
      throw new Error(result.stderr?.trim() || `curl failed with exit code ${result.code}`);
    }

    const { body, status, redirectUrl } = parseCurlResponse(result.stdout ?? "");
    if (status >= 300 && status < 400) {
      if (!redirectUrl) throw new Error(`Redirect from ${currentUrl.href} has no Location header`);
      if (redirects === MAX_REDIRECTS) throw new Error(`Too many redirects (maximum ${MAX_REDIRECTS})`);
      currentUrl = assertSupportedUrl(new URL(redirectUrl, currentUrl).href);
      continue;
    }
    if (status < 200 || status >= 300) {
      throw new Error(`Request failed with HTTP status ${status}`);
    }
    if (!body.trim()) throw new Error(`No content returned from ${currentUrl.href}`);

    return { html: body, url: currentUrl.href };
  }

  throw new Error(`Too many redirects (maximum ${MAX_REDIRECTS})`);
}

export async function fetchUrlToMarkdown(exec, params, options = {}) {
  const timeoutMs = params.timeoutMs ?? 30000;
  const signal = options.signal;
  const allowPrivateNetwork = options.allowPrivateNetwork ?? process.env.PI_FETCH_WEB_ALLOW_PRIVATE_NETWORK === "1";
  const fetched = await fetchPublicHtml(exec, params.url, timeoutMs, signal, allowPrivateNetwork);

  const dom = new JSDOM(fetched.html, { url: fetched.url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

  const rawContent = article?.content ?? dom.window.document.body?.innerHTML ?? fetched.html;
  const markdownBody = turndown.turndown(rawContent).trim();
  const title = article?.title?.trim() || dom.window.document.title?.trim() || fetched.url;

  return {
    markdown: [
      `# ${title.replace(/```/g, "``\\`")}`,
      "",
      `Source: ${fetched.url}`,
      "",
      markdownBody || "(No readable body content extracted)",
    ].join("\n"),
    title,
    extracted: Boolean(article),
    markdownBody,
  };
}
