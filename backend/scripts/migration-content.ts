const legacyMigrationOwner = "yahro_owner";

export function renderMigrationForCurrentOwner(content: string, quotedCurrentOwner: string) {
  return content.replaceAll(legacyMigrationOwner, quotedCurrentOwner);
}
