import type { RecommendationEvalFixture } from "../../../src/recommend/evaluation/fixtures.js";
export { DOCS_SITE_FIXTURE } from "./docs-site.js";
export { MONOREPO_PACKAGE_FIXTURE } from "./monorepo-package.js";
export { NEXTJS_APP_FIXTURE } from "./nextjs-app.js";
export { PYTHON_API_FIXTURE } from "./python-api.js";
export { TYPESCRIPT_CLI_PACKAGE_FIXTURE } from "./typescript-cli-package.js";
import { DOCS_SITE_FIXTURE } from "./docs-site.js";
import { MONOREPO_PACKAGE_FIXTURE } from "./monorepo-package.js";
import { NEXTJS_APP_FIXTURE } from "./nextjs-app.js";
import { PYTHON_API_FIXTURE } from "./python-api.js";
import { TYPESCRIPT_CLI_PACKAGE_FIXTURE } from "./typescript-cli-package.js";

export const RECOMMENDATION_EVAL_FIXTURES: RecommendationEvalFixture[] = [
  TYPESCRIPT_CLI_PACKAGE_FIXTURE,
  NEXTJS_APP_FIXTURE,
  PYTHON_API_FIXTURE,
  DOCS_SITE_FIXTURE,
  MONOREPO_PACKAGE_FIXTURE
];
