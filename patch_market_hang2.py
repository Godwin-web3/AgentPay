#!/usr/bin/env python3

path = "src/jobService.js"
with open(path) as f:
    content = f.read()

old = """      const job = await getJob(id);
      if (job.client !== '0x0000000000000000000000000000000000000000') {
        jobs.push({
          ...job,
          budget: Number(job.budget).toFixed(2),
          description: job.description.slice(0, 80)
        });
      }
    } catch { }
  }"""

new = """      const jobTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('getJob timeout')), 5000));
      const job = await Promise.race([getJob(id), jobTimeout]);
      if (job.client !== '0x0000000000000000000000000000000000000000') {
        jobs.push({
          ...job,
          budget: Number(job.budget).toFixed(2),
          description: job.description.slice(0, 80)
        });
      }
    } catch (e) {
      console.error('[getRecentJobs] job fetch failed', id.toString(), e.message);
    }
  }"""

if old not in content:
    raise SystemExit("PATCH FAILED: job fetch loop not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/jobService.js — timeout added to job fetch loop")
