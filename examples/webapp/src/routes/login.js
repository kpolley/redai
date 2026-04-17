import { Router } from "express";
import { findUserByEmail } from "../db/users.js";
import { createSession } from "../auth/session.js";

export const loginRouter = Router();

loginRouter.post("/", (req, res) => {
  const user = findUserByEmail(req.body.email);
  if (!user || user.password !== req.body.password) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  res.json({ token: createSession(user) });
});
