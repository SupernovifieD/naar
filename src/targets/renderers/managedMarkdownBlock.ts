export function buildNaarSkillManagedBlock(
  slug: string,
  skillName: string,
  summary: string,
  markdown: string
): string {
  return `\n<!-- naar:skill:${slug}:start -->\n## Naar Skill: ${skillName}\n${summary}\n\n${markdown}\n<!-- naar:skill:${slug}:end -->\n`;
}
