import path from "node:path";

export function rel(root: string, fullPath: string): string {
  const relative = path.relative(root, fullPath);
  return relative === "" ? "." : relative.replaceAll("\\", "/");
}

export function normalizePath(p: string): string {
  return p.replaceAll("\\", "/");
}
