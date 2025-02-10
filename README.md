# 3agent Server Service

This repository contains the **Server** service for 3agent. It uses [SST (Serverless Stack)](https://docs.serverless-stack.com/) to define and manage AWS infrastructure.

## Overview

3agent is a no-code solution for deploying autonomous agents on Base. Each agent comes with its own ERC20 token and a built-in bonding curve for trading. The agent also interacts on X (formerly Twitter) using the credentials you provide. NO DEV ALLOCATION.

## Infrastructure

### 1. API Gateway

A single **API Gateway** (HTTP API) is created:

- **Name**: `AgentApi`
- Routes:
  - `GET /agent` → Fetch agent data
  - `POST /start` → Start an agent
  - `POST /update` → Update agent data
  - `POST /create` → Create a new agent
  - `DELETE /remove` → Remove an agent

### 2. DynamoDB Tables

1. **AgentData**  
   - **Primary Index**: `agentId` (Partition key)  
   - **Global Index**: `byRemovalStatus` (Partition: `remove`, Sort: `createdAt`)  
   - Stores core metadata about agents (e.g., `agentId`, `remove` status, and timestamps).

2. **UserData**  
   - **Primary Index**: `userId` (Partition) and `agentId` (Sort)  
   - Maps users to their associated agents.

3. **AgentMapping**  
   - **Primary Index**: `agentId` (Partition key)  
   - **Global Indexes**: `byStatus` (Partition: `status`), `byTaskArn` (Partition: `taskArn`)  
   - Tracks ECS tasks for agents along with their status.

4. **AgentTwitterMapping**  
   - **Primary Index**: `username` (Partition key)  
   - Associates Twitter usernames with agents.

### 3. Lambda Functions

- **Start** (`source/functions/start.handler`)  
  Starts an agent using provided parameters.

- **Fetch** (`source/functions/fetch.handler`)  
  Retrieves agent data from DynamoDB tables.

- **Create** (`source/functions/create.handler`)  
  Creates and initializes a new agent, including optional Twitter mappings.

- **Update** (`source/functions/update.handler`)  
  Updates existing agent data.

- **Remove** (`source/functions/remove.handler`)  
  Removes an agent and related data (e.g., user/agent mappings, Twitter info).

### 4. Scheduled Jobs & Event Subscriptions

- **UpdateMapping** (`source/jobs/updateMapping.handler`)  
  - **EventBridge Subscription**: Listens for ECS Task State Change events on the default AWS event bus to update agent mappings.

- **RestartAgents** (`source/jobs/restartAgents.handler`)  
  - **Cron**: Runs every 30 minutes to check and restart agents if necessary.

- **RemoveAgents** (`source/jobs/removeAgents.handler`)  
  - **Cron**: Runs every hour to remove agents marked for removal.

## Environment Variables

- **API_KEY**: Used for authentication.  
- **SERVICE_URL**: Optional service URL for agent operations.  
- **RPC_URL**: (Used by `RemoveAgents`) for blockchain or other external service interactions.

Make sure these are set in your deployment or local development environment as required.