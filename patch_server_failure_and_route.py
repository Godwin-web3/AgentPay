#!/usr/bin/env python3

path = "src/server.js"
with open(path) as f:
    content = f.read()

old_catch = """            } catch (err) {
              console.error('❌ Schedule ' + s.id + ' failed:', err.message);
            }
          }
        } catch (err) {
          console.error('Keeper user error:', err.message);
        }
      }"""

new_catch = """            } catch (err) {
              console.error('❌ Schedule ' + s.id + ' failed:', err.message);
              try {
                await appendFailure({
                  userAddress: userAddress,
                  to: s.to,
                  amount: s.amount,
                  reason: s.reason,
                  blockedReason: err.message,
                  scheduleId: s.id
                });
              } catch (logErr) {
                console.error('❌ Failed to log schedule failure:', logErr.message);
              }
            }
          }
        } catch (err) {
          console.error('Keeper user error:', err.message);
        }
      }"""

if old_catch not in content:
    raise SystemExit("PATCH FAILED (catch): text not found")
content = content.replace(old_catch, new_catch, 1)

old_route = "app.get('/jobs/check-hired', handleCheckHiredJobs);"
new_route = """app.get('/jobs/check-hired', handleCheckHiredJobs);

async function handleScheduleStats(req, res) {
  try {
    const userId = getUserId(req);
    const stats = await require('./spendStore').getScheduleStats(userId);
    return send(res, 200, stats);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}
app.get('/schedules/stats', handleScheduleStats);"""

if old_route not in content:
    raise SystemExit("PATCH FAILED (route): text not found")
content = content.replace(old_route, new_route, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched src/server.js — failure logging + GET /schedules/stats route added")
