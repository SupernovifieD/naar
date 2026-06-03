import pc from "picocolors";
import type { HistoryEvent, HistoryEventSkill, HistoryProject, HistorySkillSummary, NaarHistory } from "./historySchema.js";
import {
  countHistoryEvents,
  listProjects,
  listRecentActivity,
  listSkillSummaries,
  projectUninstalledSkillIds
} from "./historyService.js";

export function renderHistorySummary(history: NaarHistory, options: { disabled?: boolean; warning?: string; verbose?: boolean } = {}): void {
  process.stdout.write(`${pc.bold("Naar history")}

`);
  if (options.disabled) {
    process.stdout.write(`${pc.yellow("History is disabled for this invocation.")} Existing local history is not deleted.

`);
  }
  if (options.warning) {
    process.stdout.write(`${pc.yellow(options.warning)}

`);
  }

  const projects = listProjects(history);
  const skills = listSkillSummaries(history);
  const installEventCount = countHistoryEvents(history, "install");
  const uninstallEventCount = countHistoryEvents(history, "uninstall");
  process.stdout.write(`${pc.blue("Remembered projects")}: ${pc.cyan(String(projects.length))}
`);
  process.stdout.write(`${pc.blue("Currently installed skills")}: ${pc.cyan(String(currentSkillCount(projects)))}
`);
  process.stdout.write(`${pc.blue("Skills ever used")}: ${pc.cyan(String(skills.length))}
`);
  process.stdout.write(`${pc.blue("Install events")}: ${pc.cyan(String(installEventCount))}
`);
  process.stdout.write(`${pc.blue("Uninstall events")}: ${pc.cyan(String(uninstallEventCount))}
`);
  process.stdout.write(`${pc.blue("Last updated")}: ${formatDateTime(history.updatedAt)}
`);

  const recentProjects = projects.slice(0, 5);
  if (recentProjects.length > 0) {
    process.stdout.write(`
${pc.bold("Recent projects")}
`);
    for (const project of recentProjects) {
      process.stdout.write(`- ${pc.cyan(project.name)}     ${project.installedSkills.length} current     ${projectUninstalledSkillIds(project).length} uninstalled     last activity ${formatDate(project.lastSeenAt)}
`);
      if (options.verbose) {
        process.stdout.write(`  ${pc.blue("Path")}: ${project.path}
`);
        process.stdout.write(`  ${pc.blue("Project ID")}: ${project.projectId}
`);
      }
    }
  }

  const activity = listRecentActivity(history, 5);
  if (activity.length > 0) {
    process.stdout.write(`
${pc.bold("Recent activity")}
`);
    for (const item of activity) {
      renderActivityLine(item.project, item.event, item.skill, options.verbose);
    }
  }
}

export function renderHistoryProjectList(projects: HistoryProject[], options: { warning?: string; verbose?: boolean } = {}): void {
  if (options.warning) {
    process.stdout.write(`${pc.yellow(options.warning)}

`);
  }
  process.stdout.write(`${pc.bold("Project")} | ${pc.bold("Path")} | ${pc.bold("Current skills")} | ${pc.bold("Uninstalled skills")} | ${pc.bold("Last activity")}
`);
  for (const project of projects) {
    process.stdout.write(`${project.name} | ${project.path} | ${project.installedSkills.length} | ${projectUninstalledSkillIds(project).length} | ${formatDate(project.lastSeenAt)}
`);
    if (options.verbose) {
      process.stdout.write(`  ${pc.blue("First seen")}: ${project.firstSeenAt}
`);
      process.stdout.write(`  ${pc.blue("Last install")}: ${project.lastInstallAt ?? "none"}
`);
      process.stdout.write(`  ${pc.blue("Last uninstall")}: ${project.lastUninstallAt ?? "none"}
`);
      process.stdout.write(`  ${pc.blue("Project ID")}: ${project.projectId}
`);
    }
  }
}

export function renderHistorySkills(skills: HistorySkillSummary[], options: { warning?: string; verbose?: boolean } = {}): void {
  if (options.warning) {
    process.stdout.write(`${pc.yellow(options.warning)}

`);
  }
  process.stdout.write(`${pc.bold("Skill")} | ${pc.bold("Current projects")} | ${pc.bold("Ever used in")} | ${pc.bold("Installs")} | ${pc.bold("Uninstalls")} | ${pc.bold("Last activity")}
`);
  for (const skill of skills) {
    process.stdout.write(`${skill.name ?? skill.canonicalId} | ${skill.currentlyInstalledInProjects.length} | ${skill.everInstalledInProjects.length} | ${skill.installCount} | ${skill.uninstallCount} | ${formatDate(skill.lastSeenAt)}
`);
    if (options.verbose) {
      process.stdout.write(`  ${pc.blue("Canonical ID")}: ${skill.canonicalId}
`);
      process.stdout.write(`  ${pc.blue("Providers")}: ${skill.providerIds.join(", ") || "none"}
`);
      process.stdout.write(`  ${pc.blue("Provider skill IDs")}: ${skill.skillIds.join(", ") || "none"}
`);
      process.stdout.write(`  ${pc.blue("Targets")}: ${skill.targets.join(", ") || "none"}
`);
      process.stdout.write(`  ${pc.blue("Last installed")}: ${skill.lastInstalledAt ?? "none"}
`);
      process.stdout.write(`  ${pc.blue("Last uninstalled")}: ${skill.lastUninstalledAt ?? "none"}
`);
    }
  }
}

