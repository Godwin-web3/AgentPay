require('dotenv').config();
const { inferOnChain } = require('./somniaAi');

async function parseIntentOnChain(userInput, wallet, vaultBalance) {
  const balanceLine = vaultBalance !== undefined
    ? 'The user current vault balance is: ' + vaultBalance + ' STT.'
    : 'Vault balance is unknown.';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const shortSystem = 'You are AgentPay, a sharp autonomous payment agent on the Somnia network. Today is ' + dateStr + '. You have a dry, confident personality. You HAVE real-time data access via the context provided in the user message - ALWAYS use it for prices. For financial actions, respond with JSON. For everything else, respond naturally in JSON chat format. FINANCIAL ACTIONS (use exact JSON): pay={action:"pay",to:"0x...",amount:0.01,reason:"...",message:"..."}. swap={action:"propose_swap",fromToken:"PING",toToken:"PONG",amount:100,message:"..."}. schedule={action:"schedule",to:"0x...",amount:0.01,interval:"1 day",reason:"...",message:"...",trigger:{type:"price",coin:"BTC",operator:">",threshold:200000} or null if no condition}. balance={action:"balance",message:"..."}. history={action:"history",message:"..."}. cancel_schedule={action:"cancel_schedule",jobId:"...",message:"..."}. update_policy={action:"update_policy",message:"..."}. EVERYTHING ELSE: {action:"chat",message:"your natural response"}. If real-time price context is provided, use it to answer precisely.';
  const prompt = `${shortSystem}\n\nUser: ${userInput}\n${balanceLine}`;

  try {
    const systemWithBalance = shortSystem + ' Agent context: ' + balanceLine;
    console.log('🤖 Sending to Somnia AI with context length:', userInput.length);
    const { result, requestId } = await inferOnChain(userInput, systemWithBalance, wallet);
...
    let cleaned = result.replace(/```json|```/g, '').trim();
    // Quote unquoted keys: { action: -> { "action":
    cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

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
