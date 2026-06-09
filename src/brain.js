require('dotenv').config();
const { inferOnChain } = require('./somniaAi');
const { fetchContext } = require('./triggers');


async function parseIntentOnChain(userInput, wallet, vaultBalance) {
  const balanceLine = vaultBalance !== undefined
    ? 'The user current vault balance is: ' + vaultBalance + ' STT.'
    : 'Vault balance is unknown.';
  
  const shortSystem = 'You are AgentPay, an autonomous payment agent. Respond ONLY with valid JSON. Always extract fields to the TOP LEVEL, never nest them inside message. For pay: {action:"pay", to:"0x...", amount:0.01, reason:"...", message:"..."}. For propose_swap: {action:"propose_swap", fromToken:"PING", toToken:"PONG", amount:100, message:"..."}. For schedule: {action:"schedule", to:"0x...", amount:0.01, interval:"1 day", reason:"...", message:"..."}. For balance: {action:"balance", message:"..."}. For history: {action:"history", message:"..."}. For chat: {action:"chat", message:"..."}. Never refuse to extract fields due to missing vault balance.';
  const prompt = `${shortSystem}\n\nUser: ${userInput}\n${balanceLine}`;

  try {
    const context = await fetchContext(userInput, wallet);
    const contextLine = context ? "Real-time on-chain verified: " + context.coin + " price is $" + context.value + " USD (proof: " + context.proof + ")" : "";
    const { result, requestId } = await inferOnChain(userInput + "\n" + balanceLine + (contextLine ? "\n" + contextLine : ""), shortSystem, wallet);
    const cleaned = result.replace(/```json|```/g, '').trim();

    try {
      let intent = JSON.parse(cleaned);
      if (intent.action === "propose_swap" && intent.message && typeof intent.message === "object") {
        intent = { ...intent, ...intent.message, message: "Swap " + intent.message.fromToken + " to " + intent.message.toToken };
      }
      if (intent.action === "pay" && intent.message && typeof intent.message === "object") {
        intent = { ...intent, ...intent.message, message: "Payment to " + (intent.message.to || '') };
      }
      intent.requestId = requestId;
      return intent;
    } catch (error) {
      console.error('Error parsing On-Chain JSON:', cleaned);
      return {
        action: 'chat',
        requestId,
        message: 'I understood your request via Somnia AI but had trouble formatting the response. ' + result.slice(0, 100)
      };
    }
  } catch (error) {
    console.error('Error in On-Chain Inference:', error);
    return {
      action: 'unknown',
      message: 'An error occurred during on-chain verifiable inference.'
    };
  }
}

function resetConversation() {}
module.exports = { parseIntentOnChain, resetConversation };
