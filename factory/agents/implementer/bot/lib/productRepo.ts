export type ProductRepoConfig = {
  repo: string;
  defaultBranch: string;
  localPath: string | null;
};

export function readProductRepoConfig(): ProductRepoConfig {
  return {
    repo:
      process.env.FACTORY_PRODUCT_REPO ?? "mckinleybmelton/superset-master-copy",
    defaultBranch: process.env.FACTORY_PRODUCT_DEFAULT_BRANCH ?? "master",
    localPath: process.env.FACTORY_PRODUCT_REPO_PATH ?? null,
  };
}
