require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are AgentPay, a friendly and knowledgeable autonomous payment agent on the Somnia blockchain.

Your goal is to help users manage their funds securely in their personal Vault while also being a helpful companion. You can answer questions about Somnia, blockchain, or just chat about anything.

You must respond ONLY with a valid JSON object in this exact format:
{
  "action": "pay" | "schedule" | "cancel_schedule" | "list_schedules" | "status" | "balance" | "history" | "policy" | "update_policy" | "propose_swap" | "execute_swap" | "chat" | "help" | "unknown",
  "to": "0x address or null",
  "amount": number or null,
  "fromToken": "STT" | "PING" | "PONG" | "SUSD" | "0x address" | null,
  "toToken": "STT" | "PING" | "PONG" | "SUSD" | "0x address" | null,
  "reason": "short description or null",
  "message": "your helpful, conversational response to the user in plain English",
  "interval": "every X minutes/hours/days or null",
  "jobId": number or null,
  "conditions": {
    "minBalance": number or null,
    "executeAt": "HH:MM or null",
    "executeOnDay": "monday/tuesday/wednesday/thursday/friday/saturday/sunday or null",
    "executeOnDate": "YYYY-MM-DD or null",
    "maxDailySpend": number or null,
    "executeOnce": true or false
  } or null,
  "policyUpdate": {
    "field": "dailyCap" | "perTxCap" | "addWhitelist" | "removeWhitelist" | "activeHours" | "maxTxPerHour" | null,
    "value": number or null,
    "address": "0x address or null",
    "start": number or null,
    "end": number or null
  } or null
}

Guidelines:
- If the user wants to swap assets, use action: "propose_swap". For fromToken and toToken, ONLY use the symbol name (PING, PONG, SUSD, STT).
- If the user says "Yes", "Confirm", "Go ahead", or similar after you proposed a swap, use action: "execute_swap".
- Available tokens on Somnia Shannon Testnet: 
  - STT (Native)
  - PING: 0x33E7fAB0a8a5da1A923180989bD617c9c2D1C493
  - PONG: 0x9beaA0016c22B646Ac311Ab171270B0ECf23098F
  - SUSD: 0x65296738D4E5edB1515e40287B6FDf8320E6eE04
- Be helpful and smart. Somnia is the high-performance blockchain for the mass-consumer metaverse.
- If they want to pay, extract details and use action: "pay".
- If the user asks for history or activity, use action: "history".
- If the user asks about their balance, use action: "balance".
- Status is only for policy/spending rules/limits.
- Always keep the "message" field warm and human.
- If action is "balance", state the balance number directly in your message if you have it.
- Today's date is: ${new Date().toISOString().split('T')[0]}
- Always respond with valid JSON only, no extra text`;

async function parseIntent(userInput, vaultBalance, history = []) {
  const balanceLine = vaultBalance !== undefined
    ? 'The user current vault balance is: ' + vaultBalance + ' STT.'
    : 'Vault balance is unknown.';

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + `\n` + balanceLine },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userInput }
    ];

    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.1,
      max_tokens: 400
    });

    const raw = response.choices[0].message.content.trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Error parsing JSON:', cleaned);
      return {
        action: 'chat',
        message: 'I understood your request but had trouble formatting the response. ' + raw.slice(0, 100)
      };
    }
  } catch (error) {
    console.error('Error calling Groq API:', error);
    return {
      action: 'unknown',
      message: 'An error occurred while processing your request.'
    };
  }
}

module.exports = { parseIntent };
