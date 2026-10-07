/** The names a project goes by: its own and its aliases, lower case. */
export function namesOf(project: { name: string; aliases: string[] }): string[] {
  return [project.name, ...project.aliases].map((name) => name.trim().toLowerCase());
}

/**
 * Whether a repository (`owner/name`) or a project of an IDE belongs to the project: one of
 * the project's names is it — in full, or as the part after the owner.
 */
export function belongsTo(candidate: string, names: string[]): boolean {
  const full = candidate.trim().toLowerCase();
  const short = full.split('/').pop() ?? full;
  return names.some((name) => name === full || name === short);
}
