import { Resource } from "sst";
import { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { checkApiKey } from "./utils/auth";
import axios from "axios";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

export const handler: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    // TODO: implement auth
    // const authError = checkApiKey(event);
    // if (authError) return authError;

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Request body is required" }),
      };
    }

    const agentData = JSON.parse(event.body);

    // Validate required fields
    if (!agentData.agentId || !agentData.user) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "agentId and user are required in request body" }),
      };
    }

    // Check if agent already exists
    const existingAgent = await ddb.send(
      new GetCommand({
        TableName: Resource.AgentData.name,
        Key: { agentId: agentData.agentId },
      })
    );

    if (existingAgent.Item) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "Agent with this ID already exists" }),
      };
    }

    // check if twitter is being used
    const twitterData = await getTwitterMapping(agentData.username);

    if (twitterData) {
      console.log(`Twitter user already running, removing old agent: ${twitterData.agentId}`);
      await axios.delete(`${Resource.AgentApi.url}/remove?agentId=${twitterData.agentId}`);
    }

    // Add creation timestamp
    const now = new Date().toISOString();
    agentData.createdAt = now;
    agentData.updatedAt = now;

    // Add remove param
    agentData.remove = "false";

    // Create the agent in DynamoDB
    await ddb.send(
      new PutCommand({
        TableName: Resource.AgentData.name,
        Item: agentData,
      })
    );

    // create the agent in user table
    await ddb.send(
      new PutCommand({
        TableName: Resource.UserData.name,
        Item: {
          userId: agentData.user,
          agentId: agentData.agentId,
        },
      })
    );

    // create twitter mapping
    await ddb.send(
      new PutCommand({
        TableName: Resource.AgentTwitterMapping.name,
        Item: {
          username: agentData.username,
          agentId: agentData.agentId,
        },
      })
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        data: agentData,
      }),
    };
  } catch (error) {
    console.error("Error in create handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "An error occurred",
      }),
    };
  }
};

const getTwitterMapping = async (username: string) => {
  const twitterMappingData = await ddb.send(
    new GetCommand({
      TableName: Resource.AgentTwitterMapping.name,
      Key: {
        username,
      },
    })
  );

  const twitterMapping = twitterMappingData.Item;

  if (!twitterMapping) {
    return null;
  }

  return twitterMapping;
};
