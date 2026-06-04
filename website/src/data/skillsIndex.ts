export interface IndexedSkillRecord {
  id: string;
  name: string;
  provider: string;
  publisher?: string;
  license?: string;
  updatedAt?: string;
  description: string;
  url?: string;
  installRef: string;
  installCommand: string;
  npxCommand: string;
  status?: string;
  risk?: number;
  tags?: string[];
}

export interface SkillsIndexPayload {
  generatedAt: string;
  providers: string[];
  warnings: string[];
  skills: IndexedSkillRecord[];
}
