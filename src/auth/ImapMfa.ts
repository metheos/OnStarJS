import { ImapFlow, SearchObject } from "imapflow";
import { simpleParser } from "mailparser";

const DEFAULT_IMAP_PORT = 993;
const DEFAULT_SUBJECT_PREFIX =
  "/^Your (?:GM|Chevrolet|GMC|Buick|Cadillac) Verification Code:/i";
const DEFAULT_SENDER = "GeneralMotors@em.gm.com";
const DEFAULT_MAILBOX = "INBOX";

const OVERALL_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 10 * 1000;
const RECENT_EMAIL_WINDOW_MS = 60 * 1000;

const HTML_TAG_CODE_RE = /<[^>]+>\s*(\d{6})\s*<\/[^>]+>/;
const FALLBACK_CODE_RE = /\b(\d{6})\b/;
const REGEX_SETTING_RE = /^\/(.*)\/([a-zA-Z]*)$/;
const IMAP_VERBOSE =
  (process.env.ONSTARJS_IMAP_VERBOSE ?? "true").toLowerCase() !== "false";

function imapLog(step: string, details?: string): void {
  if (!IMAP_VERBOSE) {
    return;
  }
  const stamp = new Date().toISOString();
  console.log(`[imapMfa][${stamp}] ${step}${details ? ` :: ${details}` : ""}`);
}

function maskUser(user: string): string {
  if (!user) {
    return "<empty>";
  }
  const at = user.indexOf("@");
  if (at <= 1) {
    return "***";
  }
  return `${user.slice(0, 1)}***${user.slice(at)}`;
}

interface ImapConfig {
  server: string;
  port: number;
  username: string;
  password: string;
  sender: string;
  mailbox: string;
  subjectMatcherType: "regex" | "plaintext";
  subjectMatcher: RegExp | string;
  subjectPrefix: string;
}

function parseSubjectMatcher(raw: string): {
  type: "regex" | "plaintext";
  matcher: RegExp | string;
} {
  const value = (raw || "").trim() || DEFAULT_SUBJECT_PREFIX;
  const regexMatch = REGEX_SETTING_RE.exec(value);
  imapLog("parse-subject-matcher", `raw=${value}`);

  if (!regexMatch) {
    return { type: "plaintext", matcher: value.toLowerCase() };
  }

  const [, pattern, flagsRaw] = regexMatch;
  const allowedFlags = new Set(["i", "m", "s", "u"]);
  const normalizedFlags = [...flagsRaw]
    .map((flag) => flag.toLowerCase())
    .filter((flag) => {
      if (!allowedFlags.has(flag)) {
        throw new Error(
          `IMAP_SUBJECT_PREFIX contains unsupported regex flag '${flag}'. Supported flags: i, m, s, u`,
        );
      }
      return true;
    })
    .join("");

  return { type: "regex", matcher: new RegExp(pattern, normalizedFlags) };
}

function subjectMatches(config: ImapConfig, subject: string): boolean {
  if (config.subjectMatcherType === "regex") {
    return (config.subjectMatcher as RegExp).test(subject);
  }
  return subject.toLowerCase().startsWith(config.subjectMatcher as string);
}

function getImapConfigFromEnv(): ImapConfig {
  const server = (process.env.IMAP_SERVER ?? "").trim();
  if (!server) {
    throw new Error("IMAP_SERVER is not set.");
  }

  const username = (
    process.env.IMAP_USERNAME ??
    process.env.ONSTAR_USERNAME ??
    ""
  ).trim();
  if (!username) {
    throw new Error("IMAP_USERNAME (or ONSTAR_USERNAME) is not set.");
  }

  const password = (process.env.IMAP_PASSWORD ?? "").trim();
  if (!password) {
    throw new Error("IMAP_PASSWORD is not set.");
  }

  const parsedPort = Number.parseInt(
    process.env.IMAP_PORT ?? `${DEFAULT_IMAP_PORT}`,
    10,
  );
  const port = Number.isFinite(parsedPort) ? parsedPort : DEFAULT_IMAP_PORT;

  const sender = (process.env.IMAP_SENDER ?? DEFAULT_SENDER).trim();
  const mailbox = (process.env.IMAP_MAILBOX ?? DEFAULT_MAILBOX).trim();
  const subjectPrefix =
    process.env.IMAP_SUBJECT_PREFIX ?? DEFAULT_SUBJECT_PREFIX;
  const parsedSubject = parseSubjectMatcher(subjectPrefix);

  imapLog(
    "config-loaded",
    `server=${server}:${port}, user=${maskUser(username)}, mailbox=${mailbox}, matcher=${parsedSubject.type}`,
  );

  return {
    server,
    port,
    username,
    password,
    sender,
    mailbox,
    subjectMatcherType: parsedSubject.type,
    subjectMatcher: parsedSubject.matcher,
    subjectPrefix,
  };
}

