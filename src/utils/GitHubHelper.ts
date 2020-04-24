import { raiseError } from 'analytics'
export const SERVER_FAULT = 'Server Fault'
export const NOT_FOUND = 'Repo Not Found'
export const BAD_CREDENTIALS = 'Bad credentials'
export const API_RATE_LIMIT = `API rate limit`
export const EMPTY_PROJECT = `Empty project`
export const BLOCKED_PROJECT = `Blocked project`

function apiRateLimitExceeded(content: any /* examined any */) {
  return (
    content && content['documentation_url'] === 'https://developer.github.com/v3/#rate-limiting'
  )
}

function isEmptyProject(content: any /* examined any */) {
  return content && content['message'] === 'Git Repository is empty.'
}

function isBlockedProject(content: any /* examined any */) {
  return content && content['message'] === 'Repository access blocked'
}

type Options = {
  accessToken?: string
}

async function request(url: string, { accessToken }: Options = {}) {
  const headers = {} as HeadersInit & {
    Authorization?: string
  }
  if (accessToken) {
    headers.Authorization = `token ${accessToken}`
  }
  const res = await fetch(url, { headers })
  const contentType = res.headers.get('Content-Type') || res.headers.get('content-type')
  if (!contentType) {
    throw new Error(`Response has no content type`)
  } else if (!contentType.includes('application/json')) {
    throw new Error(`Response content type is ${contentType}`)
  }
  // About res.ok:
  // True if res.status between 200~299
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Response/ok
  if (res.ok) {
    return res.json()
  } else {
    if (res.status === 404 || res.status === 401) throw new Error(NOT_FOUND)
    else if (res.status === 500) throw new Error(SERVER_FAULT)
    else {
      const content = await res.json()
      if (apiRateLimitExceeded(content)) throw new Error(API_RATE_LIMIT)
      if (isEmptyProject(content)) throw new Error(EMPTY_PROJECT)
      if (isBlockedProject(content)) throw new Error(BLOCKED_PROJECT)
      // Unknown type of error, report it!
      raiseError(new Error(res.statusText))
      throw new Error(content && content.message)
    }
  }
}

type PageType = 'blob' | 'tree' | string

export type MetaData = {
  userName?: string
  repoName?: string
  branchName?: string
  accessToken?: string
  type?: PageType
  api?: RepoMetaData
}

type RepoMetaData = {
  default_branch: string
  html_url: string
  owner: {
    html_url: string
  }
}

export async function getRepoMeta({
  userName,
  repoName,
  accessToken,
}: MetaData): Promise<RepoMetaData> {
  const url = `https://api.github.com/repos/${userName}/${repoName}`
  return await request(url, { accessToken })
}

export type TreeItem = {
  path: string
  mode: string
  sha: string
  size: number
  url: string
  type: 'blob' | 'commit' | 'tree'
}

export type TreeData = {
  sha: string
  truncated: boolean
  tree: TreeItem[]
  url: string
}

export async function getTreeData({
  userName,
  repoName,
  branchName,
  accessToken,
}: MetaData): Promise<TreeData> {
  const url = `https://api.github.com/repos/${userName}/${repoName}/git/trees/${branchName}?recursive=1`
  return await request(url, { accessToken })
}

export type BlobData = {
  encoding: 'base64' | string
  sha: string
  content?: string
  size: number
  url: string
}

export async function getBlobData({
  userName,
  repoName,
  accessToken,
  sha,
}: Pick<MetaData, 'userName' | 'repoName' | 'accessToken'> & {
  sha: string
}): Promise<BlobData> {
  const url = `https://api.github.com/repos/${userName}/${repoName}/git/blobs/${sha}`
  return await request(url, { accessToken })
}

export function getUrlForRedirect(
  { userName, repoName, branchName }: MetaData,
  type = 'blob',
  path?: string,
) {
  return `/${userName}/${repoName}/${type}/${branchName}/${path}`
}
