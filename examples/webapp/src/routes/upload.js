import { Router } from "express";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireUser } from "../auth/session.js";

export const uploadRouter = Router();

uploadRouter.post("/", requireUser, (req, res) => {
  const targetPath = join(process.cwd(), "src", "uploads", req.body.filename);
  writeFileSync(targetPath, req.body.content || "");
  res.json({ path: targetPath });
});
