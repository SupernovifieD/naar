import pc from "picocolors";
import type { HistoryProject, HistorySkillSummary, NaarHistory } from "./historySchema.js";
import { listProjects, listSkillSummaries } from "./historyService.js";

export function renderHistorySummary(history: NaarHistory, options: { disabled?: boolean; warning?: string; verbose?: boolean } = {}): void {
  process.stdout.write(`${pc.bold("Naar history")}\n\n`);
  if (options.disabled) {
    process.stdout.write(`${pc.yellow("History is disabled for this invocation.")} Existing local history is not deleted.\n\n`);
  }
  if (options.warning) {
    process.stdout.write(`${pc.yellow(options.warning)}\n\n`);
  }

  const projects = listProjects(history);
  const skills = listSkillSummaries(history);
  process.stdout.write(`${pc.blue("Remembered projects")}: ${pc.cyan(String(projects.length))}\n`);
  process.stdout.write(`${pc.blue("Remembered skills")}: ${pc.cyan(String(skills.length))}\n`);
  process.stdout.write(`${pc.blue("Last updated")}: ${history.updatedAt}\n`);

  const recentProjects = projects.slice(0, 5);
  if (recentProjects.length > 0) {
    process.stdout.write(`\n${pc.bold("Recent projects")}\n`);
    for (const project of recentProjects) {
      process.stdout.write(`- ${pc.cyan(project.name)}     ${project.installedSkills.length} skills     last used ${formatDate(project.lastSeenAt)}\n`);
      if (options.verbose) {
        process.stdout.write(`  ${pc.blue("Path")}: ${project.path}\n`);
      }
    }
  }

  const recentSkills = skills.slice(0, 5);
  if (recentSkills.length > 0) {
    process.stdout.write(`\n${pc.bold("Recent skills")}\n`);
    for (const skill of recentSkills) {
      process.stdout.write(`- ${pc.cyan(skill.name ?? skill.canonicalId)}     ${skill.usedInProjects.length} projects     last used ${formatDate(skill.lastSeenAt)}\n`);
      if (options.verbose) {
        process.stdout.write(`  ${pc.blue("Canonical ID")}: ${skill.canonicalId}\n`);
      }
    }
  }
}

export function renderHistoryProjectList(projects: HistoryProject[], options: { warning?: string; verbose?: boolean } = {}): void {
  if (options.warning) {
    process.stdout.write(`${pc.yellow(options.warning)}\n\n`);
  }
  process.stdout.write(`${pc.bold("Project")} | ${pc.bold("Path")} | ${pc.bold("Skills")} | ${pc.bold("Last used")}\n`);
  for (const project of projects) {
    process.stdout.write(`${project.name} | ${project.path} | ${project.installedSkills.length} | ${formatDate(project.lastSeenAt)}\n`);
    if (options.verbose) {
      process.stdout.write(`  ${pc.blue("First seen")}: ${project.firstSeenAt}\n`);
      process.stdout.write(`  ${pc.blue("Project ID")}: ${project.projectId}\n`);
    }
  }
}

export function renderHistorySkills(skills: HistorySkillSummary[], options: { warning?: string; verbose?: boolean } = {}): void {
  if (options.warning) {
    process.stdout.write(`${pc.yellow(options.warning)}\n\n`);
  }
  process.stdout.write(`${pc.bold("Skill")} | ${pc.bold("Used in projects")} | ${pc.bold("Installs")} | ${pc.bold("Last used")}\n`);
  for (const skill of skills) {
    process.stdout.write(`${skill.name ?? skill.canonicalId} | ${skill.usedInProjects.length} | ${skill.installCount} | ${formatDate(skill.lastSeenAt)}\n`);
    if (options.verbose) {
      process.stdout.write(`  ${pc.blue("Canonical ID")}: ${skill.canonicalId}\n`);
      process.stdout.write(`  ${pc.blue("Providers")}: ${skill.providerIds.join(", ")}\n`);
      process.stdout.write(`  ${pc.blue("Targets")}: ${skill.targets.join(", ")}\n`);
    }
  }
}

export function renderHistoryProject(project: HistoryProject, options: { warning?: string; verbose?: boolean } = {}): void {
  if (options.warning) {
    process.stdout.write(`${pc.yellow(options.warning)}\n\n`);
  }
  process.stdout.write(`${pc.bold(project.name)}\n`);
  process.stdout.write(`${pc.blue("Path")}: ${project.path}\n`);
  process.stdout.write(`${pc.blue("First seen")}: ${project.firstSeenAt}\n`);
  process.stdout.write(`${pc.blue("Last seen")}: ${project.lastSeenAt}\n`);
  if (project.lastInstallAt) {
    process.stdout.write(`${pc.blue("Last install")}: ${project.lastInstallAt}\n`);
  }

  if (project.detected) {
    process.stdout.write(`\n${pc.bold("Detected")}:\n`);
    renderOptionalList("Languages", project.detected.languages);
    renderOptionalList("Frameworks", project.detected.frameworks);
    renderOptionalList("Package managers", project.detected.packageManagers);
    renderOptionalList("Assistants", project.detected.assistants);
  }

  process.stdout.write(`\n${pc.bold("Installed skills")}:\n`);
  for (const skill of project.installedSkills) {
    process.stdout.write(`- ${pc.cyan(skill.name ?? skill.canonicalId)} (${skill.providerId})\n`);
    process.stdout.write(`  ${pc.blue("Canonical ID")}: ${skill.canonicalId}\n`);
    process.stdout.write(`  ${pc.blue("Targets")}: ${skill.targets.join(", ")}\n`);
    if (typeof skill.securityScore === "number") {
      process.stdout.write(`  ${pc.blue("Security score")}: ${skill.securityScore}/100\n`);
    }
    if (options.verbose) {
      process.stdout.write(`  ${pc.blue("Skill ID")}: ${skill.skillId}\n`);
      process.stdout.write(`  ${pc.blue("Version")}: ${skill.version ?? "unknown"}\n`);
      process.stdout.write(`  ${pc.blue("Ref")}: ${skill.ref ?? "unknown"}\n`);
      process.stdout.write(`  ${pc.blue("Install count")}: ${skill.installCount}\n`);
      process.stdout.write(`  ${pc.blue("Last seen")}: ${skill.lastSeenAt}\n`);
    }
  }
}

export function historySummaryJson(history: NaarHistory, disabled = false): object {
  const projects = listProjects(history);
  const skills = listSkillSummaries(history);
  return {
    disabled,
    projectCount: projects.length,
    skillCount: skills.length,
    updatedAt: history.updatedAt,
    recentProjects: projects.slice(0, 5),
    recentSkills: skills.slice(0, 5)
  };
}

function renderOptionalList(label: string, values: string[] | undefined): void {
  if (values && values.length > 0) {
    process.stdout.write(`  ${pc.blue(label)}: ${values.join(", ")}\n`);
  }
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}
