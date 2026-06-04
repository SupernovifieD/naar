import fs from "node:fs";

export interface ReleaseBullet {
  text: string;
  depth: number;
}

export interface ReleaseSection {
  title: string;
  bullets: ReleaseBullet[];
}

export interface ReleaseEntry {
  version: string;
  slug: string;
  date: string;
  sections: ReleaseSection[];
}

export function parseChangelog(): ReleaseEntry[] {
  const changelogPath = new URL("../../../CHANGELOG.md", import.meta.url);
  const source = fs.readFileSync(changelogPath, "utf8");
  const lines = source.split(/\r?\n/);
  const releases: ReleaseEntry[] = [];
  let currentRelease: ReleaseEntry | null = null;
  let currentSection: ReleaseSection | null = null;

  for (const rawLine of lines) {
    const releaseMatch = rawLine.match(/^## \[(.+?)\] - (.+)$/);
    if (releaseMatch) {
      if (currentRelease) releases.push(currentRelease);
      const [, version, date] = releaseMatch;
      currentRelease = {
        version,
        slug: `v${version}`,
        date,
        sections: []
      };
      currentSection = null;
      continue;
    }

    if (!currentRelease) {
      continue;
    }

    const sectionMatch = rawLine.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      currentSection = {
        title: sectionMatch[1].trim(),
        bullets: []
      };
      currentRelease.sections.push(currentSection);
      continue;
    }

    const bulletMatch = rawLine.match(/^(\s*)-\s+(.+)$/);
    if (bulletMatch && currentSection) {
      const [, indent, text] = bulletMatch;
      currentSection.bullets.push({
        text: text.trim(),
        depth: Math.floor(indent.length / 2)
      });
      continue;
    }

    const continuation = rawLine.trim();
    if (continuation && currentSection && currentSection.bullets.length > 0) {
      currentSection.bullets[currentSection.bullets.length - 1].text += ` ${continuation}`;
    }
  }

  if (currentRelease) {
    releases.push(currentRelease);
  }

  return releases;
}
