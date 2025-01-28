import { Resource } from "sst";
import { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { checkApiKey } from "./utils/auth";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

export const handler: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    // TODO: implement auth
    // const authError = checkApiKey(event);
    // if (authError) return authError;

    // const agentId = event.pathParameters?.agentId;
    const agentId = event.queryStringParameters?.agentId;

    if (!agentId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "agentId is required in parameters" }),
      };
    }

    // Check if agent exists and get userId
    const existingAgent = await ddb.send(
      new GetCommand({
        TableName: Resource.AgentData.name,
        Key: { agentId },
      })
    );

    if (!existingAgent.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Agent not found" }),
      };
    }

    const userId = existingAgent.Item.user;

    // Mark agent as removed in AgentData table
    await ddb.send(
      new UpdateCommand({
        TableName: Resource.AgentData.name,
        Key: { agentId },
        UpdateExpression: "SET #remove = :remove, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#remove": "remove",
        },
        ExpressionAttributeValues: {
          ":remove": true,
          ":updatedAt": new Date().toISOString(),
        },
      })
    );

    // Delete the agent record from UserData table
    await ddb.send(
      new DeleteCommand({
        TableName: Resource.UserData.name,
        Key: {
          userId,
          agentId,
        },
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Agent marked as removed",
      }),
    };
  } catch (error) {
    console.error("Error in delete handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "An error occurred",
      }),
    };
  }
};
