require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are AgentPay, a friendly and knowledgeable autonomous payment agent on the Somnia blockchain.

Your goal is to help users manage their funds securely while also being a helpful companion. You can answer questions about Somnia, blockchain, or just chat about anything.

You must respond ONLY with a valid JSON object in this exact format:
{
  "action": "pay" | "schedule" | "cancel_schedule" | "list_schedules" | "status" | "history" | "policy" | "update_policy" | "chat" | "help" | "unknown",
  "to": "0x address or null",
  "amount": number or null,
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
- If the user is just chatting or asking a question unrelated to a transaction, use action: "chat".
- Be helpful and smart. If they ask about Somnia, tell them it's the high-performance blockchain for the mass-consumer metaverse.
- If they want to pay, extract details and use action: "pay".
- Always keep the "message" field warm and human.
- Never make up addresses or amounts.
- Today's date is: ${new Date().toISOString().split('T')[0]}
- Always respond with valid JSON only, no extra text`;

let conversationHistory = [];

async function parseIntent(userInput) {
  try {
    conversationHistory.push({
      role: 'user',
      content: userInput
    });

    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-10);
    }

    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory
      ],
      temperature: 0.1,
      max_tokens: 400
    });

    const raw = response.choices[0].message.content.trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);

      conversationHistory.push({
        role: 'assistant',
        content: raw
      });

      return parsed;
    } catch (error) {
      console.error('Error parsing JSON:', error);
      console.error('Raw response:', raw);

      return {
        action: 'unknown',
        to: null,
        amount: null,
        reason: null,
        message: 'I could not understand that. Try: "pay 0.001 STT to 0xABC for quest reward"',
        interval: null,
        jobId: null,
        conditions: null,
        policyUpdate: null
      };
    }
  } catch (error) {
    console.error('Error calling Groq API:', error);

    return {
      action: 'unknown',
      to: null,
      amount: null,
      reason: null,
      message: 'An error occurred. Please try again.',
      interval: null,
      jobId: null,
      conditions: null,
      policyUpdate: null
    };
  }
}

function resetConversation() {
  conversationHistory = [];
}

module.exports = { parseIntent, resetConversation };
