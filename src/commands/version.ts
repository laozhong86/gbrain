import pkg from "../../package.json";

export function runVersion(): string {
  return pkg.version;
}
