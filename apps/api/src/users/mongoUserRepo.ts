import { ROLES, isRole } from "@meridian/shared";
import { UserModel } from "./userModel";
import { normalizeEmail, type NewUser, type UserRecord, type UserRepo } from "./types";

/** MongoDB adapter. Exercised by `npm run seed` against your real database. */
export class MongoUserRepo implements UserRepo {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const doc = await UserModel.findOne({ email: normalizeEmail(email) }).select("+passwordHash").lean();
    if (!doc) return null;
    if (!isRole(doc.role)) throw new Error(`User ${String(doc._id)} has an unknown role (expected one of ${ROLES.join(", ")})`);
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

  async upsertByEmail(user: NewUser): Promise<{ created: boolean }> {
    const result = await UserModel.updateOne(
      { email: normalizeEmail(user.email) },
      { $set: { name: user.name, role: user.role, passwordHash: user.passwordHash, active: true } },
      { upsert: true, runValidators: true },
    );
    return { created: result.upsertedCount > 0 };
  }

  async count(): Promise<number> {
    return UserModel.countDocuments();
  }
}