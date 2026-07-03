#!/usr/bin/env python3

path = "frontend/src/api.ts"
with open(path) as f:
    content = f.read()

marker = "export async function getSchedules(userId: string): Promise<{ schedules: any[] }> {"
if marker not in content:
    raise SystemExit("PATCH FAILED: getSchedules marker not found")

idx = content.index(marker)
insert_before = """export async function getScheduleStats(userId: string): Promise<Record<string, { success: number; failed: number; lastRun: number }>> {
  return request<Record<string, { success: number; failed: number; lastRun: number }>>('/schedules/stats', {}, userId)
}

"""
content = content[:idx] + insert_before + content[idx:]

with open(path, "w") as f:
    f.write(content)

print("✅ Patched frontend/src/api.ts — getScheduleStats added")
