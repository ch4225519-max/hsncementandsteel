import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agentmail_inboxes: defineTable({
    clientId: v.string(),
    inboxId: v.string(),
    username: v.optional(v.string()),
    domain: v.optional(v.string()),
    address: v.optional(v.string()),
  }).index("by_clientId", ["clientId"]),
});
