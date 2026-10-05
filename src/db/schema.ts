import { pgTable, serial, text, integer, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

// Anonymous customer feedback, always scoped to a client.
export const feedback = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    clientId: text("client_id").notNull(),
    message: text("message").notNull(),
    rating: integer("rating"),
    tableNumber: text("table_number"),
    location: text("location"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("feedback_client_idx").on(t.clientId)]
);

// Generated reviews, always scoped to a client.
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    clientId: text("client_id").notNull(),
    overallRating: text("overall_rating"),
    staffRating: text("staff_rating"),
    serviceRating: text("service_rating"),
    selectedItems: jsonb("selected_items").$type<string[]>(),
    generatedText: text("generated_text").notNull(),
    tableNumber: text("table_number"),
    location: text("location"),
    customerId: text("customer_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("reviews_client_idx").on(t.clientId)]
);

// Monthly AI usage per client (billing/limit enforcement for the AI Review add-on).
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    clientId: text("client_id").notNull(),
    month: text("month").notNull(), // YYYY-MM (UTC)
    requestCount: integer("request_count").notNull().default(0),
    successfulRequests: integer("successful_requests").notNull().default(0),
    failedRequests: integer("failed_requests").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("ai_usage_client_month_idx").on(t.clientId, t.month)]
);

export type Feedback = typeof feedback.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;
