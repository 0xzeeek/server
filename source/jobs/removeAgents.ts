import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ethers } from "ethers";

import CURVE_ABI from "../lib/curveAbi.json";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

interface Agent {
  agentId: `0x${string}`;
  name: string;
  image: string;
  ticker: string;
  username: string;
  email: string;
  password?: string;
  bio: string;
  description: string;
  characterFile: string;
  curve: `0x${string}`;
  user: `0x${string}`;
}

async function getAgents(): Promise<Agent[]> {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const command = new QueryCommand({
    TableName: Resource.AgentData.name,
    IndexName: "byRemovalStatus",
    KeyConditionExpression: "#remove = :removeVal AND #createdAt BETWEEN :startTime AND :endTime",
    ExpressionAttributeNames: {
      "#remove": "remove",
      "#createdAt": "createdAt",
    },
    ExpressionAttributeValues: {
      ":removeVal": "false",
      ":startTime": seventyTwoHoursAgo,
      ":endTime": fortyEightHoursAgo,
    },
  });

  const result = await ddb.send(command);
  return (result.Items as Agent[]) || [];
}

async function isCurveFinalized(curveAddress: string): Promise<boolean> {
  if (!process.env.RPC_URL) {
    throw new Error("RPC_URL is not set");
  }

  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const curveContract = new ethers.Contract(curveAddress, CURVE_ABI, provider);

    return await curveContract.finalized();
  } catch (error) {
    console.error(`Error checking curve status for ${curveAddress}:`, error);
    return false;
  }
}

async function updateAgentStatus(agentId: string): Promise<void> {
  const command = new UpdateCommand({
    TableName: Resource.AgentData.name,
    Key: { agentId },
    UpdateExpression: "SET #remove = :removeVal",
    ExpressionAttributeNames: {
      "#remove": "remove",
    },
    ExpressionAttributeValues: {
      ":removeVal": "true",
    },
  });

  await ddb.send(command);
}

async function removeAgentMapping(agentId: string, username: string): Promise<void> {
  const mappingCommand = new DeleteCommand({
    TableName: Resource.AgentMapping.name,
    Key: { agentId },
  });

  await ddb.send(mappingCommand);

  const twitterMappingCommand = new DeleteCommand({
    TableName: Resource.AgentTwitterMapping.name,
    Key: { username },
  });

  await ddb.send(twitterMappingCommand);
}

async function removeAgentUserData(agentId: string, userId: string): Promise<void> {
  console.log(`Removing agent user data for ${agentId} and ${userId}`);
  const command = new DeleteCommand({
    TableName: Resource.UserData.name,
    Key: { userId, agentId },
  });

  await ddb.send(command);
}

export async function handler() {
  try {
    const agents = await getAgents();

    console.log(`Checking ${agents.length} agents`);

    for (const agent of agents) {
      const isFinalized = await isCurveFinalized(agent.curve);

      // If curve is not finalized, update agent status to removed
      if (!isFinalized) {
        await updateAgentStatus(agent.agentId);
        await removeAgentMapping(agent.agentId, agent.username);
        await removeAgentUserData(agent.agentId, agent.user);
        console.log(`Updated agent ${agent.agentId} removal status to true`);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Successfully processed agents" }),
    };
  } catch (error) {
    console.error("Error processing agents:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process agents" }),
    };
  }
}
