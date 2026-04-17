import { Router } from "express";
import { requireUser } from "../auth/session.js";
import { findUserById } from "../db/users.js";

export const profileRouter = Router();

profileRouter.get("/:id", requireUser, (req, res) => {
  const user = findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: "missing" });
  res.json(user);
});
