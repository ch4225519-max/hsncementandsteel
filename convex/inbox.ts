import { internalMutation, internalQuery } from "./_generated/server.js";
import { v } from "convex/values";

export const storeInbox = internalMutation({
  args: {
    clientId: v.string(),
    inboxId: v.string(),
    username: v.optional(v.string()),
    domain: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentmail_inboxes")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        inboxId: args.inboxId,
        username: args.username,
        domain: args.domain,
        address: args.address,
      });
      return existing.inboxId;
    }
    const id = await ctx.db.insert("agentmail_inboxes", args);
    return id;
  },
});

export const getInbox = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentmail_inboxes")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .first();
    return existing ?? null;
  },
});
