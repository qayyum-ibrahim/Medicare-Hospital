import { ROLES, isRole } from "@meridian/shared";
import mongoose from "mongoose";
import { UserModel } from "./userModel";
import { normalizeEmail, type NewUser, type UserRecord, type UserRepo } from "./types";

interface UserDoc {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  passwordHash: string;
  active: boolean;
  lastLoginAt?: Date | null;
}

function toRecord(doc: UserDoc): UserRecord {
  if (!isRole(doc.role)) {
    throw new Error(`User ${String(doc._id)} has an unknown role (expected one of ${ROLES.join(", ")})`);
  }
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    passwordHash: doc.passwordHash,
    active: doc.active,
    lastLoginAt: doc.lastLoginAt ?? null,
  };
}

/** MongoDB adapter. Exercised by `npm run seed` and by logging in against your real database. */
export class MongoUserRepo implements UserRepo {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const doc = await UserModel.findOne({ email: normalizeEmail(email) }).select("+passwordHash").lean();
    return doc ? toRecord(doc) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await UserModel.findById(id).select("+passwordHash").lean();
    return doc ? toRecord(doc) : null;
  }

  async upsertByEmail(user: NewUser): Promise<{ created: boolean }> {
    const result = await UserModel.updateOne(
      { email: normalizeEmail(user.email) },
      { $set: { name: user.name, role: user.role, passwordHash: user.passwordHash, active: true } },
      { upsert: true, runValidators: true },
    );
    return { created: result.upsertedCount > 0 };
  }

  async recordLogin(id: string, at: Date): Promise<void> {
    if (!mongoose.isValidObjectId(id)) return;
    await UserModel.updateOne({ _id: id }, { $set: { lastLoginAt: at } });
  }

  async count(): Promise<number> {
    return UserModel.countDocuments();
  }
}