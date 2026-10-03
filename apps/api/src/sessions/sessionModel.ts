import mongoose, { Schema } from "mongoose";

const sessionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    currentHash: { type: String, required: true, unique: true },
    previousHash: { type: String, default: null, index: true },
    rotatedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// MongoDB deletes expired sessions by itself (its cleanup runs about once a minute).
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = mongoose.model("Session", sessionSchema);