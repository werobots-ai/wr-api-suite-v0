export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function maskFromLastFour(lastFour: string): string {
  return `**** **** **** ${lastFour}`;
}
