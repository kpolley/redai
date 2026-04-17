import { z } from "zod";

function coerceToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(coerceToString).filter(Boolean).join("; ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "description", "summary", "name", "title", "value", "content"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function coerceToStringArray(value: unknown): unknown {
  if (value === null || value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map(coerceToString);
}

export const tolerantString = z.preprocess(coerceToString, z.string());

export function tolerantStringArray() {
  return z.preprocess(coerceToStringArray, z.array(tolerantString)).default([]);
}
