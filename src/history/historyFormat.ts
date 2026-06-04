import pc from "picocolors";
import type { HistoryEvent, HistoryEventSkill, HistoryProject, HistorySkillSummary, NaarHistory } from "./historySchema.js";
import {
  countHistoryEvents,
  listProjects,
  listRecentActivity,
  listSkillSummaries,
  projectUninstalledSkillIds
} from "./historyService.js";
import { command, formatDateOnly, formatLocalDateTime, heading, info, joinSegments, keyValue, muted, pathText, skill as skillText, warning } from "../utils/terminal.js";

export function renderHistorySummary(history: NaarHistory, options: { disabled?: boolean; warning?: string; verbose?: boolean } = {}): void {
  process.stdout.write(`${heading("Naar history")}\n\n`);
  if (options.disabled) {
    process.stdout.write(`${warning("History is disabled for this invocation.")} Existing local history is not deleted.\n\n`);
  }
  if (options.warning) {
    process.stdout.write(`${warning(options.warning)}\n\n`);
  }

  const projects = listProjects(history);
  const skills = listSkillSummaries(history);
  const installEventCount = countHistoryEvents(history, "install");
  const uninstallEventCount = countHistoryEvents(history, "uninstall");
  process.stdout.write(`${keyValue("Remembered projects", String(projects.length))}\n`);
  process.stdout.write(`${keyValue("Current skills", String(currentSkillCount(projects)))}\n`);
  process.stdout.write(`${keyValue("Skills ever used", String(skills.length))}\n`);
  process.stdout.write(`${keyValue("Install events", String(installEventCount))}\n`);
  process.stdout.write(`${keyValue("Uninstall events", String(uninstallEventCount))}\n`);
  process.stdout.write(`${keyValue("Last updated", formatLocalDateTime(history.updatedAt))}\n`);

  const recentProjects = projects.slice(0, 5);
  if (recentProjects.length > 0) {
    process.stdout.write(`\n${heading("Recent projects")}\n\n`);
    for (const project of recentProjects) {
      process.stdout.write(`* ${skillText(project.name)} ${muted("·")} ${project.installedSkills.length} current ${muted("·")} ${projectUninstalledSkillIds(project).length} uninstalled ${muted("·")} last activity ${formatDate(project.lastSeenAt)}\n`);
      if (options.verbose) {
        process.stdout.write(`  ${keyValue("Path", pathText(project.path))}\n`);
        process.stdout.write(`  ${keyValue("Project ID", project.projectId)}\n`);
      }
    }
  }

  const activity = listRecentActivity(history, 5);
  if (activity.length > 0) {
    process.stdout.write(`\n${heading("Recent activity")}\n\n`);
    for (const item of activity) {
      renderActivityLine(item.project, item.event, item.skill, options.verbose);
    }
  }
}

export function renderHistoryProjectList(projects: HistoryProject[], options: { warning?: string; verbose?: boolean } = {}): void {
  if (options.warning) {
    process.stdout.write(`${warning(options.warning)}\n\n`);
  }
  process.stdout.write(`${heading("Remembered projects")}\n\n`);
  for (const project of projects) {
    process.stdout.write(`${skillText(project.name)}\n`);
    process.stdout.write(`  ${joinSegments([
      `${project.installedSkills.length} current`,
      `${projectUninstalledSkillIds(project).length} uninstalled`,
      `last activity ${formatDate(project.lastSeenAt)}`
    ])}\n`);
    if (options.verbose) {
      process.stdout.write(`  ${keyValue("Path", pathText(project.path))}\n`);
      process.stdout.write(`  ${keyValue("First seen", formatLocalDateTime(project.firstSeenAt))}\n`);
      process.stdout.write(`  ${keyValue("Last install", formatLocalDateTime(project.lastInstallAt))}\n`);
      process.stdout.write(`  ${keyValue("Last uninstall", formatLocalDateTime(project.lastUninstallAt))}\n`);
      process.stdout.write(`  ${keyValue("Project ID", project.projectId)}\n`);
    }
    process.stdout.write("\n");
  }
}

export function renderHistorySkills(skills: HistorySkillSummary[], options: { warning?: string; verbose?: boolean } = {}): void {
  if (options.warning) {
    process.stdout.write(`${warning(options.warning)}\n\n`);
  }
  process.stdout.write(`${heading("Remembered skills")}\n\n`);
  for (const skill of skills) {
    process.stdout.write(`${skillText(skill.name ?? skill.canonicalId)}\n`);
    process.stdout.write(`  ${joinSegments([
      `${skill.currentlyInstalledInProjects.length} current projects`,
      `${skill.everInstalledInProjects.length} ever used`,
      `${skill.installCount} installs`,
      `${skill.uninstallCount} uninstalls`,
      `last activity ${formatDate(skill.lastSeenAt)}`
    ])}\n`);
    if (options.verbose) {
      process.stdout.write(`  ${keyValue("Canonical ID", skill.canonicalId)}\n`);
      process.stdout.write(`  ${keyValue("Providers", skill.providerIds.join(", ") || "none")}\n`);
      process.stdout.write(`  ${keyValue("Provider skill IDs", skill.skillIds.join(", ") || "none")}\n`);
      process.stdout.write(`  ${keyValue("Targets", skill.targets.join(", ") || "none")}\n`);
      process.stdout.write(`  ${keyValue("Last installed", formatLocalDateTime(skill.lastInstalledAt))}\n`);
      process.stdout.write(`  ${keyValue("Last uninstalled", formatLocalDateTime(skill.lastUninstalledAt))}\n`);
    }
    process.stdout.write("\n");
  }
}

