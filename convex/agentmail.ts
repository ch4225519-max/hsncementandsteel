"use node";

import { action } from "./_generated/server.js";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { GenericActionCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel.js";

const AGENTMAIL_API = "https://api.agentmail.to";
const INBOX_CLIENT_ID = "hsn-site-inbox-v1";

type InboxInfo = {
  inboxId: string;
  username?: string;
  domain?: string;
  address?: string;
};

async function agentmailFetch(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    throw new Error("AGENTMAIL_API_KEY is not set. Add it in the Keys tab / environment before sending email.");
  }
  const res = await fetch(`${AGENTMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AgentMail ${init.method ?? "GET"} ${path} failed (${res.status}): ${body}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** Creates the site's inbox on AgentMail (idempotent via client_id) and returns its info. */
async function createInbox(): Promise<InboxInfo> {
  const created = await agentmailFetch("/inboxes", {
    method: "POST",
    body: JSON.stringify({
      client_id: INBOX_CLIENT_ID,
      username: "hsn-site",
      display_name: "HSN Cement and Steel",
    }),
  });
  const inboxId = String(created.inbox_id);
  if (!inboxId) throw new Error(`AgentMail inbox creation failed: ${JSON.stringify(created)}`);
  return {
    inboxId,
    username: typeof created.username === "string" ? created.username : undefined,
    domain: typeof created.domain === "string" ? created.domain : undefined,
    address: typeof created.address === "string" ? created.address : undefined,
  };
}

/** Resolves the site's persistent AgentMail inbox, creating it on first use. */
async function resolveInbox(ctx: GenericActionCtx<DataModel>): Promise<InboxInfo> {
  const existing = await ctx.runQuery(internal.inbox.getInbox, { clientId: INBOX_CLIENT_ID });
  if (existing) {
    return {
      inboxId: existing.inboxId,
      username: existing.username,
      domain: existing.domain,
      address: existing.address,
    };
  }
  const created = await createInbox();
  await ctx.runMutation(internal.inbox.storeInbox, { clientId: INBOX_CLIENT_ID, ...created });
  return created;
}

/**
 * Ensures the site has a persistent AgentMail inbox (created once, reused forever).
 * Returns the inbox info.
 */
export const ensureInbox = action({
  args: { clientId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<InboxInfo> => {
    const clientId = args.clientId ?? INBOX_CLIENT_ID;
    const existing = await ctx.runQuery(internal.inbox.getInbox, { clientId });
    if (existing) {
      return {
        inboxId: existing.inboxId,
        username: existing.username,
        domain: existing.domain,
        address: existing.address,
      };
    }
    const created = await createInbox();
    await ctx.runMutation(internal.inbox.storeInbox, { clientId, ...created });
    return created;
  },
});

/**
 * Sends an email from the site's AgentMail inbox.
 */
export const sendEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    replyTo: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const inbox = await resolveInbox(ctx);

    const result = await agentmailFetch(`/inboxes/${inbox.inboxId}/messages/send`, {
      method: "POST",
      body: JSON.stringify({
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
        cc: args.cc,
        bcc: args.bcc,
        reply_to: args.replyTo,
      }),
    });
    return { inboxId: inbox.inboxId, messageId: result.message_id ?? result.id ?? null, ...result };
  },
});
