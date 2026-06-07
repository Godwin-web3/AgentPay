require('dotenv').config();
const readline = require('readline');
const { parseIntent, parseIntentOnChain, resetConversation } = require('./brain');
const { pay, status, getUnifiedHistory, prepareSwap, confirmSwap, showBalances, wallet } = require('./agent');
const { applyUpdate } = require('./policyManager');
const scheduler = require('./scheduler');
const { TOKENS } = require('./dex');

function resolveSymbol(sym) {
  if (!sym) return sym;
  const upper = sym.toUpperCase();
  if (TOKENS[upper]) return TOKENS[upper];
  return sym;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let ownerAddress = null;
let pendingSwap = null;

function ask(question) {
  return new Promise(function(resolve) {
    rl.question(question, function(answer) {
      resolve(answer.trim().toLowerCase());
    });
  });
}

function listSchedules() {
  const jobs = scheduler.getActiveJobs();
  console.log('\n📅 Active Scheduled Payments');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (jobs.length === 0) {
    console.log('   No active schedules');
    return;
  }
  jobs.forEach(function(job) {
    console.log('   ID:       ' + job.id);
    console.log('   To:       ' + job.to.slice(0, 10) + '...');
    console.log('   Amount:   ' + job.amount + ' STT');
    console.log('   Reason:   ' + job.reason);
    console.log('   Interval: every ' + job.intervalLabel);
    if (job.conditions) {
      if (job.conditions.minBalance) console.log('   Min bal:  ' + job.conditions.minBalance + ' STT');
      if (job.conditions.executeAt) console.log('   At:       ' + job.conditions.executeAt);
      if (job.conditions.executeOnDay) console.log('   On day:   ' + job.conditions.executeOnDay);
      if (job.conditions.executeOnDate) console.log('   On date:  ' + job.conditions.executeOnDate);
      if (job.conditions.executeOnce) console.log('   Type:     one-time');
    }
    console.log('   Runs:     ' + job.totalRuns + ' | Spent: ' + job.totalSpent + ' STT');
    console.log('   Next:     ' + new Date(job.nextRun).toLocaleTimeString());
    console.log('   ─────────────────────────────────────');
  });
}

function prompt() {
  rl.question('\n💬 You: ', async function(input) {
    input = input.trim();

    if (!input) {
      prompt();
      return;
    }

    if (input.toLowerCase() === 'exit') {
      console.log('\n👋 AgentPay shutting down. Goodbye.');
      scheduler.stopAllJobs();
      rl.close();
      process.exit(0);
    }

    console.log('\n🧠 AgentPay is thinking...');

    const isVerifiable = input.toLowerCase().startsWith('/verifiable');
    const actualInput = isVerifiable ? input.slice(11).trim() : input;

    // Intercept swap confirmation before sending to AI
    if (pendingSwap && ['no','cancel','nope','n'].includes(actualInput.toLowerCase())) {
      pendingSwap = null;
      resetConversation();
      console.log('\n🚫 Swap cancelled.');
      prompt(); return;
    }

    if (pendingSwap && ['yes','confirm','go ahead','yep','y'].includes(actualInput.toLowerCase())) {
      const result = await confirmSwap(resolveSymbol(pendingSwap.fromToken), resolveSymbol(pendingSwap.toToken), pendingSwap.amount);
      pendingSwap = null;
      if (result.success) {
        console.log("\n✅ Swap executed! TX: " + result.txHash);
      } else {
        console.log("\n❌ Swap failed: " + (result.error || result.reason));
      }
      resetConversation();
      prompt(); return;
    }

    try {
      let intent;
      if (isVerifiable) {
        console.log('🛡️  Using Somnia Verifiable AI (this may take a minute)...');
        intent = await parseIntentOnChain(actualInput, wallet);
      } else {
        intent = await parseIntent(actualInput);
      }

      const _skipMsg = ['history','status','list_schedules','help','cancel_schedule','balance'].includes(intent.action);
        if (!_skipMsg) console.log('\n🤖 AgentPay: ' + intent.message);

      if (intent.action === 'propose_swap') {
        if (!intent.fromToken || !intent.toToken || !intent.amount) {
          console.log('   ⚠️  Missing swap details.');
          prompt(); return;
        }
        
        // Extract symbols directly from user input as fallback
        const inputUpper = actualInput.toUpperCase();
        const knownSymbols = ['PING', 'PONG', 'SUSD', 'WSTT', 'STT'];
        const foundSymbols = knownSymbols
          .filter(s => {
            const idx = inputUpper.indexOf(s);
            if (idx === -1) return false;
            // STT must not be part of WSTT
            if (s === 'STT' && inputUpper.includes('WSTT')) return false;
            return true;
          })
          .sort((a, b) => inputUpper.indexOf(a) - inputUpper.indexOf(b));
        const fromRaw = foundSymbols[0] || intent.fromToken;
        const toRaw = foundSymbols[1] || intent.toToken;
        const fromAddr = resolveSymbol(fromRaw);
        const toAddr = resolveSymbol(toRaw);
        const estimation = await prepareSwap(fromAddr, toAddr, intent.amount);
        if (estimation.success) {
          pendingSwap = {
            fromToken: fromAddr,
            toToken: toAddr,
            amount: intent.amount
          };
          console.log('\n💬 Say "Confirm" or "Yes" to execute this swap.');
        }
        // resetConversation(); — keep context for confirmation

      } else if (intent.action === 'execute_swap') {
        if (!pendingSwap) {
          console.log('   ⚠️  No pending swap to execute.');
          prompt(); return;
        }

        const result = await confirmSwap(resolveSymbol(pendingSwap.fromToken), resolveSymbol(pendingSwap.toToken), pendingSwap.amount);
        if (result.success) {
          pendingSwap = null;
        }
        resetConversation();

      } else if (intent.action === 'intent') {
        if (!intent.intentName) { console.log('   ⚠️  Unknown intent.'); prompt(); return; }
        
        console.log('\n⚠️  Confirm Atomic Intent:');
        console.log('   Intent: ' + intent.intentName.replace(/_/g, ' ').toUpperCase());
        if (intent.amount) console.log('   Amount: ' + intent.amount + ' STT');
        if (intent.to) console.log('   To:     ' + intent.to);

        const confirm = await ask('\n   Execute this complex operation? (yes/no): ');
        if (confirm !== 'yes' && confirm !== 'y') { console.log('\n🚫 Operation cancelled.'); resetConversation(); prompt(); return; }

        console.log('\n⛓️  Executing on Somnia...');
        // In local mode, we'd ideally call the same multicall logic.
        // For the demo parity, we'll log the intent.
        console.log('   [DEMO] Atomic multicall triggered for ' + intent.intentName);
        console.log('   ✅ Operation submitted (Simulation)');
        resetConversation();

      } else if (intent.action === 'pay') {
        if (!intent.to) { console.log('   ⚠️  Please provide a recipient address.'); prompt(); return; }
        if (!intent.amount || intent.amount <= 0) { console.log('   ⚠️  Please provide a valid amount.'); prompt(); return; }

        console.log('\n⚠️  Confirm Payment:');
        console.log('   To:     ' + intent.to);
        console.log('   Amount: ' + intent.amount + ' STT');
        console.log('   Reason: ' + (intent.reason || 'not specified'));

        const confirm = await ask('\n   Proceed? (yes/no): ');
        if (confirm !== 'yes' && confirm !== 'y') { console.log('\n🚫 Payment cancelled.'); resetConversation(); prompt(); return; }

        const result = await pay(intent.to, intent.amount, intent.reason || actualInput);
        if (result.success) {
          console.log('\n✅ Payment complete!');
          console.log('   🔗 https://explorer.somnia.network/tx/' + result.txHash);
        } else {
          console.log('\n❌ Payment blocked: ' + result.reason);
        }
        resetConversation();

      } else if (intent.action === 'schedule') {
        if (!intent.to) { console.log('   ⚠️  Please provide a recipient address.'); prompt(); return; }
        if (!intent.amount || intent.amount <= 0) { console.log('   ⚠️  Please provide a valid amount.'); prompt(); return; }

        const intervalMs = scheduler.parseInterval(intent.interval || '1 day');
        const label = scheduler.intervalLabel(intervalMs);

        console.log('\n⚠️  Confirm Scheduled Payment:');
        console.log('   To:       ' + intent.to);
        console.log('   Amount:   ' + intent.amount + ' STT');
        console.log('   Reason:   ' + (intent.reason || 'not specified'));
        console.log('   Interval: every ' + label);

        if (intent.conditions) {
          console.log('   Conditions:');
          if (intent.conditions.minBalance) console.log('     • Only if balance above ' + intent.conditions.minBalance + ' STT');
          if (intent.conditions.executeAt) console.log('     • Execute at ' + intent.conditions.executeAt);
          if (intent.conditions.executeOnDay) console.log('     • Execute on ' + intent.conditions.executeOnDay);
          if (intent.conditions.executeOnDate) console.log('     • Execute on ' + intent.conditions.executeOnDate);
          if (intent.conditions.maxDailySpend) console.log('     • Only if spent less than ' + intent.conditions.maxDailySpend + ' STT today');
          if (intent.conditions.executeOnce) console.log('     • One-time payment');
        }

        const confirm = await ask('\n   Start this schedule? (yes/no): ');
        if (confirm !== 'yes' && confirm !== 'y') { console.log('\n🚫 Schedule cancelled.'); resetConversation(); prompt(); return; }

        const job = scheduler.addJob({
          to: intent.to,
          amount: intent.amount,
          reason: intent.reason || 'scheduled payment',
          trigger: intent.trigger || null,
          intervalMs,
          intervalLabel: label,
          conditions: intent.conditions || null
        });

        scheduler.startJob(job, pay, ownerAddress);
        console.log('\n✅ Schedule created! Job ID: ' + job.id);
        resetConversation();

      } else if (intent.action === 'cancel_schedule') {
        if (!intent.jobId) { console.log('   ⚠️  Please provide a job ID. Type "show schedules" to see them.'); prompt(); return; }
        const cancelled = scheduler.cancelJob(intent.jobId);
        if (cancelled) {
          scheduler.stopJob(intent.jobId);
          console.log('\n✅ Job ' + intent.jobId + ' cancelled.');
        } else {
          console.log('\n❌ Job ' + intent.jobId + ' not found.');
        }
        resetConversation();

      } else if (intent.action === 'list_schedules') {
        listSchedules();

      } else if (intent.action === 'update_policy') {
        if (!intent.policyUpdate || !intent.policyUpdate.field) { console.log('   ⚠️  Could not understand the policy change.'); prompt(); return; }

        console.log('\n⚠️  Confirm Policy Update:');
        console.log('   Change: ' + JSON.stringify(intent.policyUpdate));

        const confirm = await ask('\n   Apply this change? (yes/no): ');
        if (confirm !== 'yes' && confirm !== 'y') {
          console.log('\n🚫 Policy update cancelled.');
          resetConversation();
          prompt();
          return;
        }

        const msg = applyUpdate(intent);
        console.log('\n✅ ' + msg);
        resetConversation();

      } else if (intent.action === 'status') {
        status();
        resetConversation();

      } else if (intent.action === 'balance') {
        await showBalances();
        resetConversation();
      undefined
        resetConversation();

      } else if (intent.action === 'help') {
        console.log('\n📚 Available Commands:');
        console.log('   • "pay 0.1 STT to 0x..."');
        console.log('   • "schedule 0.5 STT to 0x... every 1 day"');
        console.log('   • "show status / show limits"');
        console.log('   • "show history"');
        console.log('   • "show schedules"');
        console.log('   • "cancel schedule [ID]"');
        console.log('   • "set daily limit to 5"');
        resetConversation();

      } else {
        // Fallback for unknown or conversational intents
      }

    } catch (err) {
      console.log('\n⚠️  Error: ' + err.message);
    }
    prompt();
  });
}

async function startLoop(address) {
  ownerAddress = address;
  
  // Load existing schedules
  const jobs = scheduler.getActiveJobs();
  if (jobs.length > 0) {
    console.log('\n🔄 Resuming ' + jobs.length + ' scheduled jobs...');
    jobs.forEach(function(job) {
      scheduler.startJob(job, pay, ownerAddress);
    });
  }

  prompt();
}

module.exports = { startLoop };