export function renderHistoryProject(project: HistoryProject, options: { warning?: string; verbose?: boolean } = {}): void {
  if (options.warning) {
    process.stdout.write(`${warning(options.warning)}\n\n`);
  }
  process.stdout.write(`${heading(project.name)}\n`);
  process.stdout.write(`${keyValue("Path", pathText(project.path))}\n`);
  process.stdout.write(`${keyValue("First seen", formatLocalDateTime(project.firstSeenAt))}\n`);
  process.stdout.write(`${keyValue("Last activity", formatLocalDateTime(project.lastSeenAt))}\n`);
  if (project.lastInstallAt) {
    process.stdout.write(`${keyValue("Last install", formatLocalDateTime(project.lastInstallAt))}\n`);
  }
  if (project.lastUninstallAt) {
    process.stdout.write(`${keyValue("Last uninstall", formatLocalDateTime(project.lastUninstallAt))}\n`);
  }

  if (project.detected) {
    process.stdout.write(`\n${heading("Detected")}\n`);
    renderOptionalList("Languages", project.detected.languages);
    renderOptionalList("Frameworks", project.detected.frameworks);
    renderOptionalList("Package managers", project.detected.packageManagers);
    renderOptionalList("Assistants", project.detected.assistants);
  }

  process.stdout.write(`\n${heading("Current installed skills")}\n`);
  if (project.installedSkills.length === 0) {
    process.stdout.write("* none\n");
  }
  for (const skill of project.installedSkills) {
    process.stdout.write(`* ${skillText(skill.name ?? skill.canonicalId)} ${info(`[${skill.providerId}]`)}\n`);
    process.stdout.write(`  ${joinSegments([
      `Targets ${skill.targets.join(", ") || "none"}`,
      typeof skill.securityScore === "number" ? `Security ${skill.securityScore}/100` : undefined
    ])}\n`);
    if (typeof skill.securityScore === "number") {
      void 0;
    }
    if (options.verbose) {
      process.stdout.write(`  ${keyValue("Canonical ID", skill.canonicalId)}\n`);
      process.stdout.write(`  ${keyValue("Provider skill ID", skill.skillId)}\n`);
      process.stdout.write(`  ${keyValue("Version", skill.version ?? "unknown")}\n`);
      process.stdout.write(`  ${keyValue("Ref", skill.ref ?? "unknown")}\n`);
      process.stdout.write(`  ${keyValue("Install count", String(skill.installCount))}\n`);
      process.stdout.write(`  ${keyValue("Installed at", formatLocalDateTime(skill.installedAt))}\n`);
      process.stdout.write(`  ${keyValue("Last seen", formatLocalDateTime(skill.lastSeenAt))}\n`);
    }
  }

  const uninstalled = projectUninstalledSkillIds(project);
  process.stdout.write(`\n${heading("Previously uninstalled skills")}\n`);
  if (uninstalled.length === 0) {
    process.stdout.write("* none\n");
  }
  for (const canonicalId of uninstalled) {
    process.stdout.write(`* ${info(canonicalId)}\n`);
  }

  const events = [...project.events]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, options.verbose ? project.events.length : 10);
  if (events.length > 0) {
    process.stdout.write(`\n${heading("Recent activity")}\n`);
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
  process.stdout.write(`* ${formatDate(event.at)} ${muted("·")} ${verb} ${info(skill.name ?? skill.canonicalId)} in ${project.name}\n`);
  if (verbose) {
    process.stdout.write(`  ${keyValue("Event ID", event.eventId)}\n`);
    process.stdout.write(`  ${keyValue("Source", event.source)}\n`);
    process.stdout.write(`  ${keyValue("Provider", skill.providerId)}\n`);
    process.stdout.write(`  ${keyValue("Provider skill ID", skill.skillId)}\n`);
    process.stdout.write(`  ${keyValue("Canonical ID", skill.canonicalId)}\n`);
    process.stdout.write(`  ${keyValue("Version", skill.version ?? "unknown")}\n`);
    process.stdout.write(`  ${keyValue("Ref", skill.ref ?? "unknown")}\n`);
    process.stdout.write(`  ${keyValue("Targets", skill.targets.join(", ") || "none")}\n`);
    if (typeof skill.securityScore === "number") {
      process.stdout.write(`  ${keyValue("Security score", `${skill.securityScore}/100`)}\n`);
    }
    process.stdout.write(`  ${keyValue("Timestamp", event.at)}\n`);
  }
}

function currentSkillCount(projects: HistoryProject[]): number {
  return projects.reduce((count, project) => count + project.installedSkills.length, 0);
}

function renderOptionalList(label: string, values: string[] | undefined): void {
  if (values && values.length > 0) {
    process.stdout.write(`  ${keyValue(label, values.join(", "))}\n`);
  }
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function formatDateTime(value: string): string {
  return formatLocalDateTime(value);
}
