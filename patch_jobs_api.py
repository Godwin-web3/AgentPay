#!/usr/bin/env python3

path = "frontend/src/api.ts"
with open(path) as f:
    content = f.read()

old = """export async function cancelSchedule(jobId: string, userId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/schedules/' + jobId, { method: 'DELETE' }, userId)
}"""

new = """export async function cancelSchedule(jobId: string, userId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/schedules/' + jobId, { method: 'DELETE' }, userId)
}

export async function getMyJobs(userId: string): Promise<{ created: any[]; hired: any[] }> {
  return request<{ created: any[]; hired: any[] }>('/api/jobs/mine', {}, userId)
}

export async function getMarketJobs(userId: string): Promise<any> {
  return request<any>('/market-intel', {}, userId)
}"""

if old not in content:
    raise SystemExit("PATCH FAILED: cancelSchedule not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched frontend/src/api.ts — added getMyJobs and getMarketJobs")
