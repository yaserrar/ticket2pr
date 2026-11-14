/**
 * Remote URL parsing (spec §8.1). Pure, unit-tested. Supports
 * `git@github.com:owner/repo.git`, `ssh://git@github.com/owner/repo.git` and
 * `https://github.com/owner/repo(.git)`.
 */
export type ParsedRemote = { host: string; owner: string; repo: string };

export function parseRemoteUrl(url: string): ParsedRemote | null {
  const trimmed = url.trim();
  const scp = trimmed.match(/^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  if (scp) return { host: scp[1]!.toLowerCase(), owner: scp[2]!, repo: scp[3]! };
  try {
    const u = new URL(trimmed);
    const parts = u.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return { host: u.hostname.toLowerCase(), owner: parts[parts.length - 2]!, repo: parts[parts.length - 1]! };
  } catch {
    return null;
  }
}

/**
 * github.com, or an SSH host alias for it (`git@github-work:owner/repo.git`,
 * defined in ~/.ssh/config to pick a key).
 */
const isGithubHost = (host: string) => host === 'github.com' || /(^|[.-])github([.-]|$)/.test(host);

export function githubRepoFromRemote(url: string | null | undefined): { owner: string; repo: string } | null {
  if (!url) return null;
  const parsed = parseRemoteUrl(url);
  return parsed && isGithubHost(parsed.host) ? { owner: parsed.owner, repo: parsed.repo } : null;
}

export function compareUrl(github: { owner: string; repo: string }, base: string, branch: string) {
  return `https://github.com/${github.owner}/${github.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1`;
}

/** `t2p/{shortLink}-{slug(title, 40)}` (spec §8.2). */
export function branchNameFor(shortLink: string, title: string) {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  const safeLink = shortLink.replace(/[^A-Za-z0-9]/g, '');
  return slug ? `t2p/${safeLink}-${slug}` : `t2p/${safeLink}`;
}
