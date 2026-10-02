import { z } from "zod";
import { STATIONS } from "../rules/queue";

export const moveQueueSchema = z.object({
  to: z.enum([...STATIONS, "done"], "Choose where the patient goes next"),
  /** Required by the server when the move is outside normal flow. */
  reason: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type MoveQueueInput = z.input<typeof moveQueueSchema>;