import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rules = readFileSync("firebase/firestore.rules", "utf8");
const customerLoyaltyService = readFileSync("src/services/firebase/loyaltyService.ts", "utf8");

test("static Firestore contract requires server-time 12-hour cooldown checks", () => {
  assert.match(rules, /duration\.value\(12,\s*'h'\)/);
  assert.match(rules, /request\.time\s*>=\s*data\.get\('lastStampAt',\s*null\)\s*\+\s*duration\.value\(12,\s*'h'\)/);
  assert.match(rules, /stampCooldownElapsed\(get\(loyaltyPath\(request\.resource\.data\.customerId\)\)\.data\)/);
  assert.match(rules, /stampCooldownElapsed\(resource\.data\)/);
  assert.match(rules, /request\.resource\.data\.lastStampAt\s*==\s*request\.time/);
});

test("static Firestore contract keeps Admin and Staff access on their single assigned client", () => {
  assert.match(rules, /function isAdminOf\(clientId\)[\s\S]*?adminClientId\(\)\s*==\s*clientId/);
  assert.match(rules, /function isStaffUserOf\(clientId\)[\s\S]*?staffClientId\(\)\s*==\s*clientId/);
  assert.doesNotMatch(rules, /function isSuperAdmin\(/);
  assert.doesNotMatch(rules, /allow read, write: if isSuperAdmin\(\)/);
  assert.match(rules, /match \/stampTransactions\/\{transactionId\}[\s\S]*?allow create:[\s\S]*?isStaffUserOf\(clientId\)/);
  assert.match(rules, /match \/loyaltyAccounts\/\{customerId\}[\s\S]*?validStampAccountMutation/);
  assert.match(rules, /lastVisitTransactionId/);
  assert.match(rules, /visitCountedAt/);
});

test("static Firestore contract blocks customer loyalty writes and makes reward redemption atomic", () => {
  const loyaltyStart = rules.indexOf("match /loyaltyAccounts/{customerId}");
  const customerStart = rules.indexOf("match /customers/{customerId}");
  const loyaltyRules = rules.slice(loyaltyStart, customerStart);
  assert.match(loyaltyRules, /allow create:[\s\S]*?isStaffUserOf/);
  assert.match(loyaltyRules, /allow update:[\s\S]*?isStaffUserOf/);
  assert.match(loyaltyRules, /allow delete:\s*if false/);
  assert.match(rules, /match \/rewardRedemptions\/\{redemptionId\}[\s\S]*?existsAfter\([\s\S]*?stampTransactions/);
  assert.match(rules, /allow update, delete:\s*if false/);
  assert.match(rules, /match \/stampTransactions\/\{transactionId\}[\s\S]*?allow delete:\s*if false/);
});

test("static Firestore contract keeps customer-owned tokens, profile fields, and history tenant-bound", () => {
  assert.match(rules, /match \/customerTokens\/\{token\}[\s\S]*?resource\.data\.customerId\s*==\s*uid\(\)/);
  assert.match(rules, /changed\(\)\.hasOnly\([\s\S]*?'name'[\s\S]*?'phone'[\s\S]*?'updatedAt'/);
  assert.match(rules, /match \/stampTransactions\/\{transactionId\}[\s\S]*?resource\.data\.get\('customerId', ''\)\s*==\s*uid\(\)/);
  assert.match(rules, /get\(\/databases\/\$\(database\)\/documents\/customers\/\$\(uid\(\)\)\)\.data\.get\('clientId', ''\)\s*==\s*clientId/);
  assert.match(customerLoyaltyService, /where\("customerId",\s*"==",\s*customerId\)[\s\S]*where\("clientId",\s*"==",\s*clientId\)/);
});
