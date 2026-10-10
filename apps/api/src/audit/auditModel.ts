import { AUDIT_ACTIONS, AUDIT_OUTCOMES } from "@meridian/shared";
import mongoose, { Schema } from "mongoose";

const auditSchema = new Schema(
  {
    // The unique index on seq is what makes two writers fight over the same slot, not both win.
    seq: { type: Number, required: true, unique: true },
    at: { type: Date, required: true },
    actorId: { type: String, default: null, index: true },
    actorRole: { type: String, default: null },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    outcome: { type: String, enum: AUDIT_OUTCOMES, required: true },
    entityType: { type: String, default: null },
    entityId: { type: String, default: null },
    patientId: { type: String, default: null, index: true },
    reason: { type: String, default: null },
    detail: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  { versionKey: false, timestamps: false, minimize: false },
);

export const AuditModel = mongoose.model("AuditEntry", auditSchema);