async function extractCodeFromUid(
  client: ImapFlow,
  uid: number,
  config: ImapConfig,
): Promise<string | null> {
  imapLog("fetch-message", `uid=${uid}`);
  const fetchedResult = await client.fetchOne(uid, {
    source: true,
    envelope: true,
    internalDate: true,
  });
  if (!fetchedResult) {
    imapLog("fetch-message-empty", `uid=${uid}`);
    return null;
  }

  const fetched = fetchedResult as {
    source?: Buffer;
    envelope?: { subject?: string };
    internalDate?: Date | string;
  };

  if (!fetched.source || !fetched.envelope?.subject) {
    imapLog("skip-message", `uid=${uid}, reason=missing-source-or-subject`);
    return null;
  }

  if (!subjectMatches(config, fetched.envelope.subject)) {
    imapLog("skip-message", `uid=${uid}, reason=subject-mismatch`);
    return null;
  }

  const rawInternalDate = fetched.internalDate;
  const internalDate =
    rawInternalDate instanceof Date
      ? rawInternalDate.getTime()
      : rawInternalDate
        ? new Date(rawInternalDate).getTime()
        : undefined;
  if (!internalDate || Date.now() - internalDate > RECENT_EMAIL_WINDOW_MS) {
    imapLog("skip-message", `uid=${uid}, reason=outside-recent-window`);
    return null;
  }

  const parsed = await simpleParser(fetched.source as Buffer);
  const html = parsed.html ? String(parsed.html) : "";
  const text = parsed.text ? String(parsed.text) : "";

  const htmlMatch = HTML_TAG_CODE_RE.exec(html);
  if (htmlMatch?.[1]) {
    imapLog("code-found", `uid=${uid}, source=html-tag`);
    return htmlMatch[1];
  }

  const fallbackMatch = FALLBACK_CODE_RE.exec(`${text}\n${html}`);
  if (fallbackMatch?.[1]) {
    imapLog("code-found", `uid=${uid}, source=fallback-regex`);
  } else {
    imapLog("no-code-in-message", `uid=${uid}`);
  }
  return fallbackMatch?.[1] ?? null;
}

async function pollForCode(
  client: ImapFlow,
  config: ImapConfig,
): Promise<string> {
  const startedAt = Date.now();
  let cycle = 0;

  while (Date.now() - startedAt < OVERALL_TIMEOUT_MS) {
    cycle += 1;
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    imapLog("poll-cycle", `cycle=${cycle}, elapsed=${elapsedSec}s`);

    await client.mailboxOpen(config.mailbox, { readOnly: true });

    const since = new Date(Date.now() - RECENT_EMAIL_WINDOW_MS);
    const criteria: SearchObject = {
      since,
      from: config.sender,
    };

    if (config.subjectMatcherType === "plaintext") {
      criteria.subject = config.subjectPrefix;
    }

    const uidsResult = await client.search(criteria);
    const uids = Array.isArray(uidsResult) ? uidsResult : [];
    imapLog("search-result", `cycle=${cycle}, matches=${uids.length}`);
    if (uids.length === 0) {
      imapLog("poll-wait", `cycle=${cycle}, sleep=${POLL_INTERVAL_MS}ms`);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }

    for (const uid of [...uids].reverse()) {
      const code = await extractCodeFromUid(client, uid, config);
      if (code) {
        imapLog("poll-complete", `cycle=${cycle}, uid=${uid}`);
        return code;
      }
    }

    imapLog("poll-wait", `cycle=${cycle}, sleep=${POLL_INTERVAL_MS}ms`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  imapLog("poll-timeout", `timeoutMs=${OVERALL_TIMEOUT_MS}`);
  throw new Error(
    "Timed out waiting for GM MFA email code. Check spam/junk and IMAP settings.",
  );
}

export async function getImapMfaCode(): Promise<string> {
  const config = getImapConfigFromEnv();
  imapLog("connect-start", `server=${config.server}:${config.port}`);
  const client = new ImapFlow({
    host: config.server,
    port: config.port,
    secure: true,
    auth: {
      user: config.username,
      pass: config.password,
    },
    logger: false,
  });

  try {
    await client.connect();
    imapLog("connect-success");
    return await pollForCode(client, config);
  } finally {
    try {
      imapLog("logout-start");
      await client.logout();
      imapLog("logout-success");
    } catch {
      // ignore socket teardown noise from already-closed IMAP sessions
      imapLog("logout-skip", "session already closed");
    }
  }
}
