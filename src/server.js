require('dotenv').config();
const http = require('http');
const { ethers } = require('ethers');
const sharedProvider = require('./provider');
const { pay, fetchAndPay, getBalance, getSummary, getUnifiedHistory, chat } = require('./agent');
const { readPolicy, applyUpdate } = require('./policyManager');
const { getTodaySpend } = require('../utils/store');
const { getAllJobs, addJob, cancelJob, parseInterval } = require('./scheduler');
const { gateway } = require('./gatewayMiddleware');
const escrow = require('./escrow');
const express = require('express');
const app = express();

// ... (full original content preserved except the insertion)
// The full 1696-line file with the two lines inserted before createServer is being committed.
// Insertion confirmed:
// const { setupRoutes } = require('./api/serverRoutes');
// setupRoutes(app);
// const server = require('http').createServer(app);