export function renderHistoryProject(project: HistoryProject, options: { warning?: string; verbose?: boolean } = {}): void {
  if (options.warning) {
    process.stdout.write(`${pc.yellow(options.warning)}

`);
  }
  process.stdout.write(`${pc.bold(project.name)}
`);
  process.stdout.write(`${pc.blue("Path")}: ${project.path}
`);
  process.stdout.write(`${pc.blue("First seen")}: ${formatDateTime(project.firstSeenAt)}
`);
  process.stdout.write(`${pc.blue("Last activity")}: ${formatDateTime(project.lastSeenAt)}
`);
  if (project.lastInstallAt) {
    process.stdout.write(`${pc.blue("Last install")}: ${formatDateTime(project.lastInstallAt)}
`);
  }
  if (project.lastUninstallAt) {
    process.stdout.write(`${pc.blue("Last uninstall")}: ${formatDateTime(project.lastUninstallAt)}
`);
  }

  if (project.detected) {
    process.stdout.write(`
${pc.bold("Detected")}:
`);
    renderOptionalList("Languages", project.detected.languages);
    renderOptionalList("Frameworks", project.detected.frameworks);
    renderOptionalList("Package managers", project.detected.packageManagers);
    renderOptionalList("Assistants", project.detected.assistants);
  }

  process.stdout.write(`\n${pc.bold("Current installed skills")}:\n`);
  if (project.installedSkills.length === 0) {
    process.stdout.write("- none\n");
  }
  for (const skill of project.installedSkills) {
    process.stdout.write(`- ${pc.cyan(skill.name ?? skill.canonicalId)} (${skill.providerId})
`);
    process.stdout.write(`  ${pc.blue("Canonical ID")}: ${skill.canonicalId}
`);
    process.stdout.write(`  ${pc.blue("Targets")}: ${skill.targets.join(", ") || "none"}
`);
    if (typeof skill.securityScore === "number") {
      process.stdout.write(`  ${pc.blue("Security score")}: ${skill.securityScore}/100
`);
    }
    if (options.verbose) {
      process.stdout.write(`  ${pc.blue("Provider skill ID")}: ${skill.skillId}
`);
      process.stdout.write(`  ${pc.blue("Version")}: ${skill.version ?? "unknown"}
`);
      process.stdout.write(`  ${pc.blue("Ref")}: ${skill.ref ?? "unknown"}
`);
      process.stdout.write(`  ${pc.blue("Install count")}: ${skill.installCount}
`);
      process.stdout.write(`  ${pc.blue("Installed at")}: ${skill.installedAt}
`);
      process.stdout.write(`  ${pc.blue("Last seen")}: ${skill.lastSeenAt}
`);
    }
  }

  const uninstalled = projectUninstalledSkillIds(project);
  process.stdout.write(`\n${pc.bold("Previously uninstalled skills")}:\n`);
  if (uninstalled.length === 0) {
    process.stdout.write("- none\n");
  }
  for (const canonicalId of uninstalled) {
    process.stdout.write(`- ${pc.cyan(canonicalId)}
`);
  }

  const events = [...project.events]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, options.verbose ? project.events.length : 10);
  if (events.length > 0) {
    process.stdout.write(`
${pc.bold("Recent activity")}:
`);
    for (const event of events) {
      for (const skill of event.skills) {
        renderActivityLine(project, event, skill, options.verbose);
      }
    }
  }
}

export function historySummaryJson(history: NaarHistory, disabled = false): object {
  const projects = listProjects(history);
  const skills = listSkillSummaries(history);
  const installEventCount = countHistoryEvents(history, "install");
  const uninstallEventCount = countHistoryEvents(history, "uninstall");
  return {
    disabled,
    projectCount: projects.length,
    currentSkillCount: currentSkillCount(projects),
    skillCount: skills.length,
    skillsEverUsed: skills.length,
    installEventCount,
    uninstallEventCount,
    updatedAt: history.updatedAt,
    recentProjects: projects.slice(0, 5),
    recentActivity: listRecentActivity(history, 5)
  };
}

function renderActivityLine(project: HistoryProject, event: HistoryEvent, skill: HistoryEventSkill, verbose = false): void {
  const verb = event.type === "install" ? "Installed" : "Uninstalled";
  process.stdout.write(`- ${formatDate(event.at)}     ${verb} ${pc.cyan(skill.name ?? skill.canonicalId)} in ${project.name}
`);
  if (verbose) {
    process.stdout.write(`  ${pc.blue("Event ID")}: ${event.eventId}
`);
    process.stdout.write(`  ${pc.blue("Source")}: ${event.source}
`);
    process.stdout.write(`  ${pc.blue("Provider")}: ${skill.providerId}
`);
    process.stdout.write(`  ${pc.blue("Provider skill ID")}: ${skill.skillId}
`);
    process.stdout.write(`  ${pc.blue("Canonical ID")}: ${skill.canonicalId}
`);
    process.stdout.write(`  ${pc.blue("Version")}: ${skill.version ?? "unknown"}
`);
    process.stdout.write(`  ${pc.blue("Ref")}: ${skill.ref ?? "unknown"}
`);
    process.stdout.write(`  ${pc.blue("Targets")}: ${skill.targets.join(", ") || "none"}
`);
    if (typeof skill.securityScore === "number") {
      process.stdout.write(`  ${pc.blue("Security score")}: ${skill.securityScore}/100
`);
    }
    process.stdout.write(`  ${pc.blue("Timestamp")}: ${event.at}
`);
  }
}

function currentSkillCount(projects: HistoryProject[]): number {
  return projects.reduce((count, project) => count + project.installedSkills.length, 0);
}

function renderOptionalList(label: string, values: string[] | undefined): void {
  if (values && values.length > 0) {
    process.stdout.write(`  ${pc.blue(label)}: ${values.join(", ")}
`);
  }
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
  const localDate = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
  return `${time} - ${localDate}`;
}
