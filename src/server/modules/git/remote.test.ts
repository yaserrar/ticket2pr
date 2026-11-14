import { describe, expect, it } from 'vitest';
import { branchNameFor, compareUrl, githubRepoFromRemote, parseRemoteUrl } from './remote';

describe('parseRemoteUrl', () => {
  it('parses SSH, ssh:// and HTTPS remotes', () => {
    const expected = { host: 'github.com', owner: 'yaserrar', repo: 'bistro-site' };
    expect(parseRemoteUrl('git@github.com:yaserrar/bistro-site.git')).toEqual(expected);
    expect(parseRemoteUrl('ssh://git@github.com/yaserrar/bistro-site.git')).toEqual(expected);
    expect(parseRemoteUrl('https://github.com/yaserrar/bistro-site.git')).toEqual(expected);
    expect(parseRemoteUrl('https://github.com/yaserrar/bistro-site')).toEqual(expected);
    expect(parseRemoteUrl('git@github-asrar:yaserrar/bistro-site.git')).toMatchObject({ host: 'github-asrar' });
  });

  it('returns null for local paths and junk', () => {
    expect(parseRemoteUrl('/tmp/origin.git')).toBeNull();
    expect(parseRemoteUrl('nonsense')).toBeNull();
  });

  it('recognises github.com and SSH aliases for it', () => {
    expect(githubRepoFromRemote('git@github.com:a/b.git')).toEqual({ owner: 'a', repo: 'b' });
    expect(githubRepoFromRemote('git@github-asrar:yaserrar/asrar.git')).toEqual({ owner: 'yaserrar', repo: 'asrar' });
    expect(githubRepoFromRemote('git@gitlab.com:a/b.git')).toBeNull();
    expect(githubRepoFromRemote('git@mygithubby.example:a/b.git')).toBeNull();
  });
});

describe('compareUrl', () => {
  it('builds the GitHub compare link (spec §8.5)', () => {
    expect(compareUrl({ owner: 'a', repo: 'b' }, 'main', 't2p/Xk3-fix')).toBe(
      'https://github.com/a/b/compare/main...t2p%2FXk3-fix?expand=1',
    );
  });
});

describe('branchNameFor', () => {
  it('slugs the title to 40 characters', () => {
    expect(branchNameFor('Xk3pQ9aB', 'Footer: the Privacy link goes to a 404')).toBe('t2p/Xk3pQ9aB-footer-the-privacy-link-goes-to-a-404');
    expect(branchNameFor('Mn7', 'Éditer le «héros» — très long titre qui dépasse largement')).toBe(
      't2p/Mn7-editer-le-heros-tres-long-titre-qui-depa',
    );
    expect(branchNameFor('Ab1', '!!!')).toBe('t2p/Ab1');
  });
});
