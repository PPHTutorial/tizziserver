import { z } from "zod";

/** Every `/api/v1` response is one of these. */
export const ErrorShape = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
});

export const Meta = z
  .object({
    traceId: z.string().optional(),
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional(),
    total: z.number().int().nonnegative().optional(),
  })
  .optional();

export function ok<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data, error: z.null().optional(), meta: Meta });
}

export const Envelope = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: ErrorShape.nullish(),
  meta: Meta,
});

export type Envelope = z.infer<typeof Envelope>;
