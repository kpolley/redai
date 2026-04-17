import { Router } from "express";
import { requireAdmin } from "../auth/session.js";
import { users } from "../db/users.js";

export const adminRouter = Router();

adminRouter.get("/users", requireAdmin, (_req, res) => {
  res.json(users);
});
