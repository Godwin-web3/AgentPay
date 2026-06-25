require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function parseIntent(userInput, walletAddress, usdcBalance) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const systemPrompt = `You are AgentPay, an autonomous USDC payment agent on Arc testnet. Today is ${dateStr}. User wallet: ${walletAddress}. USDC balance: ${usdcBalance}.
You operate in two modes:
REACTIVE: User gives a direct instruction.
AUTONOMOUS: User gives a goal. You decide what paid services to call to achieve it. If fetching data or compute requires payment, include it in the action.
Always respond with ONLY valid JSON, no markdown.

Known paid endpoints (use these exactly, do not invent URLs):
- ETH/USD price: https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
- BTC/USD price: https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
- AI intelligence (x402 paid): http://localhost:3000/intelligence

Actions:
Goal requires fetching a paid resource:
{"action":"fetch_and_pay","url":"https://...","maxAmount":0.01,"reason":"...","message":"..."}
Direct payment instruction:
{"action":"pay","to":"0x...","amount":0.01,"reason":"...","message":"..."}
User wants to hire an agent for a task (ERC-8183 job escrow):
{"action":"hire_agent","description":"...","budget":5,"message":"..."}
User asks about balance:
{"action":"balance","message":"..."}
User asks about history:
{"action":"history","message":"..."}
User asks about policy:
{"action":"policy","message":"..."}
Cannot fulfil or general chat:
{"action":"chat","message":"..."}`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 512,
    });

    let result = chatCompletion.choices[0].message.content;
    
    // Strip ```json fences
    let cleaned = result.replace(/```json|```/g, '').trim();
    
    // Fix unquoted keys with regex: { action: -> { "action":
    cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    try {
      return JSON.parse(cleaned);
    } catch (parseError) {
      console.error('JSON parse error, falling back to chat action:', parseError, cleaned);
      return { action: 'chat', message: result };
    }
  } catch (error) {
    console.error('Groq API error:', error);
    return { action: 'chat', message: "I encountered an error while processing your request." };
  }
}

function resetConversation() {}

module.exports = { parseIntent, resetConversation };
